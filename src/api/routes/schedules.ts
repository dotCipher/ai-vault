/**
 * Schedule management API endpoints
 */

import { Router, type Request, type Response } from 'express';
import { ScheduleManager } from '../../utils/schedule-manager.js';
import { createError, isApiError } from '../middleware/error-handler.js';
import type { ScheduleArchiveOptions } from '../../types/schedule.js';

const router = Router();
const scheduleManager = new ScheduleManager();

/**
 * GET /api/schedules
 * List all schedules
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const schedules = await scheduleManager.loadSchedules();
    res.json({ schedules });
  } catch (error) {
    throw createError('Failed to load schedules', 500, error);
  }
});

/**
 * POST /api/schedules
 * Create a new schedule
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { provider, cron, description, options } = req.body;

    if (!provider || !cron) {
      throw createError('Provider and cron expression are required', 400);
    }

    const archiveOptions: ScheduleArchiveOptions = {
      downloadMedia: !options?.skipMedia,
      limit: options?.limit,
      sinceDays: options?.sinceDays,
    };

    const newSchedule = await scheduleManager.addSchedule(
      provider,
      cron,
      archiveOptions,
      description
    );

    res.json({ success: true, schedule: newSchedule });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Failed to create schedule', 500, error);
  }
});

/**
 * PUT /api/schedules/:id
 * Update a schedule
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const schedule = await scheduleManager.updateSchedule(id, updates);

    res.json({ success: true, schedule });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Failed to update schedule', 500, error);
  }
});

/**
 * DELETE /api/schedules/:id
 * Delete a schedule
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await scheduleManager.removeSchedule(id);

    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Failed to delete schedule', 500, error);
  }
});

/**
 * POST /api/schedules/:id/enable
 * Enable a schedule
 */
router.post('/:id/enable', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const schedule = await scheduleManager.updateSchedule(id, { enabled: true });

    res.json({ success: true, schedule });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Failed to enable schedule', 500, error);
  }
});

/**
 * POST /api/schedules/:id/disable
 * Disable a schedule
 */
router.post('/:id/disable', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const schedule = await scheduleManager.updateSchedule(id, { enabled: false });

    res.json({ success: true, schedule });
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }
    throw createError('Failed to disable schedule', 500, error);
  }
});

export function createSchedulesRouter(): Router {
  return router;
}
