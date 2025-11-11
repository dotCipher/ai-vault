/**
 * Grok Web Provider - Strategy-Based Implementation
 *
 * Uses pluggable authentication architecture with cookie-based auth.
 *
 * NOTE: Only cookie-based authentication is currently supported.
 * Grok does not have an official API for conversation history retrieval.
 *
 * KNOWN LIMITATIONS:
 * - Voice conversations: Audio files are not accessible through the web interface or API.
 *   Only metadata (title, timestamps) can be archived.
 * - Message content: DOM structure is heavily dynamic; message scraping may not work
 *   for all conversation types. Messages API endpoint returns 404.
 * - Successfully captures: Conversation titles, IDs, creation/modification times
 */

import { StrategyBasedProvider } from '../auth/base-strategy-provider.js';
import type {
  ProviderConfig,
  Conversation,
  ConversationHierarchy,
  Message,
  Attachment,
  Asset,
  Workspace,
  Project,
  ProjectFile,
} from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { AuthenticationError, NotFoundError } from '../../types/provider.js';
import { CookieApiStrategy } from '../auth/strategies.js';
import { autoScroll } from '../../utils/scraper.js';

/**
 * Grok Web Provider with strategy-based authentication
 * Currently only supports cookie-based auth (the only method available)
 */
export class GrokWebApiProvider extends StrategyBasedProvider {
  readonly name = 'grok-web' as const;
  readonly displayName = 'Grok (grok.com)';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];

  // Rate limiting configuration for Grok
  readonly rateLimit = {
    maxConcurrent: 1, // Sequential downloads
    requestsPerSecond: 2, // Conservative rate
  };

  protected registerAuthStrategies(): void {
    // Only cookie-based auth works for Grok
    // No official API available
    this.strategyManager.register(new CookieApiStrategy('.grok.com', 'https://grok.com'));

    // Future: If Grok releases an API
    // this.strategyManager.register(new GrokApiKeyStrategy());
  }

  /**
   * Wait for Cloudflare challenge to complete
   */
  private async waitForCloudflareChallenge(page: any): Promise<void> {
    try {
      // Wait for potential Cloudflare challenge
      await page.waitForFunction(
        () => {
          const bodyText = document.body.innerText;
          return (
            !bodyText.includes('Checking your browser') &&
            !bodyText.includes('Just a moment') &&
            !bodyText.includes('Making sure')
          );
        },
        { timeout: 30000 }
      );
    } catch {
      // If timeout, continue anyway - might not be a Cloudflare challenge
    }
  }

  /**
   * List conversations - uses cookie-based API with DOM fallback
   */
  async listConversations(options?: ListConversationsOptions): Promise<ConversationSummary[]> {
    this.requireAuth();
    return this.listConversationsViaWeb(options);
  }

  /**
   * List conversations via grok.com (API first, DOM scraping fallback)
   */
  private async listConversationsViaWeb(
    options?: ListConversationsOptions
  ): Promise<ConversationSummary[]> {
    const scraper = this.getScraper();
    const page = await scraper.createPage({
      cookies: this.config!.cookies!,
      domain: '.grok.com',
    });

    try {
      const pageSize = options?.limit || 60;

      // Navigate to grok.com first to establish session (60s timeout for Cloudflare)
      await page.goto('https://grok.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Wait for Cloudflare challenge if present
      await this.waitForCloudflareChallenge(page);

      // Extra wait to ensure session is fully established
      await page.waitForTimeout(3000);

      // Try API first, fall back to DOM scraping if it fails
      let conversations: ConversationSummary[] = [];
      let apiSuccess = false;

      try {
        const apiUrl = `https://grok.com/rest/app-chat/conversations?pageSize=${pageSize}`;
        const response = await page.evaluate(async (url) => {
          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
          });

          // Check if response is OK
          if (!res.ok) {
            return { error: `API returned ${res.status}`, status: res.status };
          }

          // Check content type to ensure it's JSON
          const contentType = res.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            return { error: `Expected JSON but got: ${contentType}`, status: res.status };
          }

          return await res.json();
        }, apiUrl);

        // If we got an error object, throw to trigger fallback
        if (response.error) {
          console.warn(`API request failed: ${response.error}, falling back to DOM scraping...`);
          throw new Error(response.error);
        }

        // Parse API response
        const conversationsData = response.conversations || response.data || response;

        if (Array.isArray(conversationsData)) {
          conversations = conversationsData.map((conv: any) => ({
            id: conv.conversationId || conv.id || conv.uuid,
            title: conv.title || conv.name || 'Untitled',
            messageCount: conv.messageCount || conv.messages?.length || 0,
            createdAt: conv.createTime
              ? new Date(conv.createTime)
              : conv.createdAt
                ? new Date(conv.createdAt)
                : new Date(),
            updatedAt: conv.modifyTime
              ? new Date(conv.modifyTime)
              : conv.updatedAt
                ? new Date(conv.updatedAt)
                : new Date(),
            hasMedia:
              conv.mediaTypes && Array.isArray(conv.mediaTypes) && conv.mediaTypes.length > 0,
            preview: conv.preview || conv.lastMessage || undefined,
          }));
          apiSuccess = true;
        }
      } catch (apiError) {
        console.warn('API failed, using DOM scraping fallback:', apiError);
      }

      // Fallback to DOM scraping if API failed
      if (!apiSuccess) {
        console.log('Scraping conversation list from DOM...');

        // Navigate to history page where conversations are listed
        await page.goto('https://grok.com/history?tab=conversations', {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });

        // Wait for actual conversation content to load instead of fixed timeout
        try {
          await page.waitForFunction(
            () => {
              const hasConversations = document.querySelectorAll('a[href*="/chat/"]').length > 0;
              const isLoading = document.body.innerText.includes('Making sure');
              const hasHistoryContent =
                document.querySelector('[class*="history"]') ||
                document.querySelector('[class*="History"]') ||
                document.body.innerText.includes('History');

              return (hasConversations || hasHistoryContent) && !isLoading;
            },
            { timeout: 30000 }
          );

          await page.waitForTimeout(2000);
        } catch {
          console.warn('Timeout waiting for conversation content, continuing with scraping...');
        }

        // Extract conversations from DOM
        const scrapedData = await page.evaluate((limit) => {
          // Try multiple possible selectors for conversation items
          const conversationSelectors = [
            '[data-testid="conversation-item"]',
            '[data-conversation-id]',
            'a[href^="/c/"]', // Grok changed URLs from /chat/ to /c/
            'a[href^="/chat/"]', // Keep old pattern as fallback
            '[class*="conversation"]',
            '[class*="chat-item"]',
            'div[role="button"][class*="chat"]',
            'nav a[href*="/c/"]',
            'nav a[href*="/chat/"]',
          ];

          let conversationElements: Element[] = [];

          for (const selector of conversationSelectors) {
            const elements = Array.from(document.querySelectorAll(selector));
            if (elements.length > 0) {
              conversationElements = elements;
              break;
            }
          }

          // If we still don't have conversations, try to find links to conversation pages
          if (conversationElements.length === 0) {
            const allLinks = Array.from(document.querySelectorAll('a[href]'));
            conversationElements = allLinks.filter((link) => {
              const href = link.getAttribute('href') || '';
              return (href.includes('/c/') || href.includes('/chat/')) && href.length > 10;
            });
          }

          // Extract data from found elements
          const results = conversationElements.slice(0, limit).map((el, idx) => {
            // Extract ID from href
            const link =
              el.getAttribute('href') || el.querySelector('a')?.getAttribute('href') || '';
            const idMatch = link.match(/\/(?:c|chat)\/([a-zA-Z0-9_-]+)/);
            const id = idMatch ? idMatch[1] : `unknown-${idx}`;

            // Extract title
            let title = 'Untitled';
            const titleEl = el.querySelector('[class*="title"]') || el.querySelector('h3, h4');
            if (titleEl?.textContent) {
              title = titleEl.textContent.trim();
            } else if (el.textContent) {
              const text = el.textContent.trim();
              const lines = text.split('\n').filter((l) => l.trim().length > 0);
              title = lines[0]?.substring(0, 100) || 'Untitled';
            }

            // Try to extract timestamp
            const timeEl = el.querySelector('time');
            let updatedAt = new Date();
            if (timeEl) {
              const datetime = timeEl.getAttribute('datetime');
              if (datetime) {
                updatedAt = new Date(datetime);
              }
            }

            return {
              id,
              title,
              messageCount: 0,
              createdAt: updatedAt,
              updatedAt,
              hasMedia: false,
              preview: undefined,
            };
          });

          return results;
        }, pageSize);

        if (scrapedData.length > 0) {
          conversations = scrapedData.map((conv: any) => ({
            ...conv,
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt),
          }));
          console.log(`Successfully scraped ${conversations.length} conversations from DOM`);
        } else {
          console.warn('No conversations found via DOM scraping');
        }
      }

      await page.close();
      return conversations;
    } catch (error) {
      await page.close();
      throw error;
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
   * Fetch conversation via grok.com web platform
   */
  private async fetchConversationViaWeb(id: string): Promise<Conversation> {
    const scraper = this.getScraper();
    const page = await scraper.createPage({
      cookies: this.config!.cookies!,
      domain: '.grok.com',
    });

    try {
      // Navigate to conversation
      await page.goto(`https://grok.com/c/${id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Wait for Cloudflare
      await this.waitForCloudflareChallenge(page);

      // Try to use REST API first
      let conversationData: any = null;
      let messages: Message[] = [];

      try {
        const apiUrl = `https://grok.com/rest/app-chat/conversations/${id}`;
        conversationData = await page.evaluate(async (url) => {
          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
          });

          if (!res.ok) {
            return null;
          }

          return await res.json();
        }, apiUrl);

        if (conversationData) {
          // Parse messages from API response
          const apiMessages = conversationData.messages || [];
          messages = apiMessages.map((msg: any, idx: number) => ({
            id: msg.id || `msg-${idx}`,
            role: msg.role || (msg.sender === 'user' ? 'user' : 'assistant'),
            content: msg.content || msg.text || '',
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            attachments: msg.attachments || undefined,
          }));
        }
      } catch (apiError) {
        console.warn('Conversation API failed, using DOM scraping:', apiError);
      }

      // If API failed, fall back to DOM scraping
      if (!conversationData || messages.length === 0) {
        console.log('Scraping conversation from DOM...');

        // Wait for messages to load
        await page.waitForTimeout(3000);

        // Scroll to load all messages
        await autoScroll(page);

        // Extract conversation data from DOM
        const domData = await page.evaluate(() => {
          const titleEl = document.querySelector('h1, [class*="title"]');
          const title = titleEl?.textContent?.trim() || 'Untitled';

          const messageSelectors = [
            '[data-message]',
            '[class*="message"]',
            '[class*="Message"]',
            '.chat-message',
            '[role="article"]',
          ];

          let messageElements: Element[] = [];
          for (const selector of messageSelectors) {
            const elements = Array.from(document.querySelectorAll(selector));
            if (elements.length > 0) {
              messageElements = elements;
              break;
            }
          }

          const messages = messageElements.map((el: Element, idx: number) => {
            // Determine role
            const roleAttr = el.getAttribute('data-role');
            const hasUserClass = el.className.includes('user');
            const role = roleAttr === 'user' || hasUserClass ? 'user' : 'assistant';

            // Extract content
            const contentEl = el.querySelector('[class*="content"], [class*="text"]');
            const content = contentEl?.textContent?.trim() || el.textContent?.trim() || '';

            // Extract timestamp
            const timeEl = el.querySelector('time');
            const timestamp = timeEl?.getAttribute('datetime') || new Date().toISOString();

            // Extract media
            const mediaEls = Array.from(el.querySelectorAll('img, video')) as HTMLElement[];
            const attachments = mediaEls.map((media: HTMLElement, mediaIdx: number) => ({
              id: `${idx}-${mediaIdx}`,
              type: media.tagName.toLowerCase() as 'image' | 'video',
              url: media.getAttribute('src') || '',
            }));

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

        conversationData = domData;
        messages = domData.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
          attachments: msg.attachments?.map(
            (att: any): Attachment => ({
              id: att.id,
              type: att.type,
              url: att.url,
            })
          ),
        }));
      }

      await page.close();

      const title = conversationData?.title || 'Untitled';

      return {
        id,
        provider: this.name,
        title,
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
   * Download media from Grok with rate limiting
   */
  async downloadMedia(url: string, outputPath: string) {
    // Add delay for rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Use base implementation with retry
    return this.retry(() => super.downloadMedia(url, outputPath), 3, 5000);
  }
}
