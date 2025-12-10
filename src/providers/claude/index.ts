/**
 * Claude Provider
 *
 * Supports:
 * - Native import from Claude export directory (conversations.json, projects.json)
 * - API-based archival for ongoing conversation backup
 * - Project/workspace organization
 * - Artifact and attachment support
 *
 * Authentication: sessionKey cookie from claude.ai
 * API Base: https://claude.ai/api
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

interface ClaudeProject {
  uuid: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export class ClaudeProvider extends BaseProvider {
  readonly name = 'claude' as const;
  readonly displayName = 'Claude';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];

  private scraper?: BrowserScraper;
  private organizationId?: string;
  private conversationProjects: Map<string, string> = new Map(); // conversationId -> projectName
  private projects: Map<string, ClaudeProject> = new Map(); // projectId -> project data
  private cachedPage?: any; // Reusable browser page for API calls

  /**
   * Get or create a reusable browser page for API calls
   * This avoids creating a new page for every operation
   */
  private async getOrCreatePage(): Promise<any> {
    if (this.cachedPage) {
      try {
        // Check if page is still valid
        await this.cachedPage.evaluate(() => true);
        return this.cachedPage;
      } catch {
        // Page is stale, create a new one
        this.cachedPage = undefined;
      }
    }

    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.claude.ai',
    });

    // Navigate to establish session
    await page.goto('https://claude.ai', { waitUntil: 'domcontentloaded', timeout: 15000 });
    this.cachedPage = page;
    return page;
  }

  /**
   * Authenticate with Claude using sessionKey cookie
   */
  async authenticate(config: ProviderConfig): Promise<boolean> {
    this.config = config;

    if (config.authMethod !== 'cookies') {
      throw new AuthenticationError('Only cookies authentication is supported for Claude');
    }

    if (!config.cookies) {
      throw new AuthenticationError('sessionKey cookie is required for Claude');
    }

    // Initialize browser for API calls
    this.scraper = new BrowserScraper();
    await this.scraper.init();

    return this.isAuthenticated();
  }

  /**
   * Check authentication status and extract organization ID
   */
  async isAuthenticated(): Promise<boolean> {
    this.requireAuth();

    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.claude.ai',
    });

    try {
      // Navigate to Claude to establish session
      await page.goto('https://claude.ai', { waitUntil: 'networkidle', timeout: 30000 });

      // Check if we're redirected to login
      const url = page.url();
      if (url.includes('/login') || url.includes('/auth/')) {
        await page.close();
        return false;
      }

      // Try to extract organization ID from the page or API
      const orgId = await page.evaluate(async () => {
        try {
          // Try to get organization from API
          const response = await fetch('https://claude.ai/api/organizations', {
            method: 'GET',
            credentials: 'include',
          });

          if (!response.ok) {
            return null;
          }

          const orgs = await response.json();
          // Return the first organization UUID
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
      return true;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Fetch a single page of conversations from the API
   * Returns minimal data to avoid string overflow in page.evaluate()
   */
  private async fetchConversationPage(
    page: any,
    pageNum: number,
    limit: number
  ): Promise<{ items: any[]; hasMore: boolean }> {
    const url = `https://claude.ai/api/organizations/${this.organizationId}/chat_conversations?limit=${limit}&page=${pageNum}`;

    const result = await page.evaluate(
      async ({ url }: { url: string }) => {
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
        });

        if (!res.ok) {
          return { items: [], hasMore: false, error: res.status };
        }

        const data = await res.json();
        const conversations = Array.isArray(data) ? data : [];

        // Return only minimal fields to avoid large data transfer
        const minimalItems = conversations.map((conv: any) => ({
          uuid: conv.uuid,
          name: conv.name || 'Untitled',
          created_at: conv.created_at,
          updated_at: conv.updated_at,
          summary: conv.summary,
          project_uuid: conv.project_uuid,
        }));

        return {
          items: minimalItems,
          hasMore: conversations.length === 100, // API limit
        };
      },
      { url }
    );

    if (result.error && pageNum === 1) {
      throw new Error(`API request failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Fetch projects for the organization
   */
  private async fetchProjects(page: any): Promise<any[]> {
    const url = `https://claude.ai/api/organizations/${this.organizationId}/projects`;

    try {
      return await page.evaluate(
        async ({ url }: { url: string }) => {
          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
          });

          if (!res.ok) return [];
          return await res.json();
        },
        { url }
      );
    } catch {
      return [];
    }
  }

  /**
   * List conversations from Claude API with pagination
   * Pagination is done outside page.evaluate() to avoid string overflow
   */
  async listConversations(options: ListConversationsOptions = {}): Promise<ConversationSummary[]> {
    this.requireAuth();

    if (!this.organizationId) {
      throw new Error('Organization ID not available. Authentication may have failed.');
    }

    const page = await this.getOrCreatePage();

    try {
      const pageSize = 100; // API limit per request
      const requestedLimit = options.limit;

      // Fetch conversations with pagination outside browser context
      // Track seen UUIDs to detect when API returns duplicates (pagination cycling)
      const allConversations: any[] = [];
      const seenUuids = new Set<string>();
      let pageNum = 1;
      let hasMore = true;

      while (hasMore) {
        const result = await this.fetchConversationPage(page, pageNum, pageSize);

        // Check for duplicates - if we see any UUID we've already seen,
        // the API is cycling back (pagination doesn't work as expected)
        let foundDuplicate = false;
        for (const item of result.items) {
          if (seenUuids.has(item.uuid)) {
            foundDuplicate = true;
            break;
          }
          seenUuids.add(item.uuid);
          allConversations.push(item);
        }

        // Stop if we found duplicates (API cycled) or no more results
        hasMore = result.hasMore && !foundDuplicate;
        if (requestedLimit && allConversations.length >= requestedLimit) {
          hasMore = false;
        }
        pageNum++;
      }

      // Fetch projects
      const projectsData = await this.fetchProjects(page);

      // Store projects for later use
      if (Array.isArray(projectsData)) {
        for (const proj of projectsData) {
          this.projects.set(proj.uuid, proj);
        }
      }

      // Transform to ConversationSummary format
      let summaries: ConversationSummary[] = allConversations.map((conv: any) => {
        // Map conversation to project if available
        if (conv.project_uuid && this.projects.has(conv.project_uuid)) {
          const project = this.projects.get(conv.project_uuid)!;
          this.conversationProjects.set(conv.uuid, project.name);
        }

        return {
          id: conv.uuid,
          title: conv.name || 'Untitled',
          messageCount: 0, // Will be determined when fetching full conversation
          createdAt: conv.created_at ? new Date(conv.created_at) : new Date(),
          updatedAt: conv.updated_at ? new Date(conv.updated_at) : new Date(),
          hasMedia: false, // Will be determined when fetching full conversation
          preview: conv.summary, // Claude includes AI-generated summaries
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
      // Don't close the cached page on error, just invalidate it
      this.cachedPage = undefined;
      throw error;
    }
  }

  /**
   * Fetch a full conversation from Claude API
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();

    if (!this.organizationId) {
      throw new Error('Organization ID not available. Authentication may have failed.');
    }

    const page = await this.getOrCreatePage();

    try {
      // Fetch conversation details with full message history
      const url = `https://claude.ai/api/organizations/${this.organizationId}/chat_conversations/${id}?tree=True&rendering_mode=messages&render_all_tools=true`;

      const data = await page.evaluate(
        async ({ url }: { url: string }) => {
          const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
          });

          if (!res.ok) {
            throw new Error(`API request failed: ${res.status} ${res.statusText}`);
          }

          return await res.json();
        },
        { url }
      );

      // Parse conversation data
      const title = data.name || 'Untitled';
      const messages: Message[] = [];

      // Process chat messages
      const chatMessages = data.chat_messages || [];

      for (const chatMsg of chatMessages) {
        const sender = chatMsg.sender;
        const role = sender === 'human' ? 'user' : 'assistant';

        // Process content array - Claude messages have multiple content blocks
        const contentBlocks = chatMsg.content || [];
        const textParts: string[] = [];
        const thinkingParts: string[] = [];
        const attachments: any[] = [];

        for (const block of contentBlocks) {
          const contentType = block.type;

          if (contentType === 'text') {
            // Regular text content
            if (block.text) {
              textParts.push(block.text);
            }
          } else if (contentType === 'thinking') {
            // Extended thinking blocks (Claude-specific feature)
            if (block.thinking) {
              thinkingParts.push(`[Thinking: ${block.thinking}]`);
            }
          } else if (contentType === 'tool_use') {
            // Tool use blocks - check for artifacts first
            if (block.name === 'artifacts' && block.input) {
              // Extract artifact content and metadata
              const artifactId = block.input.id || `artifact-${attachments.length}`;
              const artifactType = block.input.type || 'text/plain';
              const artifactTitle = block.input.title || 'Untitled Artifact';
              const artifactContent = block.input.content || '';

              // Determine file extension from artifact type
              let extension = '.txt';
              if (artifactType.includes('html')) extension = '.html';
              else if (artifactType.includes('javascript') || artifactType.includes('react'))
                extension = '.jsx';
              else if (artifactType.includes('python')) extension = '.py';
              else if (artifactType.includes('svg')) extension = '.svg';
              else if (artifactType.includes('mermaid')) extension = '.mmd';

              // Add artifact to attachments with full content
              attachments.push({
                id: artifactId,
                type: 'artifact',
                title: artifactTitle,
                artifactType: artifactType,
                content: artifactContent,
                extension: extension,
              });

              // Update text marker to show artifact title
              textParts.push(`[Artifact: ${artifactTitle}]`);
            } else {
              // Other tool uses (web search, code execution, etc.)
              textParts.push(`[Tool: ${block.name || 'unknown'}]`);
            }
          } else if (contentType === 'tool_result') {
            // Skip tool results for now
          } else if (contentType === 'image') {
            // Image attachments
            if (block.source?.url) {
              attachments.push({
                id: block.id || `${chatMsg.uuid}-image-${attachments.length}`,
                type: 'image',
                url: block.source.url,
                mimeType: block.source.media_type || 'image/jpeg',
              });
            }
          } else if (contentType === 'document') {
            // Document attachments (PDFs, etc.)
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

        // Combine thinking and text (thinking first if present)
        const fullContent = [...thinkingParts, ...textParts].join('\n\n').trim();

        // Skip messages with no content and no attachments
        if (!fullContent && attachments.length === 0) {
          continue;
        }

        // Convert timestamp
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

      // Extract hierarchy information
      const hierarchy: any = {};
      const projectName = this.conversationProjects.get(id);
      if (projectName) {
        hierarchy.projectName = projectName;
        // Find project ID
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
          summary: data.summary, // Claude includes AI-generated summaries
        },
        hierarchy:
          Object.keys(hierarchy).length > 0 ? (hierarchy as ConversationHierarchy) : undefined,
      };
    } catch (error) {
      // Invalidate cached page on error
      this.cachedPage = undefined;
      throw error;
    }
  }

  /**
   * Cleanup browser resources
   */
  async cleanup(): Promise<void> {
    if (this.cachedPage) {
      try {
        await this.cachedPage.close();
      } catch {
        // Ignore errors when closing
      }
      this.cachedPage = undefined;
    }
    if (this.scraper) {
      await this.scraper.close();
      this.scraper = undefined;
    }
  }
}
