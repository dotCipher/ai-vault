/**
 * Status command - Show diff between remote provider and local archive
 */

import chalk from 'chalk';
import ora from 'ora';
import { getProvider } from '../providers/index.js';
import { loadConfig } from '../utils/config.js';
import { createArchiver } from '../core/archiver.js';
import type { ProviderName } from '../types/index.js';

interface StatusOptions {
  provider?: string;
  since?: string;
  until?: string;
  limit?: string;
}

interface DiffResult {
  newConversations: Array<{
    id: string;
    title: string;
    updatedAt: Date;
    messageCount: number;
  }>;
  archivedConversations: Array<{
    id: string;
    title: string;
    updatedAt: Date;
    localUpdatedAt: Date;
    messageCount: number;
  }>;
  updatedConversations: Array<{
    id: string;
    title: string;
    remoteUpdatedAt: Date;
    localUpdatedAt: Date;
    messageCount: number;
  }>;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  try {
    const config = await loadConfig();

    // Determine which provider to use
    const providerName: ProviderName =
      (options.provider as ProviderName) || (Object.keys(config.providers)[0] as ProviderName);

    if (!providerName) {
      console.error(chalk.red('No provider specified. Run `ai-vault setup` first.'));
      process.exit(1);
    }

    const providerConfig = config.providers[providerName];
    if (!providerConfig) {
      console.error(
        chalk.red(`Provider '${providerName}' not configured. Run 'ai-vault setup' first.`)
      );
      process.exit(1);
    }

    // Initialize provider
    const spinner = ora(`Connecting to ${providerName}...`).start();
    const provider = getProvider(providerName);

    try {
      await provider.authenticate(providerConfig);
      spinner.succeed(`Connected to ${provider.displayName}`);
    } catch (error: any) {
      spinner.fail('Authentication failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }

    // Parse date filters
    const since = options.since ? new Date(options.since) : undefined;
    const until = options.until ? new Date(options.until) : undefined;
    const limit = options.limit ? parseInt(options.limit, 10) : undefined;

    // Fetch remote conversation list
    const fetchSpinner = ora('Fetching remote conversations...').start();
    const remoteConversations = await provider.listConversations({
      since,
      until,
      limit,
    });
    fetchSpinner.succeed(`Found ${remoteConversations.length} remote conversations`);

    // Load local archive
    const archiveSpinner = ora('Loading local archive...').start();
    let archiveDir = config.settings?.archiveDir;

    // Expand ~ to home directory
    if (archiveDir && archiveDir.startsWith('~')) {
      const os = await import('os');
      archiveDir = archiveDir.replace(/^~/, os.homedir());
    }

    const archiver = createArchiver(archiveDir);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = (archiver as any).storage;
    const localIndex = await storage.getIndex(providerName);
    archiveSpinner.succeed(`Found ${Object.keys(localIndex).length} local conversations`);

    // Calculate diff
    const diff: DiffResult = {
      newConversations: [],
      archivedConversations: [],
      updatedConversations: [],
    };

    const localConversationIds = new Set(Object.keys(localIndex));

    for (const remote of remoteConversations) {
      if (!localConversationIds.has(remote.id)) {
        // New conversation - not yet archived
        diff.newConversations.push({
          id: remote.id,
          title: remote.title,
          updatedAt: remote.updatedAt,
          messageCount: remote.messageCount,
        });
      } else {
        // Conversation exists locally
        const local = localIndex[remote.id];
        const remoteTime = remote.updatedAt.getTime();
        const localTime = new Date(local.updatedAt).getTime();

        // Check if remote has been updated since last archive (with 1 second tolerance)
        if (remoteTime > localTime + 1000) {
          diff.updatedConversations.push({
            id: remote.id,
            title: remote.title,
            remoteUpdatedAt: remote.updatedAt,
            localUpdatedAt: new Date(local.updatedAt),
            messageCount: remote.messageCount,
          });
        } else {
          diff.archivedConversations.push({
            id: remote.id,
            title: remote.title,
            updatedAt: remote.updatedAt,
            localUpdatedAt: new Date(local.updatedAt),
            messageCount: remote.messageCount,
          });
        }
      }
    }

    // Display results
    console.log();
    console.log(chalk.bold.cyan('═'.repeat(80)));
    console.log(chalk.bold.cyan(`Archive Status - ${provider.displayName}`));
    console.log(chalk.bold.cyan('═'.repeat(80)));
    console.log();

    // Summary
    console.log(chalk.bold('Summary:'));
    console.log(`  ${chalk.green('✓')} Already archived: ${diff.archivedConversations.length}`);
    console.log(`  ${chalk.yellow('○')} Updated remotely: ${diff.updatedConversations.length}`);
    console.log(`  ${chalk.blue('+')} New (not archived): ${diff.newConversations.length}`);
    console.log(`  ${chalk.gray('=')} Total remote: ${remoteConversations.length}`);
    console.log();

    // Show new conversations
    if (diff.newConversations.length > 0) {
      console.log(chalk.bold.blue(`\n📥 New Conversations (${diff.newConversations.length}):`));
      console.log(chalk.gray('─'.repeat(80)));
      diff.newConversations.slice(0, 10).forEach((conv) => {
        const date = chalk.gray(conv.updatedAt.toLocaleDateString());
        const messages = chalk.gray(`${conv.messageCount} messages`);
        console.log(`  ${chalk.blue('+')} ${conv.title}`);
        console.log(`     ${messages} • ${date}`);
      });
      if (diff.newConversations.length > 10) {
        console.log(chalk.gray(`     ... and ${diff.newConversations.length - 10} more`));
      }
      console.log();
    }

    // Show updated conversations
    if (diff.updatedConversations.length > 0) {
      console.log(
        chalk.bold.yellow(`\n🔄 Updated Remotely (${diff.updatedConversations.length}):`)
      );
      console.log(chalk.gray('─'.repeat(80)));
      diff.updatedConversations.slice(0, 10).forEach((conv) => {
        const remoteDate = chalk.yellow(conv.remoteUpdatedAt.toLocaleDateString());
        const localDate = chalk.gray(conv.localUpdatedAt.toLocaleDateString());
        const messages = chalk.gray(`${conv.messageCount} messages`);
        console.log(`  ${chalk.yellow('○')} ${conv.title}`);
        console.log(`     ${messages} • Remote: ${remoteDate} • Local: ${localDate}`);
      });
      if (diff.updatedConversations.length > 10) {
        console.log(chalk.gray(`     ... and ${diff.updatedConversations.length - 10} more`));
      }
      console.log();
    }

    // Show hint for archiving
    if (diff.newConversations.length > 0 || diff.updatedConversations.length > 0) {
      console.log(
        chalk.cyan('\n💡 Tip: Run `ai-vault archive` to download new and updated conversations')
      );
    }

    console.log(chalk.gray('─'.repeat(80)));
    console.log();

    // Cleanup
    if (provider.cleanup) {
      await provider.cleanup();
    }
  } catch (error: any) {
    console.error(chalk.red('\n✗ Error:'), error.message);
    process.exit(1);
  }
}
