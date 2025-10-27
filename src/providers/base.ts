/**
 * Abstract base provider class with shared functionality
 */

import type {
  Provider,
  ListConversationsOptions,
  ConversationSummary,
  MediaDownloadResult,
} from '../types/provider';
import type { ProviderName, ProviderConfig, Conversation } from '../types';
import axios, { AxiosInstance } from 'axios';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import crypto from 'crypto';

export abstract class BaseProvider implements Provider {
  abstract readonly name: ProviderName;
  abstract readonly displayName: string;
  abstract readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[];

  protected config?: ProviderConfig;
  protected client?: AxiosInstance;

  /**
   * Initialize HTTP client with authentication
   */
  protected initClient(baseURL: string, headers: Record<string, string> = {}): void {
    this.client = axios.create({
      baseURL,
      headers: {
        'User-Agent': 'ai-vault/1.0.0',
        ...headers,
      },
      timeout: 30000,
    });
  }

  abstract authenticate(config: ProviderConfig): Promise<boolean>;
  abstract isAuthenticated(): Promise<boolean>;
  abstract listConversations(options?: ListConversationsOptions): Promise<ConversationSummary[]>;
  abstract fetchConversation(id: string): Promise<Conversation>;

  /**
   * Default implementation for downloading media files
   */
  async downloadMedia(url: string, outputPath: string): Promise<MediaDownloadResult> {
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'ai-vault/1.0.0',
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
   * Helper to check if authentication is configured
   */
  protected requireAuth(): void {
    if (!this.config) {
      throw new Error(`Provider ${this.name} is not configured. Run 'ai-vault setup' first.`);
    }
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
}
