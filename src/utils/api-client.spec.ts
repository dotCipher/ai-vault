/**
 * API Client Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { createApiClient } from './api-client';

// Mock axios
vi.mock('axios');

describe('ApiClient', () => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      response: {
        use: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue(mockInstance as any);
  });

  describe('createApiClient', () => {
    it('should create client with correct configuration', () => {
      createApiClient({
        baseURL: 'https://api.example.com',
        apiKey: 'test-key',
      });

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.example.com',
        headers: {
          'User-Agent': 'ai-vault/1.0.0',
          Authorization: 'Bearer test-key',
        },
        timeout: 30000,
      });
    });

    it('should use custom timeout if provided', () => {
      createApiClient({
        baseURL: 'https://api.example.com',
        apiKey: 'test-key',
        timeout: 60000,
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });

    it('should include custom headers', () => {
      createApiClient({
        baseURL: 'https://api.example.com',
        apiKey: 'test-key',
        headers: {
          'X-Custom-Header': 'value',
        },
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'value',
          }),
        })
      );
    });

    it('should work without API key', () => {
      createApiClient({
        baseURL: 'https://api.example.com',
      });

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.anything(),
          }),
        })
      );
    });
  });

  describe('API methods', () => {
    let client: ReturnType<typeof createApiClient>;

    beforeEach(() => {
      client = createApiClient({
        baseURL: 'https://api.example.com',
        apiKey: 'test-key',
      });
    });

    it('should make GET requests', async () => {
      const mockData = { data: 'test' };
      mockInstance.get.mockResolvedValue({ data: mockData });

      const result = await client.get('/endpoint');

      expect(mockInstance.get).toHaveBeenCalledWith('/endpoint', undefined);
      expect(result).toEqual(mockData);
    });

    it('should make POST requests', async () => {
      const mockData = { id: 1 };
      const postData = { name: 'test' };
      mockInstance.post.mockResolvedValue({ data: mockData });

      const result = await client.post('/endpoint', postData);

      expect(mockInstance.post).toHaveBeenCalledWith('/endpoint', postData, undefined);
      expect(result).toEqual(mockData);
    });

    it('should retry on failure', async () => {
      const mockData = { success: true };
      mockInstance.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: mockData });

      const result = await client.get('/endpoint');

      expect(mockInstance.get).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockData);
    });

    it('should fail after max retries', async () => {
      mockInstance.get.mockRejectedValue(new Error('Permanent failure'));

      await expect(client.get('/endpoint')).rejects.toThrow('Permanent failure');
      expect(mockInstance.get).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });
});
