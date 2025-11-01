# ChatGPT Media Investigation Guide

## Current State

**Archive Coverage**: 52 media files (11% of 459 total)
**Missing**: 407 files

- Voice conversation audio files (.wav)
- User-uploaded images/documents
- DALL-E generated images

## File ID Patterns Found in Export

### Audio Files (Voice Conversations)

```
<conversation-id>/audio/file_<hash>-<uuid>.wav
```

Example: `689f45b6-f6f0-8332-8f61-69c9e796073c/audio/file_0000000023f862308c7427969a6af9f1-aa570aac-8dec-44e9-a99a-63988a2a33ce.wav`

### User Uploads

```
user-<user-id>/file_<hash>-<uuid>.png
```

Example: `user-RiluP6G7FP0pTCENvYwUhX8L/file_00000000852061faa8cc471856577130-1f52f12d-1ffb-463d-9d7e-ef89f412c1f2.png`

### Regular File Uploads

```
file_<hash>-sanitized.jpg
```

Example: `file_000000007af061f58e495c4cc9c32a33-sanitized.jpg`

## Investigation Steps

### Step 1: Open ChatGPT and Find a Voice Conversation

1. Go to https://chatgpt.com
2. Open a conversation that has voice messages (Advanced Voice or audio attachments)
3. Open Chrome DevTools (F12) → Network tab
4. Click on the audio message/playback

### Step 2: Look for File Download APIs

Watch for network requests that look like:

- `/backend-api/files/<file-id>/download`
- `/backend-api/conversation/<id>/files`
- `/files/download?file=<file-id>`
- Any request with response type `audio/wav` or `audio/webm`

### Step 3: Check Message Metadata

In the conversation API response (`/backend-api/conversation/<id>`):

- Look for `msg.metadata.voice` or `msg.metadata.audio`
- Check if there are file IDs in the message parts
- Look for `attachment` objects with `file_id` fields

### Step 4: Find File ID → Download URL Pattern

If you find a download endpoint, note:

- **Endpoint**: Full URL
- **Authentication**: Bearer token? Cookies?
- **Parameters**: What file ID format does it expect?
- **Response headers**: Content-Type, Content-Disposition

## API Endpoints to Test

Try these in the browser console while authenticated:

```javascript
// Get conversation with audio
const convId = '689f45b6-f6f0-8332-8f61-69c9e796073c'; // Known audio conversation
const token = '<your-access-token>';

// Fetch conversation details
const conv = await fetch(`https://chatgpt.com/backend-api/conversation/${convId}`, {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());

// Inspect message metadata
console.log(JSON.stringify(conv.mapping, null, 2));

// Look for file IDs in messages
Object.values(conv.mapping).forEach((node) => {
  if (node.message?.metadata) {
    console.log('Message metadata:', node.message.metadata);
  }
  if (node.message?.content?.parts) {
    console.log('Content parts:', node.message.content.parts);
  }
});
```

## Expected Findings

### Hypothesis 1: File Service Protocol

Files use `file-service://` or `sediment://` internal protocols that need conversion:

- Pattern: `file-service://<file-id>` → `https://chatgpt.com/backend-api/files/<file-id>/download`

### Hypothesis 2: Separate Files API

There's a dedicated files API:

- `/backend-api/files/<file-id>`
- `/backend-api/files/<file-id>/download`
- May require special permissions or scopes

### Hypothesis 3: Embedded Data URLs

Audio might be embedded as data URLs in specific message types:

- Check for `data:audio/wav;base64,` in content parts
- Voice messages might have separate storage

## Code Changes Needed

If we find downloadable URLs, update `src/providers/chatgpt/index.ts`:

1. **Add audio/voice attachment detection** (around line 428)
2. **Convert internal file IDs to download URLs** (around line 378-398)
3. **Handle file-service:// and sediment:// protocols**

Example:

```typescript
// Convert internal file service URLs to downloadable URLs
if (possibleUrl.startsWith('file-service://')) {
  const fileId = possibleUrl.replace('file-service://', '');
  possibleUrl = `https://chatgpt.com/backend-api/files/${fileId}/download`;
}
```

## Test Plan

After making changes:

1. Run archive on a conversation with voice messages
2. Verify audio files are downloaded
3. Run validation script again to compare coverage
4. Target: >80% media coverage (360+ files)
