/**
 * List command - Display conversations from configured providers
 */

import chalk from 'chalk';
import ora from 'ora';
import { getProvider } from '../providers/index.js';
import { loadConfig } from '../utils/config.js';
import type { ProviderName } from '../types/index.js';

interface ListOptions {
  provider?: string;
  search?: string;
  since?: string;
  until?: string;
  limit?: string;
}

export async function listCommand(options: ListOptions): Promise<void> {
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

    // Fetch conversation list
    const fetchSpinner = ora('Fetching conversation list...').start();
    const conversations = await provider.listConversations({
      since,
      until,
      limit,
    });
    fetchSpinner.succeed(`Found ${conversations.length} conversations`);

    // Apply search filter
    let filteredConversations = conversations;
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filteredConversations = conversations.filter((c) => {
        const titleMatch = c.title.toLowerCase().includes(searchLower);
        const previewMatch = c.preview?.toLowerCase().includes(searchLower);
        return titleMatch || previewMatch;
      });
      console.log(
        chalk.cyan(`\nFiltered to ${filteredConversations.length} matching conversations\n`)
      );
    }

    // Display conversations
    if (filteredConversations.length === 0) {
      console.log(chalk.yellow('No conversations found.'));
      return;
    }

    console.log(chalk.bold(`\nConversations from ${provider.displayName}:`));
    console.log(chalk.gray('─'.repeat(80)));

    filteredConversations.forEach((conv, index) => {
      const num = chalk.gray(`[${index + 1}/${filteredConversations.length}]`);
      const title = chalk.bold(conv.title);
      const messages = chalk.gray(`${conv.messageCount} messages`);
      const date = chalk.gray(conv.updatedAt.toLocaleDateString());
      const preview = conv.preview ? chalk.dim(`\n  ${conv.preview.substring(0, 100)}...`) : '';

      console.log(`${num} ${title}`);
      console.log(`  ${messages} • ${date}${preview}`);
      console.log();
    });

    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.green(`Total: ${filteredConversations.length} conversations`));

    // Cleanup
    if (provider.cleanup) {
      await provider.cleanup();
    }
  } catch (error: any) {
    console.error(chalk.red('\n✗ Error:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}
