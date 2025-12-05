/**
 * Provider-Agnostic Storage Layer
 *
 * Handles saving conversations, metadata, and organizing archives
 * Works with any provider through standard Conversation/Message types
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { promisify } from 'util';
import type { Conversation, Asset, Workspace, Project } from '../types/index.js';
import type {
  StorageConfig,
  ExportFormat,
  ConversationIndex,
  HierarchyIndex,
} from '../types/storage.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class Storage {
  private config: StorageConfig;
  private batchMode: boolean = false;
  private pendingIndexUpdates: Map<string, Map<string, ConversationIndex[string]>> = new Map();
  private pendingHierarchyUpdates: Map<string, Conversation[]> = new Map();
  private useCompression: boolean = false; // Disable compression by default for compatibility

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * Enable or disable gzip compression for JSON files
   * Compression reduces disk usage by ~70-80% but adds minor CPU overhead
   */
  setCompression(enabled: boolean): void {
    this.useCompression = enabled;
  }

  /**
   * Enable batch mode for improved performance when saving multiple conversations
   * In batch mode, index updates are queued in memory and saved in a single operation
   */
  enableBatchMode(): void {
    this.batchMode = true;
    this.pendingIndexUpdates.clear();
    this.pendingHierarchyUpdates.clear();
  }

  /**
   * Disable batch mode and flush any pending updates
   */
  async disableBatchMode(): Promise<void> {
    await this.flushPendingUpdates();
    this.batchMode = false;
  }

  /**
   * Flush all pending index updates to disk
   */
  async flushPendingUpdates(): Promise<void> {
    if (!this.batchMode || this.pendingIndexUpdates.size === 0) {
      return;
    }

    // Process each provider's pending updates
    for (const [provider, updates] of this.pendingIndexUpdates.entries()) {
      const indexPath = path.join(this.config.baseDir, provider, 'index.json');

      // Load existing index
      let index: ConversationIndex = {};
      if (existsSync(indexPath)) {
        const content = await fs.readFile(indexPath, 'utf-8');
        index = JSON.parse(content);
      }

      // Apply all pending updates
      for (const [conversationId, entry] of updates.entries()) {
        index[conversationId] = entry;
      }

      // Save updated index with compression
      await fs.mkdir(path.dirname(indexPath), { recursive: true });

      if (this.useCompression) {
        const compressed = await gzip(JSON.stringify(index, null, 2));
        await fs.writeFile(indexPath + '.gz', compressed);
      } else {
        await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
      }

      // Update hierarchy index if there are pending hierarchy updates
      if (this.pendingHierarchyUpdates.has(provider)) {
        await this.updateHierarchyIndex(provider, this.pendingHierarchyUpdates.get(provider)!);
      }
    }

    // Clear pending updates
    this.pendingIndexUpdates.clear();
    this.pendingHierarchyUpdates.clear();
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
      const extension = this.getExtension(format);
      const filePath = path.join(conversationDir, `conversation.${extension}`);
      const content = this.formatConversation(conversation, format);

      // Use compression for JSON files to save disk space
      if (format === 'json' && this.useCompression) {
        const compressed = await gzip(content);
        await fs.writeFile(filePath + '.gz', compressed);
      } else {
        await fs.writeFile(filePath, content, 'utf-8');
      }
    }

    // Save artifacts as separate files
    await this.saveArtifacts(conversation, conversationDir);

    // Update index
    await this.updateIndex(conversation, conversationDir);
  }

  /**
   * Save artifacts as separate files
   */
  private async saveArtifacts(conversation: Conversation, conversationDir: string): Promise<void> {
    for (const message of conversation.messages) {
      if (message.attachments) {
        for (const attachment of message.attachments) {
          // Only write artifacts that have content (not external URLs)
          if (attachment.type === 'artifact' && attachment.content) {
            const filename = `${this.sanitizeFilename(attachment.id)}${attachment.extension}`;
            const artifactPath = path.join(conversationDir, filename);
            await fs.writeFile(artifactPath, attachment.content, 'utf-8');
          }
        }
      }
    }
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
   * Get an existing conversation from storage
   */
  async getConversation(provider: string, conversationId: string): Promise<Conversation | null> {
    const conversationDir = path.join(
      this.config.baseDir,
      provider,
      'conversations',
      this.sanitizeFilename(conversationId)
    );

    if (!existsSync(conversationDir)) {
      return null;
    }

    // Try to read the JSON file (check both compressed and uncompressed)
    const jsonPath = path.join(conversationDir, 'conversation.json');
    const jsonGzPath = jsonPath + '.gz';

    // Try compressed first (newer format)
    if (existsSync(jsonGzPath)) {
      const compressed = await fs.readFile(jsonGzPath);
      const decompressed = await gunzip(compressed);
      const conv = JSON.parse(decompressed.toString('utf-8')) as Conversation;
      // Ensure dates are Date objects
      conv.createdAt = new Date(conv.createdAt);
      conv.updatedAt = new Date(conv.updatedAt);
      return conv;
    }

    // Fall back to uncompressed (legacy format)
    if (existsSync(jsonPath)) {
      const content = await fs.readFile(jsonPath, 'utf-8');
      const conv = JSON.parse(content) as Conversation;
      // Ensure dates are Date objects
      conv.createdAt = new Date(conv.createdAt);
      conv.updatedAt = new Date(conv.updatedAt);
      return conv;
    }

    return null;
  }

  /**
   * Get path to conversation directory
   * Organizes by hierarchy (workspace/project) if present
   */
  getConversationPath(conversation: Conversation): string {
    const baseProviderDir = path.join(this.config.baseDir, conversation.provider);

    // Organize by hierarchy if present
    if (conversation.hierarchy) {
      const { workspaceId, projectId } = conversation.hierarchy;

      // Organize by workspace and optionally project
      if (workspaceId) {
        const workspaceDir = path.join(
          baseProviderDir,
          'workspaces',
          this.sanitizeFilename(workspaceId)
        );

        if (projectId) {
          // workspace/project/conversations/conversation-id
          return path.join(
            workspaceDir,
            'projects',
            this.sanitizeFilename(projectId),
            'conversations',
            this.sanitizeFilename(conversation.id)
          );
        }

        // workspace/conversations/conversation-id
        return path.join(workspaceDir, 'conversations', this.sanitizeFilename(conversation.id));
      }
    }

    // Fall back to flat or date-based organization
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
          } else if (attachment.type === 'artifact' && attachment.content) {
            // Reference local artifact file
            const filename = `${this.sanitizeFilename(attachment.id)}${attachment.extension}`;
            lines.push(
              `- [${attachment.title || attachment.id}](${filename}) (${attachment.artifactType})`
            );
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
   * Update conversation index (batched if in batch mode, immediate otherwise)
   */
  private async updateIndex(conversation: Conversation, conversationPath: string): Promise<void> {
    // Compute content hash from last message for incremental backup detection
    const contentHash = this.computeContentHash(conversation);

    const indexEntry: ConversationIndex[string] = {
      title: conversation.title,
      provider: conversation.provider,
      messageCount: conversation.messages.length,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      archivedAt: new Date().toISOString(),
      hasMedia: conversation.messages.some((m) => m.attachments && m.attachments.length > 0),
      mediaCount: conversation.messages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0),
      path: path.relative(path.join(this.config.baseDir, conversation.provider), conversationPath),
      contentHash,
    };

    // Include hierarchy info if present
    if (conversation.hierarchy) {
      indexEntry.workspaceId = conversation.hierarchy.workspaceId;
      indexEntry.workspaceName = conversation.hierarchy.workspaceName;
      indexEntry.projectId = conversation.hierarchy.projectId;
      indexEntry.projectName = conversation.hierarchy.projectName;
      indexEntry.folder = conversation.hierarchy.folder;
    }

    if (this.batchMode) {
      // Queue update for later batch save
      if (!this.pendingIndexUpdates.has(conversation.provider)) {
        this.pendingIndexUpdates.set(conversation.provider, new Map());
      }
      this.pendingIndexUpdates.get(conversation.provider)!.set(conversation.id, indexEntry);

      // Track hierarchy updates separately
      if (conversation.hierarchy) {
        if (!this.pendingHierarchyUpdates.has(conversation.provider)) {
          this.pendingHierarchyUpdates.set(conversation.provider, []);
        }
        this.pendingHierarchyUpdates.get(conversation.provider)!.push(conversation);
      }
    } else {
      // Immediate save (legacy behavior)
      const indexPath = path.join(this.config.baseDir, conversation.provider, 'index.json');

      // Load existing index or create new one
      let index: ConversationIndex = {};
      if (existsSync(indexPath)) {
        const content = await fs.readFile(indexPath, 'utf-8');
        index = JSON.parse(content);
      }

      // Add/update conversation entry
      index[conversation.id] = indexEntry;

      // Save index with optional compression
      if (this.useCompression) {
        const compressed = await gzip(JSON.stringify(index, null, 2));
        await fs.writeFile(indexPath + '.gz', compressed);
      } else {
        await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
      }

      // Update hierarchy index if conversation has hierarchy
      if (conversation.hierarchy) {
        await this.updateHierarchyIndex(conversation.provider, [conversation]);
      }
    }
  }

  /**
   * Update hierarchy index for a provider
   * Builds or updates the hierarchy-index.json file
   */
  private async updateHierarchyIndex(
    provider: string,
    conversations: Conversation[]
  ): Promise<void> {
    const hierarchyPath = path.join(this.config.baseDir, provider, 'hierarchy-index.json');

    // Load existing hierarchy index
    let hierarchyIndex: HierarchyIndex = {
      workspaces: {},
      unorganized: [],
    };

    if (existsSync(hierarchyPath)) {
      const content = await fs.readFile(hierarchyPath, 'utf-8');
      hierarchyIndex = JSON.parse(content);
    }

    // Update with new conversations
    for (const conversation of conversations) {
      if (!conversation.hierarchy || !conversation.hierarchy.workspaceId) {
        // Track as unorganized (if not already present)
        if (!hierarchyIndex.unorganized.includes(conversation.id)) {
          hierarchyIndex.unorganized.push(conversation.id);
        }
        continue;
      }

      const { workspaceId, workspaceName, projectId, projectName } = conversation.hierarchy;

      // Initialize workspace if needed
      if (!hierarchyIndex.workspaces[workspaceId]) {
        hierarchyIndex.workspaces[workspaceId] = {
          name: workspaceName || workspaceId,
          conversationIds: [],
          projects: {},
        };
      }

      const workspace = hierarchyIndex.workspaces[workspaceId];

      // Update workspace name if changed
      if (workspaceName && workspace.name !== workspaceName) {
        workspace.name = workspaceName;
      }

      if (projectId) {
        // Initialize project if needed
        if (!workspace.projects[projectId]) {
          workspace.projects[projectId] = {
            name: projectName || projectId,
            conversationIds: [],
          };
        }

        const project = workspace.projects[projectId];

        // Update project name if changed
        if (projectName && project.name !== projectName) {
          project.name = projectName;
        }

        // Add conversation to project (if not already present)
        if (!project.conversationIds.includes(conversation.id)) {
          project.conversationIds.push(conversation.id);
        }

        // Remove from workspace-level if present
        workspace.conversationIds = workspace.conversationIds.filter(
          (id) => id !== conversation.id
        );
      } else {
        // Add to workspace-level conversations (if not already present)
        if (!workspace.conversationIds.includes(conversation.id)) {
          workspace.conversationIds.push(conversation.id);
        }

        // Remove from any project if present
        for (const projectId in workspace.projects) {
          workspace.projects[projectId].conversationIds = workspace.projects[
            projectId
          ].conversationIds.filter((id) => id !== conversation.id);
        }
      }

      // Remove from unorganized if present
      hierarchyIndex.unorganized = hierarchyIndex.unorganized.filter(
        (id) => id !== conversation.id
      );
    }

    // Save hierarchy index
    await fs.mkdir(path.dirname(hierarchyPath), { recursive: true });
    await fs.writeFile(hierarchyPath, JSON.stringify(hierarchyIndex, null, 2), 'utf-8');
  }

  /**
   * Get hierarchy index for a provider
   */
  async getHierarchyIndex(provider: string): Promise<HierarchyIndex> {
    const hierarchyPath = path.join(this.config.baseDir, provider, 'hierarchy-index.json');

    if (!existsSync(hierarchyPath)) {
      return {
        workspaces: {},
        unorganized: [],
      };
    }

    const content = await fs.readFile(hierarchyPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Get conversation index for a provider
   */
  async getIndex(provider: string): Promise<ConversationIndex> {
    const indexPath = path.join(this.config.baseDir, provider, 'index.json');
    const indexGzPath = indexPath + '.gz';

    // Try compressed first
    if (existsSync(indexGzPath)) {
      const compressed = await fs.readFile(indexGzPath);
      const decompressed = await gunzip(compressed);
      return JSON.parse(decompressed.toString('utf-8'));
    }

    // Fall back to uncompressed
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
   * Compute a content hash for incremental backup detection
   * Uses the last message content + message count for fast change detection
   */
  private computeContentHash(conversation: Conversation): string {
    const messages = conversation.messages;
    if (messages.length === 0) {
      return crypto.createHash('sha256').update('empty').digest('hex').substring(0, 16);
    }

    // Use last message content + total count for hash
    // This catches both new messages and edits to the last message
    const lastMessage = messages[messages.length - 1];
    const hashInput = `${messages.length}:${lastMessage.content}`;

    return crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
  }

  /**
   * Get content hash for a locally stored conversation
   */
  async getContentHash(provider: string, conversationId: string): Promise<string | undefined> {
    const index = await this.getIndex(provider);
    return index[conversationId]?.contentHash;
  }

  /**
   * Save assets to disk
   */
  async saveAssets(provider: string, assets: Asset[]): Promise<void> {
    const assetsDir = path.join(this.config.baseDir, provider, 'assets');
    await fs.mkdir(assetsDir, { recursive: true });

    // Save assets index with all metadata
    const indexPath = path.join(assetsDir, 'assets-index.json');
    const assetsIndex = assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      url: asset.url,
      localPath: asset.localPath,
      mimeType: asset.mimeType,
      size: asset.size,
      createdAt: asset.createdAt.toISOString(),
      lastUsedAt: asset.lastUsedAt?.toISOString(),
      metadata: asset.metadata,
    }));

    await fs.writeFile(indexPath, JSON.stringify(assetsIndex, null, 2), 'utf-8');

    // Organize by type in subdirectories
    for (const asset of assets) {
      const typeDir = path.join(assetsDir, 'by-type', asset.type);
      await fs.mkdir(typeDir, { recursive: true });

      // Save individual asset metadata
      const assetFile = path.join(typeDir, `${this.sanitizeFilename(asset.id)}.json`);
      await fs.writeFile(assetFile, JSON.stringify(asset, null, 2), 'utf-8');
    }
  }

  /**
   * Save workspaces to disk
   */
  async saveWorkspaces(provider: string, workspaces: Workspace[]): Promise<void> {
    const workspacesDir = path.join(this.config.baseDir, provider, 'workspaces');
    await fs.mkdir(workspacesDir, { recursive: true });

    // Save workspaces index
    const indexPath = path.join(workspacesDir, 'workspaces-index.json');
    const workspacesIndex = workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      description: ws.description,
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
      lastUsedAt: ws.lastUsedAt?.toISOString(),
      projectCount: ws.projects.length,
      metadata: ws.metadata,
    }));

    await fs.writeFile(indexPath, JSON.stringify(workspacesIndex, null, 2), 'utf-8');

    // Save each workspace with its projects
    for (const workspace of workspaces) {
      const workspaceDir = path.join(workspacesDir, this.sanitizeFilename(workspace.id));
      await fs.mkdir(workspaceDir, { recursive: true });

      // Save workspace metadata
      const workspaceFile = path.join(workspaceDir, 'workspace.json');
      await fs.writeFile(
        workspaceFile,
        JSON.stringify(
          {
            id: workspace.id,
            provider: workspace.provider,
            name: workspace.name,
            description: workspace.description,
            createdAt: workspace.createdAt.toISOString(),
            updatedAt: workspace.updatedAt.toISOString(),
            lastUsedAt: workspace.lastUsedAt?.toISOString(),
            metadata: workspace.metadata,
          },
          null,
          2
        ),
        'utf-8'
      );

      // Save workspace as markdown
      const workspaceMd = path.join(workspaceDir, 'workspace.md');
      await fs.writeFile(workspaceMd, this.formatWorkspaceAsMarkdown(workspace), 'utf-8');

      // Save projects
      if (workspace.projects.length > 0) {
        const projectsDir = path.join(workspaceDir, 'projects');
        await fs.mkdir(projectsDir, { recursive: true });

        for (const project of workspace.projects) {
          await this.saveProject(projectsDir, project);
        }
      }
    }
  }

  /**
   * Save a single project
   */
  private async saveProject(projectsDir: string, project: Project): Promise<void> {
    const projectDir = path.join(projectsDir, this.sanitizeFilename(project.id));
    await fs.mkdir(projectDir, { recursive: true });

    // Save project metadata as JSON
    const projectFile = path.join(projectDir, 'project.json');
    await fs.writeFile(projectFile, JSON.stringify(project, null, 2), 'utf-8');

    // Save project as markdown
    const projectMd = path.join(projectDir, 'project.md');
    await fs.writeFile(projectMd, this.formatProjectAsMarkdown(project), 'utf-8');

    // Save project files if present
    if (project.files && project.files.length > 0) {
      const filesDir = path.join(projectDir, 'files');
      await fs.mkdir(filesDir, { recursive: true });

      for (const file of project.files) {
        const filePath = path.join(filesDir, this.sanitizeFilename(file.name));
        await fs.writeFile(filePath, file.content, 'utf-8');
      }
    }
  }

  /**
   * Format workspace as Markdown
   */
  private formatWorkspaceAsMarkdown(workspace: Workspace): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${workspace.name}\n`);

    if (workspace.description) {
      lines.push(`${workspace.description}\n`);
    }

    lines.push(`**Created:** ${workspace.createdAt.toISOString()}`);
    lines.push(`**Updated:** ${workspace.updatedAt.toISOString()}`);
    if (workspace.lastUsedAt) {
      lines.push(`**Last Used:** ${workspace.lastUsedAt.toISOString()}`);
    }
    lines.push(`**Projects:** ${workspace.projects.length}`);
    lines.push('');
    lines.push('---\n');

    // Projects
    if (workspace.projects.length > 0) {
      lines.push('## Projects\n');
      for (const project of workspace.projects) {
        lines.push(`### ${project.name}`);
        if (project.description) {
          lines.push(`${project.description}\n`);
        }
        if (project.type) {
          lines.push(`**Type:** ${project.type}`);
        }
        lines.push(`**Files:** ${project.files?.length || 0}`);
        lines.push(`**Updated:** ${project.updatedAt.toISOString()}`);
        lines.push('');
      }
    }

    // Metadata
    lines.push('## Metadata\n');
    lines.push('```json');
    lines.push(JSON.stringify(workspace.metadata, null, 2));
    lines.push('```');

    return lines.join('\n');
  }

  /**
   * Format project as Markdown
   */
  private formatProjectAsMarkdown(project: Project): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${project.name}\n`);

    if (project.description) {
      lines.push(`${project.description}\n`);
    }

    if (project.type) {
      lines.push(`**Type:** ${project.type}`);
    }
    lines.push(`**Created:** ${project.createdAt.toISOString()}`);
    lines.push(`**Updated:** ${project.updatedAt.toISOString()}`);
    if (project.lastUsedAt) {
      lines.push(`**Last Used:** ${project.lastUsedAt.toISOString()}`);
    }
    if (project.files) {
      lines.push(`**Files:** ${project.files.length}`);
    }
    lines.push('');
    lines.push('---\n');

    // Content
    if (project.content) {
      lines.push('## Content\n');
      lines.push('```');
      lines.push(project.content);
      lines.push('```\n');
    }

    // Files
    if (project.files && project.files.length > 0) {
      lines.push('## Files\n');
      for (const file of project.files) {
        lines.push(`### ${file.name}`);
        if (file.path) {
          lines.push(`**Path:** \`${file.path}\``);
        }
        if (file.language) {
          lines.push(`**Language:** ${file.language}`);
        }
        lines.push('');
        lines.push(`\`\`\`${file.language || ''}`);
        lines.push(file.content);
        lines.push('```\n');
      }
    }

    // Metadata
    lines.push('## Metadata\n');
    lines.push('```json');
    lines.push(JSON.stringify(project.metadata, null, 2));
    lines.push('```');

    return lines.join('\n');
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
