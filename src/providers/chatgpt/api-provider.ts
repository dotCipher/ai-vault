/**
 * ChatGPT Provider - Strategy-Based Implementation
 *
 * Uses pluggable authentication architecture with cookie-based auth.
 *
 * NOTE: Only cookie-based authentication is currently supported because
 * the OpenAI API does NOT provide conversation history retrieval.
 * The official API is stateless and only supports chat completions.
 *
 * For archiving ChatGPT conversations, you must use cookie-based auth
 * to access the chatgpt.com web platform APIs.
 */

import { StrategyBasedProvider } from '../auth/base-strategy-provider.js';
import type {
  ProviderConfig,
  Conversation,
  Message,
  ConversationHierarchy,
} from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { AuthenticationError } from '../../types/provider.js';
import { CookieApiStrategy } from '../auth/strategies.js';
import { saveProviderConfig } from '../../utils/config.js';

/**
 * ChatGPT Provider with strategy-based authentication
 * Currently only supports cookie-based auth (the only method that works for archival)
 */
export class ChatGPTApiProvider extends StrategyBasedProvider {
  readonly name = 'chatgpt' as const;
  readonly displayName = 'ChatGPT';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];

  private conversationProjects: Map<string, string> = new Map();

  protected registerAuthStrategies(): void {
    // Only cookie-based auth works for conversation archival
    // OpenAI API does NOT support conversation history retrieval
    this.strategyManager.register(
      new CookieApiStrategy('.chatgpt.com', 'https://chatgpt.com')
    );

    // API key strategy commented out until OpenAI adds conversation APIs
    // this.strategyManager.register(new OpenAIApiKeyStrategy());
  }

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
   * List conversations - uses cookie-based web API
   */
  async listConversations(options: ListConversationsOptions = {}): Promise<ConversationSummary[]> {
    this.requireAuth();
    return this.listConversationsViaWeb(options);
  }

  /**
   * List conversations via chatgpt.com web platform API
   */
  private async listConversationsViaWeb(
    options: ListConversationsOptions = {}
  ): Promise<ConversationSummary[]> {
    const scraper = this.getScraper();
    const page = await scraper.createPage({
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
        await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      } else {
        if (process.env.DEBUG) {
          console.log('[ChatGPT] Fetching new access token...');
        }
        await page.goto('https://chatgpt.com', { waitUntil: 'networkidle', timeout: 30000 });
        const result = await this.fetchAccessToken(page);
        accessToken = result.token;
      }

      // Use backend API to fetch conversations with pagination
      const limit = 100;
      const requestedLimit = options.limit;
      const projectsUrl = `https://chatgpt.com/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=20&owned_only=true`;

      const response = await page.evaluate(
        async ({ limit, requestedLimit, projectsUrl, token }) => {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          };

          // Helper function to fetch all conversations with pagination
          const fetchAllConversations = async (isArchived: boolean) => {
            const allItems: any[] = [];
            let offset = 0;
            let hasMore = true;

            while (hasMore) {
              const url = `https://chatgpt.com/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated&is_archived=${isArchived}&is_starred=false`;

              const res = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers,
              });

              if (!res.ok) {
                if (offset === 0) {
                  throw new Error(`API request failed: ${res.status} ${res.statusText}`);
                }
                break;
              }

              const data = await res.json();
              const items = data?.items || [];

              if (items.length === 0) {
                break;
              }

              allItems.push(...items);

              hasMore = items.length === limit && data.has_missing_conversations !== false;
              if (requestedLimit && allItems.length >= requestedLimit) {
                hasMore = false;
              }

              offset += limit;
            }

            return allItems;
          };

          // Fetch regular and archived conversations
          const regularConversations = await fetchAllConversations(false);
          const archivedConversations = await fetchAllConversations(true);

          // Unarchive all archived conversations
          for (const conv of archivedConversations) {
            try {
              await fetch(`https://chatgpt.com/backend-api/conversation/${conv.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers,
                body: JSON.stringify({ is_archived: false }),
              });
            } catch (err) {
              console.error(`Failed to unarchive conversation ${conv.id}:`, err);
            }
          }

          // Fetch projects
          let projectsData = null;
          try {
            const projectsRes = await fetch(projectsUrl, {
              method: 'GET',
              credentials: 'include',
              headers,
            });

            if (projectsRes.ok) {
              projectsData = await projectsRes.json();
            }
          } catch {
            // Projects are optional
          }

          return {
            conversations: { items: regularConversations },
            archivedConversations: { items: archivedConversations },
            projects: projectsData,
          };
        },
        { limit, requestedLimit, projectsUrl, token: accessToken }
      );

      await page.close();

      // Parse response
      const conversations = response.conversations?.items || [];
      const archivedConversations = response.archivedConversations?.items || [];
      const allConversations = [...conversations, ...archivedConversations];

      if (archivedConversations.length > 0) {
        console.log(`[ChatGPT] Unarchived ${archivedConversations.length} archived conversations`);
      }

      // Transform to ConversationSummary format
      let summaries: ConversationSummary[] = allConversations.map((conv: any) => ({
        id: conv.id,
        title: conv.title || 'Untitled',
        messageCount: 0,
        createdAt: conv.create_time ? new Date(conv.create_time * 1000) : new Date(),
        updatedAt: conv.update_time ? new Date(conv.update_time * 1000) : new Date(),
        hasMedia: false,
        preview: undefined,
      }));

      // Extract conversations from projects
      if (response.projects?.items) {
        for (const item of response.projects.items) {
          const gizmo = item.gizmo?.gizmo;
          const projectName = gizmo?.display?.name || 'Untitled Project';
          const projectConversations = item.conversations?.items || [];

          if (Array.isArray(projectConversations)) {
            for (const conv of projectConversations) {
              if (!summaries.find((c) => c.id === conv.id)) {
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
   * Fetch a full conversation - uses cookie-based web API
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();
    return this.fetchConversationViaWeb(id);
  }

  /**
   * Fetch conversation via chatgpt.com web platform
   */
  private async fetchConversationViaWeb(id: string): Promise<Conversation> {
    const scraper = this.getScraper();
    const page = await scraper.createPage({
      cookies: this.config!.cookies!,
      domain: '.chatgpt.com',
    });

    try {
      let accessToken: string;

      if (this.isTokenValid()) {
        accessToken = this.config!.accessToken!;
        await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      } else {
        await page.goto('https://chatgpt.com', { waitUntil: 'networkidle', timeout: 30000 });
        const result = await this.fetchAccessToken(page);
        accessToken = result.token;
      }

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

      // Extract messages (same logic as original implementation)
      const title = data.title || 'Untitled';
      const messages: Message[] = [];
      const mapping = data.mapping || {};

      const messageNodes: any[] = [];
      for (const nodeId in mapping) {
        const node = mapping[nodeId];
        if (node.message && node.message.content && node.message.content.parts) {
          messageNodes.push(node);
        }
      }

      messageNodes.sort((a, b) => {
        const timeA = a.message?.create_time || 0;
        const timeB = b.message?.create_time || 0;
        return timeA - timeB;
      });

      for (const node of messageNodes) {
        const msg = node.message;
        const role = msg.author?.role === 'user' ? 'user' : 'assistant';

        const parts = msg.content?.parts || [];
        const content = parts.filter((p: any) => typeof p === 'string').join('\n');

        const hasMediaContent = parts.some(
          (p: any) =>
            typeof p === 'object' &&
            (p.content_type === 'audio_asset_pointer' ||
              p.content_type === 'real_time_user_audio_video_asset_pointer' ||
              p.content_type === 'image_asset_pointer')
        );

        if (content || hasMediaContent) {
          const attachments: any[] = [];

          // Extract attachments (same logic as original)
          if (msg.metadata?.attachments) {
            for (const att of msg.metadata.attachments) {
              let possibleUrl =
                att.download_url || att.url || att.download_link || att.fileDownloadUrl || '';

              if (
                possibleUrl.startsWith('file-service://') ||
                possibleUrl.startsWith('sediment://')
              ) {
                const fileId = possibleUrl.replace(/^(sediment|file-service):\/\//, '');
                possibleUrl = `https://chatgpt.com/backend-api/files/download/${fileId}?conversation_id=${id}&inline=false`;
              }

              if (!possibleUrl || possibleUrl.trim() === '') {
                continue;
              }

              if (att.mimeType?.startsWith('image/')) {
                attachments.push({
                  id: att.id || `${node.id}-${attachments.length}`,
                  type: 'image',
                  url: possibleUrl,
                  mimeType: att.mimeType,
                  size: att.size,
                });
              } else if (att.mimeType?.startsWith('video/')) {
                attachments.push({
                  id: att.id || `${node.id}-${attachments.length}`,
                  type: 'video',
                  url: possibleUrl,
                  mimeType: att.mimeType,
                  size: att.size,
                });
              } else {
                attachments.push({
                  id: att.id || `${node.id}-${attachments.length}`,
                  type: 'document',
                  url: possibleUrl,
                  mimeType: att.mimeType,
                  size: att.size,
                });
              }
            }
          }

          // Extract audio/image from content parts
          for (const part of parts) {
            if (typeof part === 'object') {
              if (part.content_type === 'audio_asset_pointer' && part.asset_pointer) {
                const assetPointer = part.asset_pointer;
                if (
                  assetPointer.startsWith('sediment://') ||
                  assetPointer.startsWith('file-service://')
                ) {
                  const fileId = assetPointer.replace(/^(sediment|file-service):\/\//, '');
                  const downloadUrl = `https://chatgpt.com/backend-api/files/download/${fileId}?conversation_id=${id}&inline=false`;
                  attachments.push({
                    id: fileId,
                    type: 'audio',
                    url: downloadUrl,
                    mimeType: part.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
                    size: part.size_bytes,
                  });
                }
              }

              if (part.content_type === 'image_asset_pointer' && part.asset_pointer) {
                const assetPointer = part.asset_pointer;
                if (
                  assetPointer.startsWith('sediment://') ||
                  assetPointer.startsWith('file-service://')
                ) {
                  const fileId = assetPointer.replace(/^(sediment|file-service):\/\//, '');
                  const downloadUrl = `https://chatgpt.com/backend-api/files/download/${fileId}?conversation_id=${id}&inline=false`;
                  attachments.push({
                    id: fileId,
                    type: 'image',
                    url: downloadUrl,
                    mimeType: 'image/png',
                    size: part.size_bytes,
                  });
                }
              }
            }
          }

          messages.push({
            id: msg.id || node.id,
            role,
            content,
            timestamp: msg.create_time ? new Date(msg.create_time * 1000) : new Date(),
            attachments: attachments.length > 0 ? attachments : undefined,
          });
        }
      }

      // Extract hierarchy
      const hierarchy: any = {};
      const projectName = this.conversationProjects.get(id);
      if (projectName) {
        hierarchy.projectName = projectName;
        hierarchy.projectId = projectName;
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
}
