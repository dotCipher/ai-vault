/**
 * Verify command - Validate local archive integrity and remote parity
 */

import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { existsSync } from 'fs';
import pLimit from 'p-limit';
import { getProvider } from '../providers/index.js';
import { loadConfig } from '../utils/config.js';
import { resolveArchiveDir } from '../utils/archive-dir.js';
import { Storage, getDefaultStorageConfig } from '../core/storage.js';
import { MediaManager } from '../core/media.js';
import type { ProviderName } from '../types/index.js';
import { PermissionError } from '../types/provider.js';
import type { ConversationSummary } from '../types/provider.js';

interface VerifyOptions {
  provider?: string;
  since?: string;
  until?: string;
  limit?: string;
  full?: boolean;
  localOnly?: boolean;
}

interface VerifySummary {
  hasErrors: boolean;
}

export async function verifyCommand(options: VerifyOptions): Promise<void> {
  const config = await loadConfig();

  const providerNames: ProviderName[] = options.provider
    ? [options.provider as ProviderName]
    : (Object.keys(config.providers) as ProviderName[]);

  if (providerNames.length === 0) {
    console.error(chalk.red('No providers configured. Run `ai-vault setup` first.'));
    process.exit(1);
  }

  let hadErrors = false;

  for (let i = 0; i < providerNames.length; i++) {
    const providerName = providerNames[i];
    const providerConfig = config.providers[providerName];

    if (!providerConfig) {
      console.error(
        chalk.red(`Provider '${providerName}' not configured. Run 'ai-vault setup' first.`)
      );
      hadErrors = true;
      continue;
    }

    if (i > 0) {
      console.log('\n\n');
    }

    const result = await verifyProvider(providerName, providerConfig, config, options);
    if (result.hasErrors) {
      hadErrors = true;
    }
  }

  if (hadErrors) {
    process.exit(2);
  }
}

