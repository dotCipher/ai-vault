/**
 * Reusable web scraping utilities for providers
 */

import { execSync } from 'child_process';
import { chromium as playwrightChromium, firefox, type Browser, type Page } from 'playwright';

/**
 * Check if Playwright browsers are installed and install them if missing
 */
async function ensurePlaywrightBrowsers(): Promise<void> {
  try {
    // Try to get browser executable path - this will throw if not installed
    const chromiumPath = playwrightChromium.executablePath();
    const firefoxPath = firefox.executablePath();

    // Check if the executables actually exist
    const fs = await import('fs');
    if (!fs.existsSync(chromiumPath) || !fs.existsSync(firefoxPath)) {
      throw new Error('Browser executables not found');
    }
  } catch {
    console.log('[INFO] Playwright browsers not found, installing...');
    try {
      execSync('npx playwright install chromium firefox', {
        stdio: 'inherit',
        timeout: 300000, // 5 minute timeout
      });
      console.log('[INFO] Playwright browsers installed successfully');
    } catch (installError) {
      throw new Error(
        `Failed to install Playwright browsers. Please run 'npx playwright install' manually. Error: ${installError}`
      );
    }
  }
}

// Dynamically import playwright-extra and stealth plugin for better bot detection bypass
let stealthChromium: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Dynamic import for optional stealth support
  const { chromium: playwrightExtraChromium } = await import('playwright-extra');
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Dynamic import for optional stealth plugin
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
  playwrightExtraChromium.use(StealthPlugin());
  stealthChromium = playwrightExtraChromium;
} catch {
  console.log('[INFO] Stealth plugin not available, using standard playwright');
}

export interface ScraperConfig {
  headless?: boolean;
  userAgent?: string;
  timeout?: number;
  browser?: 'chromium' | 'firefox'; // Allow choosing browser
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
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      timeout: 60000,
      browser: 'chromium', // Default to chromium
      ...config,
    };
  }

  /**
   * Initialize browser
   */
  async init(): Promise<void> {
    if (this.browser) return;

    // Ensure Playwright browsers are installed
    await ensurePlaywrightBrowsers();

    // Check for DEBUG environment variable
    const debugMode = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
    // Check for FIREFOX environment variable to try Firefox browser
    const useFirefox = process.env.BROWSER === 'firefox' || this.config.browser === 'firefox';

    // Determine headless mode:
    // - Debug mode: visible browser (false)
    // - Otherwise: new headless mode (harder to detect than old headless)
    const headlessMode = debugMode ? false : this.config.headless;

    // Choose browser engine: Firefox, Stealth Chromium, or Standard Chromium
    let browserEngine: any;
    if (useFirefox) {
      browserEngine = firefox;
    } else if (stealthChromium && headlessMode) {
      // Use stealth chromium in headless mode for better bot detection bypass
      browserEngine = stealthChromium;
    } else {
      // Use standard chromium for visible mode or if stealth not available
      browserEngine = playwrightChromium;
    }

    const launchOptions: any = {
      headless: headlessMode,
      ...(debugMode && { slowMo: 500 }), // Slow down actions when debugging
    };

    // Chromium-specific options (only for non-stealth)
    if (!useFirefox && browserEngine === playwrightChromium) {
      launchOptions.args = [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
      ];
      // Use chrome channel for better stealth when headless
      if (headlessMode) {
        launchOptions.channel = 'chrome';
      }
    }

    this.browser = await browserEngine.launch(launchOptions);

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
      // Add extra context to avoid detection
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation'],
      // Hide webdriver property
      javaScriptEnabled: true,
    });

    // Add comprehensive script to hide automation indicators
    // Skip if using stealth plugin (it handles this better)
    if (!stealthChromium || !this.config.headless) {
      await context.addInitScript(() => {
        // Override navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // Override chrome property with realistic values
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Adding chrome property for stealth
        window.chrome = {
          runtime: {},
          loadTimes: function () {},
          csi: function () {},
          app: {},
        };

        // Override plugins with realistic count
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });

        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Override for stealth
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as any)
            : originalQuery.call(window.navigator.permissions, parameters);

        // Add realistic browser properties
        Object.defineProperty(navigator, 'vendor', {
          get: () => 'Google Inc.',
        });

        // Mock battery API
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Adding getBattery for stealth
        navigator.getBattery = () =>
          Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 1,
          });

        // Add connection info
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Adding connection property for stealth
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 50,
            downlink: 10,
            saveData: false,
          }),
        });

        // Override toString to avoid detection
        const originalToString = Function.prototype.toString;
        Function.prototype.toString = function () {
          if (this === navigator.permissions.query) {
            return 'function query() { [native code] }';
          }
          return originalToString.call(this);
        };
      });
    }

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
