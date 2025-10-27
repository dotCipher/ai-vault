/**
 * Grok (X.AI) Provider
 *
 * Supports two methods:
 * 1. X.AI API (api.x.ai) - Requires API key
 * 2. Web scraping (x.com/i/grok) - Requires session cookies
 */

import { BaseProvider } from '../base';
import type { ProviderConfig, Conversation, Message, Attachment } from '../../types';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider';
import { AuthenticationError, NotFoundError } from '../../types/provider';
import { BrowserScraper, autoScroll } from '../../utils/scraper';
import { createApiClient, type ApiClient } from '../../utils/api-client';

export class GrokProvider extends BaseProvider {
  readonly name = 'grok' as const;
  readonly displayName = 'Grok (X.AI)';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['api-key', 'cookies'];

  private scraper?: BrowserScraper;
  private apiClient?: ApiClient;
  private useWebScraping = false;

  /**
   * Authenticate with Grok
   */
  async authenticate(config: ProviderConfig): Promise<boolean> {
    this.config = config;

    // Method 1: X.AI API with API key
    if (config.authMethod === 'api-key') {
      if (!config.apiKey) {
        throw new AuthenticationError('API key is required. Get one at https://console.x.ai');
      }

      this.apiClient = createApiClient({
        baseURL: config.customEndpoint || 'https://api.x.ai',
        apiKey: config.apiKey,
      });

      this.useWebScraping = false;

      // Test API authentication
      try {
        await this.apiClient.get('/v1/models');
        return true;
      } catch (error: any) {
        throw error; // ApiClient handles auth errors
      }
    }

    // Method 2: Web scraping with cookies
    if (config.authMethod === 'cookies') {
      if (!config.cookies) {
        throw new AuthenticationError('Session cookies are required');
      }

      this.useWebScraping = true;
      this.scraper = new BrowserScraper();
      await this.scraper.init();

      return this.isAuthenticated();
    }

    throw new AuthenticationError(`Unsupported auth method: ${config.authMethod}`);
  }

  /**
   * Check if currently authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    this.requireAuth();

    if (!this.useWebScraping && this.apiClient) {
      try {
        await this.apiClient.get('/v1/models');
        return true;
      } catch {
        return false;
      }
    }

    // Test web scraping authentication
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.x.com',
    });

    try {
      await page.goto('https://x.com/i/grok', { waitUntil: 'networkidle', timeout: 30000 });

      // Check if we're redirected to login
      const url = page.url();
      const isAuthenticated = !url.includes('/login') && !url.includes('/oauth');

      await page.close();
      return isAuthenticated;
    } catch (error) {
      await page.close();
      return false;
    }
  }

  /**
   * List all conversations
   */
  async listConversations(options?: ListConversationsOptions): Promise<ConversationSummary[]> {
    this.requireAuth();

    if (this.useWebScraping) {
      return this.listConversationsViaScraping(options);
    }

    // Note: X.AI public API doesn't have list conversations endpoint
    // We'd need to use the Grok SDK or web scraping
    console.warn('X.AI API does not support listing conversations. Using web scraping...');
    this.useWebScraping = true;
    return this.listConversationsViaScraping(options);
  }

