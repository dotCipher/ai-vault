/**
 * Reusable API client utilities for providers
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { AuthenticationError, RateLimitError } from '../types/provider.js';

export interface ApiClientConfig {
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Enhanced API client with common error handling and retry logic
 */
export class ApiClient {
  private client: AxiosInstance;

  constructor(config: ApiClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      headers: {
        'User-Agent': 'ai-vault/1.0.0',
        ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
        ...config.headers,
      },
      timeout: config.timeout || 30000,
    });

    // Response interceptor for common error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        return Promise.reject(this.handleError(error));
      }
    );
  }

  /**
   * Handle common API errors
   */
  private handleError(error: AxiosError): Error {
    if (!error.response) {
      return new Error(`Network error: ${error.message}`);
    }

    const status = error.response.status;
    const data = error.response.data as any;

    // 401 Unauthorized
    if (status === 401) {
      return new AuthenticationError(
        data?.message || 'Authentication failed. Please check your credentials.'
      );
    }

    // 429 Rate Limit
    if (status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
      return new RateLimitError(
        data?.message || 'Rate limit exceeded. Please try again later.',
        retryAfter
      );
    }

    // 404 Not Found
    if (status === 404) {
      return new Error(data?.message || 'Resource not found');
    }

    // Generic error
    return new Error(data?.message || `API error: ${status}`);
  }

  /**
   * GET request with retry logic
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.retry(async () => {
      const response = await this.client.get<T>(url, config);
      return response.data;
    });
  }

  /**
   * POST request with retry logic
   */
  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.retry(async () => {
      const response = await this.client.post<T>(url, data, config);
      return response.data;
    });
  }

  /**
   * PUT request with retry logic
   */
  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.retry(async () => {
      const response = await this.client.put<T>(url, data, config);
      return response.data;
    });
  }

  /**
   * DELETE request with retry logic
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.retry(async () => {
      const response = await this.client.delete<T>(url, config);
      return response.data;
    });
  }

  /**
   * Retry with exponential backoff
   */
  private async retry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
    let lastError: Error;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry auth errors
        if (error instanceof AuthenticationError) {
          throw error;
        }

        // Respect rate limit retry-after
        if (error instanceof RateLimitError) {
          if (error.retryAfter && i < maxRetries - 1) {
            await this.delay(error.retryAfter * 1000);
            continue;
          }
          throw error;
        }

        // Exponential backoff for other errors
        if (i < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, i);
          await this.delay(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get raw axios instance for advanced usage
   */
  getRawClient(): AxiosInstance {
    return this.client;
  }
}

/**
 * Create API client with common configuration
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
