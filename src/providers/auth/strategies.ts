/**
 * Authentication Strategy Abstraction
 *
 * Provides pluggable authentication strategies for providers.
 * Each strategy handles a specific auth method (API key, OAuth, cookies, etc.)
 */

import type { ProviderConfig } from '../../types/index.js';
import { AuthenticationError } from '../../types/provider.js';
import { BrowserScraper } from '../../utils/scraper.js';
import axios, { AxiosInstance } from 'axios';

/**
 * Base interface for all authentication strategies
 */
export interface AuthStrategy {
  readonly name: string;
  readonly priority: number; // Lower = higher priority (try first)

  /**
   * Check if this strategy can be used with the given config
   */
  canAuthenticate(config: ProviderConfig): boolean;

  /**
   * Perform authentication and return authenticated client/context
   */
  authenticate(config: ProviderConfig): Promise<AuthContext>;

  /**
   * Test if current authentication is still valid
   */
  isValid(context: AuthContext): Promise<boolean>;

  /**
   * Cleanup resources
   */
  cleanup?(context: AuthContext): Promise<void>;
}

/**
 * Authentication context returned by strategies
 * Contains the authenticated client/session that providers will use
 */
export interface AuthContext {
  strategy: string;
  config: ProviderConfig;

  // HTTP client (for API-based auth)
  httpClient?: AxiosInstance;

  // Browser context (for cookie/scraper-based auth)
  scraper?: BrowserScraper;

  // Additional context data
  metadata?: {
    organizationId?: string;
    accessToken?: string;
    tokenExpiry?: Date;
    [key: string]: any;
  };
}

/**
 * API Key Authentication Strategy
 * Uses official provider APIs with API keys
 *
 * NOTE: Currently NOT used for most providers as official APIs don't support
 * conversation history retrieval. This is included for future-proofing.
 */
export class ApiKeyAuthStrategy implements AuthStrategy {
  readonly name = 'api-key';
  readonly priority = 10; // Low priority - not currently useful for archival

  constructor(
    private baseURL: string,
    private headerName: string = 'x-api-key'
  ) {}

  canAuthenticate(config: ProviderConfig): boolean {
    return config.authMethod === 'api-key' && !!config.apiKey;
  }

  async authenticate(config: ProviderConfig): Promise<AuthContext> {
    if (!config.apiKey) {
      throw new AuthenticationError('API key is required');
    }

    // Create authenticated HTTP client
    const httpClient = axios.create({
      baseURL: this.baseURL,
      headers: {
        [this.headerName]: config.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'ai-vault/2.0.0',
      },
      timeout: 30000,
    });

    // Test the API key by making a simple request
    // Subclasses should override this with provider-specific validation
    await this.validateApiKey(httpClient);

    return {
      strategy: this.name,
      config,
      httpClient,
    };
  }

  async isValid(context: AuthContext): Promise<boolean> {
    if (!context.httpClient) return false;

    try {
      await this.validateApiKey(context.httpClient);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate API key - override in subclasses for provider-specific validation
   */
  protected async validateApiKey(client: AxiosInstance): Promise<void> {
    // Default: just check if client exists
    // Subclasses should make an actual validation request
  }
}

/**
 * Anthropic API Key Strategy
 */
export class AnthropicApiKeyStrategy extends ApiKeyAuthStrategy {
  constructor() {
    super('https://api.anthropic.com/v1', 'x-api-key');
  }

  protected async validateApiKey(client: AxiosInstance): Promise<void> {
    try {
      // Test with a minimal request to validate the API key
      await client.get('/messages', {
        headers: {
          'anthropic-version': '2023-06-01',
        },
        validateStatus: (status) => status === 400 || status === 200,
      });
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new AuthenticationError('Invalid Anthropic API key');
      }
      throw error;
    }
  }
}

/**
 * OpenAI API Key Strategy
 */
export class OpenAIApiKeyStrategy extends ApiKeyAuthStrategy {
  constructor() {
    super('https://api.openai.com/v1', 'Authorization');
  }

  canAuthenticate(config: ProviderConfig): boolean {
    return config.authMethod === 'api-key' && !!config.apiKey;
  }

