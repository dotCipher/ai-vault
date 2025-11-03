# AI Vault Roadmap

## Future Enhancements

### Selectable Data Types for Import/Archive

**Priority:** Medium
**Status:** Planned

Allow users to selectively choose which types of data to process during import and archive operations, based on the provider's capabilities.

#### Description

Add command-line flags to the `import` and `archive` commands that enable users to specify which data types they want to include:

- `--with-messages` (default: true) - Include conversation messages
- `--with-media` (default: true) - Include media files (images, audio, video)
- `--with-artifacts` (default: true) - Include artifacts (code, HTML, documents with embedded content)
- `--media-types=<types>` - Specify specific media types: `images`, `audio`, `video`, `documents`

#### Use Cases

1. **Bandwidth-limited environments**: Skip media downloads to save bandwidth
2. **Storage optimization**: Import only messages for text analysis
3. **Selective archival**: Archive artifacts separately from media
4. **Privacy-focused imports**: Skip certain media types for compliance reasons
5. **Faster testing**: Quick imports during development/testing

#### Implementation Notes

- Providers should expose their capabilities via a `getSupportedDataTypes()` method
- CLI should validate requested data types against provider capabilities
- Storage layer should handle partial data gracefully
- Progress indicators should reflect what's being processed

#### Examples

```bash
# Archive only messages, skip all media
ai-vault archive claude --no-media --no-artifacts

# Import only messages and artifacts, skip images/videos
ai-vault import ~/export.zip --no-media

# Archive specific media types
ai-vault archive chatgpt --media-types=images,documents
```

## Completed Features

### Grok Provider - Pagination and Rate Limiting

**Status:** ✅ Completed (2025-11-03)

Successfully implemented comprehensive improvements for Grok conversation archiving:

#### Pagination Support

- Full conversation history retrieval with automatic pagination
- Iterates through all pages of `load-responses` endpoint
- Captures complete message history (tested: 2,373 messages vs. previous 60)
- Debug logging shows pagination progress

#### Rate Limiting Strategy

- Sequential downloads (concurrency = 1) for Grok provider
- 500ms delay between media downloads to avoid rate limits
- Exponential backoff retry: 5s, 10s, 20s (increased from 2s, 4s, 8s)
- Provider-specific concurrency control
- Significantly reduced HTTP 429 errors

#### Lazy Asset URL Resolution

- Only calls `/rest/assets/{id}` when direct download fails (404/403)
- Automatically resolves expired image URLs from Grok API
- Constructs proper URLs using `assets.grok.com` domain
- Minimizes extra API calls while handling stale URLs

#### Improved Error Handling

- Enhanced temp file uniqueness (8 random bytes vs. 4)
- Better temp file cleanup on download failures
- Improved stream error handling to prevent race conditions
- Detailed ENOENT diagnostics for troubleshooting
- Automatic partial file cleanup on errors

### Claude Provider - Artifact Extraction

**Status:** ✅ Completed (2025-11-01)

Successfully implemented artifact extraction for Claude conversations:

- Artifacts are extracted from `tool_use` content blocks
- Saved as separate files (.html, .jsx, .py, .svg, .mmd) alongside conversations
- Both import and archive operations support artifact extraction
- Validation confirmed perfect parity between archive and import
