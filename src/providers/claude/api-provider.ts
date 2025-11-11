/**
 * Claude Provider - API-First Implementation
 *
 * This is an improved implementation that supports both:
 * 1. Anthropic API (preferred) - using official API keys
 * 2. Claude.ai web platform (fallback) - using cookie-based auth
 *
 * The provider automatically selects the best authentication method.
 */

import { StrategyBasedProvider } from '../auth/base-strategy-provider.js';
import type {
  ProviderConfig,
  Conversation,
  Message,
  ConversationHierarchy,
} from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { AuthenticationError, NotFoundError } from '../../types/provider.js';
import { AnthropicApiKeyStrategy, CookieApiStrategy } from '../auth/strategies.js';

interface ClaudeProject {
  uuid: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Improved Claude Provider with API-first approach
 */
export class ClaudeApiProvider extends StrategyBasedProvider {
  readonly name = 'claude' as const;
  readonly displayName = 'Claude';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['api-key', 'cookies'];

  private organizationId?: string;
  private conversationProjects: Map<string, string> = new Map();
  private projects: Map<string, ClaudeProject> = new Map();

  protected registerAuthStrategies(): void {
    // Priority 1: Try Anthropic API first (if API key provided)
    this.strategyManager.register(new AnthropicApiKeyStrategy());

    // Priority 2: Fall back to cookie-based web API
    this.strategyManager.register(new CookieApiStrategy('.claude.ai', 'https://claude.ai'));
  }

  /**
   * List conversations using the active auth strategy
   */
  async listConversations(options: ListConversationsOptions = {}): Promise<ConversationSummary[]> {
    this.requireAuth();

    const strategy = this.getActiveStrategy();

    if (strategy === 'api-key') {
      return this.listConversationsViaApi(options);
    } else {
      return this.listConversationsViaWeb(options);
    }
  }

  /**
   * List conversations via Anthropic API
   * Note: The official Anthropic API doesn't provide conversation history retrieval
   * This is a limitation of the official API
   */
  private async listConversationsViaApi(
    options: ListConversationsOptions = {}
  ): Promise<ConversationSummary[]> {
    // The Anthropic API doesn't support listing conversations
    // This is a known limitation - the API is stateless
    throw new Error(
      'Listing conversations is not supported via Anthropic API. ' +
        'The official API does not provide conversation history. ' +
        'Please use cookie-based authentication to archive from claude.ai'
    );
  }

