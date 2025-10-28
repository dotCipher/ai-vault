/**
 * Provider interface - all AI platform providers must implement this
 */

import type { ProviderConfig, Conversation } from './index';

export interface ListConversationsOptions {
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export interface Provider {
  /** Unique provider identifier */
  readonly name: string;

  /** Human-readable display name */
  readonly displayName: string;

  /** Supported authentication methods */
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[];

  /**
   * Authenticate with the provider
   * @param config Provider configuration
   * @returns true if authentication successful
   * @throws {AuthenticationError} if authentication fails
   */
  authenticate(config: ProviderConfig): Promise<boolean>;

  /**
   * Test if current authentication is still valid
   * @returns true if authenticated and valid
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * List all conversations accessible to the authenticated user
   * @param options Filtering and pagination options
   * @returns Array of conversation summaries
   */
  listConversations(options?: ListConversationsOptions): Promise<ConversationSummary[]>;

  /**
   * Fetch complete conversation with all messages
   * @param id Conversation ID
   * @returns Complete conversation object
   * @throws {NotFoundError} if conversation doesn't exist
   */
  fetchConversation(id: string): Promise<Conversation>;

  /**
   * Download media file from provider
   * @param url Media URL
   * @param outputPath Local file path to save to
   * @returns Metadata about downloaded file
   */
  downloadMedia(url: string, outputPath: string): Promise<MediaDownloadResult>;

  /**
   * Extract cookies from browser for authentication
   * @param browser Browser name ('chrome', 'firefox', 'safari', 'edge')
   * @returns Cookie object
   */
  extractCookies?(browser: string): Promise<Record<string, string>>;

  /**
   * Cleanup resources (close browser sessions, etc.)
   */
  cleanup?(): Promise<void>;
}

/** Lightweight conversation summary for listing */
export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  hasMedia: boolean;
  preview?: string; // First message preview
}

export interface MediaDownloadResult {
  path: string;
  size: number;
  mimeType: string;
  hash?: string; // For deduplication
}

/** Custom error types */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}
