/**
 * Grok Web Provider (grok.com platform)
 *
 * This provider connects to the grok.com platform using cookie-based authentication.
 * Uses REST API endpoints at grok.com/rest/app-chat for fetching conversations.
 *
 * KNOWN LIMITATIONS:
 * - Voice conversations: Audio files are not accessible through the web interface or API.
 *   Only metadata (title, timestamps) can be archived.
 * - Message content: DOM structure is heavily dynamic; message scraping may not work
 *   for all conversation types. Messages API endpoint returns 404.
 * - Successfully captures: Conversation titles, IDs, creation/modification times
 */

import { BaseProvider } from '../base.js';
import type { ProviderConfig, Conversation, Message, Attachment } from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { AuthenticationError, NotFoundError } from '../../types/provider.js';
import { BrowserScraper, autoScroll } from '../../utils/scraper.js';

export class GrokWebProvider extends BaseProvider {
  readonly name = 'grok-web' as const;
  readonly displayName = 'Grok (grok.com)';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];

  private scraper?: BrowserScraper;

  /**
   * Authenticate with Grok Web (grok.com)
   */
  async authenticate(config: ProviderConfig): Promise<boolean> {
    this.config = config;

    // Only cookies authentication is supported for grok.com
    if (config.authMethod !== 'cookies') {
      throw new AuthenticationError('Only cookies authentication is supported for grok.com');
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

    // Test authentication by visiting grok.com
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.grok.com',
    });

    await page.goto('https://grok.com', { waitUntil: 'networkidle', timeout: 30000 });

    // Check if we're redirected to login
    const url = page.url();
    const isAuthenticated = !url.includes('/login') && !url.includes('/oauth');

    await page.close();
    return isAuthenticated;
  }

  /**
   * List all conversations from grok.com REST API
   */
  async listConversations(options?: ListConversationsOptions): Promise<ConversationSummary[]> {
    this.requireAuth();
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.grok.com',
    });

    try {
      // Use the REST API instead of scraping HTML
      const pageSize = options?.limit || 60;
      const apiUrl = `https://grok.com/rest/app-chat/conversations?pageSize=${pageSize}`;

      // Navigate to grok.com first to establish session
      await page.goto('https://grok.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

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
   * Fetch complete conversation from grok.com
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.grok.com',
    });

    try {
      // Navigate to the conversation page first to establish proper session context
      const url = `https://grok.com/chat/${id}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for page to be ready
      await page.waitForTimeout(2000);

      // Attempt to fetch conversation via REST API from within the page context
      const apiData = await page.evaluate(async (conversationId) => {
        try {
          // Fetch conversation metadata
          const metadataResponse = await fetch(
            `https://grok.com/rest/app-chat/conversations/${conversationId}`,
            {
              method: 'GET',
              credentials: 'include',
            }
          );

          let metadata = null;
          if (metadataResponse.ok) {
            metadata = await metadataResponse.json();
          }

          // Step 1: Get all responseIds from response-node endpoint
          const responseNodeUrl = `https://grok.com/rest/app-chat/conversations/${conversationId}/response-node?includeThreads=true`;

          const responseNodeResponse = await fetch(responseNodeUrl, {
            method: 'GET',
            credentials: 'include',
          });

          let responses = null;
          if (responseNodeResponse.ok) {
            const nodeData = await responseNodeResponse.json();

            if (nodeData.responseNodes && Array.isArray(nodeData.responseNodes)) {
              const responseNodes = nodeData.responseNodes;

              // Extract all responseIds
              const responseIds = responseNodes.map((node: any) => node.responseId).filter(Boolean);

              if (responseIds.length > 0) {
                // Step 2: Fetch actual message content using load-responses with responseIds
                const loadResponsesUrl = `https://grok.com/rest/app-chat/conversations/${conversationId}/load-responses`;

                const messagesResponse = await fetch(loadResponsesUrl, {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ responseIds }),
                });

                if (messagesResponse.ok) {
                  const data = await messagesResponse.json();

                  // The API returns { responses: [...] } array
                  if (data.responses && Array.isArray(data.responses)) {
                    responses = data.responses;
                  }
                }
              }
            }
          }

          return { metadata, responses };
        } catch {
          return null;
        }
      }, id);

      // If API returned data with responses, use it
      if (
        apiData &&
        apiData.metadata &&
        apiData.responses &&
        Array.isArray(apiData.responses) &&
        apiData.responses.length > 0
      ) {
        await page.close();

        const metadata = apiData.metadata;
        const responsesData = apiData.responses;

        // Map API responses to our Message format
        // Response format: { responseId, message, sender, createTime, parentResponseId, mediaTypes, ... }
        const messages: Message[] = responsesData.map((resp: any) => {
          const msg: Message = {
            id: resp.responseId || `msg-${Math.random()}`,
            role: resp.sender === 'human' ? 'user' : resp.sender || 'assistant',
            content: resp.message || resp.query || '',
            timestamp: resp.createTime ? new Date(resp.createTime) : new Date(),
            metadata: {
              model: resp.model || undefined,
              parentResponseId: resp.parentResponseId,
            },
          };

          // Add attachments if present
          const attachments: Attachment[] = [];

          // Image attachments
          if (resp.generatedImageUrls && Array.isArray(resp.generatedImageUrls)) {
            resp.generatedImageUrls.forEach((url: string, idx: number) => {
              attachments.push({
                id: `img-${idx}`,
                type: 'image',
                url,
              });
            });
          }

          // File attachments
          if (resp.fileAttachments && Array.isArray(resp.fileAttachments)) {
            resp.fileAttachments.forEach((file: any, idx: number) => {
              attachments.push({
                id: file.id || `file-${idx}`,
                type: 'document',
                url: file.url || '',
                mimeType: file.mimeType,
                size: file.size,
              });
            });
          }

          if (attachments.length > 0) {
            msg.attachments = attachments;
          }

          return msg;
        });

        return {
          id,
          provider: this.name,
          title: metadata.title || metadata.name || 'Untitled',
          messages,
          createdAt: metadata.createTime
            ? new Date(metadata.createTime)
            : messages[0]?.timestamp || new Date(),
          updatedAt: metadata.modifyTime
            ? new Date(metadata.modifyTime)
            : messages[messages.length - 1]?.timestamp || new Date(),
          metadata: {
            messageCount: messages.length,
            characterCount: messages.reduce((sum, m) => sum + m.content.length, 0),
            mediaCount: messages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0),
          },
        };
      }

      // If API didn't return messages, fall back to page scraping
      // Note: Page is already on the conversation URL from earlier navigation

      // Track audio URLs from network requests
      const audioUrlsFromNetwork: string[] = [];

      page.on('response', async (response) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';

        // Capture audio files from network
        if (
          contentType.includes('audio/') ||
          url.includes('.mp3') ||
          url.includes('.wav') ||
          url.includes('.ogg')
        ) {
          audioUrlsFromNetwork.push(url);
        }
      });

      // Check if conversation exists
      const notFound = await page.$('.error-page, [data-testid="error"]');
      if (notFound) {
        await page.close();
        throw new NotFoundError(`Conversation ${id} not found`);
      }

      // For voice conversations, wait longer for audio to load and try to trigger playback
      if (apiData?.metadata?.mediaTypes?.includes('audio')) {
        // Try clicking any play buttons or audio controls
        const playButtons = await page.$$(
          'button[aria-label*="play" i], button[title*="play" i], [role="button"][aria-label*="audio" i]'
        );

        if (playButtons.length > 0) {
          try {
            await playButtons[0].click();
            await page.waitForTimeout(2000);
          } catch {
            // Silently continue if clicking fails
          }
        }

        await page.waitForTimeout(3000);
      }

      // Scroll to load all messages
      await autoScroll(page);

      // Extract conversation data with comprehensive DOM inspection
      const data = await page.evaluate(() => {
        // Try multiple title selectors
        const titleSelectors = [
          'h1',
          'h2',
          '[data-testid="conversation-title"]',
          '.conversation-title',
          '[role="heading"]',
          'header h1',
          'header h2',
          '[class*="title"]',
          '[class*="Title"]',
        ];

        let title = 'Untitled';
        for (const selector of titleSelectors) {
          const titleEl = document.querySelector(selector);
          if (titleEl?.textContent?.trim()) {
            title = titleEl.textContent.trim();
            break;
          }
        }

        // Try MANY more message selectors
        const messageSelectors = [
          '[data-testid="message"]',
          '[data-message-id]',
          '.message-bubble', // More specific for Grok
          '.message',
          '.chat-message',
          '[role="article"]',
          'article',
          'div.message-bubble', // Even more specific
          '[class*="message-bubble"]', // Partial match for message bubbles
          'main > div > div', // Common React pattern
        ];

        let messageEls: Element[] = [];
        for (const selector of messageSelectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          // Filter out SVG and other non-message elements
          const filtered = elements.filter((el) => {
            return (
              el.tagName !== 'svg' &&
              el.tagName !== 'SVG' &&
              !el.classList.contains('lucide') &&
              el.textContent &&
              el.textContent.trim().length > 5
            ); // Has substantial content
          });
          if (filtered.length > 0 && filtered.length < 1000) {
            // Avoid selecting too generic
            messageEls = filtered;
            break;
          }
        }

        // Look for standalone audio elements (for voice conversations)
        const audioElements = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];

        const audioUrls: string[] = [];
        audioElements.forEach((audio) => {
          const src = audio.src || audio.querySelector('source')?.src || '';
          if (src) {
            audioUrls.push(src);
          }
        });

        // Check for blob URLs or data URLs
        const allUrls = Array.from(document.querySelectorAll('[src], [href]'))
          .map(
            (el) =>
              (el as HTMLElement).getAttribute('src') || (el as HTMLElement).getAttribute('href')
          )
          .filter((url) => url && (url.startsWith('blob:') || url.startsWith('data:audio')));

        allUrls.forEach((url) => {
          if (url) {
            audioUrls.push(url);
          }
        });

        const messages = messageEls.map((el: Element, idx: number) => {
          // Try to extract the actual role from various sources
          let role = 'assistant'; // default

          // Method 1: Check for data-role attribute
          const dataRole = el.getAttribute('data-role');
          if (dataRole) {
            role = dataRole;
          }

          // Method 2: Check parent container for role
          const parent = el.parentElement;
          if (parent && !dataRole) {
            const parentRole = parent.getAttribute('data-role');
            if (parentRole) {
              role = parentRole;
            }
          }

          // Method 3: Look for role label in previous sibling (often has speaker name)
          const prevSibling = el.previousElementSibling;
          if (prevSibling && !dataRole) {
            const prevText = prevSibling.textContent?.trim().toLowerCase();
            // Check for common role names
            if (prevText) {
              if (prevText.includes('sexy')) role = 'Sexy';
              else if (prevText.includes('user') || prevText.includes('you')) role = 'user';
              else if (prevText.includes('assistant') || prevText.includes('grok'))
                role = 'assistant';
              else if (prevText.includes('eve')) role = 'Eve';
            }
          }

          // Method 4: Check parent's previous sibling for role label
          if (parent && role === 'assistant') {
            const parentPrevSibling = parent.previousElementSibling;
            if (parentPrevSibling) {
              const labelText = parentPrevSibling.textContent?.trim();
              // Only use as role if it's short (likely a label, not content)
              // and doesn't look like message content
              if (
                labelText &&
                labelText.length < 30 &&
                labelText.length > 0 &&
                !labelText.includes('.') && // No sentences
                !labelText.includes('?') &&
                !labelText.includes(',') &&
                labelText.split(' ').length < 5
              ) {
                // Max 4 words
                role = labelText;
              }
            }
          }

          // Extract content - use textContent of the element directly
          let content = el.textContent?.trim() || '';

          // Extract timestamp
          const timeEl = el.querySelector('time, [datetime], .timestamp');
          const timestamp = timeEl?.getAttribute('datetime') || new Date().toISOString();

          // Extract media attachments (including audio)
          const mediaEls = Array.from(el.querySelectorAll('img, video, audio')) as HTMLElement[];
          const attachments = mediaEls.map((media: HTMLElement, mediaIdx: number) => {
            const tagName = media.tagName.toLowerCase();
            const src =
              media.getAttribute('src') ||
              (media as HTMLAudioElement | HTMLVideoElement)
                .querySelector('source')
                ?.getAttribute('src') ||
              '';
            return {
              id: `${idx}-${mediaIdx}`,
              type: tagName as 'image' | 'video' | 'audio',
              url: src,
            };
          });

          return {
            id: `msg-${idx}`,
            role: role, // Preserve the actual role (user, assistant, Sexy, Eve, etc.)
            content,
            timestamp,
            attachments: attachments.length > 0 ? attachments : undefined,
          };
        });

        return { title, messages, audioUrls };
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

      // Merge audio URLs from page and network
      const allAudioUrls = [...(data.audioUrls || []), ...audioUrlsFromNetwork].filter(
        (url, index, self) => self.indexOf(url) === index
      ); // Remove duplicates

      // If this is a voice conversation with no text messages but has audio URLs,
      // create a synthetic message to hold the audio attachments
      if (messages.length === 0 && allAudioUrls.length > 0) {
        const audioMessage: Message = {
          id: 'audio-conversation',
          role: 'assistant',
          content: '[Voice conversation - audio files available]',
          timestamp: apiData?.metadata?.createTime
            ? new Date(apiData.metadata.createTime)
            : new Date(),
          attachments: allAudioUrls.map((url: string, idx: number) => ({
            id: `audio-${idx}`,
            type: 'audio' as const,
            url: url,
          })),
        };
        messages.push(audioMessage);
      }

      // Use title from API metadata if available, otherwise from page scraping
      const title = apiData?.metadata?.title || data.title;
      const createdAt = apiData?.metadata?.createTime
        ? new Date(apiData.metadata.createTime)
        : messages[0]?.timestamp || new Date();
      const updatedAt = apiData?.metadata?.modifyTime
        ? new Date(apiData.metadata.modifyTime)
        : messages[messages.length - 1]?.timestamp || new Date();

      return {
        id,
        provider: this.name,
        title,
        messages,
        createdAt,
        updatedAt,
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
