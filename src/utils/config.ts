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

  const content = await fs.readFile(CONFIG_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save configuration to disk
 */
export async function saveConfig(config: Config): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
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
