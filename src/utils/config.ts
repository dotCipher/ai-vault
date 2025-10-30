/**
 * Configuration Management
 *
 * Stores provider credentials and settings in ~/.ai-vault/config.json
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { ProviderConfig } from '../types/index.js';

export interface Config {
  version: string;
  providers: {
    [providerName: string]: ProviderConfig;
  };
  settings?: {
    defaultProvider?: string;
    archiveDir?: string;
  };
}

const CONFIG_DIR = path.join(os.homedir(), '.ai-vault');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Load configuration from disk
 */
export async function loadConfig(): Promise<Config> {
  if (!existsSync(CONFIG_FILE)) {
    return {
      version: '1.0.0',
      providers: {},
    };
  }

  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    // If config is corrupted (e.g., from interrupted write), try to recover from backup
    const backupFile = `${CONFIG_FILE}.backup`;
    if (existsSync(backupFile)) {
      console.warn('Config file corrupted, restoring from backup...');
      try {
        const backupContent = await fs.readFile(backupFile, 'utf-8');
        const config = JSON.parse(backupContent);
        // Restore the backup to main config
        await fs.writeFile(CONFIG_FILE, backupContent, 'utf-8');
        return config;
      } catch {
        console.error('Backup file also corrupted. Creating fresh config.');
      }
    }

    // If no backup or backup is also corrupted, start fresh
    console.error('Config file corrupted and no valid backup found. Creating fresh config.');
    return {
      version: '1.0.0',
      providers: {},
    };
  }
}

/**
 * Save configuration to disk (atomic write with backup)
 */
export async function saveConfig(config: Config): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });

  // Create backup of existing config before overwriting
  if (existsSync(CONFIG_FILE)) {
    const backupFile = `${CONFIG_FILE}.backup`;
    try {
      await fs.copyFile(CONFIG_FILE, backupFile);
    } catch (error) {
      // Backup failed, but continue anyway
      console.warn('Failed to create config backup:', error);
    }
  }

  // Atomic write: write to temp file, then rename
  // This ensures the config is never corrupted even if interrupted (Ctrl+C)
  const tempFile = `${CONFIG_FILE}.tmp`;
  const content = JSON.stringify(config, null, 2);

  await fs.writeFile(tempFile, content, 'utf-8');
  await fs.rename(tempFile, CONFIG_FILE);
}

/**
 * Get provider configuration
 */
export async function getProviderConfig(providerName: string): Promise<ProviderConfig | undefined> {
  const config = await loadConfig();
  return config.providers[providerName];
}

/**
 * Save provider configuration
 */
export async function saveProviderConfig(providerConfig: ProviderConfig): Promise<void> {
  const config = await loadConfig();
  config.providers[providerConfig.providerName] = providerConfig;
  await saveConfig(config);
}

/**
 * Remove provider configuration
 */
export async function removeProviderConfig(providerName: string): Promise<void> {
  const config = await loadConfig();
  delete config.providers[providerName];
  await saveConfig(config);
}

/**
 * List configured providers
 */
export async function listConfiguredProviders(): Promise<string[]> {
  const config = await loadConfig();
  return Object.keys(config.providers);
}

/**
 * Check if provider is configured
 */
export async function isProviderConfigured(providerName: string): Promise<boolean> {
  const config = await loadConfig();
  return providerName in config.providers;
}
