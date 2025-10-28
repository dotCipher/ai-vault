/**
 * Provider registry - all AI platform providers
 */

import { GrokWebProvider } from './grok-web/index.js';
import { GrokXProvider } from './grok-x/index.js';
import type { Provider } from '../types/provider.js';
import type { ProviderName } from '../types/index.js';

// Provider registry
export const providers: Record<string, new () => Provider> = {
  'grok-web': GrokWebProvider,
  'grok-x': GrokXProvider,
  // chatgpt: ChatGPTProvider, // Coming soon
  // claude: ClaudeProvider, // Coming soon
  // gemini: GeminiProvider, // Coming soon
};

/**
 * Get a provider instance by name
 */
export function getProvider(name: ProviderName): Provider {
  const ProviderClass = providers[name];

  if (!ProviderClass) {
    throw new Error(
      `Provider '${name}' not found. Available providers: ${Object.keys(providers).join(', ')}`
    );
  }

  return new ProviderClass();
}

/**
 * Get all available provider names
 */
export function getAvailableProviders(): ProviderName[] {
  return Object.keys(providers) as ProviderName[];
}

/**
 * Check if a provider is available
 */
export function isProviderAvailable(name: string): boolean {
  return name in providers;
}

export { GrokWebProvider, GrokXProvider };
