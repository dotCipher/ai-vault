/**
 * Import Command - Import from native platform exports
 */

import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { loadConfig } from '../utils/config.js';
import { createArchiver } from '../core/archiver.js';
import type { Conversation, Message } from '../types/index.js';

interface ImportOptions {
  provider: string;
  file: string;
  output?: string;
  yes?: boolean;
}

export async function importCommand(options: ImportOptions): Promise<void> {
  clack.intro(chalk.bold.blue('AI Vault Import'));

  const { provider, file } = options;

  // Validate file exists
  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    clack.log.error(`File or directory not found: ${filePath}`);
    process.exit(1);
  }

  // Load config for output directory
  const config = await loadConfig();
  let archiveDir = options.output || config.settings?.archiveDir;

  // Expand ~ to home directory
  if (archiveDir && archiveDir.startsWith('~')) {
    const os = await import('os');
    archiveDir = archiveDir.replace(/^~/, os.homedir());
  }

  clack.log.info(`Provider: ${provider}`);
  clack.log.info(`Import from: ${filePath}`);
  clack.log.info(`Output: ${archiveDir || '~/ai-vault-data (default)'}`);
  console.log();

  // Import based on provider
  let conversations: Conversation[];

  switch (provider.toLowerCase()) {
    case 'grok':
      ({ conversations } = await importGrok(filePath));
      break;
    default:
      clack.log.error(`Import not yet supported for provider: ${provider}`);
      clack.log.info('Supported providers: grok');
      process.exit(1);
  }

  clack.log.success(`Parsed ${conversations.length} conversations`);
  console.log();

  // Confirm import (skip if --yes flag)
  if (!options.yes) {
    const confirm = await clack.confirm({
      message: `Import ${conversations.length} conversations to archive?`,
    });

    if (clack.isCancel(confirm) || !confirm) {
      clack.cancel('Import cancelled');
      process.exit(0);
    }
  }

  // Save conversations using archiver
  const archiver = createArchiver(archiveDir);
  const storage = (archiver as any).storage; // Access storage from archiver

  const spinner = clack.spinner();
  spinner.start('Importing conversations...');

  let imported = 0;
  let errors = 0;

  for (const conversation of conversations) {
    try {
      await storage.saveConversation(conversation);
      imported++;
      spinner.message(`Imported ${imported}/${conversations.length}...`);
    } catch (error) {
      errors++;
      console.error(`Failed to import ${conversation.id}:`, error);
    }
  }

  spinner.stop();
  console.log();

  clack.outro(
    chalk.green(
      `✓ Import complete! Imported ${imported} conversations${errors > 0 ? ` (${errors} errors)` : ''}`
    )
  );
}

/**
 * Import from Grok's native export format
 */
async function importGrok(
  filePath: string
): Promise<{ conversations: Conversation[]; mediaDir?: string }> {
  const spinner = clack.spinner();
  spinner.start('Reading Grok export...');

  const stat = statSync(filePath);
  let jsonFile: string;
  let mediaDir: string | undefined;

  if (stat.isDirectory()) {
    // Export is a directory - find the JSON file
    const files = readdirSync(filePath);
    const grokJson = files.find(
      (f) => f.includes('grok-backend') || f.includes('prod-grok-backend')
    );

    if (!grokJson) {
      spinner.stop('Failed');
      throw new Error('Could not find Grok backend JSON file in export directory');
    }

    jsonFile = join(filePath, grokJson);

    // Check for media directory
    const assetDir = files.find((f) => f.includes('asset-server') || f.includes('mc-asset-server'));
    if (assetDir) {
      mediaDir = join(filePath, assetDir);
    }
  } else {
    // Single JSON file
    jsonFile = filePath;
  }

  spinner.message('Parsing conversations...');

  const content = readFileSync(jsonFile, 'utf-8');
  const data = JSON.parse(content);

  const conversations: Conversation[] = [];

  for (const item of data.conversations || []) {
    const conv = item.conversation;
    const responses = item.responses || [];

    // Convert responses to messages
    const messages: Message[] = responses.map((r: any) => {
      const response = r.response;
      return {
        id: response._id,
        role: response.sender === 'human' ? ('user' as const) : ('assistant' as const),
        content: response.message || '',
        timestamp: response.create_time?.$date?.$numberLong
          ? new Date(parseInt(response.create_time.$date.$numberLong))
          : new Date(response.create_time || Date.now()),
        metadata: response.metadata || {},
      };
    });

    // Count media types
    const mediaTypes = conv.media_types || [];
    const hasImages = mediaTypes.includes('image');
    const hasDocuments = mediaTypes.includes('document');

    const conversation: Conversation = {
      id: conv.id,
      provider: 'grok',
      title: conv.title || 'Untitled',
      messages,
      createdAt: new Date(conv.create_time),
      updatedAt: new Date(conv.modify_time),
      metadata: {
        model: conv.system_prompt_name || 'grok',
        messageCount: messages.length,
        hasImages,
        hasDocuments,
        characterCount: messages.reduce((sum, m) => sum + m.content.length, 0),
        mediaCount: conv.asset_ids?.length || 0,
        raw: {
          starred: conv.starred,
          summary: conv.summary,
          mediaTypes: conv.media_types,
        },
      },
    };

    conversations.push(conversation);
  }

  spinner.stop(`✓ Parsed ${conversations.length} conversations`);

  return { conversations, mediaDir };
}
