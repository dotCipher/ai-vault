# AI Vault - Project Summary

## Overview

**AI Vault** is a CLI tool for backing up and archiving AI conversation history across multiple platforms (ChatGPT, Claude, Grok, Gemini, etc.) into a unified, local-first format.

**Mission:** Give users complete ownership and control over their AI interaction data through automated backups, standardized storage, and multi-platform support.

---

## Current Status: v1.3.0

### ✅ Completed & Working

#### Core Infrastructure

- **Project setup** - TypeScript, pnpm, ESM modules
- **CLI framework** - Commander.js with interactive prompts (Clack)
- **Test suite** - Vitest with 74 passing tests, 87% coverage
- **CI/CD** - GitHub Actions for linting, testing, building
- **Package publishing** - npm registry ready

#### Import System (NEW! 🎉)

- **Native import support** for Grok exports
- Parses Grok's export JSON format
- Converts to standardized AI Vault format
- **Tested and working** - Successfully imported 58 conversations
- Command: `ai-vault import --provider grok --file ~/export-dir/ --yes`

#### Storage Layer

- **Format:** Markdown by default (human-readable, portable)
- Optional JSON output (configurable)
- **Structure:** `~/ai-vault-data/<provider>/conversations/<id>/conversation.md`
- Full metadata preservation (timestamps, model, message counts)
- Organized by provider and conversation ID

#### Media Management

