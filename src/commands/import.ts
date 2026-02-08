/**
 * Import Command - Import from native platform exports
 */

import chalk from 'chalk';
import * as clack from '@clack/prompts';
import { readFileSync, existsSync, statSync, readdirSync, cpSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import path from 'path';
import { loadConfig } from '../utils/config.js';
import { createArchiver } from '../core/archiver.js';
import { prepareImportPath } from '../utils/zip.js';
import { resolveArchiveDir } from '../utils/archive-dir.js';
import type { Conversation, Message } from '../types/index.js';
import { captureSnapshot, calculateDiff, printDataDiff } from '../utils/data-diff.js';
import { createCliUI } from '../utils/cli-ui.js';

interface ImportOptions {
  provider?: string;
  file: string;
  output?: string;
  yes?: boolean;
}

/**
 * Auto-detect provider from export file structure
 */
async function detectProvider(filePath: string): Promise<string | null> {
  const stat = statSync(filePath);

  if (stat.isDirectory()) {
    const files = readdirSync(filePath);

    // Claude: has conversations.json, projects.json, and possibly memories.json
    if (
      files.includes('conversations.json') &&
      files.includes('projects.json') &&
      (files.includes('memories.json') || files.includes('users.json'))
    ) {
      return 'claude';
    }

    // ChatGPT: has conversations.json (without Claude-specific files)
    if (files.includes('conversations.json')) {
      return 'chatgpt';
    }

    // Grok: has files with 'grok-backend' or 'prod-grok-backend'
    if (files.some((f) => f.includes('grok-backend') || f.includes('prod-grok-backend'))) {
      return 'grok-web';
    }
  } else {
    // Single file - check filename and structure
    const filename = path.basename(filePath);

    if (filename === 'conversations.json') {
      // Peek inside to check structure
      try {
        const content = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        const first = Array.isArray(data) ? data[0] : data;

        // ChatGPT has 'mapping' field
        if (first && first.mapping) {
          return 'chatgpt';
        }

        // Grok has 'conversations' and 'responses' arrays
        if (first && first.conversations) {
          return 'grok-web';
        }
      } catch {
        // Invalid JSON, can't detect
      }
    }
  }

  return null;
}

export async function importCommand(options: ImportOptions): Promise<void> {
  const ui = createCliUI();
  ui.intro(chalk.bold.blue('AI Vault Import'));

  const { file } = options;

  // Validate file exists
  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    ui.log.error(`File or directory not found: ${filePath}`);
    process.exit(1);
  }

  // Handle ZIP files or directories
  let processPath: string;
  let cleanup: (() => void) | undefined;
  let isTemporary: boolean;

  try {
    ({ processPath, cleanup, isTemporary } = prepareImportPath(filePath));

    if (isTemporary) {
      ui.log.info(`Extracting ZIP file...`);
    }

    // Auto-detect provider if not specified
    let provider = options.provider;
    if (!provider) {
      const detected = await detectProvider(processPath);
      if (!detected) {
        ui.log.error('Could not auto-detect provider from export format.');
        ui.log.info('Please specify the provider with --provider flag');
        ui.log.info('Supported providers: grok, grok-web, chatgpt, claude');
        process.exit(1);
      }
      provider = detected;
      ui.log.success(`Auto-detected provider: ${provider}`);
    }

    // Load config for output directory
    const config = await loadConfig();
    const archiveDir = resolveArchiveDir(options.output || config.settings?.archiveDir);

    ui.log.info(`Provider: ${provider}`);
    ui.log.info(`Import from: ${filePath}`);
    ui.log.info(`Output: ${archiveDir}`);
    console.log();

    // Import based on provider
    let conversations: Conversation[];
    let sourceMediaDir: string | undefined;

    switch (provider.toLowerCase()) {
      case 'grok':
      case 'grok-web':
        ({ conversations, mediaDir: sourceMediaDir } = await importGrok(processPath, provider));
        break;
      case 'chatgpt':
        ({ conversations, mediaDir: sourceMediaDir } = await importChatGPT(processPath));
        break;
      case 'claude':
        ({ conversations, mediaDir: sourceMediaDir } = await importClaude(processPath));
        break;
      default:
        ui.log.error(`Import not yet supported for provider: ${provider}`);
        ui.log.info('Supported providers: grok, grok-web, chatgpt, claude');
        process.exit(1);
    }

    // Count total media files
    const totalMedia = conversations.reduce((sum, c) => sum + (c.metadata.mediaCount || 0), 0);

    ui.log.success(
      `Parsed ${conversations.length} conversations${totalMedia > 0 ? ` with ${totalMedia} media files` : ''}`
    );
    console.log();

    // Confirm import (skip if --yes flag)
    if (!options.yes) {
      if (!ui.isInteractive) {
        ui.log.error('Confirmation requires a TTY. Re-run with --yes.');
        process.exit(1);
      }
      const confirm = await ui.confirm({
        message: `Import ${conversations.length} conversations to archive?`,
      });

      if (ui.isCancel(confirm) || !confirm) {
        ui.cancel('Import cancelled');
        process.exit(0);
      }
    }

    // Save conversations using archiver
    const archiver = createArchiver(archiveDir);
    await archiver.init();
    const storage = archiver.getStorage(); // Access storage from archiver

    // Capture stats before importing (for data diff)
    const beforeSnapshot = await captureSnapshot(storage, provider);

    const spinner = ui.spinner();
    spinner.start('Importing conversations...');

    let imported = 0;
    let errors = 0;

    for (const conversation of conversations) {
      try {
        await storage.saveConversation(conversation);
        imported++;
        spinner.text = `Imported ${imported}/${conversations.length}...`;
      } catch (error) {
        errors++;
        console.error(`Failed to save conversation ${conversation.id}:`, error);
      }
    }

    spinner.stop();

    // Copy media files if present
    if (sourceMediaDir && existsSync(sourceMediaDir)) {
      const mediaSpinner = ui.spinner();
      mediaSpinner.start('Copying media files...');

      try {
        // Get provider-specific media directory in archive
        const targetMediaBase = path.join(archiveDir, provider, 'media');
        mkdirSync(targetMediaBase, { recursive: true });

        // Copy all media files from source directory
        let mediaFilesCopied = 0;
        const files = readdirSync(sourceMediaDir);

        for (const file of files) {
          const sourcePath = join(sourceMediaDir, file);
          const stat = statSync(sourcePath);

          if (stat.isDirectory()) {
            // Copy entire directory (e.g., dalle-generations, conversation folders)
            const targetPath = join(targetMediaBase, file);
            cpSync(sourcePath, targetPath, { recursive: true });

            // Count files in directory
            const countFiles = (dir: string): number => {
              let count = 0;
              const items = readdirSync(dir);
              for (const item of items) {
                const itemPath = join(dir, item);
                if (statSync(itemPath).isDirectory()) {
                  count += countFiles(itemPath);
                } else {
                  count++;
                }
              }
              return count;
            };
            mediaFilesCopied += countFiles(sourcePath);
          } else if (
            file.startsWith('file-') ||
            /\.(jpg|jpeg|png|gif|webp|mp3|mp4|wav)$/i.test(file)
          ) {
            // Copy individual media files
            const targetPath = join(targetMediaBase, file);
            cpSync(sourcePath, targetPath);
            mediaFilesCopied++;
          }
        }

        mediaSpinner.stop(`✓ Copied ${mediaFilesCopied} media files`);
      } catch {
        mediaSpinner.stop('Failed to copy some media files');
      }
    }

    // Capture stats after importing (for data diff)
    const afterSnapshot = await captureSnapshot(storage, provider);

    // Calculate and display data diff
    const diff = calculateDiff(beforeSnapshot, afterSnapshot);
    printDataDiff(diff, beforeSnapshot, afterSnapshot, 'import');

    console.log();

    clack.outro(
      chalk.green(
        `✓ Import complete! Imported ${imported} conversations${errors > 0 ? ` (${errors} errors)` : ''}`
      )
    );
  } finally {
    // Clean up temporary files if ZIP was extracted
    if (cleanup) {
      cleanup();
    }
  }
}

