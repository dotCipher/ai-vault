/**
 * Archive Command - Archive conversations from providers
 */

import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { getProviderConfig, listConfiguredProviders, loadConfig } from '../utils/config.js';
import { getProvider } from '../providers/index.js';
import { createArchiver } from '../core/archiver.js';
import type { Provider } from '../types/provider.js';
import type { ArchiveOptions } from '../types/storage.js';
import { captureSnapshot, calculateDiff, printDataDiff } from '../utils/data-diff.js';
import { ScheduleManager } from '../utils/schedule-manager.js';

interface ArchiveCommandOptions {
  provider?: string;
  outputDir?: string;
  since?: string;
  until?: string;
  limit?: string;
  dryRun?: boolean;
  skipMedia?: boolean;
  conversationIds?: string[];
  yes?: boolean;
  scheduleId?: string;
}

export async function archiveCommand(options: ArchiveCommandOptions): Promise<void> {
  // Initialize schedule manager if this is a scheduled run
  const scheduleManager = options.scheduleId ? new ScheduleManager() : null;

  // Track overall success for schedule status update
  let scheduleStatus: 'success' | 'error' = 'success';

  try {
    clack.intro(chalk.bold.blue('AI Vault Archive'));

    // Check for configured providers
    const configuredProviders = await listConfiguredProviders();

    if (configuredProviders.length === 0) {
      clack.log.error('No providers configured.');
      clack.log.info('Run `ai-vault setup` first to configure a provider.');
      scheduleStatus = 'error';
      process.exit(1);
    }

    // Select provider
    let providerName = options.provider;

    if (!providerName) {
      if (configuredProviders.length === 1) {
        providerName = configuredProviders[0];
        clack.log.info(`Using provider: ${providerName}`);
      } else {
        const selected = await clack.select({
          message: 'Select provider to archive:',
          options: configuredProviders.map((name) => ({
            value: name,
            label: name.charAt(0).toUpperCase() + name.slice(1),
          })),
        });

        if (clack.isCancel(selected)) {
          clack.cancel('Archive cancelled');
          process.exit(0);
        }

        providerName = selected as string;
      }
    }

    // Verify provider is configured
    if (!configuredProviders.includes(providerName)) {
      clack.log.error(`Provider "${providerName}" is not configured.`);
      clack.log.info(`Configured providers: ${configuredProviders.join(', ')}`);
      scheduleStatus = 'error';
      process.exit(1);
    }

    // Load provider
    const provider = await loadProvider(providerName);

    // Build archive options
    const archiveOptions: ArchiveOptions = {
      provider: providerName,
      skipExisting: true,
    };

    // Parse date filters
    if (options.since) {
      archiveOptions.since = new Date(options.since);
      if (isNaN(archiveOptions.since.getTime())) {
        clack.log.error(`Invalid date format: ${options.since}`);
        scheduleStatus = 'error';
        process.exit(1);
      }
    }

    if (options.until) {
      archiveOptions.until = new Date(options.until);
      if (isNaN(archiveOptions.until.getTime())) {
        clack.log.error(`Invalid date format: ${options.until}`);
        scheduleStatus = 'error';
        process.exit(1);
      }
    }

    // Parse limit
    if (options.limit) {
      const limit = parseInt(options.limit);
      if (isNaN(limit) || limit <= 0) {
        clack.log.error('Limit must be a positive number');
        scheduleStatus = 'error';
        process.exit(1);
      }
      archiveOptions.limit = limit;
    }

    // Set options
    archiveOptions.dryRun = options.dryRun || false;
    archiveOptions.downloadMedia = !options.skipMedia;
    archiveOptions.conversationIds = options.conversationIds;

    // Load config once for directory determination
    const config = await loadConfig();
    const displayArchiveDir =
      options.outputDir || config.settings?.archiveDir || '~/ai-vault-data (default)';

    // Show summary
    console.log();
    clack.log.info(chalk.bold('Archive Configuration:'));
    clack.log.info(`  Provider: ${providerName}`);
    clack.log.info(`  Output: ${displayArchiveDir}`);
    if (archiveOptions.since) {
      clack.log.info(`  Since: ${archiveOptions.since.toLocaleDateString()}`);
    }
    if (archiveOptions.until) {
      clack.log.info(`  Until: ${archiveOptions.until.toLocaleDateString()}`);
    }
    if (archiveOptions.limit) {
      clack.log.info(`  Limit: ${archiveOptions.limit} conversations`);
    }
    clack.log.info(`  Media: ${archiveOptions.downloadMedia ? 'Yes' : 'No'}`);
    clack.log.info(`  Mode: ${archiveOptions.dryRun ? 'Dry Run (preview only)' : 'Live'}`);
    console.log();

    // Confirm if not dry run and --yes not provided
    if (!archiveOptions.dryRun && !options.yes) {
      const confirm = await clack.confirm({
        message: 'Start archiving?',
      });

      if (clack.isCancel(confirm) || !confirm) {
        clack.cancel('Archive cancelled');
        process.exit(0);
      }
    }

    // Run archive
    console.log();

    // Determine archive directory: CLI option > config > default
    let archiveDir = options.outputDir || config.settings?.archiveDir;

    // Expand ~ to home directory
    if (archiveDir && archiveDir.startsWith('~')) {
      const os = await import('os');
      archiveDir = archiveDir.replace(/^~/, os.homedir());
    }

    const archiver = createArchiver(archiveDir);
    await archiver.init();

    try {
      // Capture stats before archiving (for data diff)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storage = (archiver as any).storage;
      const beforeSnapshot = await captureSnapshot(storage, providerName);

      // Run archive
      const result = await archiver.archive(provider, archiveOptions);

      // Capture stats after archiving (for data diff)
      const afterSnapshot = await captureSnapshot(storage, providerName);

      // Calculate and display data diff
      if (!archiveOptions.dryRun) {
        const diff = calculateDiff(beforeSnapshot, afterSnapshot);
        printDataDiff(diff, beforeSnapshot, afterSnapshot, 'archive');
      }

      console.log();

      if (result.errors.length > 0) {
        clack.log.warn(`Completed with ${result.errors.length} errors`);
        scheduleStatus = 'error';
      } else {
        clack.outro(chalk.green('✓ Archive complete!'));
      }
    } catch (error) {
      clack.log.error(
        'Archive failed: ' + (error instanceof Error ? error.message : 'Unknown error')
      );
      scheduleStatus = 'error';
      throw error;
    } finally {
      if (provider.cleanup) {
        await provider.cleanup();
      }
    }
  } catch (error) {
    scheduleStatus = 'error';
    if ((error as any)?.isExit !== false) {
      process.exit(1);
    }
  } finally {
    // Update schedule status if this was a scheduled run
    if (scheduleManager && options.scheduleId) {
      try {
        await scheduleManager.updateLastRun(options.scheduleId, scheduleStatus);
      } catch (error) {
        // Don't fail the entire command if status update fails
        console.error('Warning: Failed to update schedule status:', error);
      }
    }
  }
}

/**
 * Load and authenticate provider
 */
async function loadProvider(providerName: string): Promise<Provider> {
  const config = await getProviderConfig(providerName);

  if (!config) {
    throw new Error(`Provider ${providerName} is not configured`);
  }

  let provider: Provider;

  // Get provider instance from registry
  try {
    provider = getProvider(providerName as any);
  } catch (error) {
    throw new Error(`Provider ${providerName} is not available: ${error}`);
  }

  // Authenticate
  const spinner = clack.spinner();
  spinner.start('Authenticating...');

  try {
    await provider.authenticate(config);
    const isAuth = await provider.isAuthenticated();

    if (!isAuth) {
      spinner.stop('Authentication failed');
      throw new Error('Could not authenticate. Check your credentials.');
    }

    spinner.stop('✓ Authenticated');
  } catch (error) {
    spinner.stop('Authentication failed');
    throw error;
  }

  return provider;
}