  async authenticate(config: ProviderConfig): Promise<AuthContext> {
    if (!config.apiKey) {
      throw new AuthenticationError('API key is required');
    }

    // OpenAI uses Bearer token format
    const httpClient = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'ai-vault/2.0.0',
      },
      timeout: 30000,
    });

    await this.validateApiKey(httpClient);

    return {
      strategy: this.name,
      config,
      httpClient,
    };
  }

  protected async validateApiKey(client: AxiosInstance): Promise<void> {
    try {
      // Test with models endpoint
      await client.get('/models');
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new AuthenticationError('Invalid OpenAI API key');
      }
      throw error;
    }
  }
}

/**
 * Cookie + API Strategy
 * Uses cookies for web session, then accesses backend APIs
 * This is the PRIMARY approach for ChatGPT and Claude providers
 * as it's the only way to access conversation history.
 */
export class CookieApiStrategy implements AuthStrategy {
  readonly name = 'cookie-api';
  readonly priority = 1; // Highest priority - this is what works!

  constructor(
    private domain: string,
    private baseURL: string
  ) {}

  canAuthenticate(config: ProviderConfig): boolean {
    return config.authMethod === 'cookies' && !!config.cookies;
  }

  async authenticate(config: ProviderConfig): Promise<AuthContext> {
    if (!config.cookies) {
      throw new AuthenticationError('Session cookies are required');
    }

    // Initialize browser with cookies
    const scraper = new BrowserScraper();
    await scraper.init();

    // Create page with cookies to establish session
    const page = await scraper.createPage({
      cookies: config.cookies,
      domain: this.domain,
    });

    // Navigate to establish session
    await page.goto(this.baseURL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    return {
      strategy: this.name,
      config,
      scraper,
      metadata: {
        domain: this.domain,
        baseURL: this.baseURL,
      },
    };
  }

  async isValid(context: AuthContext): Promise<boolean> {
    if (!context.scraper) return false;

    try {
      const page = await context.scraper.createPage({
        cookies: context.config.cookies!,
        domain: context.metadata?.domain,
      });

      await page.goto(context.metadata?.baseURL, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      const url = page.url();
      const isValid = !url.includes('/login') && !url.includes('/auth/');

      await page.close();
      return isValid;
    } catch {
      return false;
    }
  }

  async cleanup(context: AuthContext): Promise<void> {
    if (context.scraper) {
      await context.scraper.close();
    }
  }
}

/**
 * OAuth Strategy (placeholder for future implementation)
 */
export class OAuthStrategy implements AuthStrategy {
  readonly name = 'oauth';
  readonly priority = 5;

  canAuthenticate(config: ProviderConfig): boolean {
    return config.authMethod === 'oauth';
  }

  async authenticate(config: ProviderConfig): Promise<AuthContext> {
    throw new Error('OAuth authentication not yet implemented');
  }

  async isValid(context: AuthContext): Promise<boolean> {
    return false;
  }
}

/**
 * Strategy Manager
 * Selects and manages the best authentication strategy for a provider
 */
export class AuthStrategyManager {
  private strategies: AuthStrategy[] = [];

  /**
   * Register an authentication strategy
   */
  register(strategy: AuthStrategy): void {
    this.strategies.push(strategy);
    // Sort by priority (lower number = higher priority)
    this.strategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Select the best strategy for the given config
   * Returns the first strategy that can authenticate
   */
  selectStrategy(config: ProviderConfig): AuthStrategy | null {
    for (const strategy of this.strategies) {
      if (strategy.canAuthenticate(config)) {
        return strategy;
      }
    }
    return null;
  }

  /**
   * Authenticate using the best available strategy
   */
  async authenticate(config: ProviderConfig): Promise<AuthContext> {
    const strategy = this.selectStrategy(config);

    if (!strategy) {
      throw new AuthenticationError(
        `No authentication strategy available for method: ${config.authMethod}`
      );
    }

    try {
      const context = await strategy.authenticate(config);
      return context;
    } catch (error: any) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Cleanup authentication context
   */
  async cleanup(context: AuthContext): Promise<void> {
    const strategy = this.strategies.find(s => s.name === context.strategy);
    if (strategy?.cleanup) {
      await strategy.cleanup(context);
    }
  }
}
