/**
 * Tests for Storage Layer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Storage } from './storage';
import type { StorageConfig } from '../types/storage';
import type { Conversation } from '../types';
import fs from 'fs/promises';
import { existsSync } from 'fs';

// Mock fs modules
vi.mock('fs/promises');
vi.mock('fs');

describe('Storage', () => {
  let storage: Storage;
  let mockConfig: StorageConfig;

  const createMockConversation = (overrides?: Partial<Conversation>): Conversation => ({
    id: 'conv-123',
    provider: 'grok',
    title: 'Test Conversation',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date('2025-01-01T00:00:00Z'),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date('2025-01-01T00:01:00Z'),
      },
    ],
    metadata: {
      model: 'grok-2',
      messageCount: 2,
      hasImages: false,
      hasDocuments: false,
      characterCount: 0,
      mediaCount: 0,
    },
    ...overrides,
  });

  beforeEach(() => {
    mockConfig = {
      baseDir: '/test/archive',
      formats: ['json', 'markdown'],
      organizeByDate: false,
    };
    storage = new Storage(mockConfig);

    // Reset mocks
    vi.clearAllMocks();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('{}');
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('saveConversation', () => {
    it('should save conversation in all configured formats', async () => {
      const conversation = createMockConversation();

      await storage.saveConversation(conversation);

      // Should create directory
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('grok/conversations/conv-123'),
        { recursive: true }
      );

      // Should write JSON
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('conversation.json'),
        expect.stringContaining('"id": "conv-123"'),
        'utf-8'
      );

      // Should write Markdown
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('conversation.md'),
        expect.stringContaining('# Test Conversation'),
        'utf-8'
      );

      // Should update index
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('index.json'),
        expect.any(String),
        'utf-8'
      );
    });

    it('should organize by date when configured', async () => {
      storage = new Storage({
        ...mockConfig,
        organizeByDate: true,
      });

      const conversation = createMockConversation();
      const year = conversation.createdAt.getFullYear();
      const month = String(conversation.createdAt.getMonth() + 1).padStart(2, '0');

      await storage.saveConversation(conversation);

      // Should create date-organized path: /provider/conversations/YYYY/MM/id
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(`grok/conversations/${year}/${month}/conv-123`),
        { recursive: true }
      );
    });

    it('should handle conversations with attachments', async () => {
      const conversation = createMockConversation({
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Look at this',
            timestamp: new Date('2025-01-01T00:00:00Z'),
            attachments: [
              {
                id: 'att-1',
                type: 'image',
                url: 'https://example.com/image.jpg',
              },
            ],
          },
        ],
        metadata: {
          model: 'grok-2',
          messageCount: 1,
          hasImages: true,
          hasDocuments: false,
          characterCount: 0,
          mediaCount: 1,
        },
      });

      await storage.saveConversation(conversation);

      // Markdown should include image reference
      const markdownCall = vi
        .mocked(fs.writeFile)
        .mock.calls.find((call) => call[0].toString().includes('conversation.md'));
      expect(markdownCall?.[1]).toContain('![att-1](https://example.com/image.jpg)');
    });

    it('should sanitize conversation IDs in file paths', async () => {
      const conversation = createMockConversation({
        id: 'conv/with:special*chars?',
      });

      await storage.saveConversation(conversation);

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringMatching(/conv_with_special_chars_$/), {
        recursive: true,
      });
    });
  });

  describe('conversationExists', () => {
    it('should return true when conversation directory exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const exists = await storage.conversationExists('grok', 'conv-123');

      expect(exists).toBe(true);
      expect(existsSync).toHaveBeenCalledWith(
        expect.stringContaining('grok/conversations/conv-123')
      );
    });

    it('should return false when conversation directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const exists = await storage.conversationExists('grok', 'conv-123');

      expect(exists).toBe(false);
    });
  });

  describe('getConversationPath', () => {
    it('should return flat path when organizeByDate is false', () => {
      const conversation = createMockConversation();
      const path = storage.getConversationPath(conversation);

      expect(path).toContain('grok/conversations/conv-123');
      expect(path).not.toMatch(/\d{4}\/\d{2}/); // No date folders
    });

    it('should return date-organized path when organizeByDate is true', () => {
      storage = new Storage({
        ...mockConfig,
        organizeByDate: true,
      });

      const conversation = createMockConversation();
      const year = conversation.createdAt.getFullYear();
      const month = String(conversation.createdAt.getMonth() + 1).padStart(2, '0');
      const path = storage.getConversationPath(conversation);

      expect(path).toContain(`grok/conversations/${year}/${month}/conv-123`);
    });
  });

  describe('getMediaPath', () => {
    it('should return media path for images', () => {
      const path = storage.getMediaPath('grok', 'images');
      expect(path).toContain('grok/media/images');
    });

    it('should return media path for videos', () => {
      const path = storage.getMediaPath('grok', 'videos');
      expect(path).toContain('grok/media/videos');
    });

    it('should return media path for documents', () => {
      const path = storage.getMediaPath('grok', 'documents');
      expect(path).toContain('grok/media/documents');
    });
  });

  describe('getIndex', () => {
    it('should return empty index when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const index = await storage.getIndex('grok');

      expect(index).toEqual({});
    });

    it('should return parsed index when file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          'conv-123': {
            title: 'Test',
            provider: 'grok',
            messageCount: 2,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-02T00:00:00Z',
            archivedAt: '2025-01-03T00:00:00Z',
            hasMedia: false,
            mediaCount: 0,
            path: 'conversations/conv-123',
          },
        })
      );

      const index = await storage.getIndex('grok');

      expect(index).toHaveProperty('conv-123');
      expect(index['conv-123'].title).toBe('Test');
    });
  });

  describe('getStats', () => {
    it('should calculate statistics from index', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          'conv-1': {
            title: 'Conv 1',
            provider: 'grok',
            messageCount: 5,
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
            archivedAt: '2025-01-01',
            hasMedia: true,
            mediaCount: 3,
            path: 'conversations/conv-1',
          },
          'conv-2': {
            title: 'Conv 2',
            provider: 'grok',
            messageCount: 10,
            createdAt: '2025-01-02',
            updatedAt: '2025-01-02',
            archivedAt: '2025-01-02',
            hasMedia: false,
            mediaCount: 0,
            path: 'conversations/conv-2',
          },
        })
      );

      const stats = await storage.getStats('grok');

      expect(stats.totalConversations).toBe(2);
      expect(stats.totalMessages).toBe(15);
      expect(stats.totalMedia).toBe(3);
    });
  });

  describe('format conversion', () => {
    it('should include metadata in JSON export', async () => {
      const conversation = createMockConversation({
        metadata: {
          model: 'grok-2',
          messageCount: 2,
          hasImages: true,
          hasDocuments: false,
          characterCount: 0,
          mediaCount: 5,
          customField: 'test',
        },
      });

      await storage.saveConversation(conversation);

      const jsonCall = vi
        .mocked(fs.writeFile)
        .mock.calls.find((call) => call[0].toString().includes('.json'));
      const jsonContent = JSON.parse(jsonCall?.[1] as string);
      expect(jsonContent.metadata.customField).toBe('test');
    });

    it('should format timestamps correctly in Markdown', async () => {
      storage = new Storage({
        ...mockConfig,
        formats: ['markdown'],
      });

      const conversation = createMockConversation();
      await storage.saveConversation(conversation);

      const mdCall = vi
        .mocked(fs.writeFile)
        .mock.calls.find((call) => call[0].toString().includes('.md'));
      expect(mdCall?.[1]).toContain('2025-01-01T00:00:00.000Z');
    });
  });
});
