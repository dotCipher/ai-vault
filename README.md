# 🏛️ AI Vault

**Own your data.** Open-source CLI tool for comprehensive archival of AI interactions—conversations, generated images, videos, code artifacts, and all metadata—across multiple platforms.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

## 🎯 Mission

Your AI interactions are valuable assets. They contain your thoughts, research, creative work, problem-solving, generated media, and code artifacts. But they live in siloed platforms, controlled by different companies, subject to data loss, policy changes, or account restrictions.

**AI Vault** gives you back complete control with:

- 🔄 **Automated daily backups** - Set it and forget it
- 🎯 **Smart targeting** - Archive what matters, skip the noise
- 📦 **Multi-platform support** - ChatGPT, Claude, Grok, Gemini, and more
- 🖼️ **Complete media preservation** - Images, videos, diagrams, code artifacts with intelligent deduplication
- 📝 **Full conversation history** - Every message, timestamp, metadata, and context
- 🏠 **Local-first** - Your data stays on your machine, encrypted and secure
- 🔌 **Plugin architecture** - Easy to extend with new providers

---

> ### 🏆 **Archive > Export**
>
> **Our archive feature can capture MORE data than some providers' native exports.**
>
> In benchmarks performed November 2025, we found that AI Vault's archive functionality retrieved **5x more media files** (166 vs 33) compared to a major provider's official export feature. While native exports are useful for quick imports, our live archiving directly from APIs ensures you get:
>
> - ✅ Complete media libraries (all images, files, and generated content)
> - ✅ Real-time metadata and conversation state
> - ✅ Workspace/project hierarchy information
> - ✅ Assets that may not be included in ZIP exports
>
> **Recommendation:** Use `archive` for comprehensive backups, `import` for quick migration from official exports.

---

## ✨ Features

### Supported Platforms

| Platform            | Status      | Native Import | Backend API | Media Download |
| ------------------- | ----------- | ------------- | ----------- | -------------- |
| **Grok (grok.com)** | ✅ Complete | ✅            | ✅          | ✅             |
| **Grok on X**       | ✅ Complete | ❌            | ✅          | ✅             |
| **ChatGPT**         | ✅ Complete | ✅            | ✅          | ✅             |
| **Claude**          | 📋 Planned  | ✅            | ✅          | ✅             |
| **Gemini**          | 📋 Planned  | ✅            | ✅          | ✅             |
| **Perplexity**      | 📋 Planned  | ❌            | ✅          | ✅             |

**Note:** Grok has two separate providers due to separate account systems:

- `grok-web`: Standalone grok.com platform (cookies authentication)
- `grok-x`: X-integrated Grok at x.com/grok (cookies authentication)

### Smart Features

- **Native Import Support** - Import from official platform exports (ZIP files or unpacked directories) with automatic provider detection
- **Complete Media Preservation** - Downloads images, DALL-E generations, videos, and documents
  - _Note: Audio from voice conversations is not available through most provider APIs (e.g., Grok, ChatGPT)_
- **Hierarchical Organization** - Platform-agnostic workspace/project tracking with automatic disk reorganization when conversations move
- **Smart Diff Archiving** - Automatically detects and re-archives updated conversations via timestamp comparison
- **Incremental Backups** - Only fetch new/updated conversations, skip unchanged ones
- **Status Checking** - Preview what's new, updated, or moved before archiving
- **Media Deduplication** - SHA-256 based deduplication prevents storing the same media twice
- **Flexible Scheduling** - Daily, weekly, or custom cron expressions (native OS schedulers, no daemon required)
- **Rich Export Formats** - JSON + Markdown for maximum compatibility and portability
- **Filtering & Targeting** - Date ranges, search queries, conversation limits, specific conversation IDs
- **Provider-Specific Features** - Assets library archiving (Grok), workspace/project metadata (Grok, ChatGPT)

## 📦 Installation

### Quick Install (All Platforms)

