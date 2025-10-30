/**
 * Reusable web scraping utilities for providers
 */

import { chromium, type Browser, type Page } from 'playwright';

export interface ScraperConfig {
  headless?: boolean;
  userAgent?: string;
  timeout?: number;
}

export interface CookieConfig {
  cookies: Record<string, string>;
  domain: string;
}

/**
 * Managed browser instance with authentication support
 */
export class BrowserScraper {
  private browser?: Browser;
  private config: ScraperConfig;

  constructor(config: ScraperConfig = {}) {
    this.config = {
      headless: true,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Initialize browser
   */
  async init(): Promise<void> {
    if (this.browser) return;

    // Check for DEBUG environment variable
    const debugMode = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
    const headless = debugMode ? false : this.config.headless;

    this.browser = await chromium.launch({
      headless,
      ...(debugMode && { slowMo: 500 }), // Slow down actions when debugging
    });

    if (debugMode) {
      console.log('[DEBUG] Browser launched in visible mode');
    }
  }

  /**
   * Create authenticated page with cookies
   */
  async createPage(cookieConfig?: CookieConfig): Promise<Page> {
    if (!this.browser) {
      await this.init();
    }

    const context = await this.browser!.newContext({
      userAgent: this.config.userAgent,
    });

    if (cookieConfig) {
      await context.addCookies(
        Object.entries(cookieConfig.cookies).map(([name, value]) => {
          // Cookies with __Host- prefix have special requirements:
          // - Must have secure=true
          // - Must NOT have a domain attribute
          // - Must have path=/
          // - Must use url instead of domain/path
          // See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#cookie_prefixes
          const isHostPrefixed = name.startsWith('__Host-');

          const cookie: any = {
            name,
            value,
            secure: name.startsWith('__Secure-') || isHostPrefixed,
          };

          // __Host- cookies require url parameter instead of domain/path
          // All other cookies use domain/path
          if (isHostPrefixed) {
            // Construct URL from domain (e.g., .chatgpt.com -> https://chatgpt.com)
            const hostname = cookieConfig.domain.startsWith('.')
              ? cookieConfig.domain.substring(1)
              : cookieConfig.domain;
            cookie.url = `https://${hostname}/`;
          } else {
            cookie.domain = cookieConfig.domain;
            cookie.path = '/';
          }

          return cookie;
        })
      );
    }

    return context.newPage();
  }

  /**
   * Cleanup browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }
}

/**
 * Auto-scroll page to load dynamic content
 */
export async function autoScroll(
  page: Page,
  options: {
    maxScrolls?: number;
    distance?: number;
    delay?: number;
  } = {}
): Promise<void> {
  const { maxScrolls = 50, distance = 100, delay = 100 } = options;

  await page.evaluate(
    async ({ distance, maxScrolls, delay }) => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        let scrolls = 0;

        const timer = setInterval(() => {
          const scrollHeight = document.documentElement.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          scrolls++;

          if (totalHeight >= scrollHeight || scrolls >= maxScrolls) {
            clearInterval(timer);
            resolve();
          }
        }, delay);
      });
    },
    { distance, maxScrolls, delay }
  );
}

/**
 * Scroll up to load all historical messages in chat applications
 * Many chat apps load older messages when scrolling to the top
 */
export async function scrollToLoadAllMessages(
  page: Page,
  options: {
    maxScrolls?: number;
    scrollDelay?: number;
    waitForLoad?: number;
  } = {}
): Promise<void> {
  const { maxScrolls = 100, scrollDelay = 500, waitForLoad = 1000 } = options;

  await page.evaluate(
    async ({ maxScrolls, scrollDelay, waitForLoad }) => {
      // Helper to wait
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Get current message count
      let previousMessageCount = 0;
      let stableCount = 0;

      for (let i = 0; i < maxScrolls; i++) {
        // Scroll to top
        window.scrollTo(0, 0);

        // Wait for new messages to load
        await wait(waitForLoad);

        // Count messages (look for common message selectors)
        const currentMessageCount = document.querySelectorAll(
          '[class*="message"], [class*="Message"], [data-message], .message-bubble, [class*="message-bubble"]'
        ).length;

        // Check if we loaded new messages
        if (currentMessageCount === previousMessageCount) {
          stableCount++;
          // If message count hasn't changed for 3 iterations, we're done
          if (stableCount >= 3) {
            break;
          }
        } else {
          stableCount = 0;
          previousMessageCount = currentMessageCount;
        }

        // Brief delay before next scroll
        await wait(scrollDelay);
      }
    },
    { maxScrolls, scrollDelay, waitForLoad }
  );
}

/**
 * Wait for any selector from a list
 */
export async function waitForAnySelector(
  page: Page,
  selectors: string[],
  timeout = 10000
): Promise<string | null> {
  try {
    const selector = selectors.join(', ');
    await page.waitForSelector(selector, { timeout });

    // Find which selector matched
    for (const sel of selectors) {
      const element = await page.$(sel);
      if (element) {
        return sel;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Extract text from element with multiple selector fallbacks
 */
export async function extractText(
  page: Page,
  selectors: string[],
  defaultValue = ''
): Promise<string> {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (element) {
      const text = await element.textContent();
      if (text?.trim()) {
        return text.trim();
      }
    }
  }
  return defaultValue;
}

/**
 * Extract attribute from element with multiple selector fallbacks
 */
export async function extractAttribute(
  page: Page,
  selectors: string[],
  attribute: string,
  defaultValue = ''
): Promise<string> {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (element) {
      const value = await element.getAttribute(attribute);
      if (value) {
        return value;
      }
    }
  }
  return defaultValue;
}

/**
 * Extract list of items with dynamic selectors
 */
export async function extractList<T>(
  page: Page,
  containerSelectors: string[],
  extractor: (element: any) => T
): Promise<T[]> {
  for (const selector of containerSelectors) {
    const elements = await page.$$(selector);
    if (elements.length > 0) {
      return page.evaluate(
        ({ selector, extractor }) => {
          const items = Array.from(document.querySelectorAll(selector));
          return items.map((item) => extractor(item));
        },
        { selector, extractor }
      );
    }
  }
  return [];
}
