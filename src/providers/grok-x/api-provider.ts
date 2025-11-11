/**
 * Grok on X Provider - Strategy-Based Implementation
 *
 * Uses pluggable authentication architecture with cookie-based auth.
 *
 * NOTE: Only cookie-based authentication is currently supported.
 * Grok (X-integrated) does not have an official API for conversation retrieval.
 *
 * This provider connects to the X-integrated Grok platform using cookie-based
 * authentication. Uses the same REST API structure as grok.com but may use x.com domain.
 */

import { StrategyBasedProvider } from '../auth/base-strategy-provider.js';
import type { Conversation, Message, Attachment } from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { NotFoundError } from '../../types/provider.js';
import { CookieApiStrategy } from '../auth/strategies.js';
import { autoScroll } from '../../utils/scraper.js';

/**
 * Grok on X Provider with strategy-based authentication
 * Currently only supports cookie-based auth (the only method available)
 */
export class GrokXApiProvider extends StrategyBasedProvider {
  readonly name = 'grok-x' as const;
  readonly displayName = 'Grok on X';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];

  protected registerAuthStrategies(): void {
    // Only cookie-based auth works for X-integrated Grok
    // No official API available
    this.strategyManager.register(new CookieApiStrategy('.x.com', 'https://x.com/i/grok'));

    // Future: If X releases a Grok API
    // this.strategyManager.register(new XGrokApiKeyStrategy());
  }

  /**
   * List conversations - uses cookie-based approach
   */
  async listConversations(options?: ListConversationsOptions): Promise<ConversationSummary[]> {
    this.requireAuth();
    return this.listConversationsViaWeb(options);
  }

  /**
   * List conversations via X Grok platform
   */
  private async listConversationsViaWeb(
    options?: ListConversationsOptions
  ): Promise<ConversationSummary[]> {
    const scraper = this.getScraper();
    const page = await scraper.createPage({
      cookies: this.config!.cookies!,
      domain: '.x.com',
    });

    try {
      // Use the REST API - may use x.com or grok.com domain
      const pageSize = options?.limit || 60;
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
        hasMedia: false,
        preview: conv.preview || conv.lastMessage || undefined,
      }));
    } catch (error) {
      await page.close();
      throw new Error(`Failed to list conversations: ${error}`);
    }
  }

  /**
   * Fetch conversation - uses cookie-based approach with DOM scraping
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();
    return this.fetchConversationViaWeb(id);
  }

  /**
   * Fetch conversation via X Grok platform
   */
  private async fetchConversationViaWeb(id: string): Promise<Conversation> {
    const scraper = this.getScraper();
    const page = await scraper.createPage({
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
}
