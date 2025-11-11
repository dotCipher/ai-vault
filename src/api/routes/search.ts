/**
 * Full-text search API endpoints
 */

import { Router, type Request, type Response } from 'express';
import { getSearchService } from '../services/search-service.js';
import { loadConfig } from '../../utils/config.js';
import { createError, isApiError } from '../middleware/error-handler.js';

const router = Router();

/**
 * POST /api/search/index
 * Rebuild search index
 */
router.post('/index', async (_req: Request, res: Response) => {
  try {
    const config = await loadConfig();
    const searchService = getSearchService();

    await searchService.buildIndex(
      Object.keys(config.providers || {}),
      config.settings?.archiveDir
    );

    const stats = searchService.getStats();

    res.json({
      success: true,
      message: 'Search index rebuilt',
      stats,
    });
  } catch (error) {
    throw createError('Failed to rebuild search index', 500, error);
  }
});

/**
 * POST /api/search/query
 * Execute a search query
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, providers, since, until, limit, fuzzy } = req.body;

    if (!query || typeof query !== 'string') {
      throw createError('Search query is required', 400);
    }

    const searchService = getSearchService();

    // Build index if not already built
    if (!searchService.getStats().isIndexed) {
      const config = await loadConfig();
      await searchService.buildIndex(
        Object.keys(config.providers || {}),
        config.settings?.archiveDir
      );
    }

    const results = await searchService.search({
      query,
      providers,
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
      limit: limit || 50,
      fuzzy: fuzzy !== false, // Default to true
    });

    res.json({
      results,
      total: results.length,
      query,
    });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Search failed', 500, error);
  }
});

/**
 * GET /api/search/suggestions
 * Get search suggestions
 */
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string') {
      res.json({ suggestions: [] });
      return;
    }

    const searchService = getSearchService();

    // Build index if not already built
    if (!searchService.getStats().isIndexed) {
      const config = await loadConfig();
      await searchService.buildIndex(
        Object.keys(config.providers || {}),
        config.settings?.archiveDir
      );
    }

    const suggestions = searchService.getSuggestions(q, parseInt(limit as string));

    res.json({ suggestions });
  } catch (error) {
    throw createError('Failed to get suggestions', 500, error);
  }
});

/**
 * GET /api/search/stats
 * Get search index statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const searchService = getSearchService();
    const stats = searchService.getStats();

    res.json({ stats });
  } catch (error) {
    throw createError('Failed to get search stats', 500, error);
  }
});

export function createSearchRouter(): Router {
  return router;
}
