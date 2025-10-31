/**
 * Provider-Agnostic Media Manager
 *
 * Handles downloading and deduplicating media files
 * Works with any provider through standard Attachment types
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { createWriteStream } from 'fs';
import type { Conversation, Attachment } from '../types/index.js';
import type { MediaRegistry } from '../types/storage.js';
import pLimit from 'p-limit';
import os from 'os';

export interface MediaDownloadResult {
  downloaded: number;
  skipped: number;
  failed: number;
  bytes: number;
  errors: Array<{ url: string; error: string }>;
}

export class MediaManager {
  private baseDir: string;
  private registryPath: string;
  private registry: MediaRegistry = {};
  private httpClient?: AxiosInstance;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.registryPath = path.join(baseDir, 'media-registry.json');
  }

  /**
   * Get or create HTTP client with connection pooling (lazy initialization)
   */
  private getHttpClient(): AxiosInstance {
    if (!this.httpClient) {
      // Create HTTP client with connection pooling for improved performance
      this.httpClient = axios.create({
        timeout: 60000,
        // Enable connection pooling with keep-alive
        httpAgent: new http.Agent({
          keepAlive: true,
          keepAliveMsecs: 30000,
          maxSockets: 50,
          maxFreeSockets: 10,
        }),
        httpsAgent: new https.Agent({
          keepAlive: true,
          keepAliveMsecs: 30000,
          maxSockets: 50,
          maxFreeSockets: 10,
        }),
      });
    }
    return this.httpClient;
  }

  /**
   * Initialize media manager (load registry)
   */
  async init(): Promise<void> {
    await this.loadRegistry();
  }

  /**
   * Download all media from a conversation with parallel processing
   */
  async downloadConversationMedia(
    conversation: Conversation,
    onProgress?: (current: number, total: number) => void,
    cookies?: Record<string, string>
  ): Promise<MediaDownloadResult> {
    const result: MediaDownloadResult = {
      downloaded: 0,
      skipped: 0,
      failed: 0,
      bytes: 0,
      errors: [],
    };

    // Collect all attachments from all messages
    const allAttachments: Array<{ attachment: Attachment; messageId: string }> = [];
    for (const message of conversation.messages) {
      if (message.attachments) {
        for (const attachment of message.attachments) {
          allAttachments.push({ attachment, messageId: message.id });
        }
      }
    }

    const total = allAttachments.length;
    if (total === 0) {
      return result;
    }

    // Calculate optimal concurrency for media downloads
    // More aggressive than conversation downloads since these are typically smaller files
    const cpuCount = os.cpus().length;
    const concurrency = Math.max(3, Math.min(cpuCount, 15)); // Min 3, max 15
    const limit = pLimit(concurrency);

    let completed = 0;

    // Download all media in parallel with concurrency control
    const downloadTasks = allAttachments.map(({ attachment }) =>
      limit(async () => {
        try {
          // Validate URL exists and is not empty
          if (!attachment.url || attachment.url.trim() === '') {
            if (process.env.DEBUG) {
              console.warn(`Skipping attachment with empty URL:`, {
                id: attachment.id,
                type: attachment.type,
              });
            }
            return { status: 'skipped' as const, reason: 'empty-url' };
          }

          // Check for unsupported internal protocols
          const url = attachment.url.trim();
          if (url.startsWith('file-service://') || url.startsWith('sediment://')) {
            if (process.env.DEBUG) {
              console.warn(`Skipping attachment with internal protocol URL:`, {
                id: attachment.id,
                type: attachment.type,
                protocol: url.split('://')[0] + '://',
              });
            }
            return { status: 'skipped' as const, reason: 'unsupported-protocol' };
          }

          // Check if this media was already downloaded through the browser
          const browserData = attachment.metadata?.browserDownloaded;

          let downloadResult;
          if (browserData && browserData.data) {
            // Save browser-downloaded data directly
            downloadResult = await this.saveMediaFromBuffer(
              browserData.data,
              browserData.mimeType || 'application/octet-stream',
              attachment.type,
              conversation.provider,
              conversation.id,
              true // Skip registry save - we'll batch save at the end
            );
          } else {
            // Download via HTTP
            downloadResult = await this.downloadMedia(
              attachment.url,
              attachment.type,
              conversation.provider,
              conversation.id,
              cookies,
              true // Skip registry save - we'll batch save at the end
            );
          }

          // Update progress
          completed++;
          onProgress?.(completed, total);

          return {
            status: downloadResult.skipped ? ('skipped' as const) : ('downloaded' as const),
            size: downloadResult.size,
            reason: downloadResult.skipped ? 'already-exists' : undefined,
          };
        } catch (error) {
          completed++;
          onProgress?.(completed, total);

          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Log more details for debugging
          console.error(`Media download error details:`, {
            url: attachment.url || '(empty)',
            urlLength: attachment.url?.length || 0,
            type: attachment.type,
            hasBrowserData: !!attachment.metadata?.browserDownloaded,
            error: errorMessage,
          });

          return {
            status: 'failed' as const,
            error: errorMessage,
            url: attachment.url || '(empty URL)',
          };
        }
      })
    );

    // Wait for all downloads to complete
    const results = await Promise.all(downloadTasks);

    // Aggregate results
    for (const taskResult of results) {
      if (taskResult.status === 'downloaded') {
        result.downloaded++;
        result.bytes += taskResult.size || 0;
      } else if (taskResult.status === 'skipped') {
        result.skipped++;
      } else if (taskResult.status === 'failed') {
        result.failed++;
        result.errors.push({
          url: taskResult.url!,
          error: taskResult.error!,
        });
      }
    }

    // Save registry once at the end (batch update)
    await this.saveRegistry();

    return result;
  }

  /**
   * Save media from an already-downloaded buffer (e.g., from browser context)
   */
  async saveMediaFromBuffer(
    buffer: Buffer,
    mimeType: string,
    type: string,
    provider: string,
    conversationId: string,
    skipRegistrySave = false
  ): Promise<{ path: string; size: number; hash: string; skipped: boolean }> {
    // Calculate hash from buffer
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const size = buffer.length;

    // Check if we already have this file
    if (this.registry[hash]) {
      // File already exists, just update references
      if (!this.registry[hash].references.includes(conversationId)) {
        this.registry[hash].references.push(conversationId);
        if (!skipRegistrySave) {
          await this.saveRegistry();
        }
      }

      return {
        path: this.registry[hash].path,
        size: this.registry[hash].size,
        hash,
        skipped: true,
      };
    }

    // New file - determine permanent location
    const extension = this.getExtension(mimeType, '');
    const mediaType = this.getMediaType(type, mimeType);
    const fileName = `${hash}${extension}`;
    const permanentPath = path.join(this.baseDir, provider, 'media', mediaType, fileName);

    // Ensure destination directory exists (handle race conditions with concurrent downloads)
    try {
      await fs.mkdir(path.dirname(permanentPath), { recursive: true });
    } catch (error: any) {
      // Ignore EEXIST errors (race condition - another download created it)
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    // Write buffer to permanent location
    await fs.writeFile(permanentPath, buffer);

    // Add to registry
    this.registry[hash] = {
      path: permanentPath,
      size,
      mimeType,
      firstSeen: new Date().toISOString(),
      references: [conversationId],
    };
    if (!skipRegistrySave) {
      await this.saveRegistry();
    }

    return {
      path: permanentPath,
      size,
      hash,
      skipped: false,
    };
  }

  /**
   * Download a single media file with deduplication
   */
  async downloadMedia(
    url: string,
    type: string,
    provider: string,
    conversationId: string,
    cookies?: Record<string, string>,
    skipRegistrySave = false
  ): Promise<{ path: string; size: number; hash: string; skipped: boolean }> {
    // Download to temp location first to calculate hash
    const tempPath = path.join(this.baseDir, '.temp', `download-${Date.now()}`);
    await fs.mkdir(path.dirname(tempPath), { recursive: true });

    try {
      // Download file
      const { hash, size, mimeType } = await this.downloadToFile(url, tempPath, cookies);

      // Check if we already have this file
      if (this.registry[hash]) {
        // File already exists, just update references
        if (!this.registry[hash].references.includes(conversationId)) {
          this.registry[hash].references.push(conversationId);
          if (!skipRegistrySave) {
            await this.saveRegistry();
          }
        }

        // Clean up temp file
        await fs.unlink(tempPath);

        return {
          path: this.registry[hash].path,
          size: this.registry[hash].size,
          hash,
          skipped: true,
        };
      }

      // New file - determine permanent location
      const extension = this.getExtension(mimeType, url);
      const mediaType = this.getMediaType(type, mimeType);
      const fileName = `${hash}${extension}`;
      const permanentPath = path.join(this.baseDir, provider, 'media', mediaType, fileName);

      // Ensure destination directory exists (handle race conditions with concurrent downloads)
      try {
        await fs.mkdir(path.dirname(permanentPath), { recursive: true });
      } catch (error: any) {
        // Ignore EEXIST errors (race condition - another download created it)
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }

      // Move file to permanent location
      // Use copyFile + unlink instead of rename to handle cross-filesystem moves
      try {
        await fs.copyFile(tempPath, permanentPath);
        await fs.unlink(tempPath);
      } catch (error: any) {
        // Clean up temp file on error (check existence first)
        if (existsSync(tempPath)) {
          await fs.unlink(tempPath).catch(() => {});
        }
        throw error;
      }

      // Add to registry
      this.registry[hash] = {
        path: permanentPath,
        size,
        mimeType,
        firstSeen: new Date().toISOString(),
        references: [conversationId],
      };
      if (!skipRegistrySave) {
        await this.saveRegistry();
      }

      return {
        path: permanentPath,
        size,
        hash,
        skipped: false,
      };
    } catch (error) {
      // Clean up temp file on error
      if (existsSync(tempPath)) {
        await fs.unlink(tempPath).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Download file and calculate hash
   */
  private async downloadToFile(
    url: string,
    outputPath: string,
    cookies?: Record<string, string>
  ): Promise<{ hash: string; size: number; mimeType: string }> {
    // Build Cookie header from cookies object
    const cookieHeader = cookies
      ? Object.entries(cookies)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ')
      : undefined;

    const headers: Record<string, string> = {
      'User-Agent': 'ai-vault/1.0.0',
    };

    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    let response;
    try {
      // Use pooled HTTP client for better performance
      response = await this.getHttpClient().get(url, {
        responseType: 'stream',
        headers,
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      });

      // Check if response was successful
      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      // Add more context to the error
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText} - ${url}`);
      } else if (error.code) {
        throw new Error(`${error.code}: ${error.message} - ${url}`);
      }
      throw error;
    }

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
          hash: hash.digest('hex'),
          size,
          mimeType,
        });
      });

      writer.on('error', reject);
      response.data.on('error', reject);
    });
  }

  /**
   * Get media type category from attachment type and MIME type
   */
  private getMediaType(attachmentType: string, mimeType: string): string {
    if (attachmentType === 'image' || mimeType.startsWith('image/')) {
      return 'images';
    }
    if (attachmentType === 'video' || mimeType.startsWith('video/')) {
      return 'videos';
    }
    if (attachmentType === 'audio' || mimeType.startsWith('audio/')) {
      return 'audio';
    }
    return 'documents';
  }

  /**
   * Get file extension from MIME type or URL
   */
  private getExtension(mimeType: string, url: string): string {
    // Try MIME type first
    const mimeExtensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'application/pdf': '.pdf',
    };

    if (mimeExtensions[mimeType]) {
      return mimeExtensions[mimeType];
    }

    // Try URL extension
    const urlPath = new URL(url).pathname;
    const match = urlPath.match(/\.[a-z0-9]+$/i);
    if (match) {
      return match[0];
    }

    // Default based on MIME category
    if (mimeType.startsWith('image/')) return '.jpg';
    if (mimeType.startsWith('video/')) return '.mp4';
    if (mimeType.startsWith('audio/')) return '.mp3';

    return '.bin';
  }

  /**
   * Load media registry from disk
   */
  private async loadRegistry(): Promise<void> {
    if (!existsSync(this.registryPath)) {
      this.registry = {};
      return;
    }

    const content = await fs.readFile(this.registryPath, 'utf-8');
    this.registry = JSON.parse(content);
  }

  /**
   * Save media registry to disk
   */
  private async saveRegistry(): Promise<void> {
    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fs.writeFile(this.registryPath, JSON.stringify(this.registry, null, 2), 'utf-8');
  }

  /**
   * Close HTTP connections (call when done with media manager to free resources)
   */
  closeConnections(): void {
    // Close all keep-alive connections to free resources
    const httpAgent = this.httpClient?.defaults?.httpAgent as http.Agent;
    const httpsAgent = this.httpClient?.defaults?.httpsAgent as https.Agent;

    if (httpAgent) {
      httpAgent.destroy();
    }
    if (httpsAgent) {
      httpsAgent.destroy();
    }
  }

  /**
   * Get statistics about media storage
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    uniqueFiles: number;
    dedupSavings: number;
  }> {
    const hashes = Object.keys(this.registry);
    let totalSize = 0;
    let totalReferences = 0;

    for (const hash of hashes) {
      const entry = this.registry[hash];
      totalSize += entry.size;
      totalReferences += entry.references.length;
    }

    const uniqueFiles = hashes.length;
    const totalFiles = totalReferences;
    const dedupSavings = totalSize * (totalFiles - uniqueFiles);

    return {
      totalFiles,
      totalSize,
      uniqueFiles,
      dedupSavings,
    };
  }

  /**
   * Clean up unreferenced media (garbage collection)
   */
  async cleanup(
    existingConversationIds: string[]
  ): Promise<{ filesRemoved: number; bytesFreed: number }> {
    const hashesToRemove: string[] = [];
    let bytesFreed = 0;

    for (const [hash, entry] of Object.entries(this.registry)) {
      // Keep only references that exist in current conversations
      const validReferences = entry.references.filter((id) => existingConversationIds.includes(id));

      if (validReferences.length === 0) {
        // No valid references, mark for removal
        hashesToRemove.push(hash);
        bytesFreed += entry.size;

        // Delete file
        if (existsSync(entry.path)) {
          await fs.unlink(entry.path).catch(() => {});
        }
      } else if (validReferences.length !== entry.references.length) {
        // Update references
        this.registry[hash].references = validReferences;
      }
    }

    // Remove from registry
    for (const hash of hashesToRemove) {
      delete this.registry[hash];
    }

    if (hashesToRemove.length > 0) {
      await this.saveRegistry();
    }

    return {
      filesRemoved: hashesToRemove.length,
      bytesFreed,
    };
  }
}
