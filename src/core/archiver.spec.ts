/**
 * Tests for Archiver Orchestration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Archiver } from './archiver';
import { Storage } from './storage';
import { MediaManager } from './media';
import type { Provider } from '../types/provider';
import type { ConversationSummary, Conversation } from '../types';
import type { ArchiveOptions } from '../types/storage';
import ora from 'ora';

// Mock dependencies
vi.mock('./storage');
vi.mock('./media');
vi.mock('ora');

describe('Archiver', () => {
  let archiver: Archiver;
  let mockStorage: any;
  let mockMediaManager: any;
  let mockProvider: Provider;

  const createMockSummary = (id: string): ConversationSummary => ({
    id,
    title: `Conversation ${id}`,
    preview: 'Preview text',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    messageCount: 5,
    hasMedia: false,
  });

  const createMockConversation = (id: string): Conversation => ({
    id,
    provider: 'test-provider',
    title: `Conversation ${id}`,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date('2025-01-01'),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date('2025-01-01'),
      },
    ],
    metadata: {
      model: 'test-model',
      messageCount: 2,
      hasImages: false,
      hasDocuments: false,
      characterCount: 0,
      mediaCount: 0,
    },
  });

  beforeEach(() => {
    // Mock Storage
    mockStorage = {
      saveConversation: vi.fn().mockResolvedValue(undefined),
      conversationExists: vi.fn().mockResolvedValue(false),
      getStats: vi.fn().mockResolvedValue({
        totalConversations: 10,
        totalMessages: 50,
        totalMedia: 5,
        totalSize: 1024000,
      }),
    };

    // Mock MediaManager
    mockMediaManager = {
      downloadConversationMedia: vi.fn().mockResolvedValue({
        downloaded: 0,
        skipped: 0,
        failed: 0,
        bytes: 0,
        errors: [],
      }),
      getStats: vi.fn().mockResolvedValue({
        totalFiles: 5,
        totalSize: 512000,
        uniqueFiles: 5,
        dedupSavings: 0,
      }),
    };

    // Mock Provider
    mockProvider = {
      name: 'test-provider',
      displayName: 'Test Provider',
      supportedAuthMethods: ['api-key'],
      isAuthenticated: vi.fn().mockResolvedValue(true),
      authenticate: vi.fn().mockResolvedValue(undefined),
      listConversations: vi
        .fn()
        .mockResolvedValue([
          createMockSummary('conv-1'),
          createMockSummary('conv-2'),
          createMockSummary('conv-3'),
        ]),
      fetchConversation: vi
        .fn()
        .mockImplementation((id: string) => Promise.resolve(createMockConversation(id))),
      downloadMedia: vi.fn().mockResolvedValue({
        path: '/tmp/test.jpg',
        size: 1024,
        mimeType: 'image/jpeg',
      }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    // Create archiver instance
    archiver = new Archiver(mockStorage as Storage, mockMediaManager as MediaManager);

    // Mock ora spinner
    const mockSpinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      warn: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      text: '',
    };
    vi.mocked(ora).mockReturnValue(mockSpinner as any);

    // Mock console.log to avoid cluttering test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('archive', () => {
    it('should archive all conversations from provider', async () => {
      const options: ArchiveOptions = {
        provider: 'test-provider',
      };

      const result = await archiver.archive(mockProvider, options);

      expect(mockProvider.listConversations).toHaveBeenCalled();
      expect(mockProvider.fetchConversation).toHaveBeenCalledTimes(3);
      expect(mockStorage.saveConversation).toHaveBeenCalledTimes(3);
      expect(result.conversationsArchived).toBe(3);
      expect(result.conversationsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should respect date filters', async () => {
      const options: ArchiveOptions = {
        provider: 'test-provider',
        since: new Date('2025-01-01'),
        until: new Date('2025-12-31'),
      };

      await archiver.archive(mockProvider, options);

      expect(mockProvider.listConversations).toHaveBeenCalledWith({
        since: options.since,
        until: options.until,
        limit: undefined,
      });
    });

    it('should filter by specific conversation IDs', async () => {
      const options: ArchiveOptions = {
        provider: 'test-provider',
        conversationIds: ['conv-1', 'conv-2'],
      };

      const result = await archiver.archive(mockProvider, options);

      expect(mockProvider.fetchConversation).toHaveBeenCalledTimes(2);
      expect(mockProvider.fetchConversation).toHaveBeenCalledWith('conv-1');
      expect(mockProvider.fetchConversation).toHaveBeenCalledWith('conv-2');
      expect(result.conversationsArchived).toBe(2);
    });

    it('should filter by search query in title', async () => {
      // Setup: Create conversations with different titles
      (mockProvider.listConversations as any).mockResolvedValue([
        { ...createMockSummary('conv-1'), title: 'Python tutorial' },
        { ...createMockSummary('conv-2'), title: 'JavaScript guide' },
        { ...createMockSummary('conv-3'), title: 'TypeScript basics' },
      ]);

      const options: ArchiveOptions = {
        provider: 'test-provider',
        searchQuery: 'script',
      };

      const result = await archiver.archive(mockProvider, options);

      // Should match "JavaScript" and "TypeScript" (case-insensitive)
      expect(mockProvider.fetchConversation).toHaveBeenCalledTimes(2);
      expect(mockProvider.fetchConversation).toHaveBeenCalledWith('conv-2');
      expect(mockProvider.fetchConversation).toHaveBeenCalledWith('conv-3');
      expect(result.conversationsArchived).toBe(2);
    });

    it('should filter by search query in preview', async () => {
      // Setup: Create conversations with different previews
      (mockProvider.listConversations as any).mockResolvedValue([
        { ...createMockSummary('conv-1'), title: 'Chat 1', preview: 'Discussion about Python' },
        { ...createMockSummary('conv-2'), title: 'Chat 2', preview: 'JavaScript coding tips' },
        { ...createMockSummary('conv-3'), title: 'Chat 3', preview: 'General conversation' },
      ]);

      const options: ArchiveOptions = {
        provider: 'test-provider',
        searchQuery: 'python',
      };

      const result = await archiver.archive(mockProvider, options);

      // Should match preview containing "Python" (case-insensitive)
      expect(mockProvider.fetchConversation).toHaveBeenCalledTimes(1);
      expect(mockProvider.fetchConversation).toHaveBeenCalledWith('conv-1');
      expect(result.conversationsArchived).toBe(1);
    });

    it('should handle search query with no matches', async () => {
      const options: ArchiveOptions = {
        provider: 'test-provider',
        searchQuery: 'nonexistent',
      };

      const result = await archiver.archive(mockProvider, options);

      expect(mockProvider.fetchConversation).not.toHaveBeenCalled();
      expect(result.conversationsArchived).toBe(0);
    });

    it('should respect limit option', async () => {
      const options: ArchiveOptions = {
        provider: 'test-provider',
        limit: 2,
      };

      const result = await archiver.archive(mockProvider, options);

      expect(mockProvider.fetchConversation).toHaveBeenCalledTimes(2);
      expect(result.conversationsArchived).toBe(2);
    });

    it('should skip existing conversations when skipExisting is true', async () => {
      mockStorage.conversationExists
        .mockResolvedValueOnce(true) // conv-1 exists
        .mockResolvedValueOnce(false) // conv-2 doesn't exist
        .mockResolvedValueOnce(false); // conv-3 doesn't exist

      const options: ArchiveOptions = {
        provider: 'test-provider',
        skipExisting: true,
      };

      const result = await archiver.archive(mockProvider, options);

      expect(mockStorage.conversationExists).toHaveBeenCalledTimes(3);
      expect(mockProvider.fetchConversation).toHaveBeenCalledTimes(2); // Only non-existing
      expect(result.conversationsSkipped).toBe(1);
      expect(result.conversationsArchived).toBe(2);
    });

    it('should download media when downloadMedia is true', async () => {
      const conversationWithMedia = createMockConversation('conv-1');
      conversationWithMedia.metadata.mediaCount = 3;

      vi.mocked(mockProvider.fetchConversation).mockResolvedValue(conversationWithMedia);

      mockMediaManager.downloadConversationMedia.mockResolvedValue({
        downloaded: 3,
        skipped: 0,
        failed: 0,
        bytes: 15000,
        errors: [],
      });

      const options: ArchiveOptions = {
        provider: 'test-provider',
        conversationIds: ['conv-1'],
        downloadMedia: true,
      };

      const result = await archiver.archive(mockProvider, options);

      expect(mockMediaManager.downloadConversationMedia).toHaveBeenCalled();
      expect(result.mediaDownloaded).toBe(3);
      expect(result.bytesDownloaded).toBe(15000);
    });

    it('should skip media download when downloadMedia is false', async () => {
      const options: ArchiveOptions = {
        provider: 'test-provider',
        downloadMedia: false,
      };

      await archiver.archive(mockProvider, options);

      expect(mockMediaManager.downloadConversationMedia).not.toHaveBeenCalled();
    });

    it('should skip media download when conversation has no media', async () => {
      const options: ArchiveOptions = {
        provider: 'test-provider',
        downloadMedia: true,
      };

      await archiver.archive(mockProvider, options);

      // All mock conversations have mediaCount: 0
      expect(mockMediaManager.downloadConversationMedia).not.toHaveBeenCalled();
    });

    it('should handle media download errors gracefully', async () => {
      const conversationWithMedia = createMockConversation('conv-1');
      conversationWithMedia.metadata.mediaCount = 3;

      vi.mocked(mockProvider.fetchConversation).mockResolvedValue(conversationWithMedia);

      mockMediaManager.downloadConversationMedia.mockResolvedValue({
        downloaded: 2,
        skipped: 0,
        failed: 1,
        bytes: 10000,
        errors: [{ url: 'https://example.com/fail.jpg', error: 'Network timeout' }],
      });

      const options: ArchiveOptions = {
        provider: 'test-provider',
        conversationIds: ['conv-1'],
        downloadMedia: true,
      };

      const result = await archiver.archive(mockProvider, options);

      expect(result.mediaDownloaded).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('media');
      expect(result.errors[0].message).toContain('Network timeout');
    });

    it('should handle conversation fetch errors', async () => {
      vi.mocked(mockProvider.fetchConversation)
        .mockResolvedValueOnce(createMockConversation('conv-1'))
        .mockRejectedValueOnce(new Error('API rate limit'))
        .mockResolvedValueOnce(createMockConversation('conv-3'));

      const result = await archiver.archive(mockProvider);

      expect(result.conversationsArchived).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].id).toBe('conv-2');
      expect(result.errors[0].type).toBe('conversation');
      expect(result.errors[0].message).toBe('API rate limit');
    });

    it('should handle listConversations errors', async () => {
      vi.mocked(mockProvider.listConversations).mockRejectedValue(
        new Error('Authentication failed')
      );

      const result = await archiver.archive(mockProvider);

      expect(result.conversationsArchived).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Authentication failed');
    });

    it('should perform dry run without saving', async () => {
      const options: ArchiveOptions = {
        provider: 'test-provider',
        dryRun: true,
      };

      const result = await archiver.archive(mockProvider, options);

      expect(mockProvider.fetchConversation).toHaveBeenCalledTimes(3);
      expect(mockStorage.saveConversation).not.toHaveBeenCalled();
      expect(mockMediaManager.downloadConversationMedia).not.toHaveBeenCalled();
      expect(result.conversationsArchived).toBe(3); // Counted but not saved
    });

    it('should track total duration', async () => {
      const result = await archiver.archive(mockProvider);

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should report progress with spinners', async () => {
      await archiver.archive(mockProvider);

      expect(ora).toHaveBeenCalled();
      const spinner = vi.mocked(ora).mock.results[0].value;
      expect(spinner.start).toHaveBeenCalled();
      expect(spinner.succeed).toHaveBeenCalled();
    });

    it('should continue archiving after individual failures', async () => {
      vi.mocked(mockProvider.fetchConversation)
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockResolvedValueOnce(createMockConversation('conv-2'))
        .mockRejectedValueOnce(new Error('Error 3'));

      const result = await archiver.archive(mockProvider);

      expect(result.conversationsArchived).toBe(1); // Only conv-2 succeeded
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should combine storage and media statistics', async () => {
      const stats = await archiver.getStats('test-provider');

      expect(mockStorage.getStats).toHaveBeenCalledWith('test-provider');
      expect(mockMediaManager.getStats).toHaveBeenCalled();

      expect(stats).toEqual({
        conversations: 10,
        messages: 50,
        media: 5,
        size: 512000,
      });
    });
  });

  describe('progress tracking', () => {
    it('should show progress for each conversation', async () => {
      await archiver.archive(mockProvider);

      // Should log progress for each conversation
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[1/3]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[2/3]'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[3/3]'));
    });

    it('should update media download progress', async () => {
      const conversationWithMedia = createMockConversation('conv-1');
      conversationWithMedia.metadata.mediaCount = 5;

      vi.mocked(mockProvider.fetchConversation).mockResolvedValue(conversationWithMedia);

      let progressCallback: ((current: number, total: number) => void) | undefined;
      mockMediaManager.downloadConversationMedia.mockImplementation(
        (conversation: any, onProgress: any) => {
          progressCallback = onProgress;
          // Simulate progress
          onProgress?.(1, 5);
          onProgress?.(3, 5);
          onProgress?.(5, 5);
          return Promise.resolve({
            downloaded: 5,
            skipped: 0,
            failed: 0,
            bytes: 25000,
            errors: [],
          });
        }
      );

      const options: ArchiveOptions = {
        provider: 'test-provider',
        conversationIds: ['conv-1'],
        downloadMedia: true,
      };

      await archiver.archive(mockProvider, options);

      expect(progressCallback).toBeDefined();
    });
  });

  describe('summary output', () => {
    it('should print summary with all statistics', async () => {
      await archiver.archive(mockProvider);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Archive Summary'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Archived: '));
    });

    it('should indicate dry run in summary', async () => {
      await archiver.archive(mockProvider, { provider: 'test', dryRun: true });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    });

    it('should show media statistics when media was downloaded', async () => {
      const conversationWithMedia = createMockConversation('conv-1');
      conversationWithMedia.metadata.mediaCount = 3;

      vi.mocked(mockProvider.fetchConversation).mockResolvedValue(conversationWithMedia);

      mockMediaManager.downloadConversationMedia.mockResolvedValue({
        downloaded: 3,
        skipped: 1,
        failed: 0,
        bytes: 1048576, // 1 MB
        errors: [],
      });

      await archiver.archive(mockProvider, {
        provider: 'test',
        conversationIds: ['conv-1'],
        downloadMedia: true,
      });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Media:'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Downloaded:'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('1.00 MB'));
    });

    it('should display errors in summary', async () => {
      vi.mocked(mockProvider.fetchConversation)
        .mockResolvedValueOnce(createMockConversation('conv-1'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(createMockConversation('conv-3'));

      await archiver.archive(mockProvider);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Errors:'));
    });

    it('should truncate error list when there are many errors', async () => {
      // Mock 10 failures
      vi.mocked(mockProvider.fetchConversation).mockRejectedValue(new Error('Failed'));

      const summaries = Array.from({ length: 10 }, (_, i) => createMockSummary(`conv-${i}`));
      vi.mocked(mockProvider.listConversations).mockResolvedValue(summaries);

      await archiver.archive(mockProvider);

      // Should show "and X more" message
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('... and'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('more'));
    });
  });
});