  /**
   * List conversations via claude.ai web platform API
   */
  private async listConversationsViaWeb(
    options: ListConversationsOptions = {}
  ): Promise<ConversationSummary[]> {
    const scraper = this.getScraper();

    if (!this.organizationId) {
      await this.fetchOrganizationId();
    }

    if (!this.organizationId) {
      throw new Error('Organization ID not available. Authentication may have failed.');
    }

    const page = await scraper.createPage({
      cookies: this.config!.cookies!,
      domain: '.claude.ai',
    });

    try {
      // Quick navigation to establish session
      await page.goto('https://claude.ai', { waitUntil: 'domcontentloaded', timeout: 15000 });

      // Fetch conversations and projects in parallel
      const response = await page.evaluate(
        async ({ orgId, requestedLimit }) => {
          const limit = 100; // API limit per request
          const conversationsUrl = `https://claude.ai/api/organizations/${orgId}/chat_conversations`;
          const projectsUrl = `https://claude.ai/api/organizations/${orgId}/projects`;

          // Fetch all conversations with pagination
          const allConversations: any[] = [];
          let page = 1;
          let hasMore = true;

          while (hasMore) {
            const url = `${conversationsUrl}?limit=${limit}&page=${page}`;

            const res = await fetch(url, {
              method: 'GET',
              credentials: 'include',
            });

            if (!res.ok) {
              if (page === 1) {
                throw new Error(`API request failed: ${res.status} ${res.statusText}`);
              }
              break;
            }

            const data = await res.json();
            const conversations = Array.isArray(data) ? data : [];

            if (conversations.length === 0) {
              break;
            }

            allConversations.push(...conversations);

            hasMore = conversations.length === limit;
            if (requestedLimit && allConversations.length >= requestedLimit) {
              hasMore = false;
            }

            page++;
          }

          // Fetch projects
          let projectsData: any[] = [];
          try {
            const projectsRes = await fetch(projectsUrl, {
              method: 'GET',
              credentials: 'include',
            });

            if (projectsRes.ok) {
              projectsData = await projectsRes.json();
            }
          } catch {
            // Projects are optional
          }

          return {
            conversations: allConversations,
            projects: projectsData,
          };
        },
        { orgId: this.organizationId, requestedLimit: options.limit }
      );

      await page.close();

      // Store projects
      if (Array.isArray(response.projects)) {
        for (const proj of response.projects) {
          this.projects.set(proj.uuid, proj);
        }
      }

      // Transform to ConversationSummary format
      let summaries: ConversationSummary[] = response.conversations.map((conv: any) => {
        if (conv.project_uuid && this.projects.has(conv.project_uuid)) {
          const project = this.projects.get(conv.project_uuid)!;
          this.conversationProjects.set(conv.uuid, project.name);
        }

        return {
          id: conv.uuid,
          title: conv.name || 'Untitled',
          messageCount: 0,
          createdAt: conv.created_at ? new Date(conv.created_at) : new Date(),
          updatedAt: conv.updated_at ? new Date(conv.updated_at) : new Date(),
          hasMedia: false,
          preview: conv.summary,
        };
      });

      // Apply filters
      if (options.since) {
        summaries = summaries.filter((c) => c.updatedAt >= options.since!);
      }

      if (options.until) {
        summaries = summaries.filter((c) => c.updatedAt <= options.until!);
      }

      if (options.limit) {
        summaries = summaries.slice(0, options.limit);
      }

      return summaries;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Fetch organization ID from claude.ai
   */
  private async fetchOrganizationId(): Promise<void> {
    const scraper = this.getScraper();
    const page = await scraper.createPage({
      cookies: this.config!.cookies!,
      domain: '.claude.ai',
    });

    try {
      await page.goto('https://claude.ai', { waitUntil: 'networkidle', timeout: 30000 });

      const url = page.url();
      if (url.includes('/login') || url.includes('/auth/')) {
        await page.close();
        throw new AuthenticationError('Not authenticated with claude.ai');
      }

      const orgId = await page.evaluate(async () => {
        try {
          const response = await fetch('https://claude.ai/api/organizations', {
            method: 'GET',
            credentials: 'include',
          });

          if (!response.ok) {
            return null;
          }

          const orgs = await response.json();
          return orgs?.[0]?.uuid || null;
        } catch {
          return null;
        }
      });

      if (orgId) {
        this.organizationId = orgId;
        if (process.env.DEBUG) {
          console.log(`[Claude] Authenticated with organization: ${orgId}`);
        }
      }

      await page.close();
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Fetch a full conversation
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();

    const strategy = this.getActiveStrategy();

    if (strategy === 'api-key') {
      throw new Error(
        'Fetching conversations is not supported via Anthropic API. ' +
          'Please use cookie-based authentication.'
      );
    }

    return this.fetchConversationViaWeb(id);
  }

  /**
   * Fetch conversation via claude.ai web platform
   */
  private async fetchConversationViaWeb(id: string): Promise<Conversation> {
    const scraper = this.getScraper();

    if (!this.organizationId) {
      await this.fetchOrganizationId();
    }

    if (!this.organizationId) {
      throw new Error('Organization ID not available.');
    }

    const page = await scraper.createPage({
      cookies: this.config!.cookies!,
      domain: '.claude.ai',
    });

    try {
      await page.goto('https://claude.ai', { waitUntil: 'domcontentloaded', timeout: 15000 });

      const data = await page.evaluate(
        async ({ orgId, conversationId }) => {
          const url = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`;

          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
          });

          if (!res.ok) {
            throw new Error(`API request failed: ${res.status} ${res.statusText}`);
          }

          return await res.json();
        },
        { orgId: this.organizationId, conversationId: id }
      );

      await page.close();

      // Parse conversation data (same as original implementation)
      const title = data.name || 'Untitled';
      const messages: Message[] = [];

      const chatMessages = data.chat_messages || [];

      for (const chatMsg of chatMessages) {
        const sender = chatMsg.sender;
        const role = sender === 'human' ? 'user' : 'assistant';

        const contentBlocks = chatMsg.content || [];
        const textParts: string[] = [];
        const thinkingParts: string[] = [];
        const attachments: any[] = [];

        for (const block of contentBlocks) {
          const contentType = block.type;

          if (contentType === 'text') {
            if (block.text) {
              textParts.push(block.text);
            }
          } else if (contentType === 'thinking') {
            if (block.thinking) {
              thinkingParts.push(`[Thinking: ${block.thinking}]`);
            }
          } else if (contentType === 'tool_use') {
            if (block.name === 'artifacts' && block.input) {
              const artifactId = block.input.id || `artifact-${attachments.length}`;
              const artifactType = block.input.type || 'text/plain';
              const artifactTitle = block.input.title || 'Untitled Artifact';
              const artifactContent = block.input.content || '';

              let extension = '.txt';
              if (artifactType.includes('html')) extension = '.html';
              else if (artifactType.includes('javascript') || artifactType.includes('react'))
                extension = '.jsx';
              else if (artifactType.includes('python')) extension = '.py';
              else if (artifactType.includes('svg')) extension = '.svg';
              else if (artifactType.includes('mermaid')) extension = '.mmd';

              attachments.push({
                id: artifactId,
                type: 'artifact',
                title: artifactTitle,
                artifactType: artifactType,
                content: artifactContent,
                extension: extension,
              });

              textParts.push(`[Artifact: ${artifactTitle}]`);
            } else {
              textParts.push(`[Tool: ${block.name || 'unknown'}]`);
            }
          } else if (contentType === 'image') {
            if (block.source?.url) {
              attachments.push({
                id: block.id || `${chatMsg.uuid}-image-${attachments.length}`,
                type: 'image',
                url: block.source.url,
                mimeType: block.source.media_type || 'image/jpeg',
              });
            }
          } else if (contentType === 'document') {
            if (block.source?.url) {
              attachments.push({
                id: block.id || `${chatMsg.uuid}-doc-${attachments.length}`,
                type: 'document',
                url: block.source.url,
                mimeType: block.source.media_type || 'application/octet-stream',
              });
            }
          }
        }

        const fullContent = [...thinkingParts, ...textParts].join('\n\n').trim();

        if (!fullContent && attachments.length === 0) {
          continue;
        }

        const timestamp = chatMsg.created_at ? new Date(chatMsg.created_at) : new Date();

        messages.push({
          id: chatMsg.uuid,
          role,
          content: fullContent,
          timestamp,
          attachments: attachments.length > 0 ? attachments : undefined,
          metadata: {
            originalSender: sender,
          },
        });
      }

      // Extract hierarchy
      const hierarchy: any = {};
      const projectName = this.conversationProjects.get(id);
      if (projectName) {
        hierarchy.projectName = projectName;
        for (const [projId, proj] of this.projects.entries()) {
          if (proj.name === projectName) {
            hierarchy.projectId = projId;
            break;
          }
        }
      }

      return {
        id,
        provider: this.name,
        title,
        messages,
        createdAt: data.created_at ? new Date(data.created_at) : new Date(),
        updatedAt: data.updated_at ? new Date(data.updated_at) : new Date(),
        metadata: {
          messageCount: messages.length,
          characterCount: messages.reduce((sum, m) => sum + m.content.length, 0),
          mediaCount: messages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0),
          summary: data.summary,
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
