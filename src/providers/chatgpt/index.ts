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
import type { ProviderConfig, Conversation, Message, Attachment } from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { AuthenticationError } from '../../types/provider.js';
import { BrowserScraper } from '../../utils/scraper.js';

export class ChatGPTProvider extends BaseProvider {
  readonly name = 'chatgpt' as const;
  readonly displayName = 'ChatGPT';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];

  private scraper?: BrowserScraper;

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
   * List conversations from ChatGPT
   */
  async listConversations(options: ListConversationsOptions = {}): Promise<ConversationSummary[]> {
    this.requireAuth();

    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.chatgpt.com',
    });

    try {
      await page.goto('https://chatgpt.com', { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for conversations to load
      await page.waitForSelector('[data-testid="conversation-item"], .conversation-item', {
        timeout: 10000,
      });

      // Scroll to load more conversations
      await page.evaluate(() => {
        const sidebar = document.querySelector(
          '[data-testid="conversation-list"], .conversation-list'
        );
        if (sidebar) {
          sidebar.scrollTo(0, sidebar.scrollHeight);
        }
      });

      await page.waitForTimeout(1000);

      // Extract conversation list
      const conversations = await page.evaluate(() => {
        const items = Array.from(
          document.querySelectorAll('[data-testid="conversation-item"], .conversation-item')
        );

        return items.map((item, idx) => {
          const titleEl = item.querySelector(
            '[data-testid="conversation-title"], .conversation-title, h3'
          );
          const title = titleEl?.textContent?.trim() || `Untitled ${idx + 1}`;

          const linkEl = item.querySelector('a[href*="/c/"]');
          const href = linkEl?.getAttribute('href') || '';
          const id = href.split('/c/')[1]?.split('?')[0] || `conv-${idx}`;

          const timeEl = item.querySelector('time, [data-testid="conversation-time"]');
          const timeStr = timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim();
          const updatedAt = timeStr ? new Date(timeStr) : new Date();

          return {
            id,
            title,
            messageCount: 0, // Unknown from list view
            createdAt: updatedAt, // Best guess
            updatedAt,
            hasMedia: false, // Unknown from list view
            preview: undefined,
          };
        });
      });

      await page.close();

      // Apply filters
      let filtered: ConversationSummary[] = conversations;

      if (options.since) {
        filtered = filtered.filter((c: ConversationSummary) => c.updatedAt >= options.since!);
      }

      if (options.until) {
        filtered = filtered.filter((c: ConversationSummary) => c.updatedAt <= options.until!);
      }

      if (options.limit) {
        filtered = filtered.slice(0, options.limit);
      }

      return filtered;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Fetch a full conversation from ChatGPT
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();

    const url = `https://chatgpt.com/c/${id}`;
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.chatgpt.com',
    });

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for messages to load
      await page.waitForSelector('[data-testid*="message"], .message, [data-message-author-role]', {
        timeout: 10000,
      });

      // Extract conversation data
      const data = await page.evaluate(() => {
        // Get title
        const titleEl = document.querySelector('[data-testid="conversation-title"], h1, .text-2xl');
        const title = titleEl?.textContent?.trim() || 'Untitled';

        // Get all messages
        const messageEls = Array.from(
          document.querySelectorAll(
            '[data-testid*="message"], [data-message-author-role], .group.w-full'
          )
        ) as Element[];

        const messages = messageEls.map((el: Element, idx: number) => {
          // Determine role
          const roleAttr = el.getAttribute('data-message-author-role');
          const isUser =
            roleAttr === 'user' ||
            el.querySelector('[data-testid="user-message"]') !== null ||
            el.classList.contains('user-message');

          const role = isUser ? 'user' : 'assistant';

          // Get content
          const contentEl = el.querySelector('[data-message-author-role] + div, .markdown, .prose');
          const content = contentEl?.textContent?.trim() || '';

          // Get timestamp
          const timeEl = el.querySelector('time');
          const timestamp = timeEl?.getAttribute('datetime') || new Date().toISOString();

          // Extract media attachments
          const imageEls = Array.from(
            el.querySelectorAll('img[src]:not([src*="avatar"])')
          ) as HTMLImageElement[];
          const videoEls = Array.from(el.querySelectorAll('video')) as HTMLVideoElement[];

          const attachments = [
            ...imageEls.map((img: HTMLImageElement, mediaIdx: number) => ({
              id: `${idx}-img-${mediaIdx}`,
              type: 'image' as const,
              url: img.src,
            })),
            ...videoEls.map((video: HTMLVideoElement, mediaIdx: number) => ({
              id: `${idx}-vid-${mediaIdx}`,
              type: 'video' as const,
              url: video.src || video.querySelector('source')?.src || '',
            })),
          ].filter((att) => att.url);

          return {
            id: `msg-${idx}`,
            role,
            content,
            timestamp,
            attachments: attachments.length > 0 ? attachments : undefined,
          };
        });

        return { title, messages };
      });

      await page.close();

      // Transform to standard format
      const messages: Message[] = data.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        attachments: msg.attachments?.map(
          (att: any): Attachment => ({
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
