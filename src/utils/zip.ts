/**
 * ZIP file handling utilities
 */

import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

/**
 * Check if a file is a ZIP file
 */
export function isZipFile(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  const stat = statSync(filePath);
  if (stat.isDirectory()) {
    return false;
  }

  // Check file extension
  if (filePath.toLowerCase().endsWith('.zip')) {
    return true;
  }

  return false;
}

/**
 * Extract a ZIP file to a temporary directory
 * Returns the path to the extracted directory and a cleanup function
 */
export function extractZip(zipPath: string): { extractedPath: string; cleanup: () => void } {
  if (!existsSync(zipPath)) {
    throw new Error(`ZIP file not found: ${zipPath}`);
  }

  if (!isZipFile(zipPath)) {
    throw new Error(`File is not a ZIP file: ${zipPath}`);
  }

  // Create a unique temporary directory
  const tempId = randomBytes(8).toString('hex');
  const extractedPath = join(tmpdir(), `ai-vault-import-${tempId}`);

  try {
    // Create temp directory
    mkdirSync(extractedPath, { recursive: true });

    // Extract ZIP file
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractedPath, true);

    // Cleanup function
    const cleanup = () => {
      if (existsSync(extractedPath)) {
        rmSync(extractedPath, { recursive: true, force: true });
      }
    };

    return { extractedPath, cleanup };
  } catch (error) {
    // Clean up on error
    if (existsSync(extractedPath)) {
      rmSync(extractedPath, { recursive: true, force: true });
    }
    throw new Error(
      `Failed to extract ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Handle import file path - extracts ZIP if needed, or uses directory directly
 * Returns the path to process and a cleanup function
 */
export function prepareImportPath(filePath: string): {
  processPath: string;
  cleanup: () => void;
  isTemporary: boolean;
} {
  if (!existsSync(filePath)) {
    throw new Error(`File or directory not found: ${filePath}`);
  }

  // If it's a ZIP file, extract it
  if (isZipFile(filePath)) {
    const { extractedPath, cleanup } = extractZip(filePath);
    return {
      processPath: extractedPath,
      cleanup,
      isTemporary: true,
    };
  }

  // If it's a directory, use it directly
  const stat = statSync(filePath);
  if (stat.isDirectory()) {
    return {
      processPath: filePath,
      cleanup: () => {}, // No cleanup needed
      isTemporary: false,
    };
  }

  throw new Error(`Path is neither a ZIP file nor a directory: ${filePath}`);
}
