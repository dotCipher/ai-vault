/**
 * Global error handler middleware
 */

import type { Request, Response, NextFunction } from 'express';
import chalk from 'chalk';

export interface ApiError extends Error {
  statusCode?: number;
  details?: any;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // Log error
  console.error(chalk.red(`[API Error] ${statusCode}: ${message}`));
  if (err.stack) {
    console.error(chalk.gray(err.stack));
  }

  // Send error response
  res.status(statusCode).json({
    error: message,
    details: err.details,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function createError(message: string, statusCode: number = 500, details?: any): ApiError {
  const error: ApiError = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}
