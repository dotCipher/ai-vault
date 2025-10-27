/**
 * Zod schemas for runtime validation
 */

import { z } from 'zod';

// ========== Provider Schemas ==========

export const ProviderNameSchema = z.enum(['grok', 'chatgpt', 'claude', 'gemini', 'perplexity']);

export const AuthMethodSchema = z.enum(['api-key', 'cookies', 'oauth']);

export const ProviderConfigSchema = z.object({
  name: ProviderNameSchema,
  enabled: z.boolean(),
  authMethod: AuthMethodSchema,
  apiKey: z.string().optional(),
  cookies: z.record(z.string()).optional(),
  customEndpoint: z.string().url().optional(),
});

// ========== Message Schemas ==========

export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.coerce.date(),
  metadata: z.record(z.any()).optional(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(['image', 'video', 'audio', 'document', 'code']),
        url: z.string(),
        localPath: z.string().optional(),
        mimeType: z.string().optional(),
        size: z.number().optional(),
        metadata: z.record(z.any()).optional(),
      })
    )
    .optional(),
});

export const ConversationSchema = z.object({
  id: z.string(),
  provider: ProviderNameSchema,
  title: z.string(),
  messages: z.array(MessageSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  metadata: z
    .object({
      tags: z.array(z.string()).optional(),
      archived: z.boolean().optional(),
      starred: z.boolean().optional(),
      folder: z.string().optional(),
      messageCount: z.number(),
      characterCount: z.number(),
      mediaCount: z.number(),
    })
    .passthrough(),
});

// ========== Config Schemas ==========

export const StorageConfigSchema = z.object({
  basePath: z.string(),
  organizationStrategy: z.enum(['by-provider', 'by-date', 'flat']),
  compression: z.boolean().optional(),
  encryption: z.boolean().optional(),
});

export const ScheduleConfigSchema = z.object({
  enabled: z.boolean(),
  cron: z.string().optional(),
  timezone: z.string().optional(),
  providers: z.array(ProviderNameSchema).optional(),
});

export const MediaConfigSchema = z.object({
  enabled: z.boolean(),
  deduplication: z.boolean(),
  maxFileSize: z.number().optional(),
  allowedTypes: z.array(z.string()).optional(),
  quality: z.enum(['original', 'high', 'medium', 'low']).optional(),
});

export const ExportConfigSchema = z.object({
  formats: z.array(z.enum(['json', 'markdown', 'html', 'txt'])),
  includeMetadata: z.boolean(),
  prettyPrint: z.boolean(),
});

export const VaultConfigSchema = z.object({
  version: z.string(),
  storage: StorageConfigSchema,
  providers: z.array(ProviderConfigSchema),
  scheduling: ScheduleConfigSchema.optional(),
  media: MediaConfigSchema.optional(),
  export: ExportConfigSchema.optional(),
});

// ========== Archive Options Schema ==========

export const ArchiveOptionsSchema = z.object({
  providers: z.array(ProviderNameSchema).optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  includeMedia: z.boolean().optional(),
  outputFormat: z.array(z.enum(['json', 'markdown', 'html', 'txt'])).optional(),
  filter: z
    .object({
      starred: z.boolean().optional(),
      archived: z.boolean().optional(),
      minMessages: z.number().optional(),
      maxMessages: z.number().optional(),
      searchQuery: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  dryRun: z.boolean().optional(),
});
