/**
 * Grok Web Provider Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GrokWebProvider } from './index';
import type { ProviderConfig } from '../../types';
import { AuthenticationError, NotFoundError } from '../../types/provider';
import * as scraperModule from '../../utils/scraper';

// Create mocked instances that will be used by tests
let mockScraperInstance: any = null;

// Mock dependencies with factory functions
vi.mock('../../utils/scraper', () => {
  class MockBrowserScraper {
    constructor() {
      return mockScraperInstance;
    }
  }

  return {
    BrowserScraper: MockBrowserScraper,
    autoScroll: vi.fn().mockResolvedValue(undefined),
  };
});

// Helper to mock BrowserScraper
function mockBrowserScraper(mockPage: any) {
  const mockScraper = {
    init: vi.fn().mockResolvedValue(undefined),
    createPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  // Set the mock instance that will be returned by the constructor
  mockScraperInstance = mockScraper;

  return { mockScraper };
}

describe('GrokWebProvider', () => {
  let provider: GrokWebProvider;

  beforeEach(() => {
    provider = new GrokWebProvider();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await provider.cleanup();
  });

  describe('Basic Properties', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('grok-web');
    });

    it('should have correct display name', () => {
      expect(provider.displayName).toBe('Grok (grok.com)');
    });

    it('should support cookies auth method only', () => {
      expect(provider.supportedAuthMethods).toEqual(['cookies']);
    });
  });

  describe('Authentication - API Key (not supported)', () => {
    const apiKeyConfig: ProviderConfig = {
      providerName: 'grok-web',
      authMethod: 'api-key',
      apiKey: 'test-api-key',
    };

    it('should throw error for API key authentication', async () => {
      await expect(provider.authenticate(apiKeyConfig)).rejects.toThrow(
        'Only cookies authentication is supported for grok.com'
      );
    });
  });

  describe('Authentication - Cookies', () => {
    const cookiesConfig: ProviderConfig = {
      providerName: 'grok-web',
      authMethod: 'cookies',
      cookies: {
        auth_token: 'test-token',
      },
    };

    it('should authenticate successfully with valid cookies', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://grok.com'),
        close: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(false), // Not a Cloudflare challenge
      };

      const { mockScraper } = mockBrowserScraper(mockPage);

      const result = await provider.authenticate(cookiesConfig);

      expect(result).toBe(true);
      expect(mockScraper.init).toHaveBeenCalled();
      expect(mockScraper.createPage).toHaveBeenCalledWith({
        cookies: cookiesConfig.cookies,
        domain: '.grok.com',
      });
      expect(mockPage.goto).toHaveBeenCalledWith('https://grok.com', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
    });

    it('should throw AuthenticationError if cookies are missing', async () => {
      await expect(
        provider.authenticate({
          providerName: 'grok-web',
          authMethod: 'cookies',
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it('should detect failed authentication when redirected to login', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://grok.com/login'),
        close: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(false), // Not a Cloudflare challenge
      };

      mockBrowserScraper(mockPage);

      const result = await provider.authenticate(cookiesConfig);

      expect(result).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('should throw error if not authenticated', async () => {
      await expect(provider.isAuthenticated()).rejects.toThrow(
        "Provider grok-web is not configured. Run 'ai-vault setup' first."
      );
    });
  });

  describe('listConversations', () => {
    it('should throw error if not authenticated', async () => {
      await expect(provider.listConversations()).rejects.toThrow(
        "Provider grok-web is not configured. Run 'ai-vault setup' first."
      );
    });

    it('should extract conversations from web scraping', async () => {
      const mockApiResponse = {
        conversations: [
          {
            id: 'conv-1',
            title: 'Test Conversation',
            preview: 'Hello world',
            messageCount: 5,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T12:00:00Z',
          },
          {
            id: 'conv-2',
            title: 'Another Chat',
            preview: 'Test message',
            messageCount: 3,
            createdAt: '2025-01-02T00:00:00Z',
            updatedAt: '2025-01-02T12:00:00Z',
          },
        ],
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://grok.com'),
        evaluate: vi.fn().mockResolvedValue(mockApiResponse),
        close: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'grok-web',
        authMethod: 'cookies',
        cookies: { auth_token: 'test' },
      });

      const conversations = await provider.listConversations();

      expect(conversations).toHaveLength(2);
      expect(conversations[0]).toMatchObject({
        id: 'conv-1',
        title: 'Test Conversation',
        preview: 'Hello world',
        messageCount: 5,
      });
      expect(conversations[0].createdAt).toBeInstanceOf(Date);
      expect(conversations[0].updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('fetchConversation', () => {
    it('should throw error if not authenticated', async () => {
      await expect(provider.fetchConversation('test-id')).rejects.toThrow(
        "Provider grok-web is not configured. Run 'ai-vault setup' first."
      );
    });

    it('should throw NotFoundError if conversation not found', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://grok.com/chat/invalid-id'),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        evaluate: vi.fn().mockResolvedValue(null), // API returns null
        $: vi.fn().mockResolvedValue(true), // error page found
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'grok-web',
        authMethod: 'cookies',
        cookies: { auth_token: 'test' },
      });

      await expect(provider.fetchConversation('invalid-id')).rejects.toThrow(NotFoundError);
    });

    it('should fetch and parse conversation correctly', async () => {
      // Mock API response format that matches the actual API
      const mockApiData = {
        metadata: {
          id: 'test-id',
          title: 'Test Chat',
          createTime: '2025-01-01T00:00:00Z',
          modifyTime: '2025-01-01T00:02:00Z',
        },
        responses: [
          {
            responseId: 'resp-0',
            sender: 'human',
            message: 'Hello',
            createTime: '2025-01-01T00:00:00Z',
          },
          {
            responseId: 'resp-1',
            sender: 'grok',
            message: 'Hi there!',
            createTime: '2025-01-01T00:01:00Z',
            generatedImageUrls: ['https://example.com/image.png'],
          },
        ],
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://grok.com/chat/test-id'),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        $: vi.fn().mockResolvedValue(null), // no error page
        on: vi.fn(), // for response listener
        evaluate: vi.fn().mockResolvedValue(mockApiData),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);
      vi.mocked(scraperModule.autoScroll).mockResolvedValue(undefined);

      await provider.authenticate({
        providerName: 'grok-web',
        authMethod: 'cookies',
        cookies: { auth_token: 'test' },
      });

      const conversation = await provider.fetchConversation('test-id');

      expect(conversation).toMatchObject({
        id: 'test-id',
        provider: 'grok-web',
        title: 'Test Chat',
      });
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[0].role).toBe('user');
      expect(conversation.messages[1].content).toBe('Hi there!');
      expect(conversation.messages[1].attachments).toHaveLength(1);
      expect(conversation.metadata.messageCount).toBe(2);
      expect(conversation.metadata.mediaCount).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should cleanup scraper resources', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://grok.com'),
        close: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(false), // Not a Cloudflare challenge
      };

      const { mockScraper } = mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'grok-web',
        authMethod: 'cookies',
        cookies: { auth_token: 'test' },
      });

      await provider.cleanup();

      expect(mockScraper.close).toHaveBeenCalled();
    });

    it('should not throw if scraper is not initialized', async () => {
      await expect(provider.cleanup()).resolves.not.toThrow();
    });
  });
});
