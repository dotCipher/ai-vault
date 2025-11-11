/**
 * Request logging middleware
 */

import type { Request, Response, NextFunction } from 'express';
import chalk from 'chalk';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Log request
  console.log(chalk.gray(`[${new Date().toISOString()}] ${req.method} ${req.path}`));

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? chalk.red : chalk.green;
    console.log(
      chalk.gray(
        `[${new Date().toISOString()}] ${req.method} ${req.path} ${statusColor(res.statusCode)} - ${duration}ms`
      )
    );
  });

  next();
}
