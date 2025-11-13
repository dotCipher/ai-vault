/**
 * Unit tests for UI command
 * Tests command logic without spawning actual processes
 */

import { describe, it, expect } from 'vitest';

describe('UI Command - Unit Tests', () => {
  describe('command registration', () => {
    it('should register ui command with correct options', async () => {
      const { createUICommand } = await import('../../../src/commands/ui.js');
      const command = createUICommand();

      expect(command).toBeDefined();
      expect(command.name()).toBe('ui');

      // Check that options are registered
      const options = command.options;
      const optionNames = options.map((opt) => opt.long);

      expect(optionNames).toContain('--port');
      expect(optionNames).toContain('--host');
      expect(optionNames).toContain('--api-key');
      expect(optionNames).toContain('--no-ui');
      expect(optionNames).toContain('--no-cors');
    });

    it('should have correct default values', async () => {
      const { createUICommand } = await import('../../../src/commands/ui.js');
      const command = createUICommand();

      const portOption = command.options.find((opt) => opt.long === '--port');
      const hostOption = command.options.find((opt) => opt.long === '--host');

      expect(portOption?.defaultValue).toBe('3141');
      expect(hostOption?.defaultValue).toBe('127.0.0.1');
    });
  });

  describe('command description', () => {
    it('should have a clear description', async () => {
      const { createUICommand } = await import('../../../src/commands/ui.js');
      const command = createUICommand();

      const description = command.description();
      expect(description).toContain('web UI');
      expect(description).toContain('API server');
    });
  });

  describe('option configuration', () => {
    it('should accept port option with description', async () => {
      const { createUICommand } = await import('../../../src/commands/ui.js');
      const command = createUICommand();

      const portOption = command.options.find((opt) => opt.long === '--port');
      expect(portOption).toBeDefined();
      expect(portOption?.description).toBeTruthy();
    });

    it('should accept host option with description', async () => {
      const { createUICommand } = await import('../../../src/commands/ui.js');
      const command = createUICommand();

      const hostOption = command.options.find((opt) => opt.long === '--host');
      expect(hostOption).toBeDefined();
      expect(hostOption?.description).toBeTruthy();
    });

    it('should accept api-key option', async () => {
      const { createUICommand } = await import('../../../src/commands/ui.js');
      const command = createUICommand();

      const apiKeyOption = command.options.find((opt) => opt.long === '--api-key');
      expect(apiKeyOption).toBeDefined();
    });

    it('should have --no-ui flag option', async () => {
      const { createUICommand } = await import('../../../src/commands/ui.js');
      const command = createUICommand();

      const noUiOption = command.options.find((opt) => opt.long === '--no-ui');
      expect(noUiOption).toBeDefined();
    });

    it('should have --no-cors flag option', async () => {
      const { createUICommand } = await import('../../../src/commands/ui.js');
      const command = createUICommand();

      const noCorsOption = command.options.find((opt) => opt.long === '--no-cors');
      expect(noCorsOption).toBeDefined();
    });
  });
});
