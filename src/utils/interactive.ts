/**
 * Detect if the process can safely use interactive TTY features.
 */

export function isInteractive(): boolean {
  if (process.env.AI_VAULT_HEADLESS === '1' || process.env.AI_VAULT_HEADLESS === 'true') {
    return false;
  }

  if (process.env.CI === '1' || process.env.CI === 'true') {
    return false;
  }

  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
