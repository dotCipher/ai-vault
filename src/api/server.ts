/**
 * AI Vault Local API Server
 *
 * Provides REST API for web UI and external integrations
 * Runs locally only (127.0.0.1) by default for security
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { createProvidersRouter } from './routes/providers.js';
import { createConversationsRouter } from './routes/conversations.js';
import { createArchiveRouter } from './routes/archive.js';
import { createSchedulesRouter } from './routes/schedules.js';
import { createSettingsRouter } from './routes/settings.js';
import { createSearchRouter } from './routes/search.js';
import { createMediaRouter } from './routes/media.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/logger.js';
import { rateLimiter } from './middleware/rate-limiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  port?: number;
  host?: string;
  apiKey?: string;
  enableCors?: boolean;
  serveUI?: boolean;
}

export class ApiServer {
  private app: express.Application;
  private server?: any;
  private options: Required<ServerOptions>;

  constructor(options: ServerOptions = {}) {
    this.options = {
      port: options.port || 3141,
      host: options.host || '127.0.0.1', // Local only by default
      apiKey: options.apiKey || '',
      enableCors: options.enableCors ?? true,
      serveUI: options.serveUI ?? true,
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // Enable CORS for local development
    if (this.options.enableCors) {
      this.app.use(
        cors({
          origin: [
            'http://localhost:3141',
            'http://127.0.0.1:3141',
            'http://localhost:5173', // Vite dev server
            'http://127.0.0.1:5173',
          ],
          credentials: true,
        })
      );
    }

    // Request logging
    this.app.use(requestLogger);

    // Rate limiting
    this.app.use(rateLimiter);

    // API key authentication (if enabled)
    if (this.options.apiKey) {
      this.app.use('/api', (req: Request, res: Response, next: NextFunction) => {
        const providedKey = req.headers['x-api-key'] || req.query.apiKey;
        if (providedKey !== this.options.apiKey) {
          res.status(401).json({ error: 'Invalid API key' });
          return;
        }
        next();
      });
    }
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        version: process.env.npm_package_version || '2.1.0',
        uptime: process.uptime(),
      });
    });

    // API routes
    this.app.use('/api/providers', createProvidersRouter());
    this.app.use('/api/conversations', createConversationsRouter());
    this.app.use('/api/archive', createArchiveRouter());
    this.app.use('/api/schedules', createSchedulesRouter());
    this.app.use('/api/settings', createSettingsRouter());
    this.app.use('/api/search', createSearchRouter());
    this.app.use('/api/media', createMediaRouter());

    // Serve web UI (if enabled)
    if (this.options.serveUI) {
      const uiDistPath = path.join(__dirname, '../../ui/dist');
      this.app.use(express.static(uiDistPath));

      // SPA fallback - serve index.html for all non-API routes
      this.app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(uiDistPath, 'index.html'));
      });
    }
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Global error handler
    this.app.use(errorHandler);
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.options.port, this.options.host, () => {
          const url = `http://${this.options.host}:${this.options.port}`;
          console.log(chalk.green(`\n✓ AI Vault API server running at ${url}`));
          if (this.options.serveUI) {
            console.log(chalk.blue(`  → Web UI: ${url}`));
          }
          console.log(chalk.blue(`  → API Docs: ${url}/api/health\n`));
          resolve();
        });

        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            console.error(
              chalk.red(
                `\n✗ Port ${this.options.port} is already in use. Try a different port with --port flag.\n`
              )
            );
          } else {
            console.error(chalk.red(`\n✗ Server error: ${error.message}\n`));
          }
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err: any) => {
        if (err) {
          reject(err);
        } else {
          console.log(chalk.green('\n✓ API server stopped\n'));
          resolve();
        }
      });
    });
  }

  getApp(): express.Application {
    return this.app;
  }
}

// CLI entry point
export async function startServer(options: ServerOptions = {}): Promise<ApiServer> {
  const server = new ApiServer(options);
  await server.start();
  return server;
}
