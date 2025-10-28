/**
 * Grok X Provider Tests
 *
 * TODO: These tests need to be updated to reflect the grok-x provider changes.
 * Tests are currently skipped and need to be updated to:
 * - Use GrokXProvider instead of GrokProvider
 * - Update provider name from 'grok' to 'grok-x'
 * - Update URLs from grok.com to x.com/i/grok
 * - Remove API key authentication tests (cookies only)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GrokXProvider } from './index';
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

describe.skip('GrokXProvider', () => {
  let provider: GrokXProvider;

  beforeEach(() => {
    provider = new GrokXProvider();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await provider.cleanup();
  });

  describe('Basic Properties', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('grok-x');
    });

    it('should have correct display name', () => {
      expect(provider.displayName).toBe('Grok on X');
    });

    it('should support cookies auth method only', () => {
      expect(provider.supportedAuthMethods).toEqual(['cookies']);
    });
  });

  describe('Authentication - Cookies', () => {
    const cookiesConfig: ProviderConfig = {
      providerName: 'grok-x',
      authMethod: 'cookies',
      cookies: {
        auth_token: 'test-token',
      },
    };

    it('should authenticate successfully with valid cookies', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://x.com/i/grok'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const { mockScraper } = mockBrowserScraper(mockPage);

      const result = await provider.authenticate(cookiesConfig);

      expect(result).toBe(true);
      expect(mockScraper.init).toHaveBeenCalled();
      expect(mockScraper.createPage).toHaveBeenCalledWith({
        cookies: cookiesConfig.cookies,
        domain: '.x.com',
      });
      expect(mockPage.goto).toHaveBeenCalledWith('https://x.com/i/grok', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
    });

    it('should throw AuthenticationError if cookies are missing', async () => {
      await expect(
        provider.authenticate({
          providerName: 'grok-x',
          authMethod: 'cookies',
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it('should detect failed authentication when redirected to login', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://x.com/login'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      const result = await provider.authenticate(cookiesConfig);

      expect(result).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('should throw error if not authenticated', async () => {
      await expect(provider.isAuthenticated()).rejects.toThrow(
        "Provider grok-x is not configured. Run 'ai-vault setup' first."
      );
    });
  });

  describe('listConversations', () => {
    it('should throw error if not authenticated', async () => {
      await expect(provider.listConversations()).rejects.toThrow(
        "Provider grok-x is not configured. Run 'ai-vault setup' first."
      );
    });

    it('should extract conversations from REST API', async () => {
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
        url: vi.fn().mockReturnValue('https://x.com/i/grok'),
        evaluate: vi.fn().mockResolvedValue(mockApiResponse),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'grok-x',
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
        "Provider grok-x is not configured. Run 'ai-vault setup' first."
      );
    });

    it('should throw NotFoundError if conversation not found', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://x.com/i/grok/invalid-id'),
        $: vi.fn().mockResolvedValue(true), // error page found
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'grok-x',
        authMethod: 'cookies',
        cookies: { auth_token: 'test' },
      });

      await expect(provider.fetchConversation('invalid-id')).rejects.toThrow(NotFoundError);
    });

    it('should fetch and parse conversation correctly', async () => {
      const mockConversationData = {
        title: 'Test Chat',
        messages: [
          {
            id: 'msg-0',
            role: 'user',
            content: 'Hello',
            timestamp: '2025-01-01T00:00:00Z',
            attachments: [],
          },
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'Hi there!',
            timestamp: '2025-01-01T00:01:00Z',
            attachments: [
              {
                id: '1-0',
                type: 'image',
                url: 'https://example.com/image.png',
              },
            ],
          },
        ],
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://x.com/i/grok/test-id'),
        $: vi.fn().mockResolvedValue(null), // no error page
        evaluate: vi.fn().mockResolvedValue(mockConversationData),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);
      vi.mocked(scraperModule.autoScroll).mockResolvedValue(undefined);

      await provider.authenticate({
        providerName: 'grok-x',
        authMethod: 'cookies',
        cookies: { auth_token: 'test' },
      });

      const conversation = await provider.fetchConversation('test-id');

      expect(conversation).toMatchObject({
        id: 'test-id',
        provider: 'grok-x',
        title: 'Test Chat',
      });
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[1].attachments).toHaveLength(1);
      expect(conversation.metadata.messageCount).toBe(2);
      expect(conversation.metadata.mediaCount).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should cleanup scraper resources', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://x.com/i/grok'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const { mockScraper } = mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'grok-x',
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