/**
 * Import from Grok's native export format
 */
async function importGrok(
  filePath: string,
  providerName: string = 'grok'
): Promise<{ conversations: Conversation[]; mediaDir?: string }> {
  const spinner = clack.spinner();
  spinner.start('Reading Grok export...');

  const stat = statSync(filePath);
  // Helper function to recursively find a file
  function findFileRecursive(dir: string, pattern: (filename: string) => boolean): string | null {
    const files = readdirSync(dir);
    for (const file of files) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        const found = findFileRecursive(fullPath, pattern);
        if (found) return found;
      } else if (pattern(file)) {
        return fullPath;
      }
    }
    return null;
  }

  let jsonFile: string;
  let mediaDir: string | undefined;

  if (stat.isDirectory()) {
    // Export is a directory - find the JSON file recursively
    const grokJson = findFileRecursive(
      filePath,
      (f) => f.includes('grok-backend') || f.includes('prod-grok-backend')
    );

    if (!grokJson) {
      spinner.stop('Failed');
      throw new Error('Could not find Grok backend JSON file in export directory');
    }

    jsonFile = grokJson;

    // Check for media directory recursively
    function findDirRecursive(dir: string, pattern: (dirname: string) => boolean): string | null {
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (pattern(file)) {
            return fullPath;
          }
          const found = findDirRecursive(fullPath, pattern);
          if (found) return found;
        }
      }
      return null;
    }

    mediaDir =
      findDirRecursive(
        filePath,
        (f) => f.includes('asset-server') || f.includes('mc-asset-server')
      ) || undefined;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      provider: providerName,
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

