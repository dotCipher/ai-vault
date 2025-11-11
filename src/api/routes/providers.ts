/**
 * Provider management API endpoints
 */

import { Router, type Request, type Response } from 'express';
import { loadConfig } from '../../utils/config.js';
import { getProvider } from '../../providers/index.js';
import { createError, isApiError } from '../middleware/error-handler.js';

const router = Router();

/**
 * GET /api/providers
 * List all configured providers
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await loadConfig();
    const providers = Object.entries(config.providers || {}).map(([name, providerConfig]) => ({
      name,
      displayName: providerConfig.providerName,
      authMethod: providerConfig.authMethod,
      configured: true,
    }));

    res.json({ providers });
  } catch (error) {
    throw createError('Failed to load providers', 500, error);
  }
});

/**
 * GET /api/providers/:provider/status
 * Get status and connection info for a provider
 */
router.get('/:provider/status', async (req: Request, res: Response) => {
  try {
    const { provider: providerName } = req.params;
    const config = await loadConfig();

    const providerConfig = config.providers?.[providerName];
    if (!providerConfig) {
      throw createError(`Provider ${providerName} not configured`, 404);
    }

    const provider = getProvider(providerName as 'chatgpt' | 'grok-web' | 'grok-x' | 'claude');
    if (!provider) {
      throw createError(`Provider ${providerName} not found`, 404);
    }

    // Test authentication
    let isAuthenticated = false;
    let authError: string | undefined;
    try {
      await provider.authenticate(providerConfig);
      isAuthenticated = await provider.isAuthenticated();
    } catch (error) {
      authError = error instanceof Error ? error.message : 'Unknown error';
    }

    res.json({
      provider: providerName,
      displayName: provider.displayName,
      authMethod: providerConfig.authMethod,
      isAuthenticated,
      authError,
      supportedAuthMethods: provider.supportedAuthMethods,
      rateLimit: provider.rateLimit,
    });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Failed to get provider status', 500, error);
  }
});

/**
 * POST /api/providers/:provider/test
 * Test provider connection
 */
router.post('/:provider/test', async (req: Request, res: Response) => {
  try {
    const { provider: providerName } = req.params;
    const config = await loadConfig();

    const providerConfig = config.providers?.[providerName];
    if (!providerConfig) {
      throw createError(`Provider ${providerName} not configured`, 404);
    }

    const provider = getProvider(providerName as 'chatgpt' | 'grok-web' | 'grok-x' | 'claude');
    if (!provider) {
      throw createError(`Provider ${providerName} not found`, 404);
    }

    // Test authentication
    await provider.authenticate(providerConfig);
    const isAuthenticated = await provider.isAuthenticated();

    if (!isAuthenticated) {
      throw createError('Authentication failed', 401);
    }

    // Try to list conversations (limited to 1 to test quickly)
    const conversations = await provider.listConversations({ limit: 1 });

    res.json({
      success: true,
      message: 'Provider connection successful',
      conversationsAccessible: conversations.length > 0,
    });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Provider test failed', 500, error);
  }
});

export function createProvidersRouter(): Router {
  return router;
}
