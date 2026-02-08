/**
 * Claude Provider - Strategy-Based Implementation
 *
 * Uses pluggable authentication architecture with cookie-based auth.
 *
 * NOTE: Only cookie-based authentication is currently supported because
 * the Anthropic API does NOT provide conversation history retrieval.
 * The official API is stateless and only supports message generation.
 *
 * For archiving Claude conversations, you must use cookie-based auth
 * to access the claude.ai web platform APIs.
 */

import { StrategyBasedProvider } from '../auth/base-strategy-provider.js';
import type { Conversation, Message, ConversationHierarchy } from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { AuthenticationError } from '../../types/provider.js';
import { CookieApiStrategy } from '../auth/strategies.js';
import { parseClaudeMessages } from './message-parser.js';
import { createClaudeApiError } from './errors.js';

interface ClaudeProject {
  uuid: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Claude Provider with strategy-based authentication
 * Currently only supports cookie-based auth (the only method that works for archival)
 */
export class ClaudeApiProvider extends StrategyBasedProvider {
  readonly name = 'claude' as const;
  readonly displayName = 'Claude';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];

  private organizationId?: string;
  private conversationProjects: Map<string, string> = new Map();
  private projects: Map<string, ClaudeProject> = new Map();

  protected registerAuthStrategies(): void {
    // Only cookie-based auth works for conversation archival
    // Anthropic API does NOT support conversation history retrieval
    this.strategyManager.register(new CookieApiStrategy('.claude.ai', 'https://claude.ai'));

    // API key strategy commented out until Anthropic adds conversation APIs
    // this.strategyManager.register(new AnthropicApiKeyStrategy());
  }

  /**
   * List conversations - uses cookie-based web API
   */
  async listConversations(options: ListConversationsOptions = {}): Promise<ConversationSummary[]> {
    this.requireAuth();
    return this.listConversationsViaWeb(options);
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
          // Track seen UUIDs to detect when API returns duplicates (pagination cycling)
          const allConversations: any[] = [];
          const seenUuids = new Set<string>();
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

            // Check for duplicates - if we see any UUID we've already seen,
            // the API is cycling back (pagination doesn't work as expected)
            let foundDuplicate = false;
            for (const conv of conversations) {
              if (seenUuids.has(conv.uuid)) {
                foundDuplicate = true;
                break;
              }
              seenUuids.add(conv.uuid);
              allConversations.push(conv);
            }

            // Stop if we found duplicates (API cycled) or no more results
            hasMore = conversations.length === limit && !foundDuplicate;
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
   * Fetch a full conversation - uses cookie-based web API
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();
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

      const response = await page.evaluate(
        async ({ orgId, conversationId }) => {
          const url = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`;

          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
          });

          const text = await res.text();
          let json: any = null;
          try {
            json = JSON.parse(text);
          } catch {
            // Ignore JSON parse errors
          }

          return {
            ok: res.ok,
            status: res.status,
            statusText: res.statusText,
            text,
            json,
          };
        },
        { orgId: this.organizationId, conversationId: id }
      );

      if (!response.ok) {
        throw createClaudeApiError(response.status, response.statusText, response.text);
      }

      const data = response.json;

      await page.close();

      // Parse conversation data (same as original implementation)
      const title = data.name || 'Untitled';
      const chatMessages = data.chat_messages || [];
      const messages: Message[] = parseClaudeMessages(chatMessages);

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
