/**
 * Archive Command - Archive conversations from providers
 */

import chalk from 'chalk';
import { getProviderConfig, loadConfig } from '../utils/config.js';
import { getProvider } from '../providers/index.js';
import { createArchiver } from '../core/archiver.js';
import type { Provider } from '../types/provider.js';
import type { ArchiveOptions } from '../types/storage.js';
import { captureSnapshot, calculateDiff, printDataDiff } from '../utils/data-diff.js';
import { ScheduleManager } from '../utils/schedule-manager.js';
import { resolveArchiveDir } from '../utils/archive-dir.js';
import { createCliUI } from '../utils/cli-ui.js';

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
  const ui = createCliUI();

  // Initialize schedule manager if this is a scheduled run
  const scheduleManager = options.scheduleId ? new ScheduleManager() : null;

  // Track overall success for schedule status update
  let scheduleStatus: 'success' | 'error' = 'success';

  try {
    ui.intro(chalk.bold.blue('AI Vault Archive'));

    // Load config and configured providers
    const config = await loadConfig();
    const configuredProviders = Object.keys(config.providers);

    if (configuredProviders.length === 0) {
      ui.log.error('No providers configured.');
      ui.log.info('Run `ai-vault setup` first to configure a provider.');
      scheduleStatus = 'error';
      process.exit(1);
    }

    // Select provider
    let providerName = options.provider;

    if (!providerName) {
      if (configuredProviders.length === 1) {
        providerName = configuredProviders[0];
        ui.log.info(`Using provider: ${providerName}`);
      } else if (options.yes) {
        const defaultProvider = config.settings?.defaultProvider;
        if (defaultProvider && configuredProviders.includes(defaultProvider)) {
          providerName = defaultProvider;
          ui.log.info(`Using default provider: ${providerName}`);
        } else {
          ui.log.error('Provider is required when multiple providers are configured.');
          ui.log.info('Run `ai-vault backup <provider> --yes` or set settings.defaultProvider.');
          scheduleStatus = 'error';
          process.exit(1);
        }
      } else {
        if (!ui.isInteractive) {
          ui.log.error('Provider selection requires a TTY. Provide a provider or use --yes.');
          scheduleStatus = 'error';
          process.exit(1);
        }

        const selected = await ui.select({
          message: 'Select provider to archive:',
          options: configuredProviders.map((name) => ({
            value: name,
            label: name.charAt(0).toUpperCase() + name.slice(1),
          })),
        });

        if (ui.isCancel(selected)) {
          ui.cancel('Archive cancelled');
          process.exit(0);
        }

        providerName = selected as string;
      }
    }

    // Verify provider is configured
    if (!configuredProviders.includes(providerName)) {
      ui.log.error(`Provider "${providerName}" is not configured.`);
      ui.log.info(`Configured providers: ${configuredProviders.join(', ')}`);
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
        ui.log.error(`Invalid date format: ${options.since}`);
        scheduleStatus = 'error';
        process.exit(1);
      }
    }

    if (options.until) {
      archiveOptions.until = new Date(options.until);
      if (isNaN(archiveOptions.until.getTime())) {
        ui.log.error(`Invalid date format: ${options.until}`);
        scheduleStatus = 'error';
        process.exit(1);
      }
    }

    // Parse limit
    if (options.limit) {
      const limit = parseInt(options.limit);
      if (isNaN(limit) || limit <= 0) {
        ui.log.error('Limit must be a positive number');
        scheduleStatus = 'error';
        process.exit(1);
      }
      archiveOptions.limit = limit;
    }

    // Set options
    archiveOptions.dryRun = options.dryRun || false;
    archiveOptions.downloadMedia = !options.skipMedia;
    archiveOptions.conversationIds = options.conversationIds;

    const displayArchiveDir =
      options.outputDir || config.settings?.archiveDir || '~/ai-vault-data (default)';

    // Show summary
    console.log();
    ui.log.info(chalk.bold('Archive Configuration:'));
    ui.log.info(`  Provider: ${providerName}`);
    ui.log.info(`  Output: ${displayArchiveDir}`);
    if (archiveOptions.since) {
      ui.log.info(`  Since: ${archiveOptions.since.toLocaleDateString()}`);
    }
    if (archiveOptions.until) {
      ui.log.info(`  Until: ${archiveOptions.until.toLocaleDateString()}`);
    }
    if (archiveOptions.limit) {
      ui.log.info(`  Limit: ${archiveOptions.limit} conversations`);
    }
    ui.log.info(`  Media: ${archiveOptions.downloadMedia ? 'Yes' : 'No'}`);
    ui.log.info(`  Mode: ${archiveOptions.dryRun ? 'Dry Run (preview only)' : 'Live'}`);
    console.log();

    // Confirm if not dry run and --yes not provided
    if (!archiveOptions.dryRun && !options.yes) {
      if (!ui.isInteractive) {
        ui.log.error('Confirmation requires a TTY. Re-run with --yes.');
        scheduleStatus = 'error';
        process.exit(1);
      }

      const confirm = await ui.confirm({
        message: 'Start archiving?',
      });

      if (ui.isCancel(confirm) || !confirm) {
        ui.cancel('Archive cancelled');
        process.exit(0);
      }
    }

    // Run archive
    console.log();

    // Determine archive directory: CLI option > config > default
    const archiveDir = resolveArchiveDir(options.outputDir || config.settings?.archiveDir);
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
        ui.log.warn(`Completed with ${result.errors.length} errors`);
        scheduleStatus = 'error';
      } else {
        ui.outro(chalk.green('✓ Archive complete!'));
      }
    } catch (error) {
      ui.log.error('Archive failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
      scheduleStatus = 'error';
      throw error;
    } finally {
      if (provider.cleanup) {
        try {
          await provider.cleanup();
        } catch (cleanupError) {
          console.error(
            'Warning: Failed to cleanup provider resources:',
            cleanupError instanceof Error ? cleanupError.message : cleanupError
          );
        }
      }
    }
  } catch (error) {
    scheduleStatus = 'error';
    console.error('Archive error:', error instanceof Error ? error.message : error);
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
  const ui = createCliUI();
  const spinner = ui.spinner();
  spinner.start('Authenticating...');

  try {
    await provider.authenticate(config);
    const isAuth = await provider.isAuthenticated();

    if (!isAuth) {
      spinner.stop('Authentication failed');
      console.log();
      ui.log.error('Your session cookies appear to be expired or invalid.');
      ui.log.info(
        chalk.yellow(`To fix this, run: ${chalk.bold(`ai-vault setup ${providerName}`)}`)
      );
      ui.log.info(chalk.gray('This will guide you through updating your session cookies.'));
      process.exit(1);
    }

    spinner.stop('✓ Authenticated');
  } catch (error: any) {
    spinner.stop('Authentication failed');
    console.log();
    ui.log.error(error.message || 'Unknown authentication error');

    // Show helpful hint for auth-related errors
    if (
      error.message?.includes('401') ||
      error.message?.includes('session') ||
      error.message?.includes('cookies') ||
      error.message?.includes('authentication') ||
      error.message?.includes('unauthorized') ||
      error.name === 'AuthenticationError'
    ) {
      ui.log.info(
        chalk.yellow(`To fix this, run: ${chalk.bold(`ai-vault setup ${providerName}`)}`)
      );
      ui.log.info(chalk.gray('This will guide you through updating your session cookies.'));
    }
    process.exit(1);
  }

  return provider;
}