/**
 * Import from ChatGPT's native export format
 */
async function importChatGPT(
  filePath: string
): Promise<{ conversations: Conversation[]; mediaDir?: string }> {
  const spinner = clack.spinner();
  spinner.start('Reading ChatGPT export...');

  const stat = statSync(filePath);
  let jsonFile: string;
  let mediaDir: string | undefined;

  if (stat.isDirectory()) {
    // Export is a directory - find conversations.json
    const files = readdirSync(filePath);
    const conversationsJson = files.find((f) => f === 'conversations.json');

    if (!conversationsJson) {
      spinner.stop('Failed');
      throw new Error('Could not find conversations.json in export directory');
    }

    jsonFile = join(filePath, conversationsJson);

    // Check for media files (images, DALL-E generations, audio, etc.)
    const hasMediaFiles = files.some(
      (f) =>
        f.startsWith('file-') ||
        f === 'dalle-generations' ||
        (statSync(join(filePath, f)).isDirectory() && f !== '.' && f !== '..')
    );

    if (hasMediaFiles) {
      mediaDir = filePath; // Use the export directory as media source
    }
  } else {
    // Single JSON file
    jsonFile = filePath;
  }

  spinner.message('Parsing conversations...');

  const content = readFileSync(jsonFile, 'utf-8');
  const data = JSON.parse(content);

  // data is an array of conversation objects
  const conversationsList = Array.isArray(data) ? data : [data];
  const conversations: Conversation[] = [];

  for (const conv of conversationsList) {
    const messages: Message[] = [];

    // The mapping contains message nodes
    const mapping = conv.mapping || {};

    // Build message tree from mapping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageNodes: any[] = [];
    for (const nodeId in mapping) {
      const node = mapping[nodeId];
      if (node.message && node.message.content && node.message.content.parts) {
        messageNodes.push(node);
      }
    }

    // Sort by create_time
    messageNodes.sort((a, b) => {
      const timeA = a.message.create_time || 0;
      const timeB = b.message.create_time || 0;
      return timeA - timeB;
    });

    // Convert to standard message format
    for (const node of messageNodes) {
      const msg = node.message;
      const role = msg.author.role;

      // Skip system messages
      if (role === 'system') continue;

      const content = Array.isArray(msg.content.parts)
        ? msg.content.parts.join('\\n')
        : String(msg.content.parts || '');

      if (!content.trim()) continue;

      messages.push({
        id: msg.id,
        role: role === 'user' ? 'user' : 'assistant',
        content,
        timestamp: new Date((msg.create_time || Date.now() / 1000) * 1000),
        metadata: {
          model: msg.metadata?.model_slug,
        },
      });
    }

    // Skip conversations with no messages
    if (messages.length === 0) continue;

    const conversation: Conversation = {
      id: conv.id,
      provider: 'chatgpt',
      title: conv.title || 'Untitled',
      messages,
      createdAt: new Date(conv.create_time * 1000),
      updatedAt: new Date(conv.update_time * 1000),
      metadata: {
        messageCount: messages.length,
        characterCount: messages.reduce((sum, m) => sum + m.content.length, 0),
        mediaCount: 0, // TODO: Extract media from content
      },
    };

    conversations.push(conversation);
  }

  spinner.stop(`✓ Parsed ${conversations.length} conversations`);

  return { conversations, mediaDir };
}

/**
 * Import from Claude export
 */
