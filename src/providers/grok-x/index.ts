/**
 * Grok on X Provider (x.com/grok platform - X-integrated)
 *
 * This provider connects to the X-integrated Grok platform using cookie-based authentication.
 * Uses the same REST API structure as grok.com but may use x.com domain.
 */

import { BaseProvider } from '../base.js';
import type { ProviderConfig, Conversation, Message, Attachment } from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { AuthenticationError, NotFoundError } from '../../types/provider.js';
import { BrowserScraper, autoScroll } from '../../utils/scraper.js';

export class GrokXProvider extends BaseProvider {
  readonly name = 'grok-x' as const;
  readonly displayName = 'Grok on X';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];

  private scraper?: BrowserScraper;

  /**
   * Authenticate with Grok on X (x.com/grok or x.com/i/grok)
   */
  async authenticate(config: ProviderConfig): Promise<boolean> {
    this.config = config;

    // Only cookies authentication is supported for x.com/grok
    if (config.authMethod !== 'cookies') {
      throw new AuthenticationError('Only cookies authentication is supported for Grok on X');
    }

    if (!config.cookies) {
      throw new AuthenticationError('Session cookies are required');
    }

    this.scraper = new BrowserScraper();
    await this.scraper.init();

    return this.isAuthenticated();
  }

  /**
   * Check if currently authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    this.requireAuth();

    // Test authentication by visiting x.com/i/grok
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.x.com',
    });

    await page.goto('https://x.com/i/grok', { waitUntil: 'networkidle', timeout: 30000 });

    // Check if we're redirected to login
    const url = page.url();
    const isAuthenticated = !url.includes('/login') && !url.includes('/oauth');

    await page.close();
    return isAuthenticated;
  }

  /**
   * List all conversations from X Grok REST API
   */
  async listConversations(options?: ListConversationsOptions): Promise<ConversationSummary[]> {
    this.requireAuth();
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.x.com',
    });

    try {
      // Use the REST API - may use x.com or grok.com domain
      const pageSize = options?.limit || 60;
      // Note: The actual API endpoint may vary - adjust as needed based on X's implementation
      const apiUrl = `https://x.com/i/api/grok/conversations?pageSize=${pageSize}`;

      // Navigate to x.com/i/grok first to establish session
      await page.goto('https://x.com/i/grok', { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Make API request using page context (authenticated with cookies)
      const response = await page.evaluate(async (url) => {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
        });
        return await res.json();
      }, apiUrl);

      await page.close();

      // Parse API response
      // Expected format: { conversations: [...] } or similar
      const conversations = response.conversations || response.data || response;

      if (!Array.isArray(conversations)) {
        throw new Error('Unexpected API response format');
      }

      // Transform to ConversationSummary format
      return conversations.map((conv: any) => ({
        id: conv.id || conv.conversationId || conv.uuid,
        title: conv.title || conv.name || 'Untitled',
        messageCount: conv.messageCount || conv.messages?.length || 0,
        createdAt: conv.createdAt ? new Date(conv.createdAt) : new Date(),
        updatedAt: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
        hasMedia: false, // Will be determined when fetching full conversation
        preview: conv.preview || conv.lastMessage || undefined,
      }));
    } catch (error) {
      await page.close();
      throw new Error(`Failed to list conversations: ${error}`);
    }
  }

  /**
   * Fetch complete conversation from X Grok
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.x.com',
    });

    try {
      const url = `https://x.com/i/grok/${id}`;
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
