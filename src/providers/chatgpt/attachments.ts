import type { Attachment } from '../../types/index.js';

export function extractChatGPTMessageContent(parts: any[]): {
  content: string;
  hasMediaContent: boolean;
} {
  const content = parts.filter((p: any) => typeof p === 'string').join('\n');

  const hasMediaContent = parts.some(
    (p: any) =>
      typeof p === 'object' &&
      (p.content_type === 'audio_asset_pointer' ||
        p.content_type === 'real_time_user_audio_video_asset_pointer' ||
        p.content_type === 'image_asset_pointer')
  );

  return { content, hasMediaContent };
}

export function extractChatGPTAttachments(params: {
  parts: any[];
  metadataAttachments?: any[];
  nodeId: string;
  conversationId: string;
}): Attachment[] {
  const { parts, metadataAttachments, nodeId, conversationId } = params;
  const attachments: Attachment[] = [];

  // Extract attachments from message metadata
  if (metadataAttachments) {
    for (const att of metadataAttachments) {
      let possibleUrl =
        att.download_url || // Prefer download_url
        att.url || // Then url
        att.download_link || // Alternative field
        att.fileDownloadUrl || // Alternative field
        '';

      // Convert internal protocol URLs to backend-api download URLs
      if (possibleUrl.startsWith('file-service://') || possibleUrl.startsWith('sediment://')) {
        const fileId = possibleUrl.replace(/^(sediment|file-service):\/\//, '');
        possibleUrl = `https://chatgpt.com/backend-api/files/download/${fileId}?conversation_id=${conversationId}&inline=false`;
      }

      if (!possibleUrl || possibleUrl.trim() === '') {
        continue;
      }

      if (att.mimeType?.startsWith('image/')) {
        attachments.push({
          id: att.id || `${nodeId}-${attachments.length}`,
          type: 'image',
          url: possibleUrl,
          mimeType: att.mimeType,
          size: att.size,
        });
      } else if (att.mimeType?.startsWith('video/')) {
        attachments.push({
          id: att.id || `${nodeId}-${attachments.length}`,
          type: 'video',
          url: possibleUrl,
          mimeType: att.mimeType,
          size: att.size,
        });
      } else {
        attachments.push({
          id: att.id || `${nodeId}-${attachments.length}`,
          type: 'document',
          url: possibleUrl,
          mimeType: att.mimeType,
          size: att.size,
        });
      }
    }
  }

  // Extract audio/image from content parts
  for (const part of parts) {
    if (typeof part === 'object') {
      // Handle audio asset pointers (assistant messages)
      if (part.content_type === 'audio_asset_pointer' && part.asset_pointer) {
        const assetPointer = part.asset_pointer;
        if (assetPointer.startsWith('sediment://') || assetPointer.startsWith('file-service://')) {
          const fileId = assetPointer.replace(/^(sediment|file-service):\/\//, '');
          const downloadUrl = `https://chatgpt.com/backend-api/files/download/${fileId}?conversation_id=${conversationId}&inline=false`;
          attachments.push({
            id: fileId,
            type: 'audio',
            url: downloadUrl,
            mimeType: part.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
            size: part.size_bytes,
            metadata: {
              format: part.format,
              duration: part.metadata?.end || 0,
            },
          });
        }
      }

      // Handle real-time user audio/video (user messages)
      if (
        part.content_type === 'real_time_user_audio_video_asset_pointer' &&
        part.audio_asset_pointer?.asset_pointer
      ) {
        const assetPointer = part.audio_asset_pointer.asset_pointer;
        if (assetPointer.startsWith('sediment://') || assetPointer.startsWith('file-service://')) {
          const fileId = assetPointer.replace(/^(sediment|file-service):\/\//, '');
          const downloadUrl = `https://chatgpt.com/backend-api/files/download/${fileId}?conversation_id=${conversationId}&inline=false`;
          attachments.push({
            id: fileId,
            type: 'audio',
            url: downloadUrl,
            mimeType: part.audio_asset_pointer.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
            size: part.audio_asset_pointer.size_bytes,
            metadata: {
              format: part.audio_asset_pointer.format,
              duration: part.audio_asset_pointer.metadata?.end || 0,
            },
          });
        }
      }

      // Handle image asset pointers (DALL-E, user uploads, etc.)
      if (part.content_type === 'image_asset_pointer' && part.asset_pointer) {
        const assetPointer = part.asset_pointer;
        if (assetPointer.startsWith('sediment://') || assetPointer.startsWith('file-service://')) {
          const fileId = assetPointer.replace(/^(sediment|file-service):\/\//, '');
          const downloadUrl = `https://chatgpt.com/backend-api/files/download/${fileId}?conversation_id=${conversationId}&inline=false`;
          attachments.push({
            id: fileId,
            type: 'image',
            url: downloadUrl,
            mimeType: 'image/png', // Default, will be determined from actual file
            size: part.size_bytes,
            metadata: {
              width: part.width,
              height: part.height,
              dallePrompt: part.metadata?.dalle?.prompt,
              dalleGenId: part.metadata?.dalle?.gen_id,
            },
          });
        }
      }
    }
  }

  return attachments;
}