```bash
curl -fsSL https://raw.githubusercontent.com/dotCipher/ai-vault/main/install.sh | bash
```

Or with wget:

```bash
wget -qO- https://raw.githubusercontent.com/dotCipher/ai-vault/main/install.sh | bash
```

### Package Managers

**npm (All Platforms)**

```bash
npm install -g ai-vault
```

**pnpm (All Platforms)**

```bash
pnpm install -g ai-vault
```

**Homebrew (macOS)**

```bash
brew install node@22
npm install -g ai-vault
```

_Coming soon: Direct Homebrew tap for native installation without Node.js_

### From Source (Development)

```bash
git clone https://github.com/dotCipher/ai-vault.git
cd ai-vault
pnpm install && pnpm run build
```

### Updating

**Built-in upgrade command (recommended)**

```bash
ai-vault upgrade
# or
ai-vault update

# Skip confirmation prompt
ai-vault upgrade --yes
```

**Manual update**

```bash
npm update -g ai-vault
# or
pnpm update -g ai-vault
```

**Homebrew (once tap is available)**

```bash
brew upgrade ai-vault
```

**Check current version**

```bash
ai-vault --version
# or
ai-vault -v
```

### Uninstalling

**npm/pnpm**

```bash
npm uninstall -g ai-vault
# or
pnpm uninstall -g ai-vault
```

**Homebrew (once tap is available)**

```bash
brew uninstall ai-vault
```

**Remove configuration and data** (optional)

```bash
# macOS/Linux
rm -rf ~/.config/ai-vault
rm -rf ~/ai-vault-data

# Windows
rmdir /s %APPDATA%\ai-vault
rmdir /s %USERPROFILE%\ai-vault-data
```

## 🚀 Quick Start

```bash
# Interactive setup wizard
ai-vault setup

# Option 1: Import from native export (fastest way to start)
ai-vault import --provider grok-web --file ~/Downloads/grok-export/ --yes

# Option 2: Archive via automated scraping
# Check what's new or updated first
ai-vault status

# Archive all new and updated conversations
ai-vault archive

# Schedule automated backups
ai-vault schedule add

# List archived conversations
ai-vault list

# Check for updates
ai-vault upgrade
```

## 📖 Usage

### Setup

```bash
# Interactive setup
ai-vault setup

# Setup with cookies from file (easier for cookie-based auth)
ai-vault setup --cookies-file ~/Downloads/cookies.json
```

**For cookie-based authentication:**

1. Go to the provider's website and log in:
   - **grok-web**: grok.com
   - **grok-x**: x.com/grok
   - **chatgpt**: chatgpt.com
2. Open Chrome DevTools (F12 or Cmd+Option+I)
3. Go to Application tab → Cookies → Select the site
4. Copy the cookie values you need (varies by provider)
5. Run `ai-vault setup` and enter cookies when prompted

Alternatively, you can export cookies to a JSON file and use `ai-vault setup --cookies-file <path>`

The interactive wizard will:

1. Choose which AI platforms to archive
2. Configure authentication (API keys or browser cookies)
3. Set your archive directory (default: `~/ai-vault-data`)
4. Test your connection

### Archive Now

```bash
# Archive all configured platforms
ai-vault archive

# Archive specific platform
ai-vault archive --provider grok-web

# Archive with date filter
ai-vault archive --since 2025-01-01

# Archive with custom output directory
ai-vault archive --output ~/Dropbox/AI-Backups
ai-vault archive -o /mnt/external/backups

# Limit number of conversations
ai-vault archive --limit 10

# Skip media downloads (faster, text only)
ai-vault archive --skip-media

# Dry run (see what would be archived)
ai-vault archive --dry-run
```

**Performance**: AI Vault automatically uses parallel processing with smart concurrency based on your hardware and provider constraints. Typical performance is 3-10x faster than sequential processing.

### Check Archive Status

Preview what's new or updated before archiving:

