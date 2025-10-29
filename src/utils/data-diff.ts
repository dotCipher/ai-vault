/**
 * Data Diff Utility
 *
 * Provider-agnostic utility for capturing and displaying
 * before/after statistics for import and archive operations
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import type { Storage } from '../core/storage.js';

export interface DataSnapshot {
  conversations: number;
  messages: number;
  media: number;
  sizeBytes: number;
}

export interface DataDiff {
  conversations: number;
  messages: number;
  media: number;
  sizeBytes: number;
}

/**
 * Capture current storage statistics for a provider
 */
export async function captureSnapshot(storage: Storage, provider: string): Promise<DataSnapshot> {
  const stats = await storage.getStats(provider);

  return {
    conversations: stats.totalConversations,
    messages: stats.totalMessages,
    media: stats.totalMedia || 0,
    sizeBytes: stats.totalSize || 0,
  };
}

/**
 * Calculate the difference between two snapshots
 */
export function calculateDiff(before: DataSnapshot, after: DataSnapshot): DataDiff {
  return {
    conversations: after.conversations - before.conversations,
    messages: after.messages - before.messages,
    media: after.media - before.media,
    sizeBytes: after.sizeBytes - before.sizeBytes,
  };
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Print a data diff summary report in compact table format
 */
export function printDataDiff(
  diff: DataDiff,
  before: DataSnapshot,
  after: DataSnapshot,
  operation: 'import' | 'archive'
): void {
  // Only show diff if there were changes
  const hasChanges =
    diff.conversations !== 0 || diff.messages !== 0 || diff.media !== 0 || diff.sizeBytes !== 0;

  if (!hasChanges) {
    console.log(chalk.gray('\nNo data changes detected'));
    return;
  }

  console.log(chalk.bold.cyan(`\n📊 Data Summary (${operation})`));

  const table = new Table({
    head: [
      chalk.white('Metric'),
      chalk.white('Before'),
      chalk.white('After'),
      chalk.white('Change'),
    ],
    style: {
      head: [],
      border: ['gray'],
    },
    colAligns: ['left', 'right', 'right', 'right'],
  });

  // Add conversations row
  if (diff.conversations !== 0 || before.conversations > 0) {
    table.push([
      chalk.cyan('Conversations'),
      chalk.gray(before.conversations.toString()),
      chalk.white(after.conversations.toString()),
      diff.conversations > 0 ? chalk.green(`+${diff.conversations}`) : chalk.gray('0'),
    ]);
  }

  // Add messages row
  if (diff.messages !== 0 || before.messages > 0) {
    table.push([
      chalk.cyan('Messages'),
      chalk.gray(before.messages.toString()),
      chalk.white(after.messages.toString()),
      diff.messages > 0 ? chalk.green(`+${diff.messages}`) : chalk.gray('0'),
    ]);
  }

  // Add media row
  if (diff.media !== 0 || before.media > 0) {
    table.push([
      chalk.cyan('Media Files'),
      chalk.gray(before.media.toString()),
      chalk.white(after.media.toString()),
      diff.media > 0 ? chalk.green(`+${diff.media}`) : chalk.gray('0'),
    ]);
  }

  // Add storage size row
  if (diff.sizeBytes !== 0 || before.sizeBytes > 0) {
    table.push([
      chalk.cyan('Storage Size'),
      chalk.gray(formatBytes(before.sizeBytes)),
      chalk.white(formatBytes(after.sizeBytes)),
      diff.sizeBytes > 0 ? chalk.green(`+${formatBytes(diff.sizeBytes)}`) : chalk.gray('0 B'),
    ]);
  }

  console.log(table.toString());
  console.log();
}

/**
 * Print a compact inline diff (for use within other summaries)
 */
export function printCompactDiff(diff: DataDiff): void {
  const parts: string[] = [];

  if (diff.conversations > 0) {
    parts.push(`${chalk.green(`+${diff.conversations}`)} conversations`);
  }

  if (diff.messages > 0) {
    parts.push(`${chalk.green(`+${diff.messages}`)} messages`);
  }

  if (diff.media > 0) {
    parts.push(`${chalk.green(`+${diff.media}`)} media files`);
  }

  if (diff.sizeBytes > 0) {
    parts.push(`${chalk.green(`+${formatBytes(diff.sizeBytes)}`)}`);
  }

  if (parts.length > 0) {
    console.log(chalk.bold('\nData Changes: ') + parts.join(', '));
  }
}