async function verifyProvider(
  providerName: ProviderName,
  providerConfig: any,
  config: any,
  options: VerifyOptions
): Promise<VerifySummary> {
  let hasErrors = false;

  // Header
  console.log(chalk.bold.cyan('═'.repeat(80)));
  console.log(chalk.bold.cyan(`Verify Backup - ${providerName}`));
  console.log(chalk.bold.cyan('═'.repeat(80)));

  const archiveDir = resolveArchiveDir(config.settings?.archiveDir);
  const storageConfig = getDefaultStorageConfig();
  storageConfig.baseDir = archiveDir;

  const storage = new Storage(storageConfig);
  const mediaManager = new MediaManager(archiveDir);
  await mediaManager.init();

  // Load local index
  const localIndex = await storage.getIndex(providerName);
  const localIds = Object.keys(localIndex);
  const localIdSet = new Set(localIds);

  // Local integrity checks
  const missingDirs: string[] = [];
  const missingContentFiles: string[] = [];

  for (const [id, entry] of Object.entries(localIndex)) {
    const convDir = path.join(archiveDir, providerName, entry.path);
    if (!existsSync(convDir)) {
      missingDirs.push(id);
      continue;
    }

    const hasMarkdown = existsSync(path.join(convDir, 'conversation.md'));
    const hasJson = existsSync(path.join(convDir, 'conversation.json'));
    const hasJsonGz = existsSync(path.join(convDir, 'conversation.json.gz'));

    if (!hasMarkdown && !hasJson && !hasJsonGz) {
      missingContentFiles.push(id);
    }
  }

  // Media registry checks
  const registry = mediaManager.getRegistrySnapshot();
  const missingMediaFiles: string[] = [];
  const mediaRefsByConversation = new Map<string, number>();

  for (const entry of Object.values(registry)) {
    if (!existsSync(entry.path)) {
      missingMediaFiles.push(entry.path);
    }

    for (const refId of entry.references) {
      mediaRefsByConversation.set(refId, (mediaRefsByConversation.get(refId) || 0) + 1);
    }
  }

  const danglingMediaRefs = Array.from(mediaRefsByConversation.keys()).filter(
    (id) => !localIdSet.has(id)
  );

  // Remote parity checks
  let remoteConversations: ConversationSummary[] = [];
  const missingLocal: ConversationSummary[] = [];
  const staleLocal: ConversationSummary[] = [];
  const countMismatch: ConversationSummary[] = [];
  const countUnknown: ConversationSummary[] = [];
  const localOnly: string[] = [];
  const fullMismatches: Array<{
    id: string;
    title: string;
    remoteMessages: number;
    localMessages: number;
    remoteMedia: number;
    localMedia: number;
  }> = [];
  const fullErrors: Array<{ id: string; error: string; type: 'permission' | 'other' }> = [];

  if (!options.localOnly) {
    const spinner = ora(`Connecting to ${providerName}...`).start();
    try {
      const provider = getProvider(providerName);
      await provider.authenticate(providerConfig);
      const isAuth = await provider.isAuthenticated();

      if (!isAuth) {
        spinner.fail('Authentication failed');
        console.error(chalk.red('\nYour session cookies appear to be expired or invalid.'));
        console.error(
          chalk.yellow(`\nTo fix this, run: ${chalk.bold(`ai-vault setup ${providerName}`)}`)
        );
        console.error(chalk.gray('\nThis will guide you through updating your session cookies.'));
        return { hasErrors: true };
      }

      spinner.succeed(`Connected to ${providerName}`);

      const since = options.since ? new Date(options.since) : undefined;
      const until = options.until ? new Date(options.until) : undefined;
      const limit = options.limit ? parseInt(options.limit, 10) : undefined;

      if (since && isNaN(since.getTime())) {
        console.error(chalk.red(`Invalid date format for --since: ${options.since}`));
        return { hasErrors: true };
      }
      if (until && isNaN(until.getTime())) {
        console.error(chalk.red(`Invalid date format for --until: ${options.until}`));
        return { hasErrors: true };
      }
      if (options.limit && (isNaN(limit!) || (limit as number) <= 0)) {
        console.error(chalk.red('Limit must be a positive number'));
        return { hasErrors: true };
      }

      const remoteSpinner = ora('Fetching remote conversations...').start();
      remoteConversations = await provider.listConversations({ since, until, limit });
      remoteSpinner.succeed(`Found ${remoteConversations.length} remote conversations`);

      const remoteIds = new Set(remoteConversations.map((c) => c.id));
      const listSupportsCounts = remoteConversations.some((c) => c.messageCount > 0);

      for (const remote of remoteConversations) {
        const local = localIndex[remote.id];
        if (!local) {
          missingLocal.push(remote);
          continue;
        }

        const remoteTime = remote.updatedAt.getTime();
        const localTime = new Date(local.updatedAt).getTime();

        if (remoteTime > localTime + 1000) {
          staleLocal.push(remote);
        } else if (!listSupportsCounts) {
          countUnknown.push(remote);
        } else if (remote.messageCount !== local.messageCount) {
          countMismatch.push(remote);
        }
      }

      for (const localId of localIds) {
        if (!remoteIds.has(localId)) {
          localOnly.push(localId);
        }
      }

      if (options.full) {
        const fullSpinner = ora('Running full message/media parity checks...').start();
        const limiter = pLimit(2);

        await Promise.all(
          remoteConversations.map((remote) =>
            limiter(async () => {
              try {
                const fullConv = await provider.fetchConversation(remote.id);
                const local = localIndex[remote.id];
                if (!local) {
                  return;
                }

                const remoteMessages = fullConv.messages.length;
                const remoteMedia =
                  fullConv.metadata?.mediaCount ??
                  fullConv.messages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0);

                const localMessages = local.messageCount;
                const localMedia = local.mediaCount;

                if (remoteMessages !== localMessages || remoteMedia !== localMedia) {
                  fullMismatches.push({
                    id: remote.id,
                    title: remote.title,
                    remoteMessages,
                    localMessages,
                    remoteMedia,
                    localMedia,
                  });
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const type = error instanceof PermissionError ? 'permission' : 'other';
                fullErrors.push({ id: remote.id, error: message, type });
              }
            })
          )
        );

        if (fullErrors.length > 0) {
          fullSpinner.warn(`Full parity completed with ${fullErrors.length} errors`);
        } else {
          fullSpinner.succeed('Full parity completed');
        }
      }

      if (provider.cleanup) {
        await provider.cleanup();
      }
    } catch (error: any) {
      spinner.fail('Authentication failed');
      console.error(chalk.red(`\n${error.message}`));
      return { hasErrors: true };
    }
  }

  // Output summary
  console.log();
  console.log(chalk.bold('Local Archive:'));
  console.log(`  Conversations: ${chalk.cyan(localIds.length)}`);
  if (missingDirs.length > 0) {
    console.log(`  ${chalk.red('Missing dirs:')} ${missingDirs.length}`);
  }
  if (missingContentFiles.length > 0) {
    console.log(`  ${chalk.red('Missing content files:')} ${missingContentFiles.length}`);
  }

  console.log(chalk.bold('\nMedia Registry:'));
  console.log(`  Media files indexed: ${chalk.cyan(Object.keys(registry).length)}`);
  if (missingMediaFiles.length > 0) {
    console.log(`  ${chalk.red('Missing media files:')} ${missingMediaFiles.length}`);
  }
  if (danglingMediaRefs.length > 0) {
    console.log(`  ${chalk.yellow('Dangling references:')} ${danglingMediaRefs.length}`);
  }

  if (!options.localOnly) {
    console.log(chalk.bold('\nRemote Parity:'));
    console.log(`  Remote conversations: ${chalk.cyan(remoteConversations.length)}`);
    if (missingLocal.length > 0) {
      console.log(`  ${chalk.red('Missing locally:')} ${missingLocal.length}`);
    }
    if (staleLocal.length > 0) {
      console.log(`  ${chalk.red('Stale locally:')} ${staleLocal.length}`);
    }
    if (countMismatch.length > 0) {
      console.log(`  ${chalk.yellow('Message count mismatch:')} ${countMismatch.length}`);
    }
    if (countUnknown.length > 0) {
      console.log(`  ${chalk.gray('Message count unavailable:')} ${countUnknown.length}`);
    }
    if (localOnly.length > 0) {
      console.log(`  ${chalk.yellow('Local only (deleted remotely?):')} ${localOnly.length}`);
    }

    if (options.full) {
      console.log(chalk.bold('\nFull Parity:'));
      if (fullMismatches.length > 0) {
        console.log(`  ${chalk.red('Message/media mismatches:')} ${fullMismatches.length}`);
      } else {
        console.log(`  ${chalk.green('Message/media mismatches:')} 0`);
      }
      if (fullErrors.length > 0) {
        const permissionErrors = fullErrors.filter((e) => e.type === 'permission').length;
        console.log(`  ${chalk.red('Fetch errors:')} ${fullErrors.length}`);
        if (permissionErrors > 0) {
          console.log(`  ${chalk.yellow('Permission errors:')} ${permissionErrors}`);
        }
        const sample = fullErrors.slice(0, 3);
        for (const entry of sample) {
          console.log(chalk.gray(`  ${entry.id}: ${entry.error}`));
        }
        if (fullErrors.length > sample.length) {
          console.log(chalk.gray(`  ... and ${fullErrors.length - sample.length} more`));
        }
      }
    }
  }

  // Error conditions
  if (missingDirs.length > 0) hasErrors = true;
  if (missingContentFiles.length > 0) hasErrors = true;
  if (missingMediaFiles.length > 0) hasErrors = true;
  if (danglingMediaRefs.length > 0) hasErrors = true;
  if (missingLocal.length > 0) hasErrors = true;
  if (staleLocal.length > 0) hasErrors = true;
  if (countMismatch.length > 0) hasErrors = true;
  if (options.full && fullMismatches.length > 0) hasErrors = true;
  if (options.full && fullErrors.length > 0) hasErrors = true;

  console.log();
  if (hasErrors) {
    console.log(chalk.red('Verify result: Issues detected'));
  } else {
    console.log(chalk.green('Verify result: OK'));
  }

  return { hasErrors };
}
