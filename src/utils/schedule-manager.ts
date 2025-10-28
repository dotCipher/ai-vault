/**
 * Schedule Manager - Manages schedule configurations
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ScheduleConfig, ScheduleArchiveOptions } from '../types/schedule.js';
import { Scheduler } from './scheduler.js';

export class ScheduleManager {
  private configPath: string;
  private scheduler: Scheduler;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    this.configPath = path.join(homeDir, '.ai-vault', 'schedules.json');
    this.scheduler = new Scheduler();
  }

  /**
   * Load all schedules
   */
  async loadSchedules(): Promise<ScheduleConfig[]> {
    if (!existsSync(this.configPath)) {
      return [];
    }

    const content = await fs.readFile(this.configPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Save schedules
   */
  private async saveSchedules(schedules: ScheduleConfig[]): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(schedules, null, 2));
  }

  /**
   * Get a schedule by ID
   */
  async getSchedule(id: string): Promise<ScheduleConfig | null> {
    const schedules = await this.loadSchedules();
    return schedules.find((s) => s.id === id) || null;
  }

  /**
   * Add a new schedule
   */
  async addSchedule(
    provider: string,
    cron: string,
    options: ScheduleArchiveOptions,
    description?: string
  ): Promise<ScheduleConfig> {
    const schedules = await this.loadSchedules();

    // Generate unique ID
    const id = crypto.randomBytes(8).toString('hex');

    const schedule: ScheduleConfig = {
      id,
      provider,
      cron,
      description,
      enabled: true,
      options,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    schedules.push(schedule);
    await this.saveSchedules(schedules);

    // Install in OS scheduler
    await this.scheduler.install(schedule);

    return schedule;
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(
    id: string,
    updates: {
      cron?: string;
      description?: string;
      enabled?: boolean;
      options?: Partial<ScheduleArchiveOptions>;
    }
  ): Promise<ScheduleConfig> {
    const schedules = await this.loadSchedules();
    const index = schedules.findIndex((s) => s.id === id);

    if (index === -1) {
      throw new Error(`Schedule ${id} not found`);
    }

    const schedule = schedules[index];

    // Apply updates
    if (updates.cron !== undefined) schedule.cron = updates.cron;
    if (updates.description !== undefined) schedule.description = updates.description;
    if (updates.enabled !== undefined) schedule.enabled = updates.enabled;
    if (updates.options) {
      schedule.options = { ...schedule.options, ...updates.options };
    }

    schedule.updatedAt = new Date().toISOString();

    schedules[index] = schedule;
    await this.saveSchedules(schedules);

    // Reinstall in OS scheduler (this will update the job)
    if (schedule.enabled) {
      await this.scheduler.install(schedule);
    } else {
      await this.scheduler.uninstall(schedule.id);
    }

    return schedule;
  }

  /**
   * Remove a schedule
   */
  async removeSchedule(id: string): Promise<void> {
    const schedules = await this.loadSchedules();
    const filtered = schedules.filter((s) => s.id !== id);

    if (filtered.length === schedules.length) {
      throw new Error(`Schedule ${id} not found`);
    }

    await this.saveSchedules(filtered);

    // Uninstall from OS scheduler
    await this.scheduler.uninstall(id);
  }

  /**
   * Enable a schedule
   */
  async enableSchedule(id: string): Promise<void> {
    await this.updateSchedule(id, { enabled: true });
  }

  /**
   * Disable a schedule
   */
  async disableSchedule(id: string): Promise<void> {
    await this.updateSchedule(id, { enabled: false });
  }

  /**
   * Get schedule status (includes OS scheduler info)
   */
  async getScheduleStatus(id: string) {
    const schedule = await this.getSchedule(id);

    if (!schedule) {
      return null;
    }

    const installed = await this.scheduler.isInstalled(id);
    const nextRun = await this.scheduler.getNextRun(id);

    return {
      schedule,
      installed,
      nextRun,
    };
  }

  /**
   * Update last run status
   */
  async updateLastRun(id: string, status: 'success' | 'error'): Promise<void> {
    const schedules = await this.loadSchedules();
    const index = schedules.findIndex((s) => s.id === id);

    if (index === -1) {
      return;
    }

    schedules[index].lastRun = new Date().toISOString();
    schedules[index].lastStatus = status;
    await this.saveSchedules(schedules);
  }
}
