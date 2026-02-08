/**
 * Schedule Command - Manage automated archiving schedules
 */

import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { ScheduleManager } from '../utils/schedule-manager.js';
import { listConfiguredProviders } from '../utils/config.js';
import type { ScheduleArchiveOptions } from '../types/schedule.js';
import fs from 'fs/promises';
import path from 'path';
import { createCliUI } from '../utils/cli-ui.js';

interface ScheduleCommandOptions {
  action?: 'add' | 'list' | 'remove' | 'enable' | 'disable' | 'status';
  id?: string;
  provider?: string;
  cron?: string;
  description?: string;
  limit?: string;
  sinceDays?: string;
  skipMedia?: boolean;
}

export async function scheduleCommand(options: ScheduleCommandOptions): Promise<void> {
  const ui = createCliUI();
  const manager = new ScheduleManager();
  const action = options.action || 'list';

  switch (action) {
    case 'add':
      await addSchedule(manager, options);
      break;
    case 'list':
      await listSchedules(manager);
      break;
    case 'remove':
      await removeSchedule(manager, options);
      break;
    case 'enable':
      await toggleSchedule(manager, options, true);
      break;
    case 'disable':
      await toggleSchedule(manager, options, false);
      break;
    case 'status':
      await showStatus(manager);
      break;
    default:
      ui.log.error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

/**
 * Add a new schedule
 */
async function addSchedule(
  manager: ScheduleManager,
  options: ScheduleCommandOptions
): Promise<void> {
  const ui = createCliUI();
  ui.intro(chalk.bold.blue('Add Schedule'));

  // Get provider
  let provider = options.provider;
  if (!provider) {
    const configured = await listConfiguredProviders();
    if (configured.length === 0) {
      ui.log.error('No providers configured. Run `ai-vault setup` first.');
      process.exit(1);
    }

    if (configured.length === 1) {
      provider = configured[0];
    } else {
      if (!ui.isInteractive) {
        ui.log.error('Provider selection requires a TTY. Pass --provider explicitly.');
        process.exit(1);
      }
      const selected = await clack.select({
        message: 'Select provider:',
        options: configured.map((p) => ({ value: p, label: p })),
      });

      if (clack.isCancel(selected)) {
        ui.cancel('Cancelled');
        process.exit(0);
      }

      provider = selected as string;
    }
  }

  // Get cron expression
  let cron = options.cron;
  if (!cron) {
    if (!ui.isInteractive) {
      ui.log.error('Cron selection requires a TTY. Pass --cron explicitly.');
      process.exit(1);
    }
    const cronChoice = await clack.select({
      message: 'Select schedule frequency:',
      options: [
        { value: '0 2 * * *', label: 'Daily at 2:00 AM' },
        { value: '0 */6 * * *', label: 'Every 6 hours' },
        { value: '0 0 * * 0', label: 'Weekly on Sunday at midnight' },
        { value: '0 0 1 * *', label: 'Monthly on the 1st at midnight' },
        { value: 'custom', label: 'Custom cron expression' },
      ],
    });

    if (clack.isCancel(cronChoice)) {
      ui.cancel('Cancelled');
      process.exit(0);
    }

    if (cronChoice === 'custom') {
      const customCron = await clack.text({
        message: 'Enter cron expression (e.g., "0 2 * * *"):',
        placeholder: '0 2 * * *',
        validate: (value) => {
          if (!value) return 'Cron expression is required';
          const parts = value.trim().split(/\s+/);
          if (parts.length < 5) return 'Invalid cron expression';
        },
      });

      if (clack.isCancel(customCron)) {
        ui.cancel('Cancelled');
        process.exit(0);
      }

      cron = customCron;
    } else {
      cron = cronChoice as string;
    }
  }

  // Get description
  let description = options.description;
  if (!description) {
    const desc = await clack.text({
      message: 'Description (optional):',
      placeholder: `Daily backup of ${provider}`,
    });

    if (!clack.isCancel(desc)) {
      description = desc || undefined;
    }
  }

  // Build archive options
  const archiveOptions: ScheduleArchiveOptions = {
    downloadMedia: !options.skipMedia,
  };

  if (options.limit) {
    archiveOptions.limit = parseInt(options.limit);
  }

  if (options.sinceDays) {
    archiveOptions.sinceDays = parseInt(options.sinceDays);
  }

  // Confirm
  console.log();
  clack.log.info(chalk.bold('Schedule Configuration:'));
  clack.log.info(`  Provider: ${provider}`);
  clack.log.info(`  Frequency: ${cron}`);
  if (description) {
    clack.log.info(`  Description: ${description}`);
  }
  clack.log.info(`  Download Media: ${archiveOptions.downloadMedia ? 'Yes' : 'No'}`);
  if (archiveOptions.limit) {
    clack.log.info(`  Limit: ${archiveOptions.limit} conversations`);
  }
  if (archiveOptions.sinceDays) {
    clack.log.info(`  Since: Last ${archiveOptions.sinceDays} days`);
  }
  console.log();

  const confirm = await clack.confirm({
    message: 'Create this schedule?',
  });

  if (clack.isCancel(confirm) || !confirm) {
    clack.cancel('Cancelled');
    process.exit(0);
  }

  // Create schedule
  const spinner = clack.spinner();
  spinner.start('Creating schedule...');

  try {
    const schedule = await manager.addSchedule(provider, cron, archiveOptions, description);
    spinner.stop('✓ Schedule created');

    console.log();
    clack.log.success(`Schedule ID: ${chalk.bold(schedule.id)}`);
    clack.log.info('The schedule has been installed in your system scheduler.');
    clack.log.info(`Logs will be written to: ${chalk.gray(`~/.ai-vault/logs/${schedule.id}.log`)}`);

    clack.outro(chalk.green('✓ Schedule added!'));
  } catch (error) {
    spinner.stop('Failed');
    clack.log.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * List all schedules
 */
async function listSchedules(manager: ScheduleManager): Promise<void> {
  const schedules = await manager.loadSchedules();

  if (schedules.length === 0) {
    clack.log.warn('No schedules configured.');
    clack.log.info('Run `ai-vault schedule add` to create a schedule.');
    return;
  }

  console.log(chalk.bold('\nConfigured Schedules:\n'));

  for (const schedule of schedules) {
    const status = schedule.enabled ? chalk.green('✓ Enabled') : chalk.gray('✗ Disabled');
    const lastRun = schedule.lastRun
      ? new Date(schedule.lastRun).toLocaleString()
      : chalk.gray('Never');

    console.log(chalk.bold(`${schedule.id}`));
    console.log(`  Provider: ${schedule.provider}`);
    console.log(`  Frequency: ${schedule.cron}`);
    if (schedule.description) {
      console.log(`  Description: ${schedule.description}`);
    }
    console.log(`  Status: ${status}`);
    console.log(`  Last Run: ${lastRun}`);
    if (schedule.lastStatus) {
      const statusIcon = schedule.lastStatus === 'success' ? chalk.green('✓') : chalk.red('✗');
      console.log(`  Last Status: ${statusIcon} ${schedule.lastStatus}`);
    }
    console.log();
  }
}

/**
 * Remove a schedule
 */
async function removeSchedule(
  manager: ScheduleManager,
  options: ScheduleCommandOptions
): Promise<void> {
  clack.intro(chalk.bold.blue('Remove Schedule'));

  let id = options.id;

  // If no ID provided, list schedules and prompt
  if (!id) {
    const schedules = await manager.loadSchedules();

    if (schedules.length === 0) {
      clack.log.warn('No schedules configured.');
      return;
    }

    const selected = await clack.select({
      message: 'Select schedule to remove:',
      options: schedules.map((s) => ({
        value: s.id,
        label: `${s.provider} - ${s.cron}${s.description ? ` (${s.description})` : ''}`,
      })),
    });

    if (clack.isCancel(selected)) {
      clack.cancel('Cancelled');
      process.exit(0);
    }

    id = selected as string;
  }

  // Confirm
  const confirm = await clack.confirm({
    message: `Remove schedule ${id}?`,
  });

  if (clack.isCancel(confirm) || !confirm) {
    clack.cancel('Cancelled');
    process.exit(0);
  }

  // Remove
  const spinner = clack.spinner();
  spinner.start('Removing schedule...');

  try {
    await manager.removeSchedule(id);
    spinner.stop('✓ Schedule removed');
    clack.outro(chalk.green('Schedule removed from system scheduler'));
  } catch (error) {
    spinner.stop('Failed');
    clack.log.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * Enable or disable a schedule
 */
async function toggleSchedule(
  manager: ScheduleManager,
  options: ScheduleCommandOptions,
  enable: boolean
): Promise<void> {
  const action = enable ? 'Enable' : 'Disable';
  clack.intro(chalk.bold.blue(`${action} Schedule`));

  let id = options.id;

  // If no ID provided, list schedules and prompt
  if (!id) {
    const schedules = await manager.loadSchedules();

    if (schedules.length === 0) {
      clack.log.warn('No schedules configured.');
      return;
    }

    const selected = await clack.select({
      message: `Select schedule to ${action.toLowerCase()}:`,
      options: schedules.map((s) => ({
        value: s.id,
        label: `${s.provider} - ${s.cron}${s.description ? ` (${s.description})` : ''}`,
      })),
    });

    if (clack.isCancel(selected)) {
      clack.cancel('Cancelled');
      process.exit(0);
    }

    id = selected as string;
  }

  // Update
  const spinner = clack.spinner();
  spinner.start(`${action}ing schedule...`);

  try {
    if (enable) {
      await manager.enableSchedule(id);
    } else {
      await manager.disableSchedule(id);
    }

    spinner.stop(`✓ Schedule ${enable ? 'enabled' : 'disabled'}`);
    clack.outro(chalk.green(`Schedule ${enable ? 'enabled' : 'disabled'}`));
  } catch (error) {
    spinner.stop('Failed');
    clack.log.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * Show status of all schedules (includes system scheduler info)
 */
async function showStatus(manager: ScheduleManager): Promise<void> {
  const schedules = await manager.loadSchedules();

  if (schedules.length === 0) {
    clack.log.warn('No schedules configured.');
    return;
  }

  console.log(chalk.bold('\nSchedule Status:\n'));

  for (const schedule of schedules) {
    const status = await manager.getScheduleStatus(schedule.id);

    if (!status) continue;

    const enabledStatus = schedule.enabled ? chalk.green('✓ Enabled') : chalk.gray('✗ Disabled');
    const installedStatus = status.installed
      ? chalk.green('✓ Installed')
      : chalk.red('✗ Not installed');

    console.log(chalk.bold(`${schedule.id}`));
    console.log(`  Provider: ${schedule.provider}`);
    console.log(`  Frequency: ${schedule.cron}`);
    if (schedule.description) {
      console.log(`  Description: ${schedule.description}`);
    }
    console.log(`  Config Status: ${enabledStatus}`);
    console.log(`  System Scheduler: ${installedStatus}`);

    if (status.nextRun) {
      console.log(`  Next Run: ${status.nextRun.toLocaleString()}`);
    }

    if (schedule.lastRun) {
      console.log(`  Last Run: ${new Date(schedule.lastRun).toLocaleString()}`);
      if (schedule.lastStatus) {
        const statusIcon = schedule.lastStatus === 'success' ? chalk.green('✓') : chalk.red('✗');
        console.log(`  Last Status: ${statusIcon} ${schedule.lastStatus}`);
      }
    }

    // Check for recent log
    const logPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.ai-vault',
      'logs',
      `${schedule.id}.log`
    );

    try {
      const stats = await fs.stat(logPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(
        `  Log File: ${chalk.gray(`~/.ai-vault/logs/${schedule.id}.log`)} (${sizeMB} MB)`
      );
    } catch {
      console.log(`  Log File: ${chalk.gray('No logs yet')}`);
    }

    console.log();
  }

  // Check for any failed schedules
  const failed = schedules.filter((s) => s.lastStatus === 'error');
  if (failed.length > 0) {
    console.log(chalk.red.bold(`⚠ ${failed.length} schedule(s) failed on last run`));
    console.log(chalk.gray('Check log files for details\n'));
  }
}