```bash
# Check status for all configured platforms
ai-vault status

# Check specific platform
ai-vault status --provider chatgpt

# Check with filters
ai-vault status --since 2025-01-01 --limit 50
```

The status command shows:

- **New conversations** not yet archived (marked with +)
- **Updated conversations** that changed remotely since last archive (marked with ○)
- **Hierarchy changes** conversations moved between workspaces/projects (marked with →)
- **Already archived** conversations that are up-to-date (marked with ✓)

This helps you preview what will be downloaded before running `ai-vault archive`.

### Import from Native Exports

Many platforms offer one-time data exports. AI Vault can import these and convert to its standardized format:

```bash
# Auto-detect provider from export (recommended)
ai-vault import --file ~/Downloads/chatgpt-export.zip --yes

# Import from unpacked directory
ai-vault import --file ~/Downloads/grok-export/

# Import with custom output directory
ai-vault import --file ~/Downloads/export.zip --output ~/Dropbox/AI-Backups

# Manually specify provider (optional)
ai-vault import --provider grok-web --file ~/Downloads/grok-export/

# Skip confirmation prompt
ai-vault import --file ~/Downloads/export.zip --yes
```

**Supported import formats:**

- **ChatGPT**: Export from settings → Data controls → Export data
  - Supports ZIP files and unpacked directories
  - Automatically imports all media (images, DALL-E generations, audio)
  - Provider auto-detected from `conversations.json`
- **Grok (grok.com)**: Export from grok.com → Profile → Data & Privacy → Download your data
  - Use `--provider grok-web` for standalone Grok conversations
  - Supports ZIP files and unpacked directories
- **Grok on X**: Export from x.com/grok (if available)
  - Use `--provider grok-x` for X-integrated Grok conversations
- **Claude**: _(coming soon)_ Export from settings

### Schedule Automated Backups

AI Vault uses native OS schedulers (cron on Unix, Task Scheduler on Windows) for automated backups. No long-running daemon required!

```bash
# Add a new schedule (interactive)
ai-vault schedule add

# Add schedule with options
ai-vault schedule add --provider grok-web --cron "0 2 * * *" --description "Daily Grok backup"

# List all schedules
ai-vault schedule list
# or simply
ai-vault schedule

# Show detailed status (includes system scheduler info)
ai-vault schedule status

# Remove a schedule
ai-vault schedule remove --id abc123

# Enable/disable schedules
ai-vault schedule enable --id abc123
ai-vault schedule disable --id abc123

# Advanced options
ai-vault schedule add \
  --provider grok-web \
  --cron "0 */6 * * *" \
  --limit 100 \
  --since-days 7 \
  --skip-media
```

**Schedule Options:**

- `--cron`: Cron expression (e.g., `"0 2 * * *"` for daily at 2 AM)
- `--limit`: Maximum conversations per run
- `--since-days`: Only archive conversations from last N days
- `--skip-media`: Skip downloading media files

**Logs:** Scheduled runs write logs to `~/.ai-vault/logs/<schedule-id>.log`

### List Archived Conversations

```bash
# List all archived conversations
ai-vault list

# Filter by provider
ai-vault list --provider chatgpt

# Search by keyword
ai-vault list --search "machine learning"
```

## ⚙️ Configuration

### File Locations

**Configuration file:** `~/.ai-vault/config.json`

```json
{
  "version": "1.0.0",
  "providers": {
    "grok-web": {
      "providerName": "grok-web",
      "authMethod": "cookies",
      "cookies": {
        "auth_token": "your-session-cookie"
      }
    }
  },
  "settings": {
    "archiveDir": "~/ai-vault-data"
  }
}
```

**Default archive directory:** `~/ai-vault-data`

