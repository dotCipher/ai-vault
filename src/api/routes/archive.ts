/**
 * Archive operations API endpoints
 */

import { Router, type Request, type Response } from 'express';
import { loadConfig } from '../../utils/config.js';
import { getProvider } from '../../providers/index.js';
import { Archiver } from '../../core/archiver.js';
import { Storage, getDefaultStorageConfig } from '../../core/storage.js';
import { MediaManager } from '../../core/media.js';
import { createError, isApiError } from '../middleware/error-handler.js';

const router = Router();

// Track running archive operations
const runningOperations = new Map<
  string,
  {
    provider: string;
    startTime: Date;
    status: 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
  }
>();

/**
 * GET /api/archive/status
 * Get current archive status for all providers
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const operations = Array.from(runningOperations.entries()).map(([id, op]) => ({
      id,
      ...op,
    }));

    res.json({ operations });
  } catch (error) {
    throw createError('Failed to get archive status', 500, error);
  }
});

/**
 * POST /api/archive/start
 * Start an archive operation
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { provider: providerName, options = {} } = req.body;

    if (!providerName) {
      throw createError('Provider name is required', 400);
    }

    const config = await loadConfig();
    const providerConfig = config.providers?.[providerName];

    if (!providerConfig) {
      throw createError(`Provider ${providerName} not configured`, 404);
    }

    const provider = getProvider(providerName);
    if (!provider) {
      throw createError(`Provider ${providerName} not found`, 404);
    }

    // Create operation ID
    const operationId = `${providerName}-${Date.now()}`;

    // Initialize operation tracking
    runningOperations.set(operationId, {
      provider: providerName,
      startTime: new Date(),
      status: 'running',
    });

    // Start archive in background
    (async () => {
      try {
        await provider.authenticate(providerConfig);

        const storageConfig = getDefaultStorageConfig();
        if (config.settings?.archiveDir) {
          storageConfig.baseDir = config.settings.archiveDir;
        }
        const storage = new Storage(storageConfig);
        const mediaManager = new MediaManager(storageConfig.baseDir);
        const archiver = new Archiver(storage, mediaManager);

        await archiver.init();

        const result = await archiver.archive(provider, {
          ...options,
          silent: true, // Suppress console output for API
        });

        const operation = runningOperations.get(operationId);
        if (operation) {
          operation.status = 'completed';
          operation.result = result;
        }
      } catch (error) {
        const operation = runningOperations.get(operationId);
        if (operation) {
          operation.status = 'failed';
          operation.error = error instanceof Error ? error.message : 'Unknown error';
        }
      }
    })();

    res.json({
      success: true,
      operationId,
      message: 'Archive operation started',
    });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Failed to start archive', 500, error);
  }
});

/**
 * GET /api/archive/operation/:id
 * Get status of a specific archive operation
 */
router.get('/operation/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const operation = runningOperations.get(id);

    if (!operation) {
      throw createError('Operation not found', 404);
    }

    res.json({ id, ...operation });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Failed to get operation status', 500, error);
  }
});

/**
 * GET /api/archive/history
 * Get archive operation history
 */
router.get('/history', async (_req: Request, res: Response) => {
  try {
    const history = Array.from(runningOperations.entries())
      .filter(([_, op]) => op.status !== 'running')
      .map(([id, op]) => ({ id, ...op }))
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, 50); // Last 50 operations

    res.json({ history });
  } catch (error) {
    throw createError('Failed to get archive history', 500, error);
  }
});

export function createArchiveRouter(): Router {
  return router;
}
