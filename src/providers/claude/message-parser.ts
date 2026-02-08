import type { Message, Attachment } from '../../types/index.js';

export function parseClaudeMessages(chatMessages: any[]): Message[] {
  const messages: Message[] = [];

  for (const chatMsg of chatMessages) {
    const sender = chatMsg.sender;
    const role = sender === 'human' ? 'user' : 'assistant';

    const contentBlocks = chatMsg.content || [];
    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    const attachments: Attachment[] = [];

    for (const block of contentBlocks) {
      const contentType = block.type;

      if (contentType === 'text') {
        if (block.text) {
          textParts.push(block.text);
        }
      } else if (contentType === 'thinking') {
        if (block.thinking) {
          thinkingParts.push(`[Thinking: ${block.thinking}]`);
        }
      } else if (contentType === 'tool_use') {
        if (block.name === 'artifacts' && block.input) {
          const artifactId = block.input.id || `artifact-${attachments.length}`;
          const artifactType = block.input.type || 'text/plain';
          const artifactTitle = block.input.title || 'Untitled Artifact';
          const artifactContent = block.input.content || '';

          let extension = '.txt';
          if (artifactType.includes('html')) extension = '.html';
          else if (artifactType.includes('javascript') || artifactType.includes('react'))
            extension = '.jsx';
          else if (artifactType.includes('python')) extension = '.py';
          else if (artifactType.includes('svg')) extension = '.svg';
          else if (artifactType.includes('mermaid')) extension = '.mmd';

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
        // Skip tool results for now
      } else if (contentType === 'image') {
        if (block.source?.url) {
          attachments.push({
            id: block.id || `${chatMsg.uuid}-image-${attachments.length}`,
            type: 'image',
            url: block.source.url,
            mimeType: block.source.media_type || 'image/jpeg',
          });
        }
      } else if (contentType === 'document') {
        if (block.source?.url) {
          attachments.push({
            id: block.id || `${chatMsg.uuid}-doc-${attachments.length}`,
            type: 'document',
            url: block.source.url,
            mimeType: block.source.media_type || 'application/octet-stream',
          });
        }
      }
    }

    const fullContent = [...thinkingParts, ...textParts].join('\n\n').trim();

    if (!fullContent && attachments.length === 0) {
      continue;
    }

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

  return messages;
}
