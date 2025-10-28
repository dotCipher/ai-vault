/**
 * ChatGPT Provider Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatGPTProvider } from './index';
import type { ProviderConfig } from '../../types';
import { AuthenticationError } from '../../types/provider';

// Create mocked instances that will be used by tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

describe('ChatGPTProvider', () => {
  let provider: ChatGPTProvider;

  beforeEach(() => {
    provider = new ChatGPTProvider();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await provider.cleanup();
  });

  describe('Basic Properties', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('chatgpt');
    });

    it('should have correct display name', () => {
      expect(provider.displayName).toBe('ChatGPT');
    });

    it('should support cookies auth method only', () => {
      expect(provider.supportedAuthMethods).toEqual(['cookies']);
    });
  });

  describe('Authentication - API Key (not supported)', () => {
    const apiKeyConfig: ProviderConfig = {
      providerName: 'chatgpt',
      authMethod: 'api-key',
      apiKey: 'test-api-key',
    };

    it('should throw error for API key authentication', async () => {
      await expect(provider.authenticate(apiKeyConfig)).rejects.toThrow(
        'Only cookies authentication is supported for ChatGPT'
      );
    });
  });

  describe('Authentication - Cookies', () => {
    const cookiesConfig: ProviderConfig = {
      providerName: 'chatgpt',
      authMethod: 'cookies',
      cookies: {
        '__Secure-next-auth': 'test-token',
      },
    };

    it('should authenticate successfully with valid cookies', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const { mockScraper } = mockBrowserScraper(mockPage);

      const result = await provider.authenticate(cookiesConfig);

      expect(result).toBe(true);
      expect(mockScraper.init).toHaveBeenCalled();
      expect(mockScraper.createPage).toHaveBeenCalledWith({
        cookies: cookiesConfig.cookies,
        domain: '.chatgpt.com',
      });
      expect(mockPage.goto).toHaveBeenCalledWith('https://chatgpt.com', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
    });

    it('should throw AuthenticationError if cookies are missing', async () => {
      await expect(
        provider.authenticate({
          providerName: 'chatgpt',
          authMethod: 'cookies',
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it('should detect failed authentication when redirected to login', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com/auth/login'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      const result = await provider.authenticate(cookiesConfig);

      expect(result).toBe(false);
    });

    it('should detect failed authentication when on auth page', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com/auth/'),
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
        "Provider chatgpt is not configured. Run 'ai-vault setup' first."
      );
    });
  });

  describe('listConversations', () => {
    it('should throw error if not authenticated', async () => {
      await expect(provider.listConversations()).rejects.toThrow(
        "Provider chatgpt is not configured. Run 'ai-vault setup' first."
      );
    });

    it('should extract conversations from sidebar', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'Test Conversation',
          messageCount: 0,
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2025-01-01T12:00:00Z'),
          hasMedia: false,
          preview: undefined,
        },
        {
          id: 'conv-2',
          title: 'Another Chat',
          messageCount: 0,
          createdAt: new Date('2025-01-02T00:00:00Z'),
          updatedAt: new Date('2025-01-02T12:00:00Z'),
          hasMedia: false,
          preview: undefined,
        },
      ];

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(mockConversations),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      const conversations = await provider.listConversations();

      expect(conversations).toHaveLength(2);
      expect(conversations[0]).toMatchObject({
        id: 'conv-1',
        title: 'Test Conversation',
        messageCount: 0,
      });
      expect(conversations[0].createdAt).toBeInstanceOf(Date);
      expect(conversations[0].updatedAt).toBeInstanceOf(Date);
    });

    it('should filter conversations by since date', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'Old Conversation',
          messageCount: 0,
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T12:00:00Z'),
          hasMedia: false,
          preview: undefined,
        },
        {
          id: 'conv-2',
          title: 'New Chat',
          messageCount: 0,
          createdAt: new Date('2025-01-02T00:00:00Z'),
          updatedAt: new Date('2025-01-02T12:00:00Z'),
          hasMedia: false,
          preview: undefined,
        },
      ];

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(mockConversations),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      const conversations = await provider.listConversations({
        since: new Date('2025-01-01T00:00:00Z'),
      });

      expect(conversations).toHaveLength(1);
      expect(conversations[0].id).toBe('conv-2');
    });

    it('should limit number of conversations', async () => {
      const mockConversations = Array.from({ length: 10 }, (_, i) => ({
        id: `conv-${i}`,
        title: `Conversation ${i}`,
        messageCount: 0,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T12:00:00Z'),
        hasMedia: false,
        preview: undefined,
      }));

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(mockConversations),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      const conversations = await provider.listConversations({ limit: 5 });

      expect(conversations).toHaveLength(5);
    });
  });

  describe('fetchConversation', () => {
    it('should throw error if not authenticated', async () => {
      await expect(provider.fetchConversation('test-id')).rejects.toThrow(
        "Provider chatgpt is not configured. Run 'ai-vault setup' first."
      );
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
            attachments: [],
          },
        ],
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com/c/test-id'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(mockConversationData),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      const conversation = await provider.fetchConversation('test-id');

      expect(conversation).toMatchObject({
        id: 'test-id',
        provider: 'chatgpt',
        title: 'Test Chat',
      });
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].content).toBe('Hello');
      expect(conversation.messages[1].content).toBe('Hi there!');
      expect(conversation.metadata.messageCount).toBe(2);
      expect(conversation.metadata.characterCount).toBeGreaterThan(0);
    });

    it('should extract image attachments from messages', async () => {
      const mockConversationData = {
        title: 'Image Test',
        messages: [
          {
            id: 'msg-0',
            role: 'user',
            content: 'Here is an image',
            timestamp: '2025-01-01T00:00:00Z',
            attachments: [
              {
                id: '0-img-0',
                type: 'image',
                url: 'https://example.com/image.png',
              },
            ],
          },
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'I see the image',
            timestamp: '2025-01-01T00:01:00Z',
            attachments: [],
          },
        ],
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com/c/test-id'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(mockConversationData),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      const conversation = await provider.fetchConversation('test-id');

      expect(conversation.messages[0].attachments).toHaveLength(1);
      expect(conversation.messages[0].attachments?.[0]).toMatchObject({
        id: '0-img-0',
        type: 'image',
        url: 'https://example.com/image.png',
      });
      expect(conversation.metadata.mediaCount).toBe(1);
    });

    it('should extract video attachments from messages', async () => {
      const mockConversationData = {
        title: 'Video Test',
        messages: [
          {
            id: 'msg-0',
            role: 'assistant',
            content: 'Here is a video',
            timestamp: '2025-01-01T00:00:00Z',
            attachments: [
              {
                id: '0-vid-0',
                type: 'video',
                url: 'https://example.com/video.mp4',
              },
            ],
          },
        ],
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com/c/test-id'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(mockConversationData),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      const conversation = await provider.fetchConversation('test-id');

      expect(conversation.messages[0].attachments).toHaveLength(1);
      expect(conversation.messages[0].attachments?.[0]).toMatchObject({
        id: '0-vid-0',
        type: 'video',
        url: 'https://example.com/video.mp4',
      });
      expect(conversation.metadata.mediaCount).toBe(1);
    });

    it('should handle conversations with multiple media attachments', async () => {
      const mockConversationData = {
        title: 'Multi-Media Test',
        messages: [
          {
            id: 'msg-0',
            role: 'user',
            content: 'Multiple attachments',
            timestamp: '2025-01-01T00:00:00Z',
            attachments: [
              {
                id: '0-img-0',
                type: 'image',
                url: 'https://example.com/image1.png',
              },
              {
                id: '0-img-1',
                type: 'image',
                url: 'https://example.com/image2.png',
              },
              {
                id: '0-vid-0',
                type: 'video',
                url: 'https://example.com/video.mp4',
              },
            ],
          },
        ],
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com/c/test-id'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(mockConversationData),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      const conversation = await provider.fetchConversation('test-id');

      expect(conversation.messages[0].attachments).toHaveLength(3);
      expect(conversation.metadata.mediaCount).toBe(3);
    });
  });

  describe('cleanup', () => {
    it('should cleanup scraper resources', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com'),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const { mockScraper } = mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      await provider.cleanup();

      expect(mockScraper.close).toHaveBeenCalled();
    });

    it('should not throw if scraper is not initialized', async () => {
      await expect(provider.cleanup()).resolves.not.toThrow();
    });
  });
});
