/**
 * UI command - start the web UI and API server
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { startServer } from '../api/server.js';

export function createUICommand(): Command {
  const command = new Command('ui');

  command
    .description('Start the web UI and local API server')
    .option('-p, --port <port>', 'Port to run the server on', '3141')
    .option('--host <host>', 'Host to bind the server to', '127.0.0.1')
    .option('--api-key <key>', 'API key for authentication (optional)')
    .option('--no-ui', 'Start API server only, without serving the web UI')
    .option('--no-cors', 'Disable CORS')
    .action(async (options) => {
      const spinner = ora('Starting AI Vault UI server...').start();

      try {
        const port = parseInt(options.port);
        const host = options.host;

        spinner.text = `Starting server on ${host}:${port}...`;

        await startServer({
          port,
          host,
          apiKey: options.apiKey,
          enableCors: options.cors,
          serveUI: options.ui,
        });

        spinner.stop();

        console.log(chalk.green('\n✨ AI Vault UI is ready!\n'));
        console.log(chalk.blue(`   Visit: http://${host}:${port}\n`));

        if (options.apiKey) {
          console.log(
            chalk.yellow(
              `   🔒 API authentication enabled. Use header: X-API-Key: ${options.apiKey}\n`
            )
          );
        }

        console.log(chalk.gray('   Press Ctrl+C to stop the server\n'));

        // Keep process alive
        await new Promise(() => {});
      } catch (error) {
        spinner.fail('Failed to start server');
        console.error(chalk.red(`\n${error instanceof Error ? error.message : 'Unknown error'}\n`));
        process.exit(1);
      }
    });

  return command;
}
