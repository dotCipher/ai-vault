/**
 * Scheduling Types
 */

export interface ScheduleConfig {
  /** Unique ID for this schedule */
  id: string;

  /** Provider to archive */
  provider: string;

  /** Cron expression (e.g., "0 2 * * *" for 2 AM daily) */
  cron: string;

  /** Human-readable description */
  description?: string;

  /** Whether this schedule is enabled */
  enabled: boolean;

  /** Archive options to use */
  options: ScheduleArchiveOptions;

  /** Creation timestamp */
  createdAt: string;

  /** Last modified timestamp */
  updatedAt: string;

  /** Last run timestamp */
  lastRun?: string;

  /** Last run status */
  lastStatus?: 'success' | 'error';
}

export interface ScheduleArchiveOptions {
  /** Download media attachments */
  downloadMedia?: boolean;

  /** Maximum number of conversations to archive */
  limit?: number;

  /** Only archive conversations since this many days ago */
  sinceDays?: number;
}

export interface ScheduleStatus {
  /** Schedule configuration */
  schedule: ScheduleConfig;

  /** Whether the native scheduler has this job installed */
  installed: boolean;

  /** Next scheduled run time (if available) */
  nextRun?: Date;

  /** Recent logs */
  recentLogs?: LogEntry[];
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: unknown;
}
