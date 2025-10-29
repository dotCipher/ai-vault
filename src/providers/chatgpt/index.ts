/**
 * ChatGPT Provider
 *
 * Supports:
 * - Native import from conversations.json export
 * - Web scraping for ongoing archival
 *
 * Note: OpenAI API does not provide conversation history retrieval.
 * Users must export data from Settings → Data controls → Export data
 */

import { BaseProvider } from '../base.js';
import type { ProviderConfig, Conversation, Message } from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { AuthenticationError } from '../../types/provider.js';
import { BrowserScraper } from '../../utils/scraper.js';
import { saveProviderConfig } from '../../utils/config.js';

export class ChatGPTProvider extends BaseProvider {
  readonly name = 'chatgpt' as const;
  readonly displayName = 'ChatGPT';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];

  private scraper?: BrowserScraper;

  /**
   * Check if cached token is still valid
   */
  private isTokenValid(): boolean {
    const cachedToken = this.config?.accessToken;
    const tokenExpiry = this.config?.tokenExpiry;

    if (!cachedToken || !tokenExpiry) {
      return false;
    }

    const expiryDate = new Date(tokenExpiry);
    const now = new Date();

    // Add 5 minute buffer before expiry
    const bufferMs = 5 * 60 * 1000;
    return expiryDate.getTime() - now.getTime() > bufferMs;
  }

  /**
   * Fetch new access token from session API
   */
  private async fetchAccessToken(page: any): Promise<{ token: string; expiry: string }> {
    const { accessToken, sessionData } = await page.evaluate(async () => {
      const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
        method: 'GET',
        credentials: 'include',
      });

      if (!sessionRes.ok) {
        return { accessToken: null, sessionData: null };
      }

      const data = await sessionRes.json();
      return {
        accessToken: data?.accessToken || null,
        sessionData: data,
      };
    });

    if (!accessToken || !sessionData?.expires) {
      throw new Error('Failed to obtain access token from session');
    }

    // Cache the token and expiry in config
    if (this.config) {
      this.config.accessToken = accessToken;
      this.config.tokenExpiry = sessionData.expires;

      // Save updated config to disk (async, don't wait)
      saveProviderConfig(this.config).catch((err) => {
        console.error('[ChatGPT] Failed to save token to config:', err.message);
      });
    }

    return { token: accessToken, expiry: sessionData.expires };
  }

  /**
   * Authenticate with ChatGPT
   * Uses cookies for web scraping
   */
  async authenticate(config: ProviderConfig): Promise<boolean> {
    this.config = config;

    if (config.authMethod !== 'cookies') {
      throw new AuthenticationError('Only cookies authentication is supported for ChatGPT');
    }

    if (!config.cookies) {
      throw new AuthenticationError('Session cookies are required for ChatGPT');
    }

    // Initialize browser for scraping
    this.scraper = new BrowserScraper();
    await this.scraper.init();

    return this.isAuthenticated();
  }

  /**
   * Check authentication status
   */
  async isAuthenticated(): Promise<boolean> {
    this.requireAuth();

    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.chatgpt.com',
    });

    await page.goto('https://chatgpt.com', { waitUntil: 'networkidle', timeout: 30000 });

    // Check if we're redirected to login or if we can see user-specific elements
    const url = page.url();
    const isAuthenticated = !url.includes('/auth/login') && !url.includes('/auth/');

    await page.close();
    return isAuthenticated;
  }

  /**
   * List conversations from ChatGPT using backend API
   */
  async listConversations(options: ListConversationsOptions = {}): Promise<ConversationSummary[]> {
    this.requireAuth();

    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.chatgpt.com',
    });

    try {
      let accessToken: string;

      // Check if we have a valid cached token
      if (this.isTokenValid()) {
        console.log('[ChatGPT] Using cached access token');
        accessToken = this.config!.accessToken!;
        // Quick navigation without waiting for full load
        await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      } else {
        console.log('[ChatGPT] Fetching new access token...');
        // Full navigation to establish session
        await page.goto('https://chatgpt.com', { waitUntil: 'networkidle', timeout: 30000 });
        const result = await this.fetchAccessToken(page);
        accessToken = result.token;
      }

      // Use backend API to fetch conversations
      const limit = options.limit || 100;
      const apiUrl = `https://chatgpt.com/backend-api/conversations?offset=0&limit=${limit}&order=updated&is_archived=false&is_starred=false`;

      const response = await page.evaluate(
        async ({ url, token }) => {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          };

          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers,
          });

          if (!res.ok) {
            throw new Error(`API request failed: ${res.status} ${res.statusText}`);
          }

          return await res.json();
        },
        { url: apiUrl, token: accessToken }
      );

      await page.close();

      // Parse API response
      const conversations = response.items || [];

      if (!Array.isArray(conversations)) {
        throw new Error('Unexpected API response format');
      }

      // Transform to ConversationSummary format
      let summaries: ConversationSummary[] = conversations.map((conv: any) => ({
        id: conv.id,
        title: conv.title || 'Untitled',
        messageCount: 0, // Not provided in list API
        createdAt: conv.create_time ? new Date(conv.create_time * 1000) : new Date(),
        updatedAt: conv.update_time ? new Date(conv.update_time * 1000) : new Date(),
        hasMedia: false, // Will be determined when fetching full conversation
        preview: undefined,
      }));

      // Apply filters
      if (options.since) {
        summaries = summaries.filter((c) => c.updatedAt >= options.since!);
      }

      if (options.until) {
        summaries = summaries.filter((c) => c.updatedAt <= options.until!);
      }

      return summaries;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Fetch a full conversation from ChatGPT using backend API
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();

    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.chatgpt.com',
    });

    try {
      let accessToken: string;

      // Check if we have a valid cached token
      if (this.isTokenValid()) {
        console.log('[ChatGPT] Using cached access token');
        accessToken = this.config!.accessToken!;
        // Quick navigation without waiting for full load
        await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      } else {
        console.log('[ChatGPT] Fetching new access token...');
        // Full navigation to establish session
        await page.goto('https://chatgpt.com', { waitUntil: 'networkidle', timeout: 30000 });
        const result = await this.fetchAccessToken(page);
        accessToken = result.token;
      }

      // Use backend API to fetch conversation data
      const apiUrl = `https://chatgpt.com/backend-api/conversation/${id}`;

      const data = await page.evaluate(
        async ({ url, token }) => {
          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });

          if (!res.ok) {
            throw new Error(`API request failed: ${res.status} ${res.statusText}`);
          }

          return await res.json();
        },
        { url: apiUrl, token: accessToken }
      );

      await page.close();

      // Extract messages from the conversation data
      const title = data.title || 'Untitled';
      const messages: Message[] = [];

      // Parse the conversation mapping structure
      const mapping = data.mapping || {};

      // Build message chain by traversing the tree
      const messageNodes: any[] = [];
      for (const nodeId in mapping) {
        const node = mapping[nodeId];
        if (node.message && node.message.content && node.message.content.parts) {
          messageNodes.push(node);
        }
      }

      // Sort by create_time
      messageNodes.sort((a, b) => {
        const timeA = a.message?.create_time || 0;
        const timeB = b.message?.create_time || 0;
        return timeA - timeB;
      });

      // Transform to Message format
      for (const node of messageNodes) {
        const msg = node.message;
        const role = msg.author?.role === 'user' ? 'user' : 'assistant';

        // Extract text content from parts
        const parts = msg.content?.parts || [];
        const content = parts.filter((p: any) => typeof p === 'string').join('\n');

        if (content) {
          messages.push({
            id: msg.id || node.id,
            role,
            content,
            timestamp: msg.create_time ? new Date(msg.create_time * 1000) : new Date(),
            attachments: undefined, // TODO: Extract attachments if needed
          });
        }
      }

      return {
        id,
        provider: this.name,
        title,
        messages,
        createdAt: data.create_time
          ? new Date(data.create_time * 1000)
          : messages[0]?.timestamp || new Date(),
        updatedAt: data.update_time
          ? new Date(data.update_time * 1000)
          : messages[messages.length - 1]?.timestamp || new Date(),
        metadata: {
          messageCount: messages.length,
          characterCount: messages.reduce((sum, m) => sum + m.content.length, 0),
          mediaCount: messages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0),
        },
      };
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Cleanup browser resources
   */
  async cleanup(): Promise<void> {
    if (this.scraper) {
      await this.scraper.close();
      this.scraper = undefined;
    }
  }
}
