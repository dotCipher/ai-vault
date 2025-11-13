/**
 * Integration tests for CLI
 * Tests actual CLI execution using child processes via execa
 *
 * Run with: pnpm test:integration
 * These tests are slower but test the CLI as users would interact with it
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execa } from 'execa';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');
const cliPath = join(rootDir, 'dist/cli.js');

describe('CLI - Integration Tests', () => {
  beforeAll(() => {
    // Ensure CLI is built
    if (!existsSync(cliPath)) {
      throw new Error(
        `CLI not built. Run 'pnpm run build' before running integration tests.\nExpected: ${cliPath}`
      );
    }
  });

  describe('help command', () => {
    it('should display help when --help flag is used', async () => {
      const { stdout, exitCode } = await execa('node', [cliPath, '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: ai-vault');
      expect(stdout).toContain('Options:');
      expect(stdout).toContain('Commands:');
    });

    it('should display help for specific command', async () => {
      const { stdout, exitCode } = await execa('node', [cliPath, 'ui', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Usage: ai-vault ui');
      expect(stdout).toContain('--port');
      expect(stdout).toContain('--host');
    });
  });

  describe('version command', () => {
    it('should display version number', async () => {
      const { stdout, exitCode } = await execa('node', [cliPath, 'version']);

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/^\d+\.\d+\.\d+$/); // Semantic version format
    });

    it('should match package.json version', async () => {
      const { stdout } = await execa('node', [cliPath, 'version']);
      const { version } = await import(join(rootDir, 'package.json'), {
        assert: { type: 'json' },
      });

      expect(stdout.trim()).toBe(version);
    });
  });

  describe('error handling', () => {
    it('should exit with error code for unknown command', async () => {
      const result = await execa('node', [cliPath, 'unknown-command'], {
        reject: false,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('error');
    });

    it('should show help suggestion for unknown command', async () => {
      const result = await execa('node', [cliPath, 'invalid'], {
        reject: false,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toLowerCase()).toMatch(/unknown|help/);
    });
  });

  describe('command registration', () => {
    it('should list all expected commands in help', async () => {
      const { stdout } = await execa('node', [cliPath, '--help']);

      const expectedCommands = ['backup', 'schedule', 'status', 'ui', 'upgrade', 'version'];

      for (const cmd of expectedCommands) {
        expect(stdout).toContain(cmd);
      }
    });
  });

  describe('UI command', () => {
    it('should accept port option', async () => {
      // Just test that the option is accepted, don't actually start server
      const { stdout } = await execa('node', [cliPath, 'ui', '--help']);

      expect(stdout).toContain('--port');
      expect(stdout).toContain('3141'); // default port
    });

    it('should accept host option', async () => {
      const { stdout } = await execa('node', [cliPath, 'ui', '--help']);

      expect(stdout).toContain('--host');
      expect(stdout).toContain('127.0.0.1'); // default host
    });

    it('should accept api-key option', async () => {
      const { stdout } = await execa('node', [cliPath, 'ui', '--help']);

      expect(stdout).toContain('--api-key');
    });

    it('should accept --no-ui flag', async () => {
      const { stdout } = await execa('node', [cliPath, 'ui', '--help']);

      expect(stdout).toContain('--no-ui');
    });

    it('should accept --no-cors flag', async () => {
      const { stdout } = await execa('node', [cliPath, 'ui', '--help']);

      expect(stdout).toContain('--no-cors');
    });
  });

  describe('backup command', () => {
    it('should show help for backup command', async () => {
      const { stdout, exitCode } = await execa('node', [cliPath, 'backup', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('backup');
    });
  });

  describe('schedule command', () => {
    it('should show help for schedule command', async () => {
      const { stdout, exitCode } = await execa('node', [cliPath, 'schedule', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('schedule');
    });
  });

  describe('status command', () => {
    it('should show help for status command', async () => {
      const { stdout, exitCode } = await execa('node', [cliPath, 'status', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('status');
    });
  });

  describe('exit codes', () => {
    it('should exit with 0 on success', async () => {
      const { exitCode } = await execa('node', [cliPath, '--help']);
      expect(exitCode).toBe(0);
    });

    it('should exit with non-zero on error', async () => {
      const { exitCode } = await execa('node', [cliPath, 'invalid-cmd'], {
        reject: false,
      });
      expect(exitCode).not.toBe(0);
    });
  });
});
