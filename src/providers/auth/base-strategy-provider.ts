/**
 * Strategy-Based Provider Base Class
 *
 * Improved base provider that uses pluggable authentication strategies
 * Providers can register multiple auth strategies and the system will
 * automatically select the best one based on the config.
 */

import type {
  Provider,
  ListConversationsOptions,
  ConversationSummary,
  MediaDownloadResult,
} from '../../types/provider.js';
import type { ProviderName, ProviderConfig, Conversation } from '../../types/index.js';
import type { AuthStrategy, AuthContext } from './strategies.js';
import { AuthStrategyManager } from './strategies.js';
import { AuthenticationError } from '../../types/provider.js';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';

/**
 * Enhanced base provider with auth strategy support
 */
export abstract class StrategyBasedProvider implements Provider {
  abstract readonly name: ProviderName;
  abstract readonly displayName: string;
  abstract readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[];

  protected config?: ProviderConfig;
  protected authContext?: AuthContext;
  protected strategyManager: AuthStrategyManager;

  constructor() {
    this.strategyManager = new AuthStrategyManager();
    this.registerAuthStrategies();
  }

  /**
   * Register authentication strategies for this provider
   * Subclasses should override to register provider-specific strategies
   */
  protected abstract registerAuthStrategies(): void;

  /**
   * Authenticate using the best available strategy
   */
  async authenticate(config: ProviderConfig): Promise<boolean> {
    this.config = config;

    try {
      this.authContext = await this.strategyManager.authenticate(config);
      return await this.isAuthenticated();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(`Authentication failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check if currently authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    if (!this.authContext) {
      return false;
    }

    const strategy = this.strategyManager['strategies'].find(
      s => s.name === this.authContext!.strategy
    );

    if (!strategy) {
      return false;
    }

    return await strategy.isValid(this.authContext);
  }

  /**
   * Helper to require authentication
   */
  protected requireAuth(): void {
    if (!this.config || !this.authContext) {
      throw new Error(`Provider ${this.name} is not configured. Run 'ai-vault setup' first.`);
    }
  }

  /**
   * Get the HTTP client from auth context (for API-based strategies)
   */
  protected getHttpClient() {
    this.requireAuth();
    if (!this.authContext?.httpClient) {
      throw new Error(`HTTP client not available for strategy: ${this.authContext?.strategy}`);
    }
    return this.authContext.httpClient;
  }

  /**
   * Get the browser scraper from auth context (for scraper-based strategies)
   */
  protected getScraper() {
    this.requireAuth();
    if (!this.authContext?.scraper) {
      throw new Error(`Browser scraper not available for strategy: ${this.authContext?.strategy}`);
    }
    return this.authContext.scraper;
  }

  /**
   * Check which auth strategy is currently active
   */
  protected getActiveStrategy(): string {
    return this.authContext?.strategy || 'none';
  }

  /**
   * Default implementation for downloading media files
   */
  async downloadMedia(url: string, outputPath: string): Promise<MediaDownloadResult> {
    // Use authenticated HTTP client if available, otherwise use axios directly
    const client = this.authContext?.httpClient || axios;

    const response = await client.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'ai-vault/2.0.0',
      },
    });

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Create hash stream for deduplication
    const hash = crypto.createHash('sha256');
    let size = 0;

    return new Promise((resolve, reject) => {
      const writer = createWriteStream(outputPath);

      response.data.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        size += chunk.length;
      });

      response.data.pipe(writer);

      writer.on('finish', () => {
        const mimeType = response.headers['content-type'] || 'application/octet-stream';
        resolve({
          path: outputPath,
          size,
          mimeType,
          hash: hash.digest('hex'),
        });
      });

      writer.on('error', reject);
    });
  }

  /**
   * Helper for exponential backoff retry
   */
  protected async retry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
    let lastError: Error;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors
        if (lastError.name === 'AuthenticationError') {
          throw lastError;
        }

        if (i < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, i);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.authContext) {
      await this.strategyManager.cleanup(this.authContext);
      this.authContext = undefined;
    }
  }

  // Abstract methods that providers must implement
  abstract listConversations(options?: ListConversationsOptions): Promise<ConversationSummary[]>;
  abstract fetchConversation(id: string): Promise<Conversation>;
}
