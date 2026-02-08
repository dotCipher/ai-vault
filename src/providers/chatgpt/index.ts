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
import type {
  ProviderConfig,
  Conversation,
  Message,
  ConversationHierarchy,
} from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { AuthenticationError } from '../../types/provider.js';
import { BrowserScraper } from '../../utils/scraper.js';
import { saveProviderConfig } from '../../utils/config.js';
import { extractChatGPTAttachments, extractChatGPTMessageContent } from './attachments.js';

export class ChatGPTProvider extends BaseProvider {
  readonly name = 'chatgpt' as const;
  readonly displayName = 'ChatGPT';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];

  private scraper?: BrowserScraper;
  private conversationProjects: Map<string, string> = new Map(); // conversationId -> projectName

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
   * Fetch a single page of conversations from the API
   * Returns minimal data to avoid string overflow in page.evaluate()
   */
  private async fetchConversationPage(
    page: any,
    accessToken: string,
    offset: number,
    limit: number,
    isArchived: boolean
  ): Promise<{ items: any[]; hasMore: boolean }> {
    const result = await page.evaluate(
      async ({
        offset,
        limit,
        isArchived,
        token,
      }: {
        offset: number;
        limit: number;
        isArchived: boolean;
        token: string;
      }) => {
        const url = `https://chatgpt.com/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated&is_archived=${isArchived}&is_starred=false`;

        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          if (offset === 0) {
            throw new Error(`API request failed: ${res.status} ${res.statusText}`);
          }
          return { items: [], hasMore: false, error: true };
        }

        const data = await res.json();
        const items = data?.items || [];

        // Return only the minimal fields we need to avoid large data transfer
        const minimalItems = items.map((conv: any) => ({
          id: conv.id,
          title: conv.title || 'Untitled',
          create_time: conv.create_time,
          update_time: conv.update_time,
        }));

        return {
          items: minimalItems,
          hasMore: items.length === limit && data.has_missing_conversations !== false,
        };
      },
      { offset, limit, isArchived, token: accessToken }
    );

    return result;
  }

  /**
   * Unarchive a batch of conversations
   */
  private async unarchiveConversations(
    page: any,
    accessToken: string,
    conversationIds: string[]
  ): Promise<void> {
    if (conversationIds.length === 0) return;

    await page.evaluate(
      async ({ ids, token }: { ids: string[]; token: string }) => {
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        };

        for (const id of ids) {
          try {
            await fetch(`https://chatgpt.com/backend-api/conversation/${id}`, {
              method: 'PATCH',
              credentials: 'include',
              headers,
              body: JSON.stringify({ is_archived: false }),
            });
          } catch {
            // Silently continue on failure
          }
        }
      },
      { ids: conversationIds, token: accessToken }
    );
  }

  /**
   * Fetch projects/gizmos data
   */
  private async fetchProjects(page: any, accessToken: string): Promise<any> {
    const projectsUrl = `https://chatgpt.com/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=20&owned_only=true`;

    try {
      return await page.evaluate(
        async ({ url, token }: { url: string; token: string }) => {
          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });

          if (!res.ok) return null;
          return await res.json();
        },
        { url: projectsUrl, token: accessToken }
      );
    } catch {
      return null;
    }
  }

  /**
   * List conversations from ChatGPT using backend API
   * Pagination is done outside page.evaluate() to avoid string overflow
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
        if (process.env.DEBUG) {
          console.log('[ChatGPT] Using cached access token');
        }
        accessToken = this.config!.accessToken!;
        // Quick navigation without waiting for full load
        await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      } else {
        if (process.env.DEBUG) {
          console.log('[ChatGPT] Fetching new access token...');
        }
        // Full navigation to establish session
        await page.goto('https://chatgpt.com', { waitUntil: 'networkidle', timeout: 30000 });
        const result = await this.fetchAccessToken(page);
        accessToken = result.token;
      }

      const pageSize = 100; // API limit per request
      const requestedLimit = options.limit;

      // Fetch regular conversations with pagination outside browser context
      const regularConversations: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await this.fetchConversationPage(page, accessToken, offset, pageSize, false);
        regularConversations.push(...result.items);

        hasMore = result.hasMore;
        if (requestedLimit && regularConversations.length >= requestedLimit) {
          hasMore = false;
        }
        offset += pageSize;
      }

      // Fetch archived conversations with pagination outside browser context
      const archivedConversations: any[] = [];
      offset = 0;
      hasMore = true;

      while (hasMore) {
        const result = await this.fetchConversationPage(page, accessToken, offset, pageSize, true);
        archivedConversations.push(...result.items);

        hasMore = result.hasMore;
        if (
          requestedLimit &&
          regularConversations.length + archivedConversations.length >= requestedLimit
        ) {
          hasMore = false;
        }
        offset += pageSize;
      }

      // Unarchive archived conversations in batches
      if (archivedConversations.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < archivedConversations.length; i += batchSize) {
          const batch = archivedConversations.slice(i, i + batchSize).map((c) => c.id);
          await this.unarchiveConversations(page, accessToken, batch);
        }
        console.log(`[ChatGPT] Unarchived ${archivedConversations.length} archived conversations`);
      }

      // Fetch projects
      const projectsData = await this.fetchProjects(page, accessToken);

      await page.close();

      // Combine all conversations
      const allConversations = [...regularConversations, ...archivedConversations];

      if (!Array.isArray(allConversations)) {
        throw new Error('Unexpected API response format');
      }

      // Transform to ConversationSummary format
      let summaries: ConversationSummary[] = allConversations.map((conv: any) => ({
        id: conv.id,
        title: conv.title || 'Untitled',
        messageCount: 0, // Not provided in list API
        createdAt: conv.create_time ? new Date(conv.create_time * 1000) : new Date(),
        updatedAt: conv.update_time ? new Date(conv.update_time * 1000) : new Date(),
        hasMedia: false, // Will be determined when fetching full conversation
        preview: undefined,
      }));

      // Extract conversations from projects/gizmos
      if (projectsData?.items) {
        for (const item of projectsData.items) {
          const gizmo = item.gizmo?.gizmo;
          const projectName = gizmo?.display?.name || 'Untitled Project';
          const projectConversations = item.conversations?.items || [];

          if (Array.isArray(projectConversations)) {
            for (const conv of projectConversations) {
              // Check if this conversation is already in the list (avoid duplicates)
              if (!summaries.find((c) => c.id === conv.id)) {
                // Store the project mapping for later use in fetchConversation
                this.conversationProjects.set(conv.id, projectName);

                summaries.push({
                  id: conv.id,
                  title: conv.title || 'Untitled',
                  messageCount: 0,
                  createdAt: new Date(conv.create_time * 1000),
                  updatedAt: new Date(conv.update_time * 1000),
                  hasMedia: false,
                  preview: `Project: ${projectName}`,
                });
              }
            }
          }
        }
      }

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
        if (process.env.DEBUG) {
          console.log('[ChatGPT] Using cached access token');
        }
        accessToken = this.config!.accessToken!;
        // Quick navigation without waiting for full load
        await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      } else {
        if (process.env.DEBUG) {
          console.log('[ChatGPT] Fetching new access token...');
        }
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
        const { content, hasMediaContent } = extractChatGPTMessageContent(parts);

        // Include message if it has text content OR media content
        if (content || hasMediaContent) {
          const attachments = extractChatGPTAttachments({
            parts,
            metadataAttachments: msg.metadata?.attachments,
            nodeId: node.id,
            conversationId: id,
          });

          messages.push({
            id: msg.id || node.id,
            role,
            content,
            timestamp: msg.create_time ? new Date(msg.create_time * 1000) : new Date(),
            attachments: attachments.length > 0 ? attachments : undefined,
          });
        }
      }

      // Extract hierarchy information if available
      const hierarchy: any = {};
      const projectName = this.conversationProjects.get(id);
      if (projectName) {
        hierarchy.projectName = projectName;
        // ChatGPT uses projects for organization (not workspaces)
        hierarchy.projectId = projectName; // Use name as ID since API doesn't provide separate ID
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
        hierarchy:
          Object.keys(hierarchy).length > 0 ? (hierarchy as ConversationHierarchy) : undefined,
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
