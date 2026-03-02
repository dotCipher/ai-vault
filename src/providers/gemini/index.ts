/**
 * Gemini Provider
 *
 * Supports:
 * - Cookie-based scraping of gemini.google.com
 *
 * Authentication: Google account cookies from gemini.google.com
 * Method: DOM scraping via BrowserScraper (no public API available)
 */

import { BaseProvider } from '../base.js';
import type { ProviderConfig, Conversation, Message } from '../../types/index.js';
import type { ListConversationsOptions, ConversationSummary } from '../../types/provider.js';
import { AuthenticationError, NotFoundError } from '../../types/provider.js';
import { BrowserScraper } from '../../utils/scraper.js';
import chalk from 'chalk';

export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini' as const;
  readonly displayName = 'Gemini';
  readonly supportedAuthMethods: ('api-key' | 'cookies' | 'oauth')[] = ['cookies'];
  // Single shared page — must not be navigated concurrently
  readonly rateLimit = { maxConcurrent: 1 };

  private static readonly CAPTCHA_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes

  private scraper?: BrowserScraper;
  private cachedPage?: any;
  // Semaphore set when Google's sorry/CAPTCHA page is detected; expires after 60 minutes
  private captchaBlockedUntil: Date | null = null;

  /** Throws immediately if the CAPTCHA cooldown semaphore is still active. */
  private checkCaptchaBlock(): void {
    if (!this.captchaBlockedUntil) return;
    if (Date.now() < this.captchaBlockedUntil.getTime()) {
      const remaining = Math.ceil((this.captchaBlockedUntil.getTime() - Date.now()) / 60_000);
      throw new Error(
        `Google bot-detection cooldown active — Gemini is blocked for ${remaining} more minute(s) ` +
          `(until ${this.captchaBlockedUntil.toLocaleTimeString()}). Try again later.`
      );
    }
    // Semaphore has expired; clear it
    this.captchaBlockedUntil = null;
  }

  /** Arms the CAPTCHA semaphore for 60 minutes and logs a warning. */
  private triggerCaptchaBlock(): void {
    this.captchaBlockedUntil = new Date(Date.now() + GeminiProvider.CAPTCHA_COOLDOWN_MS);
    process.stderr.write(
      `\n⚠ Google CAPTCHA detected. All Gemini operations are blocked until ` +
        `${this.captchaBlockedUntil.toLocaleTimeString()} (60 minutes).\n`
    );
  }

  /**
   * Get or create a reusable browser page.
   * Does not navigate — callers are responsible for navigating to their target URL.
   */
  private async getOrCreatePage(): Promise<any> {
    const cachedPage = this.cachedPage;
    if (cachedPage) {
      try {
        await cachedPage.evaluate(() => true);
        return cachedPage;
      } catch {
        this.cachedPage = undefined;
      }
    }

    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.google.com',
    });

    this.cachedPage = page;
    return page;
  }

  /**
   * Authenticate with Gemini using Google account cookies
   */
  async authenticate(config: ProviderConfig): Promise<boolean> {
    this.config = config;

    if (config.authMethod !== 'cookies') {
      throw new AuthenticationError('Only cookies authentication is supported for Gemini');
    }

    if (!config.cookies) {
      throw new AuthenticationError('Google account cookies are required for Gemini');
    }

    this.scraper = new BrowserScraper();
    await this.scraper.init();

    return this.isAuthenticated();
  }

  /**
   * Check if the current cookies give access to gemini.google.com
   */
  async isAuthenticated(): Promise<boolean> {
    this.requireAuth();
    this.checkCaptchaBlock();

    const page = await this.scraper!.createPage({
      cookies: this.config!.cookies!,
      domain: '.google.com',
    });

    try {
      await page.goto('https://gemini.google.com/app', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      const url = page.url();
      if (url.includes('consent.google.com')) {
        throw new AuthenticationError(
          'Redirected to Google consent page. Your cookies are incomplete — export ALL cookies ' +
            'from gemini.google.com (including SOCS, SAPISID, SID, etc.) using a browser extension ' +
            'like Cookie-Editor and re-run: ai-vault setup gemini --cookies-file <path>'
        );
      }
      return !url.includes('accounts.google.com');
    } finally {
      await page.close();
    }
  }

  /**
   * List conversations via the internal batchexecute API (MaZiqc RPC).
   * Avoids DOM scroll scraping — uses cursor-based pagination from the network API.
   */
  async listConversations(options: ListConversationsOptions = {}): Promise<ConversationSummary[]> {
    this.requireAuth();
    this.checkCaptchaBlock();

    const page = await this.getOrCreatePage();

    try {
      await page.goto('https://gemini.google.com/app', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const listUrl = page.url();
      if (listUrl.includes('google.com/sorry')) {
        this.triggerCaptchaBlock();
        throw new Error(
          'Google bot-detection triggered while listing conversations. ' +
            `Gemini is blocked for 60 minutes (until ${this.captchaBlockedUntil!.toLocaleTimeString()}).`
        );
      }
      if (listUrl.includes('accounts.google.com')) {
        throw new AuthenticationError('Redirected to Google login — cookies may have expired');
      }

      // Extract WIZ_global_data session params required for batchexecute
      const { sid, bl, at } = await page.evaluate(() => {
        const wiz = (window as any).WIZ_global_data ?? {};
        return {
          sid: String(wiz.FdrFJe ?? ''),
          bl: String(wiz.cfb2h ?? ''),
          at: String(wiz.SNlM0e ?? ''),
        };
      });

      if (!sid || !bl || !at) {
        throw new Error(
          'Failed to extract Gemini session parameters from WIZ_global_data — ' +
            'try re-authenticating with fresh cookies'
        );
      }

      // Execute a batchexecute MaZiqc call from the browser context (cookies are automatic)
      const batchExecute = (fReqJson: string): Promise<string> =>
        page.evaluate(
          async ({
            sid,
            bl,
            at,
            fReqJson,
          }: {
            sid: string;
            bl: string;
            at: string;
            fReqJson: string;
          }) => {
            const reqId = Math.floor(Math.random() * 900000) + 100000;
            const url =
              `https://gemini.google.com/_/BardChatUi/data/batchexecute` +
              `?rpcids=MaZiqc&source-path=%2Fapp` +
              `&bl=${encodeURIComponent(bl)}&f.sid=${encodeURIComponent(sid)}` +
              `&hl=en&_reqid=${reqId}&rt=c`;

            const resp = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                'X-Same-Domain': '1',
              },
              body: `f.req=${encodeURIComponent(fReqJson)}&at=${encodeURIComponent(at)}`,
            });

            if (!resp.ok) throw new Error(`batchexecute HTTP ${resp.status}`);
            return resp.text();
          },
          { sid, bl, at, fReqJson }
        );

      // Parse the streaming batchexecute response to extract conversations and the next cursor.
      // Response format: )]}'  followed by SIZE\n[JSON]\n chunks.
      const parseResponse = (text: string): { cursor: string | null; items: any[][] } => {
        const startIdx = text.indexOf('[["wrb.fr","MaZiqc"');
        if (startIdx === -1) return { cursor: null, items: [] };

        // Walk forward to find the matching closing bracket, skipping string contents
        let depth = 0;
        let inString = false;
        let escaped = false;
        let endIdx = startIdx;
        for (let i = startIdx; i < text.length; i++) {
          const ch = text[i];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\' && inString) {
            escaped = true;
            continue;
          }
          if (ch === '"') {
            inString = !inString;
            continue;
          }
          if (inString) continue;
          if (ch === '[' || ch === '{') depth++;
          else if (ch === ']' || ch === '}') {
            if (--depth === 0) {
              endIdx = i;
              break;
            }
          }
        }

        let outer: any[];
        try {
          outer = JSON.parse(text.substring(startIdx, endIdx + 1));
        } catch {
          return { cursor: null, items: [] };
        }

        // outer = [["wrb.fr","MaZiqc","INNER_JSON_STRING",...]]
        const entry = outer[0];
        if (!Array.isArray(entry) || entry[1] !== 'MaZiqc' || typeof entry[2] !== 'string') {
          return { cursor: null, items: [] };
        }

        let inner: any;
        try {
          inner = JSON.parse(entry[2]);
        } catch {
          return { cursor: null, items: [] };
        }

        // inner = [null, cursor_or_null, [[conv_array, ...], ...]]
        return {
          cursor: inner[1] ?? null,
          items: Array.isArray(inner[2]) ? inner[2] : [],
        };
      };

      const toSummary = (conv: any[]): ConversationSummary | null => {
        // conv[0] = "c_<hex_id>", conv[1] = title, conv[5] = [sec, ns] timestamp
        const rawId = String(conv[0] ?? '');
        const id = rawId.replace(/^c_/, '');
        if (!id) return null;
        const title = String(conv[1] ?? 'Untitled').trim() || 'Untitled';
        const tsPair = Array.isArray(conv[5]) ? conv[5] : null;
        const date = tsPair ? new Date(Number(tsPair[0]) * 1000) : new Date();
        return { id, title, messageCount: 0, createdAt: date, updatedAt: date, hasMedia: false };
      };

      const allSummaries: ConversationSummary[] = [];

      // 1. Pinned conversations (category flag [1,null,1])
      try {
        const fReq = JSON.stringify([
          [['MaZiqc', JSON.stringify([13, null, [1, null, 1]]), null, 'generic']],
        ]);
        const { items } = parseResponse(await batchExecute(fReq));
        for (const conv of items) {
          const s = toSummary(conv);
          if (s) allSummaries.push(s);
        }
      } catch {
        // Pinned fetch is best-effort; continue with regular conversations
      }

      // 2. Regular conversations with cursor pagination (category flag [0,null,1])
      const MAX_PAGES = 200;
      let cursor: string | null = null;
      let pageCount = 0;
      while (true) {
        if (++pageCount > MAX_PAGES) {
          console.log(
            chalk.yellow(`\n⚠ Gemini: reached ${MAX_PAGES} pagination pages, stopping.`)
          );
          break;
        }
        const innerArg =
          cursor === null
            ? JSON.stringify([13, null, [0, null, 1]])
            : JSON.stringify([20, cursor, [0, null, 1]]);

        const fReq = JSON.stringify([[['MaZiqc', innerArg, null, 'generic']]]);
        const { cursor: nextCursor, items } = parseResponse(await batchExecute(fReq));

        for (const conv of items) {
          const s = toSummary(conv);
          if (s) allSummaries.push(s);
        }

        if (!nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
      }

      let summaries = allSummaries;
      if (options.since) summaries = summaries.filter((c) => c.updatedAt >= options.since!);
      if (options.until) summaries = summaries.filter((c) => c.updatedAt <= options.until!);
      if (options.limit) summaries = summaries.slice(0, options.limit);

      return summaries;
    } catch (error) {
      this.cachedPage = undefined;
      throw error;
    }
  }

  /**
   * Fetch a full conversation by navigating to its URL
   */
  async fetchConversation(id: string): Promise<Conversation> {
    this.requireAuth();
    this.checkCaptchaBlock();

    const page = await this.getOrCreatePage();

    try {
      await page.goto(`https://gemini.google.com/app/${id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Brief pause to avoid triggering Google's bot detection
      await page.waitForTimeout(2500);

      const url = page.url();
      if (url.includes('accounts.google.com')) {
        throw new AuthenticationError('Redirected to Google login — cookies may have expired');
      }
      if (url.includes('google.com/sorry')) {
        this.triggerCaptchaBlock();
        throw new Error(
          'Google bot-detection triggered. ' +
            `Gemini is blocked for 60 minutes (until ${this.captchaBlockedUntil!.toLocaleTimeString()}).`
        );
      }

      // Gemini redirects to /app when a conversation is not found
      if (!url.includes(`/app/${id}`)) {
        throw new NotFoundError(`Conversation '${id}' not found`);
      }

      // Wait for the message thread — use 'attached' since Angular animations prevent 'visible'
      await page.waitForSelector(
        '[data-conversation-id], .conversation-container, model-response, user-query',
        { state: 'attached', timeout: 15000 }
      );

      // Extract messages and title (with timeout to prevent hanging on problematic pages)
      const evalPromise = page.evaluate(
        ({ convId }: { convId: string }) => {
          // Collect all turn elements in document order, tagged by role
          const allPairs: Array<{ el: Element; role: 'user' | 'assistant' }> = [
            ...Array.from(
              document.querySelectorAll('user-query, [data-role="user"], .user-query-container')
            ).map((el) => ({ el, role: 'user' as const })),
            ...Array.from(
              document.querySelectorAll('model-response, [data-role="model"], .model-response-text')
            ).map((el) => ({ el, role: 'assistant' as const })),
          ].sort((a, b) =>
            a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
          );

          const messages = allPairs
            .map((p, i) => {
              const content = p.el.textContent?.trim() ?? '';
              return content ? { id: `${convId}-${i}`, role: p.role, content } : null;
            })
            .filter(Boolean) as Array<{ id: string; role: 'user' | 'assistant'; content: string }>;

          // Extract title: prefer <title> tag minus " - Gemini" suffix, then h1
          const isGenericTitle = (t: string) =>
            /^(Google\s+)?Gemini$/i.test(t) || /^Chats$/i.test(t);

          let title = document.title?.replace(/\s*[-|]\s*Gemini\s*$/, '').trim() || '';
          if (isGenericTitle(title)) title = '';
          if (!title) {
            title = document.querySelector('h1')?.textContent?.trim() || '';
          }
          if (!title || isGenericTitle(title)) {
            title = `Gemini conversation ${convId}`;
          }

          return { messages, title };
        },
        { convId: id }
      );
      let evalTimeoutHandle: ReturnType<typeof setTimeout>;
      const evalTimeout = new Promise<never>((_, reject) => {
        evalTimeoutHandle = setTimeout(
          () => reject(new Error(`Timeout extracting messages from conversation ${id}`)),
          30_000
        );
      });
      let rawMessages: any, rawTitle: any;
      try {
        ({ messages: rawMessages, title: rawTitle } = await Promise.race([
          evalPromise,
          evalTimeout,
        ]));
      } finally {
        clearTimeout(evalTimeoutHandle!);
      }

      const messages: Message[] = (
        rawMessages as Array<{ id: string; role: 'user' | 'assistant'; content: string }>
      ).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(),
      }));

      return {
        id,
        provider: this.name,
        title: rawTitle || `Gemini conversation ${id}`,
        messages,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          messageCount: messages.length,
          characterCount: messages.reduce((sum, m) => sum + m.content.length, 0),
          mediaCount: 0,
        },
      };
    } catch (error) {
      this.cachedPage = undefined;
      throw error;
    }
  }

  /**
   * Cleanup browser resources
   */
  async cleanup(): Promise<void> {
    if (this.cachedPage) {
      try {
        await this.cachedPage.close();
      } catch {
        // ignore
      }
      this.cachedPage = undefined;
    }
    if (this.scraper) {
      await this.scraper.close();
      this.scraper = undefined;
    }
  }
}
