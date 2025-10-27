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
    'Own your data. Comprehensive archival of AI interactions—conversations, images, videos, code artifacts, and metadata—across multiple platforms.'
  )
  .version(packageJson.version, '-v, -V, --version', 'Output the current version');

program
  .command('setup')
  .description('Interactive setup wizard')
  .action(async () => {
    console.log(chalk.blue('Setup wizard coming soon!'));
    console.log(chalk.gray('This will help you configure providers and authentication.'));
  });

program
  .command('archive')
  .description('Archive conversations from configured providers')
  .option('-p, --provider <provider>', 'Specific provider to archive')
  .option('--since <date>', 'Archive conversations since date')
  .option('--dry-run', 'Preview what would be archived without downloading')
  .action(async (options) => {
    console.log(chalk.blue('Archive command coming soon!'));
    console.log(chalk.gray('Options:'), options);
  });

program
  .command('list')
  .description('List archived conversations')
  .option('-p, --provider <provider>', 'Filter by provider')
  .option('--search <query>', 'Search conversations')
  .action(async (options) => {
    console.log(chalk.blue('List command coming soon!'));
    console.log(chalk.gray('Options:'), options);
  });

program
  .command('schedule')
  .description('Configure automated backup schedule')
  .option('--daily', 'Schedule daily backups')
  .option('--cron <expression>', 'Custom cron expression')
  .option('--list', 'List scheduled jobs')
  .action(async (options) => {
    console.log(chalk.blue('Schedule command coming soon!'));
    console.log(chalk.gray('Options:'), options);
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
