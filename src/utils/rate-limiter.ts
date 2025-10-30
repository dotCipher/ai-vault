/**
 * Adaptive Rate Limiter
 *
 * Implements smart rate limiting with exponential backoff and adaptive concurrency
 * to handle provider rate limits gracefully across parallel operations.
 */

import { RateLimitError } from '../types/provider.js';

export interface RateLimiterConfig {
  /** Initial concurrency limit */
  initialConcurrency: number;
  /** Minimum concurrency (won't go below this) */
  minConcurrency?: number;
  /** Maximum concurrency (won't go above this) */
  maxConcurrency?: number;
  /** Base delay in ms for exponential backoff */
  baseDelay?: number;
  /** Maximum delay in ms for exponential backoff */
  maxDelay?: number;
}

export class RateLimiter {
  private currentConcurrency: number;
  private minConcurrency: number;
  private maxConcurrency: number;
  private baseDelay: number;
  private maxDelay: number;
  private rateLimitCount: number = 0;
  private lastRateLimitTime: number = 0;
  private circuitOpen: boolean = false;
  private circuitResetTime: number = 0;

  constructor(config: RateLimiterConfig) {
    this.currentConcurrency = config.initialConcurrency;
    this.minConcurrency = config.minConcurrency ?? 1;
    this.maxConcurrency = config.maxConcurrency ?? config.initialConcurrency;
    this.baseDelay = config.baseDelay ?? 1000;
    this.maxDelay = config.maxDelay ?? 60000;
  }

  /**
   * Get current concurrency limit
   */
  getConcurrency(): number {
    return this.currentConcurrency;
  }

  /**
   * Check if circuit breaker is open (all operations should pause)
   */
  isCircuitOpen(): boolean {
    if (this.circuitOpen && Date.now() >= this.circuitResetTime) {
      // Reset circuit breaker
      this.circuitOpen = false;
      this.rateLimitCount = 0;
    }
    return this.circuitOpen;
  }

  /**
   * Handle a successful operation (increase concurrency gradually)
   */
  recordSuccess(): void {
    // Gradually increase concurrency after successful operations
    // Only increase if we haven't hit rate limits recently (last 30 seconds)
    const timeSinceLastRateLimit = Date.now() - this.lastRateLimitTime;
    if (timeSinceLastRateLimit > 30000 && this.currentConcurrency < this.maxConcurrency) {
      // Increase by 1, but max every 10 successful operations
      this.currentConcurrency = Math.min(this.currentConcurrency + 0.1, this.maxConcurrency);
    }
  }

  /**
   * Handle a rate limit error (decrease concurrency, calculate backoff)
   */
  recordRateLimit(error?: RateLimitError): { shouldPause: boolean; delay: number } {
    this.rateLimitCount++;
    this.lastRateLimitTime = Date.now();

    // Reduce concurrency by 50% (minimum 1)
    this.currentConcurrency = Math.max(
      Math.floor(this.currentConcurrency / 2),
      this.minConcurrency
    );

    // Calculate backoff delay
    let delay: number;

    if (error?.retryAfter) {
      // Use provider's retry-after header
      delay = Math.min(error.retryAfter * 1000, this.maxDelay);
    } else {
      // Exponential backoff: baseDelay * 2^(rateLimitCount - 1)
      delay = Math.min(this.baseDelay * Math.pow(2, this.rateLimitCount - 1), this.maxDelay);
    }

    // If multiple rate limits in quick succession, open circuit breaker
    const shouldPause = this.rateLimitCount >= 3;
    if (shouldPause) {
      this.circuitOpen = true;
      this.circuitResetTime = Date.now() + delay;
    }

    return { shouldPause, delay };
  }

  /**
   * Wait for the appropriate backoff delay
   */
  async waitForBackoff(delay: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Reset the rate limiter state
   */
  reset(): void {
    this.rateLimitCount = 0;
    this.lastRateLimitTime = 0;
    this.circuitOpen = false;
    this.circuitResetTime = 0;
  }

  /**
   * Get current state for debugging/monitoring
   */
  getState() {
    return {
      currentConcurrency: Math.floor(this.currentConcurrency),
      rateLimitCount: this.rateLimitCount,
      circuitOpen: this.circuitOpen,
      timeSinceLastRateLimit: Date.now() - this.lastRateLimitTime,
    };
  }
}