  /**
   * List conversations via web scraping
   */
  private async listConversationsViaScraping(
    options?: ListConversationsOptions
  ): Promise<ConversationSummary[]> {
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.x.com',
    });

    try {
      await page.goto('https://x.com/i/grok', { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for conversations list to load
      await page
        .waitForSelector('[data-testid="conversation-item"], .conversation-list-item', {
          timeout: 10000,
        })
        .catch(() => {
          // Try alternative selectors if standard ones don't work
        });

      // Scroll to load more conversations
      await autoScroll(page);

      // Extract conversation data
      const conversations = await page.evaluate(() => {
        const items = Array.from(
          document.querySelectorAll(
            '[data-testid="conversation-item"], .conversation-list-item, [data-conversation-id]'
          )
        ) as Element[];

        return items
          .map((item: Element) => {
            const id =
              item.getAttribute('data-conversation-id') || item.getAttribute('data-id') || '';
            const titleEl = item.querySelector(
              '.conversation-title, [data-testid="conversation-title"]'
            );
            const title = titleEl?.textContent?.trim() || 'Untitled';
            const previewEl = item.querySelector('.conversation-preview, .message-preview');
            const preview = previewEl?.textContent?.trim();
            const timeEl = item.querySelector('time, .timestamp');
            const timestamp = timeEl?.getAttribute('datetime') || timeEl?.textContent || '';

            return { id, title, preview, timestamp };
          })
          .filter((item: any) => item.id); // Only keep items with IDs
      });

      await page.close();

      // Transform to ConversationSummary format
      return conversations.map((conv) => ({
        id: conv.id,
        title: conv.title,
        messageCount: 0, // Unknown from list view
        createdAt: conv.timestamp ? new Date(conv.timestamp) : new Date(),
        updatedAt: conv.timestamp ? new Date(conv.timestamp) : new Date(),
        hasMedia: false, // Unknown from list view
        preview: conv.preview,
      }));
    } catch (error) {
      await page.close();
      throw new Error(`Failed to list conversations: ${error}`);
    }
  }

  /**
   * Fetch complete conversation
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();

    if (this.useWebScraping) {
      return this.fetchConversationViaScraping(id);
    }

    // API method (not available in public API)
    throw new Error('Fetching individual conversations requires web scraping');
  }

  /**
   * Fetch conversation via web scraping
   */
  private async fetchConversationViaScraping(id: string): Promise<Conversation> {
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.x.com',
    });

    try {
      const url = `https://x.com/i/grok/conversation/${id}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Check if conversation exists
      const notFound = await page.$('.error-page, [data-testid="error"]');
      if (notFound) {
        await page.close();
        throw new NotFoundError(`Conversation ${id} not found`);
      }

      // Scroll to load all messages
      await autoScroll(page);

      // Extract conversation data
      const data = await page.evaluate(() => {
        const titleEl = document.querySelector('.conversation-title, h1');
        const title = titleEl?.textContent?.trim() || 'Untitled';

        const messageEls = Array.from(
          document.querySelectorAll('.message, [data-testid="message"], .chat-message')
        ) as Element[];

        const messages = messageEls.map((el: Element, idx: number) => {
          const roleEl = el.querySelector('.message-role, [data-role]');
          const role =
            roleEl?.getAttribute('data-role') ||
            (el.classList.contains('user-message') ? 'user' : 'assistant');

          const contentEl = el.querySelector('.message-content, .message-text');
          const content = contentEl?.textContent?.trim() || '';

          const timeEl = el.querySelector('time, .timestamp');
          const timestamp = timeEl?.getAttribute('datetime') || new Date().toISOString();

          // Extract media attachments
          const mediaEls = Array.from(el.querySelectorAll('img, video')) as HTMLElement[];
          const attachments = mediaEls.map((media: HTMLElement, mediaIdx: number) => ({
            id: `${idx}-${mediaIdx}`,
            type: media.tagName.toLowerCase() as 'image' | 'video',
            url: media.getAttribute('src') || '',
          }));

          return {
            id: `msg-${idx}`,
            role: role as 'user' | 'assistant',
            content,
            timestamp,
            attachments: attachments.length > 0 ? attachments : undefined,
          };
        });

        return { title, messages };
      });

      await page.close();

      // Transform to standard format
      const messages: Message[] = data.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        attachments: msg.attachments?.map(
          (att): Attachment => ({
            id: att.id,
            type: att.type,
            url: att.url,
          })
        ),
      }));

      return {
        id,
        provider: this.name,
        title: data.title,
        messages,
        createdAt: messages[0]?.timestamp || new Date(),
        updatedAt: messages[messages.length - 1]?.timestamp || new Date(),
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
