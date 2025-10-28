/**
 * Provider-Agnostic Media Manager
 *
 * Handles downloading and deduplicating media files
 * Works with any provider through standard Attachment types
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { createWriteStream } from 'fs';
import type { Conversation, Attachment } from '../types/index.js';
import type { MediaRegistry } from '../types/storage.js';

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

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.registryPath = path.join(baseDir, 'media-registry.json');
  }

  /**
   * Initialize media manager (load registry)
   */
  async init(): Promise<void> {
    await this.loadRegistry();
  }

  /**
   * Download all media from a conversation
   */
  async downloadConversationMedia(
    conversation: Conversation,
    onProgress?: (current: number, total: number) => void
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
    let current = 0;

    for (const { attachment } of allAttachments) {
      current++;
      onProgress?.(current, total);

      try {
        const downloadResult = await this.downloadMedia(
          attachment.url,
          attachment.type,
          conversation.provider,
          conversation.id
        );

        if (downloadResult.skipped) {
          result.skipped++;
        } else {
          result.downloaded++;
          result.bytes += downloadResult.size;
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          url: attachment.url,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Download a single media file with deduplication
   */
  async downloadMedia(
    url: string,
    type: string,
    provider: string,
    conversationId: string
  ): Promise<{ path: string; size: number; hash: string; skipped: boolean }> {
    // Download to temp location first to calculate hash
    const tempPath = path.join(this.baseDir, '.temp', `download-${Date.now()}`);
    await fs.mkdir(path.dirname(tempPath), { recursive: true });

    try {
      // Download file
      const { hash, size, mimeType } = await this.downloadToFile(url, tempPath);

      // Check if we already have this file
      if (this.registry[hash]) {
        // File already exists, just update references
        if (!this.registry[hash].references.includes(conversationId)) {
          this.registry[hash].references.push(conversationId);
          await this.saveRegistry();
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

      // Move file to permanent location
      await fs.mkdir(path.dirname(permanentPath), { recursive: true });
      await fs.rename(tempPath, permanentPath);

      // Add to registry
      this.registry[hash] = {
        path: permanentPath,
        size,
        mimeType,
        firstSeen: new Date().toISOString(),
        references: [conversationId],
      };
      await this.saveRegistry();

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
    outputPath: string
  ): Promise<{ hash: string; size: number; mimeType: string }> {
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'ai-vault/1.0.0',
      },
      timeout: 60000,
    });

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
