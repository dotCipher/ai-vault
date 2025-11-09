#!/usr/bin/env node

/**
 * AI Vault CLI
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get package.json path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('ai-vault')
  .description(
    'Own your data. Comprehensive backup of AI interactions—conversations, images, videos, code artifacts, and metadata—across multiple platforms.'
  );

program
  .command('version')
  .description('Output the current version')
  .action(() => {
    console.log(packageJson.version);
  });

program
  .command('setup')
  .description('Interactive setup wizard')
  .option('--cookies-file <path>', 'Path to cookies JSON file (for cookie-based auth)')
  .action(async (options) => {
    const { setupCommand } = await import('./commands/setup.js');
    await setupCommand(options);
  });

program
  .command('backup')
  .alias('archive')
  .description('Backup conversations from configured providers')
  .option('-p, --provider <provider>', 'Specific provider to backup')
  .option('-o, --output <directory>', 'Output directory (overrides config)')
  .option('--since <date>', 'Backup conversations since date (YYYY-MM-DD)')
  .option('--until <date>', 'Backup conversations until date (YYYY-MM-DD)')
  .option('--limit <number>', 'Maximum number of conversations to backup')
  .option('--dry-run', 'Preview what would be backed up without downloading')
  .option('--skip-media', 'Skip downloading media files (images, videos)')
  .option('--ids <ids...>', 'Specific conversation IDs to backup')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options) => {
    // Show deprecation warning if using 'archive' alias
    const command = program.args[0];
    if (command === 'archive') {
      console.log(
        chalk.yellow('⚠ Warning: "archive" is deprecated. Please use "backup" instead.')
      );
      console.log(chalk.gray('  The "archive" command will be removed in version 2.0.0\n'));
    }

    const { archiveCommand } = await import('./commands/archive.js');
    await archiveCommand({
      provider: options.provider,
      outputDir: options.output,
      since: options.since,
      until: options.until,
      limit: options.limit,
      dryRun: options.dryRun,
      skipMedia: options.skipMedia,
      conversationIds: options.ids,
      yes: options.yes,
    });
  });

program
  .command('import')
  .description('Import conversations from native platform exports')
  .option(
    '-p, --provider <provider>',
    'Provider (grok, chatgpt, claude) - auto-detected if omitted'
  )
  .requiredOption('-f, --file <path>', 'Path to export file or directory')
  .option('-o, --output <directory>', 'Output directory (overrides config)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options) => {
    const { importCommand } = await import('./commands/import.js');
    await importCommand(options);
  });

program
  .command('status')
  .description('Show sync status - compare remote conversations with local archive')
  .option('-p, --provider <provider>', 'Provider to check (grok-web, chatgpt, etc.)')
  .option('--since <date>', 'Check conversations since date (YYYY-MM-DD)')
  .option('--until <date>', 'Check conversations until date (YYYY-MM-DD)')
  .option('--limit <number>', 'Maximum number of conversations to check')
  .action(async (options) => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand(options);
  });

program
  .command('list')
  .description('[DEPRECATED: use "status" instead] List conversations from providers')
  .option('-p, --provider <provider>', 'Provider to list from (grok-web, grok-x, etc.)')
  .option('--search <query>', 'Search conversations by title or preview')
  .option('--since <date>', 'List conversations since date (YYYY-MM-DD)')
  .option('--until <date>', 'List conversations until date (YYYY-MM-DD)')
  .option('--limit <number>', 'Maximum number of conversations to list')
  .action(async (options) => {
    const { listCommand } = await import('./commands/list.js');
    await listCommand(options);
  });

program
  .command('schedule')
  .description('Manage automated backup schedules')
  .argument('[action]', 'Action: add, list, remove, enable, disable, status')
  .option('--id <id>', 'Schedule ID (for remove/enable/disable)')
  .option('-p, --provider <provider>', 'Provider to schedule')
  .option('--cron <expression>', 'Cron expression (e.g., "0 2 * * *")')
  .option('--description <text>', 'Schedule description')
  .option('--limit <number>', 'Maximum conversations to backup per run')
  .option('--since-days <days>', 'Only backup conversations from last N days')
  .option('--skip-media', 'Skip downloading media files')
  .action(async (action, options) => {
    const { scheduleCommand } = await import('./commands/schedule.js');
    await scheduleCommand({
      action: action || 'list',
      id: options.id,
      provider: options.provider,
      cron: options.cron,
      description: options.description,
      limit: options.limit,
      sinceDays: options.sinceDays,
      skipMedia: options.skipMedia,
    });
  });

program
  .command('upgrade')
  .alias('update')
  .description('Check for and install the latest version')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options) => {
    const ora = (await import('ora')).default;
    const axios = (await import('axios')).default;
    const { execSync } = await import('child_process');

    const spinner = ora('Checking for updates...').start();

    try {
      // Check latest version on npm
      const response = await axios.get('https://registry.npmjs.org/ai-vault/latest', {
        timeout: 5000,
      });
      const latestVersion = response.data.version;
      const currentVersion = packageJson.version;

      spinner.stop();

      if (latestVersion === currentVersion) {
        console.log(chalk.green('✓ You are already on the latest version!'));
        console.log(chalk.gray(`  Current: v${currentVersion}`));
        return;
      }

      console.log(chalk.yellow('\nUpdate available!'));
      console.log(chalk.gray(`  Current: v${currentVersion}`));
      console.log(chalk.green(`  Latest:  v${latestVersion}\n`));

      // Show release notes URL
      console.log(
        chalk.gray(
          `Release notes: https://github.com/dotCipher/ai-vault/releases/tag/v${latestVersion}\n`
        )
      );

      // Prompt for confirmation if -y not provided
      if (!options.yes) {
        console.log(chalk.cyan('Run with --yes to skip this prompt\n'));
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.bold('Upgrade now? (y/N): '), (ans) => {
            rl.close();
            resolve(ans);
          });
        });

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log(chalk.gray('Upgrade cancelled.'));
          return;
        }
      }

      // Perform upgrade
      console.log();
      const upgradeSpinner = ora('Installing latest version...').start();

      try {
        execSync('npm install -g ai-vault@latest', {
          stdio: 'pipe',
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
        });
        upgradeSpinner.succeed(chalk.green(`Successfully upgraded to v${latestVersion}!`));
        console.log(chalk.gray('\nRun `ai-vault --help` to see all commands.'));
      } catch (error) {
        upgradeSpinner.fail('Upgrade failed');
        console.error(
          chalk.red('\nError:'),
          error instanceof Error ? error.message : 'Unknown error'
        );
        console.log(chalk.yellow('\nTry manually: npm install -g ai-vault@latest'));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Failed to check for updates');
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      console.log(chalk.gray('\nCheck manually: https://www.npmjs.com/package/ai-vault'));
      process.exit(1);
    }
  });

program.parse();
