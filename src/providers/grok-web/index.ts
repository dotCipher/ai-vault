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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

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
                // Step 2: Paginate through load-responses to fetch ALL messages
                const loadResponsesUrl = `https://grok.com/rest/app-chat/conversations/${conversationId}/load-responses`;

                let allResponses: any[] = [];
                let cursor: string | null = null;
                let pageCount = 0;
                const maxPages = 100; // Safety limit to prevent infinite loops

                // Keep fetching until no more pages
                while (pageCount < maxPages) {
                  pageCount++;

                  // Build request body with responseIds and optional cursor for pagination
                  const requestBody: any = { responseIds };
                  if (cursor) {
                    requestBody.cursor = cursor;
                  }

                  const messagesResponse = await fetch(loadResponsesUrl, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                  });

                  if (!messagesResponse.ok) {
                    console.warn(
                      `load-responses returned ${messagesResponse.status} on page ${pageCount}`
                    );
                    break;
                  }

                  const data = await messagesResponse.json();

                  // The API returns { responses: [...] } array
                  if (data.responses && Array.isArray(data.responses)) {
                    allResponses = allResponses.concat(data.responses);
                  }

                  // Check for pagination info (various possible field names)
                  const hasMore = data.hasMore || data.hasNextPage || false;
                  const nextCursor =
                    data.nextCursor || data.cursor || data.nextPageToken || data.next || null;

                  // Debug logging for pagination
                  if (pageCount === 1) {
                    console.log(`Fetched page 1: ${data.responses?.length || 0} messages`);
                  } else {
                    console.log(
                      `Fetched page ${pageCount}: ${data.responses?.length || 0} messages (cursor: ${cursor ? 'yes' : 'no'})`
                    );
                  }

                  // Stop if no more pages or no cursor to continue
                  if (!hasMore && !nextCursor) {
                    break;
                  }

                  // Update cursor for next iteration
                  cursor = nextCursor;

                  // Safety check: if cursor didn't change, break to avoid infinite loop
                  if (!cursor) {
                    break;
                  }
                }

                if (pageCount >= maxPages) {
                  console.warn(
                    `Reached maximum page limit (${maxPages}) for conversation ${conversationId}`
                  );
                }

                console.log(
                  `Total messages fetched across ${pageCount} page(s): ${allResponses.length}`
                );
                responses = allResponses;
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
              const resolvedUrl = this.resolveUrl(url);
              if (resolvedUrl && resolvedUrl.trim() !== '') {
                attachments.push({
                  id: `img-${idx}`,
                  type: 'image',
                  url: resolvedUrl,
                });
              }
            });
          }

          // File attachments
          if (resp.fileAttachments && Array.isArray(resp.fileAttachments)) {
            resp.fileAttachments.forEach((file: any, idx: number) => {
              const resolvedUrl = this.resolveUrl(file.url || '');
              if (resolvedUrl && resolvedUrl.trim() !== '') {
                attachments.push({
                  id: file.id || `file-${idx}`,
                  type: 'document',
                  url: resolvedUrl,
                  mimeType: file.mimeType,
                  size: file.size,
                });
              }
            });
          }

          if (attachments.length > 0) {
            msg.attachments = attachments;
          }

          return msg;
        });

        // Extract hierarchy information from API metadata
        const hierarchy: any = {};

        // Check if conversation is in any workspaces (Grok uses "workspaces" array)
        if (
          metadata.workspaces &&
          Array.isArray(metadata.workspaces) &&
          metadata.workspaces.length > 0
        ) {
          // Use the first workspace (conversations can be in multiple workspaces)
          const workspace = metadata.workspaces[0];
          if (typeof workspace === 'string') {
            // If it's a workspace ID string
            hierarchy.workspaceId = workspace;
          } else if (workspace && typeof workspace === 'object') {
            // If it's a workspace object
            hierarchy.workspaceId = workspace.id || workspace.workspaceId;
            hierarchy.workspaceName = workspace.name || workspace.title;
          }
        }

        // Check for single workspace field (backup)
        if (!hierarchy.workspaceId && (metadata.workspaceId || metadata.workspace)) {
          hierarchy.workspaceId = metadata.workspaceId || metadata.workspace?.id;
          hierarchy.workspaceName =
            metadata.workspaceName || metadata.workspace?.name || metadata.workspace?.title;
        }

        // Check for project info
        if (metadata.projectId || metadata.project) {
          hierarchy.projectId = metadata.projectId || metadata.project?.id;
          hierarchy.projectName =
            metadata.projectName || metadata.project?.name || metadata.project?.title;
        }

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
          // Add hierarchy if any workspace/project info found
          hierarchy:
            Object.keys(hierarchy).length > 0 ? (hierarchy as ConversationHierarchy) : undefined,
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
          const attachments = mediaEls
            .map((media: HTMLElement, mediaIdx: number) => {
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
            })
            .filter((att) => att.url && att.url.trim() !== ''); // Filter out empty URLs

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

      // Download blob/data URLs through browser BEFORE closing page
      const browserDownloadedMedia: Array<{ originalUrl: string; data: Buffer; mimeType: string }> =
        [];

      for (const msg of data.messages) {
        if (msg.attachments) {
          for (const att of msg.attachments) {
            // Check if this is a blob or data URL that needs browser download
            if (att.url.startsWith('blob:') || att.url.startsWith('data:')) {
              try {
                const mediaData = await page.evaluate(async (url: string) => {
                  const response = await fetch(url);
                  const blob = await response.blob();
                  const arrayBuffer = await blob.arrayBuffer();
                  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                  return {
                    data: base64,
                    mimeType: blob.type,
                  };
                }, att.url);

                browserDownloadedMedia.push({
                  originalUrl: att.url,
                  data: Buffer.from(mediaData.data, 'base64'),
                  mimeType: mediaData.mimeType,
                });
              } catch (error) {
                console.warn(`Failed to download blob/data URL: ${att.url}`, error);
              }
            }
          }
        }
      }

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
            url: this.resolveUrl(att.url),
            metadata: {
              // Store downloaded blob data if available
              browserDownloaded: browserDownloadedMedia.find((m) => m.originalUrl === att.url),
            },
          })
        ),
      }));

      // Merge audio URLs from page and network
      const allAudioUrls = [...(data.audioUrls || []), ...audioUrlsFromNetwork]
        .filter((url, index, self) => self.indexOf(url) === index) // Remove duplicates
        .filter((url) => url && url.trim() !== ''); // Remove empty URLs

      // If this is a voice conversation with no text messages but has audio URLs,
      // create a synthetic message to hold the audio attachments
      if (messages.length === 0 && allAudioUrls.length > 0) {
        const audioAttachments = allAudioUrls
          .map((url: string, idx: number) => {
            const resolvedUrl = this.resolveUrl(url);
            if (resolvedUrl && resolvedUrl.trim() !== '') {
              return {
                id: `audio-${idx}`,
                type: 'audio' as const,
                url: resolvedUrl,
              };
            }
            return null;
          })
          .filter((att): att is { id: string; type: 'audio'; url: string } => att !== null);

        if (audioAttachments.length > 0) {
          const audioMessage: Message = {
            id: 'audio-conversation',
            role: 'assistant',
            content: '[Voice conversation - audio files available]',
            timestamp: apiData?.metadata?.createTime
              ? new Date(apiData.metadata.createTime)
              : new Date(),
            attachments: audioAttachments,
          };
          messages.push(audioMessage);
        }
      }

      // Use title from API metadata if available, otherwise from page scraping
      const title = apiData?.metadata?.title || data.title;
      const createdAt = apiData?.metadata?.createTime
        ? new Date(apiData.metadata.createTime)
        : messages[0]?.timestamp || new Date();
      const updatedAt = apiData?.metadata?.modifyTime
        ? new Date(apiData.metadata.modifyTime)
        : messages[messages.length - 1]?.timestamp || new Date();

      // Extract hierarchy information from API metadata (if available from scraping fallback)
      const hierarchy: any = {};
      if (apiData?.metadata) {
        const meta = apiData.metadata;
        if (meta.workspaceId || meta.workspace) {
          hierarchy.workspaceId = meta.workspaceId || meta.workspace?.id;
          hierarchy.workspaceName =
            meta.workspaceName || meta.workspace?.name || meta.workspace?.title;
        }
        if (meta.projectId || meta.project) {
          hierarchy.projectId = meta.projectId || meta.project?.id;
          hierarchy.projectName = meta.projectName || meta.project?.name || meta.project?.title;
        }
      }

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
        // Add hierarchy if any workspace/project info found
        hierarchy:
          Object.keys(hierarchy).length > 0 ? (hierarchy as ConversationHierarchy) : undefined,
      };
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * List all assets from grok.com assets library
   */
  async listAssets(options?: { pageSize?: number; orderBy?: string }): Promise<Asset[]> {
    this.requireAuth();
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.grok.com',
    });

    try {
      const pageSize = options?.pageSize || 50;
      const orderBy = options?.orderBy || 'ORDER_BY_LAST_USE_TIME';
      const apiUrl = `https://grok.com/rest/assets?pageSize=${pageSize}&orderBy=${orderBy}`;

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
      const assets = response.assets || response.data || response;

      if (!Array.isArray(assets)) {
        console.warn('Unexpected assets API response format:', response);
        return [];
      }

      // Transform to Asset format
      return assets.map((asset: any) => ({
        id: asset.id || asset.assetId || asset.uuid,
        provider: this.name,
        name: asset.name || asset.title || asset.fileName || 'Untitled Asset',
        type: this.mapAssetType(asset.type || asset.mimeType),
        url: asset.url || asset.downloadUrl || '',
        mimeType: asset.mimeType || asset.contentType,
        size: asset.size || asset.fileSize,
        createdAt: asset.createdAt ? new Date(asset.createdAt) : new Date(),
        lastUsedAt: asset.lastUsedAt ? new Date(asset.lastUsedAt) : undefined,
        metadata: {
          width: asset.width,
          height: asset.height,
          duration: asset.duration,
          description: asset.description,
          tags: asset.tags || [],
          ...asset.metadata,
        },
      }));
    } catch (error) {
      await page.close();
      console.error(`Failed to list assets: ${error}`);
      return []; // Return empty array on error to not break archiving
    }
  }

  /**
   * List all workspaces from grok.com
   */
  async listWorkspaces(options?: { pageSize?: number; orderBy?: string }): Promise<Workspace[]> {
    this.requireAuth();
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.grok.com',
    });

    try {
      const pageSize = options?.pageSize || 50;
      const orderBy = options?.orderBy || 'ORDER_BY_LAST_USE_TIME';
      const apiUrl = `https://grok.com/rest/workspaces?pageSize=${pageSize}&orderBy=${orderBy}`;

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
      const workspaces = response.workspaces || response.data || response;

      if (!Array.isArray(workspaces)) {
        console.warn('Unexpected workspaces API response format:', response);
        return [];
      }

      // Transform to Workspace format
      const parsedWorkspaces: Workspace[] = [];

      for (const workspace of workspaces) {
        const projects = await this.fetchWorkspaceProjects(workspace.id || workspace.workspaceId);

        parsedWorkspaces.push({
          id: workspace.id || workspace.workspaceId || workspace.uuid,
          provider: this.name,
          name: workspace.name || workspace.title || 'Untitled Workspace',
          description: workspace.description,
          createdAt: workspace.createdAt ? new Date(workspace.createdAt) : new Date(),
          updatedAt: workspace.updatedAt ? new Date(workspace.updatedAt) : new Date(),
          lastUsedAt: workspace.lastUsedAt ? new Date(workspace.lastUsedAt) : undefined,
          projects,
          metadata: {
            projectCount: projects.length,
            totalFiles: projects.reduce((sum, p) => sum + (p.files?.length || 0), 0),
            tags: workspace.tags || [],
            ...workspace.metadata,
          },
        });
      }

      return parsedWorkspaces;
    } catch (error) {
      await page.close();
      console.error(`Failed to list workspaces: ${error}`);
      return []; // Return empty array on error to not break archiving
    }
  }

  /**
   * Fetch projects for a workspace
   */
  private async fetchWorkspaceProjects(workspaceId: string): Promise<Project[]> {
    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.grok.com',
    });

    try {
      const apiUrl = `https://grok.com/rest/workspaces/${workspaceId}/projects`;

      await page.goto('https://grok.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

      const response = await page.evaluate(async (url) => {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
        });
        if (!res.ok) return { projects: [] };
        return await res.json();
      }, apiUrl);

      await page.close();

      const projects = response.projects || response.data || response;

      if (!Array.isArray(projects)) {
        return [];
      }

      // Transform to Project format
      return projects.map((project: any) => ({
        id: project.id || project.projectId || project.uuid,
        workspaceId,
        name: project.name || project.title || 'Untitled Project',
        description: project.description,
        type: project.type || project.projectType,
        createdAt: project.createdAt ? new Date(project.createdAt) : new Date(),
        updatedAt: project.updatedAt ? new Date(project.updatedAt) : new Date(),
        lastUsedAt: project.lastUsedAt ? new Date(project.lastUsedAt) : undefined,
        content: project.content || project.code || project.text,
        files: this.parseProjectFiles(project.files || []),
        metadata: {
          fileCount: project.files?.length || 0,
          language: project.language || project.programmingLanguage,
          framework: project.framework,
          tags: project.tags || [],
          ...project.metadata,
        },
      }));
    } catch (error) {
      await page.close();
      console.error(`Failed to fetch projects for workspace ${workspaceId}: ${error}`);
      return [];
    }
  }

  /**
   * Parse project files from API response
   */
  private parseProjectFiles(files: any[]): ProjectFile[] {
    if (!Array.isArray(files)) return [];

    return files.map((file: any) => ({
      id: file.id || file.fileId || `file-${Math.random()}`,
      name: file.name || file.fileName || 'untitled',
      path: file.path || file.filePath || file.name || '',
      content: file.content || file.code || file.text || '',
      language: file.language || file.programmingLanguage,
      mimeType: file.mimeType || file.contentType,
      size: file.size || file.fileSize,
      createdAt: file.createdAt ? new Date(file.createdAt) : new Date(),
      updatedAt: file.updatedAt ? new Date(file.updatedAt) : new Date(),
    }));
  }

  /**
   * Map asset type from API to our standard types
   */
  private mapAssetType(type: string): Asset['type'] {
    if (!type) return 'document';

    const lowerType = type.toLowerCase();

    if (lowerType.includes('image') || lowerType.includes('png') || lowerType.includes('jpg'))
      return 'image';
    if (lowerType.includes('video') || lowerType.includes('mp4')) return 'video';
    if (lowerType.includes('audio') || lowerType.includes('mp3')) return 'audio';
    if (
      lowerType.includes('code') ||
      lowerType.includes('javascript') ||
      lowerType.includes('python')
    )
      return 'code';
    if (lowerType.includes('json') || lowerType.includes('csv') || lowerType.includes('xml'))
      return 'data';

    return 'document';
  }

  /**
   * Resolve relative URLs to absolute URLs
   */
  private resolveUrl(url: string): string {
    if (!url) return '';

    // Already absolute URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // Blob or data URL
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return url;
    }

    // Relative URL - add https://grok.com prefix
    const baseUrl = 'https://grok.com';

    // Remove leading slash if present to avoid double slashes
    const cleanUrl = url.startsWith('/') ? url.slice(1) : url;

    return `${baseUrl}/${cleanUrl}`;
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
