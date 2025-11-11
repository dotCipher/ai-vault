/**
 * Settings management API endpoints
 */

import { Router, type Request, type Response } from 'express';
import { loadConfig, saveConfig } from '../../utils/config.js';
import { createError } from '../middleware/error-handler.js';
import os from 'os';

const router = Router();

/**
 * GET /api/settings
 * Get all settings
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await loadConfig();

    // Remove sensitive data (API keys, cookies)
    const safeConfig = {
      ...config,
      providers: Object.entries(config.providers || {}).reduce(
        (acc, [name, provider]) => {
          acc[name] = {
            providerName: provider.providerName,
            authMethod: provider.authMethod,
            configured: true,
          };
          return acc;
        },
        {} as Record<string, any>
      ),
    };

    res.json({ settings: safeConfig });
  } catch (error) {
    throw createError('Failed to load settings', 500, error);
  }
});

/**
 * PUT /api/settings
 * Update settings
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const config = await loadConfig();

    // Merge updates (excluding provider credentials)
    const updatedConfig = {
      ...config,
      settings: {
        ...config.settings,
        ...updates.settings,
      },
    };

    await saveConfig(updatedConfig);

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    throw createError('Failed to update settings', 500, error);
  }
});

/**
 * GET /api/settings/info
 * Get system information
 */
router.get('/info', async (_req: Request, res: Response) => {
  try {
    const config = await loadConfig();

    const info = {
      version: process.env.npm_package_version || '2.1.0',
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      configPath: config.settings?.archiveDir || '~/.ai-vault',
      archiveDir: config.settings?.archiveDir || '~/ai-vault-data',
      homeDir: os.homedir(),
    };

    res.json({ info });
  } catch (error) {
    throw createError('Failed to get system info', 500, error);
  }
});

export function createSettingsRouter(): Router {
  return router;
}
