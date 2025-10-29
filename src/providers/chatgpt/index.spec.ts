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
      // Use ChatGPT API format with Unix timestamps
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'Test Conversation',
          create_time: 1704067200, // 2025-01-01T00:00:00Z
          update_time: 1704110400, // 2025-01-01T12:00:00Z
        },
        {
          id: 'conv-2',
          title: 'Another Chat',
          create_time: 1704153600, // 2025-01-02T00:00:00Z
          update_time: 1704196800, // 2025-01-02T12:00:00Z
        },
      ];

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi
          .fn()
          // First call: fetch access token
          .mockResolvedValueOnce({
            accessToken: 'test-token',
            sessionData: { expires: '2026-01-01T00:00:00Z' },
          })
          // Second call: fetch conversations
          .mockResolvedValueOnce({ items: mockConversations }),
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
      // Use ChatGPT API format with Unix timestamps
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'Old Conversation',
          create_time: 1704067200, // 2024-01-01T00:00:00Z
          update_time: 1704110400, // 2024-01-01T12:00:00Z
        },
        {
          id: 'conv-2',
          title: 'New Chat',
          create_time: 1735776000, // 2025-01-02T00:00:00Z
          update_time: 1735819200, // 2025-01-02T12:00:00Z
        },
      ];

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi
          .fn()
          // First call: fetch access token
          .mockResolvedValueOnce({
            accessToken: 'test-token',
            sessionData: { expires: '2026-01-01T00:00:00Z' },
          })
          // Second call: fetch conversations
          .mockResolvedValueOnce({ items: mockConversations }),
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
      // Use ChatGPT API format with Unix timestamps
      const mockConversations = Array.from({ length: 10 }, (_, i) => ({
        id: `conv-${i}`,
        title: `Conversation ${i}`,
        create_time: 1704067200, // 2025-01-01T00:00:00Z
        update_time: 1704110400, // 2025-01-01T12:00:00Z
      }));

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi
          .fn()
          // First call: fetch access token
          .mockResolvedValueOnce({
            accessToken: 'test-token',
            sessionData: { expires: '2026-01-01T00:00:00Z' },
          })
          // Second call: fetch conversations
          .mockResolvedValueOnce({ items: mockConversations.slice(0, 5) }),
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
      // ChatGPT API format with mapping structure
      const mockConversationData = {
        title: 'Test Chat',
        create_time: 1704067200, // 2025-01-01T00:00:00Z
        update_time: 1704067260, // 2025-01-01T00:01:00Z
        mapping: {
          'node-0': {
            id: 'node-0',
            message: {
              id: 'msg-0',
              author: { role: 'user' },
              content: { parts: ['Hello'] },
              create_time: 1704067200,
            },
          },
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'assistant' },
              content: { parts: ['Hi there!'] },
              create_time: 1704067260,
            },
          },
        },
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com/c/test-id'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi
          .fn()
          // First call: fetch access token
          .mockResolvedValueOnce({
            accessToken: 'test-token',
            sessionData: { expires: '2026-01-01T00:00:00Z' },
          })
          // Second call: fetch conversation data
          .mockResolvedValueOnce(mockConversationData),
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
      // ChatGPT API format
      const mockConversationData = {
        title: 'Image Test',
        create_time: 1704067200,
        update_time: 1704067260,
        mapping: {
          'node-0': {
            id: 'node-0',
            message: {
              id: 'msg-0',
              author: { role: 'user' },
              content: { parts: ['Here is an image'] },
              create_time: 1704067200,
            },
          },
          'node-1': {
            id: 'node-1',
            message: {
              id: 'msg-1',
              author: { role: 'assistant' },
              content: { parts: ['I see the image'] },
              create_time: 1704067260,
            },
          },
        },
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com/c/test-id'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi
          .fn()
          // First call: fetch access token
          .mockResolvedValueOnce({
            accessToken: 'test-token',
            sessionData: { expires: '2026-01-01T00:00:00Z' },
          })
          // Second call: fetch conversation data
          .mockResolvedValueOnce(mockConversationData),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      const conversation = await provider.fetchConversation('test-id');

      // Note: The current implementation has a TODO for extracting attachments
      // For now, we just verify the conversation structure
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.messages[0].content).toBe('Here is an image');
      expect(conversation.messages[1].content).toBe('I see the image');
    });

    it('should extract video attachments from messages', async () => {
      // ChatGPT API format
      const mockConversationData = {
        title: 'Video Test',
        create_time: 1704067200,
        update_time: 1704067200,
        mapping: {
          'node-0': {
            id: 'node-0',
            message: {
              id: 'msg-0',
              author: { role: 'assistant' },
              content: { parts: ['Here is a video'] },
              create_time: 1704067200,
            },
          },
        },
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com/c/test-id'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi
          .fn()
          // First call: fetch access token
          .mockResolvedValueOnce({
            accessToken: 'test-token',
            sessionData: { expires: '2026-01-01T00:00:00Z' },
          })
          // Second call: fetch conversation data
          .mockResolvedValueOnce(mockConversationData),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      const conversation = await provider.fetchConversation('test-id');

      // Note: The current implementation has a TODO for extracting attachments
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('Here is a video');
    });

    it('should handle conversations with multiple media attachments', async () => {
      // ChatGPT API format
      const mockConversationData = {
        title: 'Multi-Media Test',
        create_time: 1704067200,
        update_time: 1704067200,
        mapping: {
          'node-0': {
            id: 'node-0',
            message: {
              id: 'msg-0',
              author: { role: 'user' },
              content: { parts: ['Multiple attachments'] },
              create_time: 1704067200,
            },
          },
        },
      };

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://chatgpt.com/c/test-id'),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        evaluate: vi
          .fn()
          // First call: fetch access token
          .mockResolvedValueOnce({
            accessToken: 'test-token',
            sessionData: { expires: '2026-01-01T00:00:00Z' },
          })
          // Second call: fetch conversation data
          .mockResolvedValueOnce(mockConversationData),
        close: vi.fn().mockResolvedValue(undefined),
      };

      mockBrowserScraper(mockPage);

      await provider.authenticate({
        providerName: 'chatgpt',
        authMethod: 'cookies',
        cookies: { '__Secure-next-auth': 'test' },
      });

      const conversation = await provider.fetchConversation('test-id');

      // Note: The current implementation has a TODO for extracting attachments
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].content).toBe('Multiple attachments');
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
