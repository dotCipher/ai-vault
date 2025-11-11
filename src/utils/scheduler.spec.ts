/**
 * Scheduler Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ScheduleConfig } from '../types/schedule';

// Mock child_process before importing Scheduler
const mockExecSync = vi.fn();
const mockExecAsync = vi.fn();

vi.mock('child_process', () => ({
  execSync: mockExecSync,
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    stat: vi.fn().mockResolvedValue({ size: 0 }),
  },
}));

// Import after mocking
const { Scheduler } = await import('./scheduler');

describe('Scheduler', () => {
  let scheduler: InstanceType<typeof Scheduler>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock execSync to return full path for which/where command
    mockExecSync.mockImplementation((command: string) => {
      if (command === 'which ai-vault' || command === 'where ai-vault') {
        return '/opt/homebrew/bin/ai-vault\n';
      }
      return '';
    });

    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

    // Create scheduler instance
    scheduler = new Scheduler();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getCliPath', () => {
    it('should return full path to ai-vault binary in production', () => {
      // Access the private cliPath property via reflection for testing
      const cliPath = (scheduler as any).cliPath;

      expect(cliPath).toBe('/opt/homebrew/bin/ai-vault');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringMatching(/which ai-vault|where ai-vault/),
        expect.objectContaining({ encoding: 'utf-8' })
      );
    });

    it('should handle multiple paths from Windows where command', () => {
      // Re-mock for this specific test - reset only call history
      mockExecSync.mockReset();
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'where ai-vault' || command === 'which ai-vault') {
          return 'C:\\Program Files\\ai-vault\\ai-vault.exe\nC:\\Windows\\ai-vault.exe\n';
        }
        return '';
      });

      // Create new scheduler to trigger path detection
      const winScheduler = new Scheduler();
      const cliPath = (winScheduler as any).cliPath;

      // Should take the first path
      expect(cliPath).toBe('C:\\Program Files\\ai-vault\\ai-vault.exe');
    });

    it('should fallback to "ai-vault" if which/where command fails', () => {
      // Re-mock for this specific test - reset only call history
      mockExecSync.mockReset();
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const fallbackScheduler = new Scheduler();
      const cliPath = (fallbackScheduler as any).cliPath;

      expect(cliPath).toBe('ai-vault');
    });
  });

  describe('buildArchiveCommand', () => {
    it('should use full path in generated command', () => {
      const schedule: ScheduleConfig = {
        id: 'test-id',
        provider: 'grok-web',
        cron: '0 2 * * *',
        enabled: true,
        options: {
          downloadMedia: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Call the private buildArchiveCommand method via reflection
      const command = (scheduler as any).buildArchiveCommand(schedule);

      // Should include full path, not just "ai-vault"
      expect(command).toContain('/opt/homebrew/bin/ai-vault');
      expect(command).toContain('backup');
      expect(command).toContain('--provider "grok-web"');
    });

    it('should include skip-media flag when downloadMedia is false', () => {
      const schedule: ScheduleConfig = {
        id: 'test-id',
        provider: 'grok-web',
        cron: '0 2 * * *',
        enabled: true,
        options: {
          downloadMedia: false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const command = (scheduler as any).buildArchiveCommand(schedule);

      expect(command).toContain('--skip-media');
    });

    it('should include limit when specified', () => {
      const schedule: ScheduleConfig = {
        id: 'test-id',
        provider: 'grok-web',
        cron: '0 2 * * *',
        enabled: true,
        options: {
          downloadMedia: true,
          limit: 100,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const command = (scheduler as any).buildArchiveCommand(schedule);

      expect(command).toContain('--limit 100');
    });
  });

  describe('installUnix', () => {
    it('should generate cron entry with full path', async () => {
      const schedule: ScheduleConfig = {
        id: 'test-schedule',
        provider: 'grok-web',
        cron: '0 2 * * *',
        enabled: true,
        options: {
          downloadMedia: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock for crontab commands
      mockExecAsync.mockImplementation(async (command: string) => {
        if (command === 'crontab -l') {
          throw new Error('no crontab');
        }
        if (command.startsWith('echo ')) {
          return { stdout: '', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      });

      await scheduler.install(schedule);

      // Verify that crontab installation command includes the full path
      const crontabCalls = mockExecAsync.mock.calls.filter((call) =>
        call[0].toString().includes('crontab -')
      );

      expect(crontabCalls.length).toBeGreaterThan(0);

      // Find the echo command that sets up the crontab
      const echoCall = mockExecAsync.mock.calls.find((call) =>
        call[0].toString().startsWith('echo ')
      );

      expect(echoCall).toBeDefined();
      expect(echoCall![0]).toContain('/opt/homebrew/bin/ai-vault');
      expect(echoCall![0]).toContain('backup');
    });
  });
});