```
~/ai-vault-data/
├── grok-web/          # Standalone grok.com conversations
│   ├── conversations/ # Unorganized conversations (fallback)
│   │   └── conv-123/
│   │       ├── conversation.json
│   │       └── conversation.md
│   ├── workspaces/    # Hierarchically organized conversations
│   │   └── workspace-abc/
│   │       ├── conversations/
│   │       │   └── conv-456/    # Workspace-level conversation
│   │       │       ├── conversation.json
│   │       │       └── conversation.md
│   │       └── projects/
│   │           └── project-xyz/
│   │               ├── conversations/
│   │               │   └── conv-789/   # Project-level conversation
│   │               │       ├── conversation.json
│   │               │       └── conversation.md
│   │               ├── project.json
│   │               ├── project.md
│   │               └── files/
│   │                   └── code-file.py
│   ├── assets/        # Assets library (images, docs, code, etc.)
│   │   ├── assets-index.json
│   │   └── by-type/
│   │       ├── image/
│   │       ├── video/
│   │       ├── audio/
│   │       ├── document/
│   │       ├── code/
│   │       └── data/
│   ├── media/
│   │   ├── images/
│   │   ├── videos/
│   │   └── documents/
│   ├── index.json           # Includes hierarchy metadata
│   ├── hierarchy-index.json # Fast hierarchy lookups
│   └── media-registry.json
├── chatgpt/           # ChatGPT conversations
│   ├── conversations/ # Unorganized conversations
│   ├── workspaces/    # Project-organized conversations
│   │   └── project-name/
│   │       └── conversations/
│   └── ...
├── grok-x/            # X-integrated Grok conversations
│   └── ... (same structure as grok-web)
└── claude/
```

**Structure Explanation:**

