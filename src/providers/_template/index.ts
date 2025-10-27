/**
 * Template for creating new AI platform providers
 *
 * To create a new provider:
 * 1. Copy this directory to src/providers/yourplatform/
 * 2. Rename the class and implement all methods
 * 3. Add provider name to types/index.ts ProviderName type
 * 4. Register in src/providers/index.ts
 * 5. Create documentation in docs/providers/yourplatform.md
 */

import { BaseProvider } from '../base';
import type { ProviderConfig, Conversation } from '../../types';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider';
import { AuthenticationError, NotFoundError } from '../../types/provider';

export class TemplateProvider extends BaseProvider {
  readonly name = 'grok' as any;  // Change to your provider name (must match ProviderName type)
  readonly displayName = 'Template Provider';  // Human-readable name
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['api-key', 'cookies'];  // Supported auth methods

  /**
   * Authenticate with the provider
   */
  async authenticate(config: ProviderConfig): Promise<boolean> {
    this.config = config;

    // Example: API key authentication
    if (config.authMethod === 'api-key') {
      if (!config.apiKey) {
        throw new AuthenticationError('API key is required');
      }

      this.initClient('https://api.yourplatform.com', {
        Authorization: `Bearer ${config.apiKey}`,
      });

      // Test authentication
      try {
        await this.client!.get('/auth/verify');
        return true;
      } catch (error) {
        throw new AuthenticationError('Invalid API key');
      }
    }

    // Example: Cookie authentication
    if (config.authMethod === 'cookies') {
      if (!config.cookies) {
        throw new AuthenticationError('Cookies are required');
      }

      const cookieString = Object.entries(config.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

      this.initClient('https://yourplatform.com', {
        Cookie: cookieString,
      });

      return this.isAuthenticated();
    }

    throw new AuthenticationError(`Unsupported auth method: ${config.authMethod}`);
  }

  /**
   * Check if currently authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    this.requireAuth();

    try {
      // Make a test request to verify authentication
      await this.client!.get('/api/user/me');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all conversations
   */
  async listConversations(options?: ListConversationsOptions): Promise<ConversationSummary[]> {
    this.requireAuth();

    const params: any = {
      limit: options?.limit || 100,
      offset: options?.offset || 0,
    };

    if (options?.since) {
      params.since = options.since.toISOString();
    }

    if (options?.until) {
      params.until = options.until.toISOString();
    }

    try {
      const response = await this.client!.get('/api/conversations', { params });

      // Transform API response to ConversationSummary format
      return response.data.conversations.map((conv: any) => ({
        id: conv.id,
        title: conv.title || 'Untitled',
        messageCount: conv.message_count,
        createdAt: new Date(conv.created_at),
        updatedAt: new Date(conv.updated_at),
        hasMedia: conv.has_media || false,
        preview: conv.preview_text,
      }));
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new AuthenticationError('Session expired');
      }
      throw error;
    }
  }

  /**
   * Fetch complete conversation with all messages
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();

    try {
      const response = await this.client!.get(`/api/conversations/${id}`);
      const data = response.data;

      // Transform API response to Conversation format
      return {
        id: data.id,
        provider: this.name,
        title: data.title || 'Untitled',
        messages: data.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          metadata: msg.metadata || {},
          attachments: msg.attachments?.map((att: any) => ({
            id: att.id,
            type: att.type,
            url: att.url,
            mimeType: att.mime_type,
            size: att.size,
          })),
        })),
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        metadata: {
          messageCount: data.messages.length,
          characterCount: data.messages.reduce((sum: number, m: any) => sum + m.content.length, 0),
          mediaCount: data.messages.reduce(
            (sum: number, m: any) => sum + (m.attachments?.length || 0),
            0
          ),
          ...data.metadata,
        },
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new NotFoundError(`Conversation ${id} not found`);
      }
      if (error.response?.status === 401) {
        throw new AuthenticationError('Session expired');
      }
      throw error;
    }
  }

  /**
   * Optional: Extract cookies from browser
   * Uncomment and implement if your provider supports cookie auth
   */
  /*
  async extractCookies(browser: string): Promise<Record<string, string>> {
    // Use a library like 'chrome-cookies-secure' or 'firefox-cookies'
    // to extract cookies from the browser
    throw new Error('Cookie extraction not implemented');
  }
  */
}
