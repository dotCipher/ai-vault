/**
 * Core type definitions for AI Vault
 */

// ========== Provider Types ==========

export type ProviderName = 'grok-web' | 'grok-x' | 'chatgpt' | 'claude' | 'gemini' | 'perplexity';

export type AuthMethod = 'api-key' | 'cookies' | 'oauth';

export interface ProviderConfig {
  providerName: string; // Allow any string for extensibility
  authMethod: AuthMethod;
  apiKey?: string;
  cookies?: Record<string, string>;
  customEndpoint?: string;
  // Token caching (provider-specific, e.g., for ChatGPT session tokens)
  accessToken?: string;
  tokenExpiry?: string; // ISO 8601 timestamp
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  hasMedia: boolean;
  preview?: string;
}

// ========== Conversation Types ==========

export interface Message {
  id: string;
  role: string; // Support arbitrary roles like 'user', 'assistant', 'system', 'Sexy', 'Eve', etc.
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
  attachments?: Attachment[];
}

export interface MessageMetadata {
  model?: string;
  tokenCount?: number;
  thinkingProcess?: string; // For Claude's thinking, etc.
  citations?: Citation[];
  [key: string]: any;
}

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'code';
  url: string;
  localPath?: string;
  mimeType?: string;
  size?: number;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    [key: string]: any;
  };
}

export interface Conversation {
  id: string;
  provider: string; // Provider name (extensible)
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  metadata: ConversationMetadata;
}

export interface ConversationMetadata {
  tags?: string[];
  archived?: boolean;
  starred?: boolean;
  folder?: string;
  messageCount: number;
  characterCount: number;
  mediaCount: number;
  [key: string]: any;
}

// ========== Assets & Workspaces Types ==========

export interface Asset {
  id: string;
  provider: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'code' | 'data';
  url: string;
  localPath?: string;
  mimeType?: string;
  size?: number;
  createdAt: Date;
  lastUsedAt?: Date;
  metadata: AssetMetadata;
}

export interface AssetMetadata {
  width?: number;
  height?: number;
  duration?: number;
  description?: string;
  tags?: string[];
  [key: string]: any;
}

export interface Workspace {
  id: string;
  provider: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  projects: Project[];
  metadata: WorkspaceMetadata;
}

export interface WorkspaceMetadata {
  color?: string;
  icon?: string;
  isDefault?: boolean;
  projectCount?: number;
  [key: string]: any;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  type?: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  content?: string;
  files?: ProjectFile[];
  metadata: ProjectMetadata;
}

export interface ProjectMetadata {
  language?: string;
  framework?: string;
  version?: string;
  tags?: string[];
  [key: string]: any;
}

export interface ProjectFile {
  path: string;
  name: string;
  content: string;
  language?: string;
  mimeType?: string;
  size?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ========== Archive Types ==========

export interface ArchiveOptions {
  providers?: ProviderName[];
  since?: Date;
  until?: Date;
  includeMedia?: boolean;
  outputFormat?: OutputFormat[];
  filter?: ConversationFilter;
  dryRun?: boolean;
}

export interface ConversationFilter {
  starred?: boolean;
  archived?: boolean;
  minMessages?: number;
  maxMessages?: number;
  searchQuery?: string;
  tags?: string[];
}

export type OutputFormat = 'json' | 'markdown' | 'html' | 'txt';

export interface ArchiveResult {
  provider: ProviderName;
  conversationsArchived: number;
  mediaDownloaded: number;
  errors: ArchiveError[];
  duration: number; // milliseconds
}

export interface ArchiveError {
  conversationId?: string;
  message: string;
  stack?: string;
}

// ========== Storage Types ==========

export interface StorageConfig {
  basePath: string;
  organizationStrategy: 'by-provider' | 'by-date' | 'flat';
  compression?: boolean;
  encryption?: boolean;
}

export interface StorageMetadata {
  version: string;
  totalConversations: number;
  totalSize: number; // bytes
  lastArchived: Date;
  providers: Record<ProviderName, ProviderStats>;
}

export interface ProviderStats {
  conversationCount: number;
  mediaCount: number;
  lastSync: Date;
}

// ========== Configuration Types ==========

export interface VaultConfig {
  version: string;
  storage: StorageConfig;
  providers: ProviderConfig[];
  scheduling?: ScheduleConfig;
  media?: MediaConfig;
  export?: ExportConfig;
}

export interface ScheduleConfig {
  enabled: boolean;
  cron?: string;
  timezone?: string;
  providers?: ProviderName[];
}

export interface MediaConfig {
  enabled: boolean;
  deduplication: boolean;
  maxFileSize?: number; // MB
  allowedTypes?: string[];
  quality?: 'original' | 'high' | 'medium' | 'low';
}

export interface ExportConfig {
  formats: OutputFormat[];
  includeMetadata: boolean;
  prettyPrint: boolean;
}
