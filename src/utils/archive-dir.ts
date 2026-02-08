/**
 * Resolve the archive directory with sensible defaults and ~ expansion.
 */

import os from 'os';
import path from 'path';

export function resolveArchiveDir(configuredDir?: string): string {
  const homeDir = os.homedir();
  const defaultDir = path.join(homeDir, 'ai-vault-data');

  let resolved = configuredDir || defaultDir;

  if (resolved.startsWith('~')) {
    resolved = resolved.replace(/^~/, homeDir);
  }

  return resolved;
}
