/**
 * Conversation browsing and detail API endpoints
 */

import { Router, type Request, type Response } from 'express';
import { getDefaultStorageConfig } from '../../core/storage.js';
import { loadConfig } from '../../utils/config.js';
import { createError, isApiError } from '../middleware/error-handler.js';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const router = Router();

/**
 * GET /api/conversations
 * List all archived conversations with pagination and filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const config = await loadConfig();
    const storageConfig = getDefaultStorageConfig();
    if (config.settings?.archiveDir) {
      storageConfig.baseDir = config.settings.archiveDir;
    }

    const {
      provider,
      limit = 50,
      offset = 0,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
      since,
      until,
    } = req.query;

    // Get all conversations
    const allConversations: any[] = [];

    // Determine which providers to query
    const providers = provider ? [provider as string] : Object.keys(config.providers || {});

    for (const providerName of providers) {
      const providerPath = path.join(storageConfig.baseDir, providerName);
      if (!existsSync(providerPath)) {
        continue;
      }

      // Load index
      const indexPath = path.join(providerPath, 'index.json');
      if (!existsSync(indexPath)) {
        continue;
      }

      const indexData = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(indexData);

      // Add conversations from index
      for (const [conversationId, entry] of Object.entries(index)) {
        const conv: any = {
          id: conversationId,
          provider: providerName,
          ...(entry as Record<string, any>),
        };

        // Apply date filters
        if (since && new Date(conv.updatedAt) < new Date(since as string)) {
          continue;
        }
        if (until && new Date(conv.updatedAt) > new Date(until as string)) {
          continue;
        }

        allConversations.push(conv);
      }
    }

    // Sort conversations
    allConversations.sort((a, b) => {
      const aVal = a[sortBy as string];
      const bVal = b[sortBy as string];
      const order = sortOrder === 'asc' ? 1 : -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * order;
      }
      return ((aVal > bVal ? 1 : -1) * order) as number;
    });

    // Apply pagination
    const total = allConversations.length;
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);
    const conversations = allConversations.slice(offsetNum, offsetNum + limitNum);

    res.json({
      conversations,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total,
      },
    });
  } catch (error) {
    throw createError('Failed to list conversations', 500, error);
  }
});

/**
 * GET /api/conversations/:provider/:id
 * Get detailed conversation by ID
 */
router.get('/:provider/:id', async (req: Request, res: Response) => {
  try {
    const { provider, id } = req.params;
    const config = await loadConfig();
    const storageConfig = getDefaultStorageConfig();
    if (config.settings?.archiveDir) {
      storageConfig.baseDir = config.settings.archiveDir;
    }

    // Find conversation file
    const providerPath = path.join(storageConfig.baseDir, provider);
    if (!existsSync(providerPath)) {
      throw createError(`Provider ${provider} not found`, 404);
    }

    // Load index to find conversation location
    const indexPath = path.join(providerPath, 'index.json');
    if (!existsSync(indexPath)) {
      throw createError('No conversations found', 404);
    }

    const indexData = await fs.readFile(indexPath, 'utf-8');
    const index = JSON.parse(indexData);
    const entry = index[id];

    if (!entry) {
      throw createError(`Conversation ${id} not found`, 404);
    }

    // Load conversation data
    const conversationPath = path.join(providerPath, entry.filePath);
    if (!existsSync(conversationPath)) {
      throw createError(`Conversation file not found`, 404);
    }

    const conversationData = await fs.readFile(conversationPath, 'utf-8');
    const conversation = JSON.parse(conversationData);

    // Load markdown if available
    const markdownPath = conversationPath.replace('.json', '.md');
    let markdown: string | undefined;
    if (existsSync(markdownPath)) {
      markdown = await fs.readFile(markdownPath, 'utf-8');
    }

    res.json({
      conversation,
      markdown,
      metadata: entry,
    });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Failed to get conversation', 500, error);
  }
});

/**
 * GET /api/conversations/stats
 * Get conversation statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const config = await loadConfig();
    const storageConfig = getDefaultStorageConfig();
    if (config.settings?.archiveDir) {
      storageConfig.baseDir = config.settings.archiveDir;
    }

    const stats: any = {
      totalConversations: 0,
      byProvider: {},
      totalMessages: 0,
      totalMedia: 0,
      storageUsed: 0,
    };

    const providers = Object.keys(config.providers || {});

    for (const provider of providers) {
      const providerPath = path.join(storageConfig.baseDir, provider);
      if (!existsSync(providerPath)) {
        continue;
      }

      const indexPath = path.join(providerPath, 'index.json');
      if (!existsSync(indexPath)) {
        continue;
      }

      const indexData = await fs.readFile(indexPath, 'utf-8');
      const index = JSON.parse(indexData);

      const providerConvCount = Object.keys(index).length;
      stats.totalConversations += providerConvCount;
      stats.byProvider[provider] = {
        conversations: providerConvCount,
        messages: 0,
      };

      // Count messages
      for (const entry of Object.values(index) as any[]) {
        if (entry.messageCount) {
          stats.totalMessages += entry.messageCount;
          stats.byProvider[provider].messages += entry.messageCount;
        }
      }
    }

    res.json(stats);
  } catch (error) {
    throw createError('Failed to get conversation stats', 500, error);
  }
});

export function createConversationsRouter(): Router {
  return router;
}
