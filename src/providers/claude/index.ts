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
import { parseClaudeMessages } from './message-parser.js';
import { createClaudeApiError } from './errors.js';

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
    const cachedPage = this.cachedPage;
    if (cachedPage) {
      try {
        // Check if page is still valid
        await cachedPage.evaluate(() => true);
        return cachedPage;
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
   * List all conversations by scraping the /recents page.
   * Clicks "Show more" / "Load more" until the button disappears,
   * then extracts conversation links from the DOM.
   * This overcomes the API pagination bug that caps results at 100.
   */
  async listConversations(options: ListConversationsOptions = {}): Promise<ConversationSummary[]> {
    this.requireAuth();

    if (!this.organizationId) {
      throw new Error('Organization ID not available. Authentication may have failed.');
    }

    const page = await this.getOrCreatePage();

    try {
      // Navigate to the recents page to get the full conversation list
      await page.goto('https://claude.ai/recents', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for at least one conversation link to appear
      await page.waitForSelector('a[href*="/chat/"]', { timeout: 15000 });

      // Click "Show more" / "Load more" until no more conversations remain.
      // The button is often temporarily disabled while the page loads — poll until
      // it becomes enabled (ready), disappears (all loaded), or stays disabled
      // for 10s (treat as end-of-list).
      while (true) {
        const buttonState = await page
          .waitForFunction(
            () => {
              const allBtns = Array.from(document.querySelectorAll('button'));
              const showMore = allBtns.find((b) =>
                /show more|load more/i.test(b.textContent?.trim() ?? '')
              );
              if (!showMore) return 'gone'; // removed from DOM → all loaded
              if (!showMore.disabled) return 'ready'; // enabled → click it
              return null; // still loading → keep polling
            },
            { timeout: 10000 }
          )
          .then((h: any) => h.jsonValue())
          .catch(() => 'done');

        if (buttonState !== 'ready') break;

        await page.getByRole('button', { name: /show more|load more/i }).click();
        // Wait for new items to load; tolerate timeout on slow networks
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      }

      // Extract conversation data from DOM
      const rawConversations = await page.evaluate(() => {
        const seen = new Set<string>();
        return Array.from(document.querySelectorAll('a[href*="/chat/"]'))
          .map((a) => {
            const href = (a as HTMLAnchorElement).href;
            const uuid = href.split('/chat/')[1]?.split('?')[0]?.split('/')[0] || '';
            if (!uuid || seen.has(uuid)) return null;
            seen.add(uuid);
            const title = a.textContent?.trim() || 'Untitled';
            const timeEl = a.closest('li, [role="listitem"], [data-testid]')?.querySelector('time');
            const dateStr = timeEl?.getAttribute('datetime') || '';
            return { uuid, title, dateStr };
          })
          .filter(Boolean);
      });

      // Fetch projects (still via API)
      const projectsData = await this.fetchProjects(page);

      // Store projects for later use
      if (Array.isArray(projectsData)) {
        for (const proj of projectsData) {
          this.projects.set(proj.uuid, proj);
        }
      }

      // Transform to ConversationSummary format
      let summaries: ConversationSummary[] = (
        rawConversations as Array<{ uuid: string; title: string; dateStr: string }>
      ).map(({ uuid, title, dateStr }) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        return {
          id: uuid,
          title,
          messageCount: 0, // Filled in when fetching full conversation
          createdAt: date,
          updatedAt: date,
          hasMedia: false, // Filled in when fetching full conversation
          preview: undefined, // Not available from DOM listing
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
      // Invalidate cached page on error so next call gets a fresh one
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

      const response = await page.evaluate(
        async ({ url }: { url: string }) => {
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
        { url }
      );

      if (!response.ok) {
        throw createClaudeApiError(response.status, response.statusText, response.text);
      }

      const data = response.json;

      // Parse conversation data
      const title = data.name || 'Untitled';
      // Process chat messages
      const chatMessages = data.chat_messages || [];
      const messages: Message[] = parseClaudeMessages(chatMessages);

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
