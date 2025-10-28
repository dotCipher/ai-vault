/**
 * Provider-Agnostic Storage Layer
 *
 * Handles saving conversations, metadata, and organizing archives
 * Works with any provider through standard Conversation/Message types
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { Conversation } from '../types/index.js';
import type { StorageConfig, ExportFormat, ConversationIndex } from '../types/storage.js';

export class Storage {
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * Save a conversation to disk
   */
  async saveConversation(conversation: Conversation): Promise<void> {
    const conversationDir = this.getConversationPath(conversation);

    // Create conversation directory
    await fs.mkdir(conversationDir, { recursive: true });

    // Save in all requested formats
    for (const format of this.config.formats) {
      const filePath = path.join(conversationDir, `conversation.${this.getExtension(format)}`);
      const content = this.formatConversation(conversation, format);
      await fs.writeFile(filePath, content, 'utf-8');
    }

    // Update index
    await this.updateIndex(conversation, conversationDir);
  }

  /**
   * Check if conversation already exists
   */
  async conversationExists(provider: string, conversationId: string): Promise<boolean> {
    const conversationDir = path.join(
      this.config.baseDir,
      provider,
      'conversations',
      this.sanitizeFilename(conversationId)
    );
    return existsSync(conversationDir);
  }

  /**
   * Get path to conversation directory
   */
  getConversationPath(conversation: Conversation): string {
    const baseProviderDir = path.join(this.config.baseDir, conversation.provider);
    const conversationsDir = path.join(baseProviderDir, 'conversations');

    if (this.config.organizeByDate) {
      const date = conversation.createdAt;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return path.join(
        conversationsDir,
        `${year}`,
        `${month}`,
        this.sanitizeFilename(conversation.id)
      );
    }

    return path.join(conversationsDir, this.sanitizeFilename(conversation.id));
  }

  /**
   * Get path to media directory for a provider
   */
  getMediaPath(provider: string, mediaType: 'images' | 'videos' | 'documents' = 'images'): string {
    return path.join(this.config.baseDir, provider, 'media', mediaType);
  }

  /**
   * Format conversation for export
   */
  private formatConversation(conversation: Conversation, format: ExportFormat): string {
    switch (format) {
      case 'json':
        return this.formatAsJSON(conversation);
      case 'markdown':
        return this.formatAsMarkdown(conversation);
    }
  }

  /**
   * Export as JSON
   */
  private formatAsJSON(conversation: Conversation): string {
    return JSON.stringify(conversation, null, 2);
  }

  /**
   * Export as Markdown
   */
  private formatAsMarkdown(conversation: Conversation): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${conversation.title}\n`);
    lines.push(`**Provider:** ${conversation.provider}`);
    lines.push(`**Created:** ${conversation.createdAt.toISOString()}`);
    lines.push(`**Updated:** ${conversation.updatedAt.toISOString()}`);
    lines.push(`**Messages:** ${conversation.messages.length}`);
    lines.push('');
    lines.push('---\n');

    // Messages
    for (const message of conversation.messages) {
      lines.push(`## ${this.capitalize(message.role)}`);
      lines.push(`*${message.timestamp.toISOString()}*\n`);
      lines.push(message.content);

      // Attachments
      if (message.attachments && message.attachments.length > 0) {
        lines.push('\n**Attachments:**');
        for (const attachment of message.attachments) {
          if (attachment.type === 'image') {
            lines.push(`- ![${attachment.id}](${attachment.url})`);
          } else {
            lines.push(`- [${attachment.type}: ${attachment.id}](${attachment.url})`);
          }
        }
      }

      lines.push('\n---\n');
    }

    // Metadata
    lines.push('## Metadata\n');
    lines.push('```json');
    lines.push(JSON.stringify(conversation.metadata, null, 2));
    lines.push('```');

    return lines.join('\n');
  }

  /**
   * Update conversation index
   */
  private async updateIndex(conversation: Conversation, conversationPath: string): Promise<void> {
    const indexPath = path.join(this.config.baseDir, conversation.provider, 'index.json');

    // Load existing index or create new one
    let index: ConversationIndex = {};
    if (existsSync(indexPath)) {
      const content = await fs.readFile(indexPath, 'utf-8');
      index = JSON.parse(content);
    }

    // Add/update conversation entry
    index[conversation.id] = {
      title: conversation.title,
      provider: conversation.provider,
      messageCount: conversation.messages.length,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      archivedAt: new Date().toISOString(),
      hasMedia: conversation.messages.some((m) => m.attachments && m.attachments.length > 0),
      mediaCount: conversation.messages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0),
      path: path.relative(path.join(this.config.baseDir, conversation.provider), conversationPath),
    };

    // Save index
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * Get conversation index for a provider
   */
  async getIndex(provider: string): Promise<ConversationIndex> {
    const indexPath = path.join(this.config.baseDir, provider, 'index.json');

    if (!existsSync(indexPath)) {
      return {};
    }

    const content = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Get file extension for format
   */
  private getExtension(format: ExportFormat): string {
    switch (format) {
      case 'json':
        return 'json';
      case 'markdown':
        return 'md';
    }
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9_-]/gi, '_');
  }

  /**
   * Capitalize string
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get storage statistics
   */
  async getStats(provider: string): Promise<{
    totalConversations: number;
    totalMessages: number;
    totalMedia: number;
    totalSize: number;
  }> {
    const index = await this.getIndex(provider);
    const conversations = Object.values(index);

    return {
      totalConversations: conversations.length,
      totalMessages: conversations.reduce((sum, c) => sum + c.messageCount, 0),
      totalMedia: conversations.reduce((sum, c) => sum + c.mediaCount, 0),
      totalSize: 0, // TODO: Calculate actual directory size
    };
  }
}

/**
 * Get default storage configuration
 */
export function getDefaultStorageConfig(): StorageConfig {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return {
    baseDir: path.join(homeDir, 'ai-vault-data'),
    formats: ['markdown'], // Default to Markdown (human-readable, works with Obsidian/Notion)
    organizeByDate: false,
  };
}