async function importClaude(
  filePath: string
): Promise<{ conversations: Conversation[]; mediaDir?: string }> {
  const spinner = clack.spinner();
  spinner.start('Reading Claude export...');

  const stat = statSync(filePath);
  let baseDir: string;

  if (stat.isDirectory()) {
    baseDir = filePath;
  } else {
    throw new Error(
      'Claude exports should be directories containing conversations.json and projects.json'
    );
  }

  // Find required files
  const conversationsFile = join(baseDir, 'conversations.json');
  const projectsFile = join(baseDir, 'projects.json');

  if (!existsSync(conversationsFile)) {
    spinner.stop('Failed');
    throw new Error('Could not find conversations.json in Claude export');
  }

  spinner.message('Parsing conversations...');

  const conversationsData = JSON.parse(readFileSync(conversationsFile, 'utf-8'));
  const conversationsList = Array.isArray(conversationsData)
    ? conversationsData
    : [conversationsData];

  // Load projects for metadata (optional)
  let projects: any[] = [];
  if (existsSync(projectsFile)) {
    const projectsData = JSON.parse(readFileSync(projectsFile, 'utf-8'));
    projects = Array.isArray(projectsData) ? projectsData : [projectsData];
  }

  const conversations: Conversation[] = [];

  for (const conv of conversationsList) {
    const messages: Message[] = [];

    // Process chat messages
    const chatMessages = conv.chat_messages || [];

    for (const chatMsg of chatMessages) {
      const sender = chatMsg.sender;
      const role = sender === 'human' ? 'user' : 'assistant';

      // Process content array - Claude messages have multiple content blocks
      const contentBlocks = chatMsg.content || [];
      const textParts: string[] = [];
      const thinkingParts: string[] = [];
      const attachments: any[] = [];

      for (const block of contentBlocks) {
        const contentType = block.type;

        if (contentType === 'text') {
          // Regular text content
          if (block.text) {
            textParts.push(block.text);
          }
        } else if (contentType === 'thinking') {
          // Extended thinking blocks (Claude-specific feature)
          if (block.thinking) {
            thinkingParts.push(`[Thinking: ${block.thinking}]`);
          }
        } else if (contentType === 'tool_use') {
          // Tool use blocks (web search, artifacts, etc.)
          if (block.name === 'artifacts' && block.input) {
            // Extract and save artifact content
            const artifactId = block.input.id || `artifact-${attachments.length}`;
            const artifactType = block.input.type || 'text/plain';
            const artifactTitle = block.input.title || 'Untitled Artifact';
            const artifactContent = block.input.content || '';

            // Determine file extension based on type
            let extension = '.txt';
            if (artifactType.includes('html')) extension = '.html';
            else if (artifactType.includes('javascript') || artifactType.includes('react'))
              extension = '.jsx';
            else if (artifactType.includes('python')) extension = '.py';
            else if (artifactType.includes('svg')) extension = '.svg';
            else if (artifactType.includes('mermaid')) extension = '.mmd';

            // Add artifact as attachment
            attachments.push({
              id: artifactId,
              type: 'artifact',
              title: artifactTitle,
              artifactType: artifactType,
              content: artifactContent,
              extension: extension,
            });

            textParts.push(`[Artifact: ${artifactTitle}]`);
          } else {
            textParts.push(`[Tool: ${block.name || 'unknown'}]`);
          }
        } else if (contentType === 'tool_result') {
          // Skip tool results for now or add as metadata
          // Could be included in a future version
        }
      }

      // Combine thinking and text (thinking first if present)
      const fullContent = [...thinkingParts, ...textParts].join('\n\n').trim();

      if (!fullContent) continue;

      // Convert timestamp
      const timestamp = chatMsg.created_at ? new Date(chatMsg.created_at) : new Date();

      messages.push({
        id: chatMsg.uuid,
        role,
        content: fullContent,
        timestamp,
        attachments: attachments.length > 0 ? attachments : undefined,
        metadata: {
          originalSender: sender,
        },
      });
    }

    // Skip conversations with no messages
    if (messages.length === 0) continue;

    // Convert timestamps
    const createdAt = conv.created_at ? new Date(conv.created_at) : new Date();
    const updatedAt = conv.updated_at ? new Date(conv.updated_at) : createdAt;

    const conversation: Conversation = {
      id: conv.uuid,
      provider: 'claude',
      title: conv.name || 'Untitled',
      messages,
      createdAt,
      updatedAt,
      metadata: {
        messageCount: messages.length,
        characterCount: messages.reduce((sum, m) => sum + m.content.length, 0),
        mediaCount: 0, // Will be updated when we implement artifact/attachment support
        summary: conv.summary, // Claude exports include AI-generated summaries
      },
    };

    conversations.push(conversation);
  }

  spinner.stop(`✓ Parsed ${conversations.length} conversations`);

  if (projects.length > 0) {
    clack.log.info(`Found ${projects.length} projects in export`);
  }

  return { conversations, mediaDir: undefined };
}
