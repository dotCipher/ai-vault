/**
 * Media file browsing API endpoints
 */

import { Router, type Request, type Response } from 'express';
import { loadConfig } from '../../utils/config.js';
import { getDefaultStorageConfig } from '../../core/storage.js';
import { createError, isApiError } from '../middleware/error-handler.js';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const router = Router();

/**
 * GET /api/media
 * List all media files
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { provider, type, limit = 100, offset = 0 } = req.query;

    const config = await loadConfig();
    const storageConfig = getDefaultStorageConfig();
    if (config.settings?.archiveDir) {
      storageConfig.baseDir = config.settings.archiveDir;
    }

    const mediaFiles: any[] = [];

    // Determine which providers to query
    const providers = provider ? [provider as string] : Object.keys(config.providers || {});

    for (const providerName of providers) {
      const mediaRegistryPath = path.join(
        storageConfig.baseDir,
        providerName,
        'media-registry.json'
      );

      if (!existsSync(mediaRegistryPath)) {
        continue;
      }

      const registryData = await fs.readFile(mediaRegistryPath, 'utf-8');
      const registry = JSON.parse(registryData);

      for (const [hash, entry] of Object.entries(registry) as any) {
        if (type && entry.type !== type) {
          continue;
        }

        mediaFiles.push({
          hash,
          provider: providerName,
          ...entry,
        });
      }
    }

    // Sort by date (newest first)
    mediaFiles.sort((a, b) => {
      const aDate = new Date(a.downloadedAt || 0).getTime();
      const bDate = new Date(b.downloadedAt || 0).getTime();
      return bDate - aDate;
    });

    // Apply pagination
    const total = mediaFiles.length;
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);
    const paginatedFiles = mediaFiles.slice(offsetNum, offsetNum + limitNum);

    res.json({
      media: paginatedFiles,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total,
      },
    });
  } catch (error) {
    throw createError('Failed to list media', 500, error);
  }
});

/**
 * GET /api/media/:provider/:hash
 * Get a specific media file
 */
router.get('/:provider/:hash', async (req: Request, res: Response) => {
  try {
    const { provider, hash } = req.params;

    const config = await loadConfig();
    const storageConfig = getDefaultStorageConfig();
    if (config.settings?.archiveDir) {
      storageConfig.baseDir = config.settings.archiveDir;
    }

    const mediaRegistryPath = path.join(storageConfig.baseDir, provider, 'media-registry.json');

    if (!existsSync(mediaRegistryPath)) {
      throw createError('Media registry not found', 404);
    }

    const registryData = await fs.readFile(mediaRegistryPath, 'utf-8');
    const registry = JSON.parse(registryData);

    const entry = registry[hash];
    if (!entry) {
      throw createError('Media file not found', 404);
    }

    const filePath = path.join(storageConfig.baseDir, provider, entry.filePath);
    if (!existsSync(filePath)) {
      throw createError('Media file not found on disk', 404);
    }

    // Send file
    res.sendFile(filePath);
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Failed to get media file', 500, error);
  }
});

/**
 * GET /api/media/stats
 * Get media statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const config = await loadConfig();
    const storageConfig = getDefaultStorageConfig();
    if (config.settings?.archiveDir) {
      storageConfig.baseDir = config.settings.archiveDir;
    }

    const stats: any = {
      totalFiles: 0,
      byType: {},
      byProvider: {},
      totalSize: 0,
    };

    const providers = Object.keys(config.providers || {});

    for (const provider of providers) {
      const mediaRegistryPath = path.join(storageConfig.baseDir, provider, 'media-registry.json');

      if (!existsSync(mediaRegistryPath)) {
        continue;
      }

      const registryData = await fs.readFile(mediaRegistryPath, 'utf-8');
      const registry = JSON.parse(registryData);

      for (const entry of Object.values(registry) as any[]) {
        stats.totalFiles++;
        stats.totalSize += entry.size || 0;

        const type = entry.type || 'unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;

        if (!stats.byProvider[provider]) {
          stats.byProvider[provider] = { count: 0, size: 0 };
        }
        stats.byProvider[provider].count++;
        stats.byProvider[provider].size += entry.size || 0;
      }
    }

    res.json(stats);
  } catch (error) {
    throw createError('Failed to get media stats', 500, error);
  }
});

export function createMediaRouter(): Router {
  return router;
}