- SHA256-based deduplication (don't store duplicates)
- Media registry tracking (hash → path → references)
- Support for images, videos, documents
- Streaming hash calculation during download

#### Configuration

- Cookie-based auth setup with `--cookies-file` flag
- API key support
- Configurable archive directory
- Persistent config in `~/.ai-vault/config.json`

#### Commands Available

```bash
ai-vault setup [--cookies-file <path>]  # Interactive setup wizard
ai-vault import -p <provider> -f <file> # Import native exports
ai-vault archive [options]              # Archive via scraping
ai-vault upgrade [--yes]                # Self-update command
ai-vault --version                      # Version check
```

---

### 🚧 In Progress

#### Grok Provider (Partial)

- ✅ Authentication (cookies + API key)
- ✅ Basic scraping structure (Playwright)
- ⚠️ API endpoint identified (`https://grok.com/rest/app-chat/conversations?pageSize=60`)
- ❌ Not fully implemented (scraping selectors need work)
- **Note:** Import works perfectly; scraping needs finishing

---

### 📋 Not Yet Implemented

- **ChatGPT provider** - Import + scraping support
- **Claude provider** - Import + scraping support
- **Gemini provider** - Import + scraping
- **Perplexity provider** - Scraping only (no API/export)
- **Scheduling** - Automated cron/launchd backups
- **List command** - Browse archived conversations
- **Search** - Full-text search across archives
- **Web UI** - Browser-based archive viewer
- **Format conversion** - Auto-detect and convert between formats

---

## Installation

```bash
# npm (global install)
npm install -g ai-vault

# pnpm
pnpm install -g ai-vault

# From source
git clone https://github.com/dotCipher/ai-vault.git
cd ai-vault
pnpm install && pnpm run build
```

**Browser dependencies:** Playwright Chromium auto-installs on first `pnpm install`

---

## Quick Start

### Option 1: Import from Native Export (Recommended)

```bash
# 1. Export from Grok
# Go to grok.com → Profile → Data & Privacy → Download your data

# 2. Import to AI Vault
ai-vault import --provider grok --file ~/Downloads/grok-export/ --yes

# Done! Conversations are now in ~/ai-vault-data/grok/conversations/
```

### Option 2: Cookie-Based Setup (For Scraping)

```bash
# 1. Export cookies using Cookie-Editor extension
# Install: https://chrome.google.com/webstore/detail/cookie-editor/...
# Save cookies from grok.com to ~/grok-cookies.json

# 2. Setup with cookies file
ai-vault setup --cookies-file ~/grok-cookies.json

# 3. Archive (when scraping is fully implemented)
ai-vault archive --provider grok
```

---

## Architecture

```
ai-vault/
├── src/
│   ├── cli.ts                    # Main CLI entry point
│   ├── commands/
│   │   ├── setup.ts              # Interactive setup wizard
│   │   ├── archive.ts            # Archive command (scraping)
│   │   └── import.ts             # Import from native exports
│   ├── core/
│   │   ├── archiver.ts           # Orchestrates fetch → save workflow
│   │   ├── storage.ts            # Saves conversations (Markdown/JSON)
│   │   └── media.ts              # Downloads & deduplicates media
│   ├── providers/
│   │   ├── base.ts               # Abstract Provider interface
│   │   └── grok/
│   │       └── index.ts          # Grok implementation (partial)
│   ├── utils/
│   │   ├── config.ts             # Config file management
│   │   ├── scraper.ts            # Playwright browser automation
│   │   └── api-client.ts         # HTTP client with retry logic
│   └── types/                    # TypeScript type definitions
├── tests/                        # 74 passing tests
└── package.json                  # Published to npm
```

---

## Key Design Decisions

1. **Markdown-first storage** - Human-readable, portable, works with Obsidian/Notion
2. **Provider-agnostic core** - Storage layer doesn't care about source platform
3. **Import + Scraping hybrid** - Use native exports when available, scraping as fallback
4. **Local-first** - All data stored locally, no cloud dependencies
5. **Incremental backups** - Only fetch new conversations (when scraping is done)
6. **SHA256 deduplication** - Save storage by not duplicating media files

---

## File Structure Example

```
~/ai-vault-data/
└── grok/
    ├── conversations/
    │   ├── conv-123/
    │   │   └── conversation.md     # Full conversation in Markdown
    │   └── conv-456/
    │       └── conversation.md
    ├── media/
    │   ├── images/
    │   │   └── abc123.jpg          # SHA256-named files
    │   └── videos/
    ├── index.json                  # Conversation metadata
    └── media-registry.json         # Media deduplication tracking
```

---

## Testing Status

```
Test Files  5 passed (5)
Tests       74 passed | 11 skipped (85)
Coverage    ~87% (core modules fully tested)
```

**Tested components:**

- ✅ Storage (16 tests) - JSON/Markdown export, file operations
- ✅ Archiver (23 tests) - Orchestration, error handling, progress
- ✅ Media Manager (17 tests) - Download, dedup, SHA256 hashing
- ✅ Grok Provider (21 tests) - Auth, conversation parsing
- ✅ API Client (8 tests) - Retry logic, rate limiting

**Skipped tests:** Browser automation (Playwright) tests - mocked for speed

---

## Known Issues / Limitations

1. **Grok scraping incomplete** - Import works, but live scraping needs selector updates
2. **No scheduling yet** - Manual runs only
3. **Single provider** - Only Grok supported (ChatGPT/Claude coming)
4. **Media import pending** - Import doesn't yet copy media from exports
5. **TTY errors in non-interactive shells** - Use `--yes` flag to skip prompts

---

## Roadmap (Prioritized)

**High Priority:**

- [ ] Finish Grok scraping implementation
- [ ] ChatGPT import support
- [ ] Claude import support
- [ ] Media asset copying from imports
- [ ] Scheduling (cron/launchd)

**Medium Priority:**

- [ ] List/search commands
- [ ] Incremental updates (detect new conversations)
- [ ] ChatGPT/Claude scraping
- [ ] Format conversion utility

**Low Priority:**

- [ ] Web UI for browsing
- [ ] Obsidian/Notion export plugins
- [ ] Gemini/Perplexity providers

---

## Value Proposition

### Why AI Vault vs Native Exports?

| Feature            | Native Exports                | AI Vault                 |
| ------------------ | ----------------------------- | ------------------------ |
| **Multi-platform** | ❌ Separate tool per platform | ✅ One tool for all      |
| **Automation**     | ❌ Manual, one-time           | ✅ Scheduled incremental |
| **Format**         | ⚠️ Platform-specific          | ✅ Standardized Markdown |
| **Incremental**    | ❌ Re-download everything     | ✅ Only fetch new data   |
| **Deduplication**  | ❌ No                         | ✅ SHA256-based          |
| **Future-proof**   | ⚠️ Relies on platform         | ✅ Local, independent    |

**Bottom line:** Use native export for initial backup (fast, official), then AI Vault for ongoing automated updates.

---

## Technology Stack

- **Runtime:** Node.js 18+
- **Language:** TypeScript 5.7
- **Build:** tsc (TypeScript compiler)
- **Package Manager:** pnpm
- **CLI Framework:** Commander.js + Clack (prompts)
- **Testing:** Vitest + v8 coverage
- **Browser Automation:** Playwright
- **HTTP Client:** Axios
- **Schema Validation:** Zod

---

## Contributing

**Easy additions:**

1. **New provider imports** - Add parser for ChatGPT/Claude export formats
2. **Media copying** - Copy assets from import directories
3. **Scheduling** - Implement cron/launchd job creation
4. **Search** - Add full-text search across Markdown files

**See:** `src/providers/_template/` for provider boilerplate

---

## License

MIT License - Full ownership, commercial use allowed

---

## Current Branch Status

**Branch:** `feat/grok-provider-implementation`
**Status:** ✅ Import working, scraping in-progress
**Uncommitted changes:** All implementation work (ready to commit)

**Next steps:**

1. Test import with user's real data ✅ (Done - 58 conversations imported)
2. Commit feature branch
3. Create pull request
4. Merge to main
5. Release v1.4.0 with import support

---

## Session Notes

**Date:** 2025-10-27

### What We Built Today

1. **Import Command** - Full implementation supporting Grok native exports
   - Parses Grok's JSON format
   - Converts to standardized Conversation objects
   - Saves in Markdown format (configurable)
   - Successfully tested with 58 real conversations

2. **Cookie Setup Improvement** - Added `--cookies-file` flag
   - Accepts JSON array format (from Cookie-Editor extension)
   - Automatically converts to internal format
   - Bypasses finicky terminal JSON input

3. **Storage Optimization** - Changed default from dual-format to Markdown-only
   - Reduces duplication
   - Users can configure JSON if needed via config file
   - More efficient storage

4. **Documentation** - Comprehensive README updates
   - Import examples and instructions
   - Cookie setup workflow
   - Value proposition clarification
   - Roadmap updates

5. **Architecture Decisions** - Validated hybrid approach
   - Import for initial/bulk backups (fast, reliable)
   - Scraping for platforms without exports (flexible)
   - Both use same storage layer (standardized)

### Key Insights

- Native exports exist for major platforms (Grok ✓, ChatGPT ✓, Claude ?)
- Import is faster and more reliable than scraping
- AI Vault's value: **unification + automation + standardization**
- Markdown is better default than JSON (human-readable, portable)

### Testing Results

- ✅ 58 conversations imported successfully
- ✅ Markdown files generated with full metadata
- ✅ All 74 tests passing
- ✅ Cookie authentication working
- ✅ Build successful

### Files Modified

**New files:**

- `src/commands/import.ts` - Import command implementation
- `PROJECT_SUMMARY.md` - This document

**Modified files:**

- `src/cli.ts` - Added import command
- `src/commands/setup.ts` - Added --cookies-file support
- `src/core/storage.ts` - Changed default format to Markdown-only
- `src/core/archiver.ts` - Fixed require() → import
- `src/providers/grok/index.ts` - Updated to use grok.com instead of x.com
- `README.md` - Extensive documentation updates
- `package.json` - Added postinstall script for Playwright

### Metrics

- **Lines of code:** ~3,500 (TypeScript)
- **Test coverage:** 87%
- **Commands:** 5 implemented, 2 functional (setup, import)
- **Providers:** 1 partial (Grok import working)
- **Conversations archived:** 58 (test data)