- **conversations/**: Flat storage for conversations without workspace/project organization
- **workspaces/**: Hierarchical organization matching platform structure (Grok workspaces, ChatGPT projects)
  - Conversations are automatically organized by their workspace/project membership
  - Supports nested projects within workspaces
  - Files are automatically reorganized when conversations move between workspaces/projects
- **assets/**: Standalone assets library organized by type (images, documents, code, etc.)
- **media/**: Downloaded media files (images, videos, documents) with SHA-256 deduplication
- **index.json**: Quick lookup index for conversations with hierarchy metadata
- **hierarchy-index.json**: Fast workspace/project hierarchy lookups
- **media-registry.json**: Tracks media files and prevents duplicates

**Hierarchy Support by Provider:**

- **Grok (grok-web)**: ✅ Full workspace and project tracking
- **ChatGPT**: ✅ Project tracking
- **Grok on X (grok-x)**: ❌ No hierarchy (flat structure)
- **Claude**: 📋 Planned
- **Gemini**: 📋 Planned
- **Perplexity**: 📋 Planned

### Customizing Archive Directory

**Three ways to set the output directory** (in priority order):

1. **CLI option** (per-command override):

   ```bash
   ai-vault archive --output ~/Dropbox/AI-Backups
   ai-vault archive -o /mnt/external/backups
   ```

2. **Config file** (persistent setting):
   Manually edit `~/.ai-vault/config.json`:

   ```json
   {
     "settings": {
       "archiveDir": "~/Documents/my-ai-archives"
     }
   }
   ```

   Or set during `ai-vault setup`

3. **Default**: `~/ai-vault-data` (if nothing configured)

### Export Format

Conversations are saved in **Markdown** by default:

- Human-readable and portable
- Works with Obsidian, Notion, VS Code, and any text editor
- Includes full conversation text + metadata

To change the format, edit `~/.ai-vault/config.json`:

```json
{
  "settings": {
    "formats": ["markdown"] // Options: "markdown", "json", or both ["markdown", "json"]
  }
}
```

## 🏗️ Architecture

AI Vault uses a **plugin-based provider architecture** that makes it easy to add new AI platforms:

```
src/
├── providers/          # Pluggable AI platform providers
│   ├── base.ts        # Abstract Provider interface
│   ├── grok-web/      # Grok (grok.com) implementation
│   ├── grok-x/        # Grok on X (x.com/grok) implementation
│   ├── chatgpt/       # ChatGPT implementation
│   └── claude/        # Claude implementation
├── core/              # Core archival logic
│   ├── archiver.ts    # Main archival orchestration
│   ├── storage.ts     # Local storage management
│   ├── media.ts       # Media download & dedup
│   └── scheduler.ts   # Backup scheduling
├── cli/               # CLI commands
└── types/             # Shared TypeScript types
```

See [ARCHITECTURE.md](docs/architecture.md) for details.

## 🤝 Contributing

We welcome contributions! Whether you want to:

- Add support for a new AI platform
- Improve existing providers
- Add features or fix bugs
- Improve documentation

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Adding a New Provider

Adding a new AI platform takes ~30 minutes:

1. Copy `src/providers/_template/` to your new provider
2. Implement the `Provider` interface
3. Add authentication method
4. Implement conversation fetching
5. Add tests and documentation

See [docs/providers.md](docs/providers.md) for a detailed guide.

## 📋 Roadmap

### Completed ✅

- [x] Project setup and architecture
- [x] Storage layer with JSON + Markdown export
- [x] Media downloader with SHA256 deduplication
- [x] ZIP import support - Import directly from ZIP files or unpacked directories
- [x] Provider auto-detection from export file structure
- [x] Complete media preservation (images, DALL-E generations, audio, video)
- [x] Native import support:
  - [x] **Grok**: Import from official grok.com exports with media
  - [x] **ChatGPT**: Import from official OpenAI exports with media
- [x] Grok provider - two separate implementations:
  - [x] **grok-web**: Standalone grok.com (cookies + scraping)
    - [x] Conversation archiving with full message history
    - [x] Assets library archiving (images, documents, code, etc.)
    - [x] Workspaces and projects archiving with file preservation
  - [x] **grok-x**: X-integrated Grok at x.com/grok (cookies + scraping)
- [x] ChatGPT provider:
  - [x] **Native import**: From conversations.json exports
  - [x] **Web scraping**: Cookie-based authentication via backend API
  - [x] **Media support**: Images (uploaded & DALL-E), videos, documents
  - [x] **Backend API integration**: Reliable conversation fetching with full attachment metadata
- [x] Smart filtering system:
  - [x] Date range filtering (since/until)
  - [x] Search query filtering (title/preview)
  - [x] Conversation limit controls
  - [x] List command for browsing before archiving
  - [x] Status command for previewing changes before archiving
- [x] Smart diff archiving:
  - [x] Timestamp-based change detection (platform-agnostic)
  - [x] Automatic re-archiving of updated conversations
  - [x] Skip unchanged conversations for efficiency
  - [x] 1-second tolerance for timestamp rounding
- [x] Scheduling system:
  - [x] Platform-agnostic (cron on Unix, Task Scheduler on Windows)
  - [x] Full CRUD operations (add, list, remove, enable, disable)
  - [x] Per-provider schedule configuration
  - [x] Logging infrastructure
- [x] Hierarchy tracking:
  - [x] Platform-agnostic workspace/project tracking
  - [x] Automatic disk reorganization when conversations move
  - [x] Hierarchy change detection in status command
  - [x] Grok workspace and project support
  - [x] ChatGPT project support

### In Progress 🚧

- [ ] Additional provider implementations:
  - [ ] Claude provider (import + scraping)
  - [ ] Gemini provider (import + scraping)
  - [ ] Perplexity provider (scraping)

**Note:** API support refers to native import from official platform exports, not API-based conversation retrieval (which most platforms don't provide).

### Planned 📋

- [ ] Export to knowledge management tools (Obsidian, Notion, Roam)
- [ ] Full-text search across all archived conversations
- [ ] Web UI for browsing and exploring archives
- [ ] Conversation analytics and insights
- [ ] Automatic tagging and categorization

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Built with:

- [Playwright](https://playwright.dev/) - Web automation
- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [Clack](https://github.com/natemoo-re/clack) - Interactive prompts
- [Zod](https://zod.dev/) - Schema validation

---

**Remember:** Your data is yours. Keep it safe. 🏛️
