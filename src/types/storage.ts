/**
 * Storage and Archive Configuration Types
 */

export interface StorageConfig {
  /** Base directory for all archived data */
  baseDir: string;

  /** Export formats to generate */
  formats: ExportFormat[];

  /** Whether to organize by date */
  organizeByDate?: boolean;

  /** Custom directory naming pattern */
  dirPattern?: string;
}

export type ExportFormat = 'json' | 'markdown';

export interface ArchiveOptions {
  /** Provider to archive from */
  provider?: string;

  /** Specific conversation IDs to archive (if empty, archive all) */
  conversationIds?: string[];

  /** Only archive conversations since this date */
  since?: Date;

  /** Only archive conversations until this date */
  until?: Date;

  /** Download media attachments */
  downloadMedia?: boolean;

  /** Skip already archived conversations */
  skipExisting?: boolean;

  /** Dry run (don't actually save anything) */
  dryRun?: boolean;

  /** Maximum number of conversations to archive */
  limit?: number;

  /** Filter conversations by text search (searches title and preview) */
  searchQuery?: string;

  /** Maximum number of conversations to process in parallel (default: 3) */
  concurrency?: number;
}

export interface ArchiveResult {
  /** Number of conversations archived */
  conversationsArchived: number;

  /** Number of conversations skipped (already exist) */
  conversationsSkipped: number;

  /** Number of media files downloaded */
  mediaDownloaded: number;

  /** Number of media files skipped (already exist) */
  mediaSkipped: number;

  /** Total bytes downloaded */
  bytesDownloaded: number;

  /** Number of assets archived */
  assetsArchived?: number;

  /** Number of workspaces archived */
  workspacesArchived?: number;

  /** Total time taken (ms) */
  duration: number;

  /** Any errors encountered */
  errors: ArchiveError[];
}

export interface ArchiveError {
  /** Conversation or media ID */
  id: string;

  /** Error type */
  type: 'conversation' | 'media';

  /** Error message */
  message: string;

  /** Original error */
  error?: Error;
}

export interface MediaRegistry {
  /** SHA256 hash → file path mapping */
  [hash: string]: {
    path: string;
    size: number;
    mimeType: string;
    firstSeen: string; // ISO timestamp
    references: string[]; // Conversation IDs that reference this media
  };
}

export interface ConversationIndex {
  /** Conversation ID → metadata */
  [id: string]: {
    title: string;
    provider: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
    archivedAt: string;
    hasMedia: boolean;
    mediaCount: number;
    path: string;
  };
}
