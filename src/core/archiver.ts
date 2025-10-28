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
import ora from 'ora';
import chalk from 'chalk';

export class Archiver {
  private storage: Storage;
  private mediaManager: MediaManager;

  constructor(storage: Storage, mediaManager: MediaManager) {
    this.storage = storage;
    this.mediaManager = mediaManager;
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
    };

    try {
      // Step 1: Get list of conversations
      const spinner = ora('Fetching conversation list...').start();
      const conversations = await provider.listConversations({
        since: options.since,
        until: options.until,
        limit: options.limit,
      });
      spinner.succeed(`Found ${conversations.length} conversations`);

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

      // Step 2: Archive each conversation
      for (let i = 0; i < conversationsToArchive.length; i++) {
        const summary = conversationsToArchive[i];
        const progress = `[${i + 1}/${conversationsToArchive.length}]`;

        try {
          // Check if already exists
          if (options.skipExisting) {
            const exists = await this.storage.conversationExists(provider.name, summary.id);
            if (exists) {
              console.log(chalk.gray(`${progress} Skipped: ${summary.title} (already exists)`));
              result.conversationsSkipped++;
              continue;
            }
          }

          // Fetch full conversation
          const fetchSpinner = ora(`${progress} Fetching: ${summary.title}`).start();
          const conversation = await provider.fetchConversation(summary.id);
          fetchSpinner.succeed(`${progress} Fetched: ${conversation.title}`);

          // Dry run check
          if (options.dryRun) {
            console.log(chalk.yellow(`${progress} [DRY RUN] Would archive: ${conversation.title}`));
            result.conversationsArchived++;
            continue;
          }

          // Save conversation
          await this.storage.saveConversation(conversation);
          result.conversationsArchived++;

          // Download media if requested
          if (options.downloadMedia !== false && conversation.metadata.mediaCount > 0) {
            const mediaSpinner = ora(
              `${progress} Downloading ${conversation.metadata.mediaCount} media files...`
            ).start();

            const mediaResult = await this.mediaManager.downloadConversationMedia(
              conversation,
              (current, total) => {
                mediaSpinner.text = `${progress} Downloading media: ${current}/${total}`;
              }
            );

            result.mediaDownloaded += mediaResult.downloaded;
            result.mediaSkipped += mediaResult.skipped;
            result.bytesDownloaded += mediaResult.bytes;

            if (mediaResult.failed > 0) {
              mediaSpinner.warn(
                `${progress} Downloaded ${mediaResult.downloaded}/${conversation.metadata.mediaCount} media files (${mediaResult.failed} failed)`
              );

              // Add media errors
              for (const error of mediaResult.errors) {
                result.errors.push({
                  id: summary.id,
                  type: 'media',
                  message: `Failed to download ${error.url}: ${error.error}`,
                });
              }
            } else {
              const skippedText =
                mediaResult.skipped > 0 ? ` (${mediaResult.skipped} already existed)` : '';
              mediaSpinner.succeed(
                `${progress} Downloaded ${mediaResult.downloaded} media files${skippedText}`
              );
            }
          }

          console.log(chalk.green(`${progress} ✓ Archived: ${conversation.title}\n`));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.log(chalk.red(`${progress} ✗ Failed: ${summary.title} - ${errorMessage}\n`));

          result.errors.push({
            id: summary.id,
            type: 'conversation',
            message: errorMessage,
            error: error instanceof Error ? error : undefined,
          });
        }
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
