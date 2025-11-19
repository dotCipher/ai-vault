/**
 * Platform-agnostic scheduler wrapper
 *
 * Manages native OS schedulers (cron on Unix, Task Scheduler on Windows)
 * Does not run as a daemon - just configures native OS schedulers
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import type { ScheduleConfig } from '../types/schedule.js';

const execAsync = promisify(exec);

export class Scheduler {
  private platform: string;
  private cliPath: string;

  constructor() {
    this.platform = platform();
    // Get the path to the ai-vault CLI executable
    this.cliPath = this.getCliPath();
  }

  /**
   * Get the path to the ai-vault CLI executable
   */
  private getCliPath(): string {
    // In production, this will be the installed binary path
    // In development, this will be the npm script
    if (process.env.NODE_ENV === 'development') {
      return 'npm run dev --';
    }

    // Get the full path to the installed binary
    // This is important for cron jobs which don't have the same PATH

    // First, try to resolve from the current script location
    // This works for both npm global installs and local installs
    try {
      const scriptPath = process.argv[1];
      if (scriptPath && path.isAbsolute(scriptPath)) {
        // For npm global installs, the script is typically in a bin directory
        // We need to find the symlink that points to it
        const binDir = path.dirname(scriptPath);
        const possibleBinPath = path.join(binDir, 'ai-vault');

        // Check if this is a valid executable
        try {
          fsSync.accessSync(possibleBinPath, fsSync.constants.X_OK);
          return possibleBinPath;
        } catch {
          // Not executable or doesn't exist at this path
        }
      }
    } catch {
      // process.argv[1] not available or invalid
    }

    // Try which/where command
    try {
      const command = this.platform === 'win32' ? 'where ai-vault' : 'which ai-vault';
      const result = execSync(command, {
        encoding: 'utf-8',
      });
      // On Windows, 'where' can return multiple paths, so take the first one
      return result.toString().trim().split('\n')[0];
    } catch {
      // Fallback to just 'ai-vault' if which/where fails
      // This shouldn't happen in normal installations, but provides a fallback
      return 'ai-vault';
    }
  }

  /**
   * Install a schedule into the native OS scheduler
   */
  async install(schedule: ScheduleConfig): Promise<void> {
    if (!schedule.enabled) {
      return;
    }

    if (this.platform === 'win32') {
      await this.installWindows(schedule);
    } else {
      await this.installUnix(schedule);
    }
  }

  /**
   * Remove a schedule from the native OS scheduler
   */
  async uninstall(scheduleId: string): Promise<void> {
    if (this.platform === 'win32') {
      await this.uninstallWindows(scheduleId);
    } else {
      await this.uninstallUnix(scheduleId);
    }
  }

  /**
   * Check if a schedule is installed in the native OS scheduler
   */
  async isInstalled(scheduleId: string): Promise<boolean> {
    if (this.platform === 'win32') {
      return this.isInstalledWindows(scheduleId);
    } else {
      return this.isInstalledUnix(scheduleId);
    }
  }

  /**
   * Get next run time for a schedule
   */
  async getNextRun(scheduleId: string): Promise<Date | null> {
    if (this.platform === 'win32') {
      return this.getNextRunWindows(scheduleId);
    } else {
      return this.getNextRunUnix(scheduleId);
    }
  }

  // ========== Unix (cron) Implementation ==========

  /**
   * Install schedule using cron
   */
  private async installUnix(schedule: ScheduleConfig): Promise<void> {
    const jobName = `ai-vault-${schedule.id}`;
    const logDir = this.getLogDir();
    const logFile = path.join(logDir, `${schedule.id}.log`);

    // Ensure log directory exists
    await fs.mkdir(logDir, { recursive: true });

    // Build command to run
    const command = this.buildArchiveCommand(schedule);
    const cronCommand = `${command} >> "${logFile}" 2>&1`;

    // Get existing crontab
    let crontab = '';
    try {
      const { stdout } = await execAsync('crontab -l');
      crontab = stdout;
    } catch {
      // No existing crontab, that's fine
    }

    // Remove any existing entry for this schedule
    const lines = crontab.split('\n').filter((line) => !line.includes(jobName));

    // Add new entry
    lines.push(`# ${jobName}: ${schedule.description || schedule.provider}`);
    lines.push(`${schedule.cron} ${cronCommand}`);
    lines.push(''); // Blank line at end

    // Install new crontab
    const newCrontab = lines.join('\n');
    await execAsync(`echo "${newCrontab.replace(/"/g, '\\"')}" | crontab -`);
  }

  /**
   * Remove schedule from cron
   */
  private async uninstallUnix(scheduleId: string): Promise<void> {
    const jobName = `ai-vault-${scheduleId}`;

    // Get existing crontab
    let crontab = '';
    try {
      const { stdout } = await execAsync('crontab -l');
      crontab = stdout;
    } catch {
      // No crontab, nothing to remove
      return;
    }

    // Remove entries for this schedule (comment line + cron line)
    const lines = crontab.split('\n');
    const filtered: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(jobName)) {
        // Skip this line and potentially the next one if it's the cron command
        if (line.startsWith('#') && i + 1 < lines.length) {
          i++; // Skip the cron command line too
        }
        continue;
      }
      filtered.push(line);
    }

    // Install updated crontab
    const newCrontab = filtered.join('\n');
    if (newCrontab.trim()) {
      await execAsync(`echo "${newCrontab.replace(/"/g, '\\"')}" | crontab -`);
    } else {
      // Remove crontab entirely if empty
      await execAsync('crontab -r').catch(() => {});
    }
  }

  /**
   * Check if schedule is installed in cron
   */
  private async isInstalledUnix(scheduleId: string): Promise<boolean> {
    const jobName = `ai-vault-${scheduleId}`;

    try {
      const { stdout } = await execAsync('crontab -l');
      return stdout.includes(jobName);
    } catch {
      return false;
    }
  }

  /**
   * Get next run time from cron (approximate - cron doesn't provide this directly)
   */
  private async getNextRunUnix(_scheduleId: string): Promise<Date | null> {
    // cron doesn't provide next run time directly
    // We could parse the cron expression, but that's complex
    // Return null for now - this is an optional feature
    return null;
  }

  // ========== Windows (Task Scheduler) Implementation ==========

  /**
   * Install schedule using Windows Task Scheduler
   */
  private async installWindows(schedule: ScheduleConfig): Promise<void> {
    const taskName = `AIVault-${schedule.id}`;
    const logDir = this.getLogDir();
    const logFile = path.join(logDir, `${schedule.id}.log`);

    // Ensure log directory exists
    await fs.mkdir(logDir, { recursive: true });

    // Convert cron to Task Scheduler schedule
    // For simplicity, we'll support basic patterns and convert them
    const { frequency, time } = this.parseCronForWindows(schedule.cron);

    // Build command
    const command = this.buildArchiveCommand(schedule);

    // Create task using schtasks
    const args = [
      '/Create',
      `/TN "${taskName}"`,
      `/TR "cmd /c ${command} >> \\"${logFile}\\" 2>&1"`,
      `/SC ${frequency}`,
      time ? `/ST ${time}` : '',
      '/F', // Force create (overwrite if exists)
    ].filter(Boolean);

    await execAsync(`schtasks ${args.join(' ')}`);
  }

  /**
   * Remove schedule from Windows Task Scheduler
   */
  private async uninstallWindows(scheduleId: string): Promise<void> {
    const taskName = `AIVault-${scheduleId}`;

    try {
      await execAsync(`schtasks /Delete /TN "${taskName}" /F`);
    } catch {
      // Task doesn't exist, that's fine
    }
  }

  /**
   * Check if schedule is installed in Windows Task Scheduler
   */
  private async isInstalledWindows(scheduleId: string): Promise<boolean> {
    const taskName = `AIVault-${scheduleId}`;

    try {
      await execAsync(`schtasks /Query /TN "${taskName}"`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get next run time from Windows Task Scheduler
   */
  private async getNextRunWindows(scheduleId: string): Promise<Date | null> {
    const taskName = `AIVault-${scheduleId}`;

    try {
      const { stdout } = await execAsync(`schtasks /Query /TN "${taskName}" /FO LIST /V`);

      // Parse output for "Next Run Time"
      const match = stdout.match(/Next Run Time:\s+(.+)/);
      if (match) {
        const dateStr = match[1].trim();
        if (dateStr !== 'N/A') {
          return new Date(dateStr);
        }
      }
    } catch {
      // Task doesn't exist or query failed
    }

    return null;
  }

  /**
   * Parse cron expression for Windows Task Scheduler
   * Supports basic patterns only
   */
  private parseCronForWindows(cron: string): { frequency: string; time?: string } {
    const parts = cron.trim().split(/\s+/);

    if (parts.length < 5) {
      throw new Error('Invalid cron expression');
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Daily at specific time
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      return { frequency: 'DAILY', time };
    }

    // Weekly on specific day
    if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
      const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      return { frequency: 'WEEKLY', time };
    }

    // Hourly
    if (hour === '*' && dayOfMonth === '*' && month === '*') {
      return { frequency: 'HOURLY' };
    }

    // Default to daily
    return { frequency: 'DAILY', time: '02:00' };
  }

  // ========== Helpers ==========

  /**
   * Build the backup command to run
   */
  private buildArchiveCommand(schedule: ScheduleConfig): string {
    const args: string[] = [this.cliPath, 'backup', `--provider "${schedule.provider}"`];

    // Add schedule ID for status tracking
    args.push(`--schedule-id "${schedule.id}"`);

    // Skip confirmation prompt for scheduled runs
    args.push('--yes');

    if (schedule.options.downloadMedia === false) {
      args.push('--skip-media');
    }

    if (schedule.options.limit) {
      args.push(`--limit ${schedule.options.limit}`);
    }

    if (schedule.options.sinceDays) {
      const date = new Date();
      date.setDate(date.getDate() - schedule.options.sinceDays);
      args.push(`--since "${date.toISOString().split('T')[0]}"`);
    }

    return args.join(' ');
  }

  /**
   * Get log directory path
   */
  private getLogDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.ai-vault', 'logs');
  }
}
