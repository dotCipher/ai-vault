import { PermissionError } from '../../types/provider.js';

interface ClaudeErrorPayload {
  type?: string;
  error?: {
    type?: string;
    message?: string;
    details?: {
      error_code?: string;
      [key: string]: unknown;
    };
  };
  request_id?: string;
}

export function parseClaudeApiError(bodyText: string): ClaudeErrorPayload | null {
  if (!bodyText) return null;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed === 'object') {
      return parsed as ClaudeErrorPayload;
    }
  } catch {
    return null;
  }
  return null;
}

export function createClaudeApiError(status: number, statusText: string, bodyText: string): Error {
  const parsed = parseClaudeApiError(bodyText);
  const permission = parsed?.error?.type === 'permission_error';
  const code = parsed?.error?.details?.error_code;
  const message = parsed?.error?.message;

  if (permission) {
    let full = message || `Permission error (${status} ${statusText})`;
    if (!message && code === 'free_user_project_limit') {
      full = 'Free users can only access their 5 most recently updated projects.';
    }
    const err = new PermissionError(full, code);
    (err as any).status = status;
    if (parsed?.request_id) {
      (err as any).requestId = parsed.request_id;
    }
    return err;
  }

  if (message) {
    return new Error(`Claude API ${status} ${statusText}: ${message}`);
  }

  return new Error(`Claude API ${status} ${statusText}`);
}
