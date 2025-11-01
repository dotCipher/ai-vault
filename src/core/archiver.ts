/**
 * Provider-Agnostic Archiver
 *
 * Orchestrates: fetch from provider → download media → save to storage
 * Works with any provider implementation
 */

import type { Provider } from '../types/provider.js';
import { Storage, getDefaultStorageConfig } from './storage.js';
import { MediaManager } from './media.js';
import type { ArchiveOptions, ArchiveResult } from '../types/storage.js';
import { RateLimitError } from '../types/provider.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import ora from 'ora';
import chalk from 'chalk';
import pLimit from 'p-limit';
import os from 'os';

export class Archiver {
  private storage: Storage;
  private mediaManager: MediaManager;

  constructor(storage: Storage, mediaManager: MediaManager) {
    this.storage = storage;
    this.mediaManager = mediaManager;
  }

  /**
   * Initialize the archiver (load registries from disk)
   */
  async init(): Promise<void> {
    await this.mediaManager.init();
  }

  /**
   * Get the storage instance (used by import command)
   */
  getStorage(): Storage {
    return this.storage;
  }

  /**
   * Archive conversations from a provider
   */
  async archive(provider: Provider, options: ArchiveOptions = {}): Promise<ArchiveResult> {
    const startTime = Date.now();
    const result: ArchiveResult = {
      conversationsArchived: 0,
      conversationsSkipped: 0,
      mediaDownloaded: 0,
      mediaSkipped: 0,
      bytesDownloaded: 0,
      duration: 0,
      errors: [],
      assetsArchived: 0,
      workspacesArchived: 0,
    };

    try {
      // Archive assets if provider supports it
      if ('listAssets' in provider && typeof provider.listAssets === 'function') {
        const assetSpinner = ora('Fetching assets library...').start();
        try {
          const assets = await provider.listAssets();
          assetSpinner.succeed(`Found ${assets.length} assets`);

          if (assets.length > 0 && !options.dryRun) {
            await this.storage.saveAssets(provider.name, assets);
            result.assetsArchived = assets.length;
            console.log(chalk.green(`✓ Archived ${assets.length} assets\n`));
          }
        } catch (error) {
          assetSpinner.fail('Failed to fetch assets');
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.log(chalk.yellow(`⚠ ${errorMessage}\n`));
        }
      }

      // Archive workspaces if provider supports it
      if ('listWorkspaces' in provider && typeof provider.listWorkspaces === 'function') {
        const workspaceSpinner = ora('Fetching workspaces...').start();
        try {
          const workspaces = await provider.listWorkspaces();
          workspaceSpinner.succeed(`Found ${workspaces.length} workspaces`);

          if (workspaces.length > 0 && !options.dryRun) {
            await this.storage.saveWorkspaces(provider.name, workspaces);
            result.workspacesArchived = workspaces.length;
            const totalProjects = workspaces.reduce(
              (sum: number, ws: any) => sum + ws.projects.length,
              0
            );
            console.log(
              chalk.green(
                `✓ Archived ${workspaces.length} workspaces with ${totalProjects} projects\n`
              )
            );
          }
        } catch (error) {
          workspaceSpinner.fail('Failed to fetch workspaces');
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.log(chalk.yellow(`⚠ ${errorMessage}\n`));
        }
      }

      // Step 1: Get list of conversations
      const spinner = ora('Fetching conversation list...').start();
      let conversations;
      try {
        conversations = await provider.listConversations({
          since: options.since,
          until: options.until,
          limit: options.limit,
        });
        spinner.succeed(`Found ${conversations.length} conversations`);
      } catch (error) {
        spinner.fail('Failed to fetch conversation list');
        throw error;
      }

      // Filter if specific IDs requested
      let conversationsToArchive = conversations;
      if (options.conversationIds && options.conversationIds.length > 0) {
        conversationsToArchive = conversations.filter((c) =>
          options.conversationIds!.includes(c.id)
        );
      }

      // Filter by search query (case-insensitive search in title and preview)
      if (options.searchQuery) {
        const searchLower = options.searchQuery.toLowerCase();
        conversationsToArchive = conversationsToArchive.filter((c) => {
          const titleMatch = c.title.toLowerCase().includes(searchLower);
          const previewMatch = c.preview?.toLowerCase().includes(searchLower);
          return titleMatch || previewMatch;
        });
      }

      // Apply limit
      if (options.limit && conversationsToArchive.length > options.limit) {
        conversationsToArchive = conversationsToArchive.slice(0, options.limit);
      }

      console.log(chalk.cyan(`\nArchiving ${conversationsToArchive.length} conversations...\n`));

      // Enable batch mode for storage operations (deferred index updates)
      if (!options.dryRun) {
        this.storage.enableBatchMode();
      }

      // Calculate smart concurrency based on hardware and provider constraints
      const initialConcurrency = this.calculateOptimalConcurrency(provider, options.concurrency);

      // Initialize rate limiter for adaptive concurrency
      const rateLimiter = new RateLimiter({
        initialConcurrency,
        minConcurrency: 1,
        maxConcurrency: initialConcurrency,
        baseDelay: 2000,
        maxDelay: 60000,
      });

      const limit = pLimit(initialConcurrency);
      console.log(chalk.gray(`Processing with concurrency: ${initialConcurrency}\n`));

      // Track progress
      let completed = 0;
      const total = conversationsToArchive.length;

      // Step 2: Archive conversations in parallel with concurrency control
      const archiveTasks = conversationsToArchive.map((summary, index) =>
        limit(async () => {
          const progress = `[${index + 1}/${total}]`;

          // Check circuit breaker before attempting operation
          if (rateLimiter.isCircuitOpen()) {
            console.log(
              chalk.yellow(`${progress} [PAUSED] Rate limit circuit breaker active, waiting...`)
            );
            await rateLimiter.waitForBackoff(5000); // Check every 5 seconds
          }

          try {
            // Check if already exists and if it needs updating (smart diff)
            const exists = await this.storage.conversationExists(provider.name, summary.id);

            if (exists && options.skipExisting) {
              // Get local conversation to compare timestamps
              const localConv = await this.storage.getConversation(provider.name, summary.id);

              if (localConv) {
                const localUpdated = new Date(localConv.updatedAt).getTime();
                const remoteUpdated = summary.updatedAt.getTime();

                // Skip only if local is up-to-date (within 1 second tolerance for rounding)
                if (remoteUpdated <= localUpdated + 1000) {
                  completed++;
                  console.log(
                    chalk.gray(`[${completed}/${total}] Skipped: ${summary.title} (up-to-date)`)
                  );
                  return { status: 'skipped' as const, summary };
                }

                // Remote is newer - re-archive it
                console.log(
                  chalk.yellow(`${progress} Re-archiving: ${summary.title} (updated remotely)`)
                );
              }
            }

            // Fetch full conversation with retry logic for timeouts
            const fetchSpinner = ora(`${progress} Fetching: ${summary.title}`).start();
            let conversation;
            const maxRetries = 3;
            let lastError;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try {
                if (attempt > 1) {
                  const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 2), 8000); // 1s, 2s, 4s
                  fetchSpinner.text = `${progress} Retrying (${attempt}/${maxRetries}): ${summary.title}`;
                  await new Promise((resolve) => setTimeout(resolve, backoffDelay));
                }
                conversation = await provider.fetchConversation(summary.id);
                break; // Success - exit retry loop
              } catch (error) {
                lastError = error;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                const isTimeout =
                  errorMessage.includes('Timeout') || errorMessage.includes('timeout');

                if (isTimeout && attempt < maxRetries) {
                  fetchSpinner.text = `${progress} Timeout - will retry: ${summary.title}`;
                  continue; // Retry on timeout
                } else {
                  throw error; // Non-timeout error or max retries reached
                }
              }
            }

            if (!conversation) {
              throw lastError || new Error('Failed to fetch conversation after retries');
            }

            fetchSpinner.stop(); // Stop silently - final "Archived" message will confirm success

            // Record successful operation
            rateLimiter.recordSuccess();

            // Dry run check
            if (options.dryRun) {
              completed++;
              console.log(
                chalk.yellow(
                  `[${completed}/${total}] [DRY RUN] Would archive: ${conversation.title}`
                )
              );
              return { status: 'archived' as const, summary, conversation };
            }

            // Save conversation
            await this.storage.saveConversation(conversation);

            // Download media if requested
            let mediaResult = null;
            if (options.downloadMedia !== false && conversation.metadata.mediaCount > 0) {
              const mediaSpinner = ora(
                `${progress} Downloading ${conversation.metadata.mediaCount} media files...`
              ).start();

              // Get cookies from provider if available (needed for authenticated media downloads)
              const providerCookies = (provider as any).config?.cookies;

              mediaResult = await this.mediaManager.downloadConversationMedia(
                conversation,
                (current, mediaTotal) => {
                  mediaSpinner.text = `${progress} Downloading media: ${current}/${mediaTotal}`;
                },
                providerCookies
              );

              if (mediaResult.failed > 0) {
                mediaSpinner.warn(
                  `${progress} Downloaded ${mediaResult.downloaded}/${conversation.metadata.mediaCount} media files (${mediaResult.failed} failed)`
                );
              } else {
                const skippedText =
                  mediaResult.skipped > 0 ? ` (${mediaResult.skipped} already existed)` : '';
                mediaSpinner.succeed(
                  `${progress} Downloaded ${mediaResult.downloaded} media files${skippedText}`
                );
              }
            }

            completed++;
            console.log(chalk.green(`[${completed}/${total}] ✓ Archived: ${conversation.title}\n`));
            return {
              status: 'archived' as const,
              summary,
              conversation,
              mediaResult,
            };
          } catch (error) {
            completed++;

            // Handle rate limit errors specially
            if (error instanceof RateLimitError) {
              const { shouldPause, delay } = rateLimiter.recordRateLimit(error);
              const newConcurrency = rateLimiter.getConcurrency();

              console.log(
                chalk.yellow(`[${completed}/${total}] ⚠ Rate limited: ${summary.title}`)
              );
              console.log(
                chalk.yellow(
                  `  Reducing concurrency to ${newConcurrency}, waiting ${Math.floor(delay / 1000)}s...`
                )
              );

              if (shouldPause) {
                console.log(
                  chalk.red(
                    `  Circuit breaker activated! Pausing all operations for ${Math.floor(delay / 1000)}s\n`
                  )
                );
              }

              // Wait for backoff period
              await rateLimiter.waitForBackoff(delay);

              return {
                status: 'rate-limited' as const,
                summary,
                error: error,
              };
            }

            // Handle other errors
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.log(
              chalk.red(`[${completed}/${total}] ✗ Failed: ${summary.title} - ${errorMessage}\n`)
            );

            return {
              status: 'failed' as const,
              summary,
              error: error instanceof Error ? error : new Error(errorMessage),
            };
          }
        })
      );

      // Wait for all tasks to complete
      const results = await Promise.all(archiveTasks);

      // Flush any pending storage updates (batch save index)
      if (!options.dryRun) {
        await this.storage.disableBatchMode();
      }

      // Aggregate results
      for (const taskResult of results) {
        if (taskResult.status === 'archived') {
          result.conversationsArchived++;
          if (taskResult.mediaResult) {
            result.mediaDownloaded += taskResult.mediaResult.downloaded;
            result.mediaSkipped += taskResult.mediaResult.skipped;
            result.bytesDownloaded += taskResult.mediaResult.bytes;

            // Add media errors
            for (const error of taskResult.mediaResult.errors) {
              console.log(chalk.red(`  Media download failed: ${error.url}`));
              console.log(chalk.gray(`  Error: ${error.error}`));
              result.errors.push({
                id: taskResult.summary.id,
                type: 'media',
                message: `Failed to download ${error.url}: ${error.error}`,
              });
            }
          }
        } else if (taskResult.status === 'skipped') {
          result.conversationsSkipped++;
        } else if (taskResult.status === 'rate-limited') {
          // Rate-limited conversations should be retried or reported
          result.errors.push({
            id: taskResult.summary.id,
            type: 'conversation',
            message: `Rate limited: ${taskResult.error.message}`,
            error: taskResult.error,
          });
        } else if (taskResult.status === 'failed') {
          result.errors.push({
            id: taskResult.summary.id,
            type: 'conversation',
            message: taskResult.error.message,
            error: taskResult.error,
          });
        }
      }

      // Log rate limiter statistics
      const rateLimiterState = rateLimiter.getState();
      if (rateLimiterState.rateLimitCount > 0) {
        console.log(
          chalk.yellow(
            `\nRate Limiting Summary: ${rateLimiterState.rateLimitCount} rate limit(s) encountered`
          )
        );
        console.log(
          chalk.yellow(
            `Final concurrency: ${rateLimiterState.currentConcurrency} (started at ${initialConcurrency})`
          )
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({
        id: 'archive',
        type: 'conversation',
        message: `Archive process failed: ${errorMessage}`,
        error: error instanceof Error ? error : undefined,
      });
    }

    result.duration = Date.now() - startTime;

    // Print summary
    this.printSummary(result, options.dryRun || false);

    return result;
  }

  /**
   * Calculate optimal concurrency based on hardware and provider constraints
   */
  private calculateOptimalConcurrency(provider: Provider, override?: number): number {
    // If user provides override, use it
    if (override !== undefined) {
      return Math.max(1, Math.min(override, 20)); // Clamp between 1-20
    }

    // Get CPU count as base metric
    const cpuCount = os.cpus().length;

    // Provider-specific limits
    const providerLimit = provider.rateLimit?.maxConcurrent;

    // Calculate smart default
    // Conservative: Use 50% of CPU cores, min 2, max 10
    let optimalConcurrency = Math.max(2, Math.floor(cpuCount * 0.5));
    optimalConcurrency = Math.min(optimalConcurrency, 10);

    // Respect provider limits if specified
    if (providerLimit !== undefined) {
      optimalConcurrency = Math.min(optimalConcurrency, providerLimit);
    }

    return optimalConcurrency;
  }

  /**
   * Print archive summary
   */
  private printSummary(result: ArchiveResult, dryRun: boolean): void {
    console.log(chalk.bold('\n═══════════════════════════════════════'));
    console.log(chalk.bold('Archive Summary'));
    console.log(chalk.bold('═══════════════════════════════════════\n'));

    if (dryRun) {
      console.log(chalk.yellow('DRY RUN - No files were actually saved\n'));
    }

    console.log(chalk.cyan('Conversations:'));
    console.log(`  Archived: ${chalk.green(result.conversationsArchived)}`);
    if (result.conversationsSkipped > 0) {
      console.log(`  Skipped:  ${chalk.gray(result.conversationsSkipped)}`);
    }

    if (result.assetsArchived && result.assetsArchived > 0) {
      console.log(chalk.cyan('\nAssets Library:'));
      console.log(`  Archived: ${chalk.green(result.assetsArchived)}`);
    }

    if (result.workspacesArchived && result.workspacesArchived > 0) {
      console.log(chalk.cyan('\nWorkspaces:'));
      console.log(`  Archived: ${chalk.green(result.workspacesArchived)}`);
    }

    if (result.mediaDownloaded > 0 || result.mediaSkipped > 0) {
      console.log(chalk.cyan('\nMedia:'));
      console.log(`  Downloaded: ${chalk.green(result.mediaDownloaded)}`);
      if (result.mediaSkipped > 0) {
        console.log(`  Skipped:    ${chalk.gray(result.mediaSkipped)} (already existed)`);
      }
      const sizeMB = (result.bytesDownloaded / 1024 / 1024).toFixed(2);
      console.log(`  Size:       ${chalk.blue(sizeMB)} MB`);
    }

    if (result.errors.length > 0) {
      console.log(chalk.red(`\nErrors: ${result.errors.length}`));
      for (const error of result.errors.slice(0, 5)) {
        console.log(chalk.red(`  • ${error.message}`));
      }
      if (result.errors.length > 5) {
        console.log(chalk.gray(`  ... and ${result.errors.length - 5} more`));
      }
    }

    const durationSec = (result.duration / 1000).toFixed(1);
    console.log(chalk.gray(`\nCompleted in ${durationSec}s`));
    console.log(chalk.bold('═══════════════════════════════════════\n'));
  }

  /**
   * Get archive statistics for a provider
   */
  async getStats(provider: string): Promise<{
    conversations: number;
    messages: number;
    media: number;
    size: number;
  }> {
    const storageStats = await this.storage.getStats(provider);
    const mediaStats = await this.mediaManager.getStats();

    return {
      conversations: storageStats.totalConversations,
      messages: storageStats.totalMessages,
      media: mediaStats.totalFiles,
      size: mediaStats.totalSize,
    };
  }
}

/**
 * Create an archiver instance with default configuration
 */
export function createArchiver(baseDir?: string): Archiver {
  const storageConfig = getDefaultStorageConfig();

  if (baseDir) {
    storageConfig.baseDir = baseDir;
  }

  const storage = new Storage(storageConfig);
  const mediaManager = new MediaManager(storageConfig.baseDir);

  return new Archiver(storage, mediaManager);
}
