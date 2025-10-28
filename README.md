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

## ✨ Features

### Supported Platforms

| Platform            | Status         | API Support | Web Scraping | Media Download |
| ------------------- | -------------- | ----------- | ------------ | -------------- |
| **Grok (grok.com)** | 🚧 In Progress | ❌          | ✅           | ✅             |
| **Grok on X**       | 🚧 In Progress | ❌          | ✅           | ✅             |
| **ChatGPT**         | 📋 Planned     | ✅          | ✅           | ✅             |
| **Claude**          | 📋 Planned     | ✅          | ✅           | ✅             |
| **Gemini**          | 📋 Planned     | ⚠️ Partial  | ✅           | ✅             |
| **Perplexity**      | 📋 Planned     | ❌          | ✅           | ✅             |

**Note:** Grok has two separate providers due to separate account systems:

- `grok-web`: Standalone grok.com platform (cookies authentication)
- `grok-x`: X-integrated Grok at x.com/grok (cookies authentication)

### Smart Features

- **Native Import Support** - Import from official platform exports (Grok, ChatGPT, Claude)
- **Incremental Backups** - Only fetch new/updated conversations
- **Media Deduplication** - Don't store the same image twice
- **Flexible Scheduling** - Daily, weekly, or custom cron expressions
- **Rich Export Formats** - JSON + Markdown for maximum compatibility
- **Automatic Cookie Management** - Extract session cookies from your browser
- **Filtering & Targeting** - Date ranges, conversation importance, custom queries

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
ai-vault archive

# Schedule automated backups
ai-vault schedule --daily

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

1. Install [Cookie-Editor](https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm) extension
2. Go to the provider's website and log in (e.g., grok.com)
3. Click Cookie-Editor → Export → JSON
4. Save to a file
5. Run `ai-vault setup --cookies-file <path>`

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

### Import from Native Exports

Many platforms offer one-time data exports. AI Vault can import these and convert to its standardized format:

```bash
# Import from Grok's native export
ai-vault import --provider grok-web --file ~/Downloads/grok-export/

# Import with custom output directory
ai-vault import --provider grok-web --file ~/Downloads/grok-export/ --output ~/Dropbox/AI-Backups

# Skip confirmation prompt
ai-vault import --provider grok-web --file ~/Downloads/grok-export/ --yes
```

**Supported import formats:**

- **Grok**: Export from grok.com → Profile → Data & Privacy → Download your data
- **ChatGPT**: _(coming soon)_ Export from settings → Data controls → Export data
- **Claude**: _(coming soon)_ Export from settings

**Why import vs scraping?**

- ✅ Faster - no web automation needed
- ✅ More reliable - uses official export format
- ✅ Complete data - includes metadata that might not be visible in UI
- ✅ Works alongside automated scraping for incremental updates

### Schedule Automated Backups

```bash
# Set up daily backups
ai-vault schedule --daily

# Custom cron expression
ai-vault schedule --cron "0 2 * * *"  # Every day at 2 AM

# View scheduled jobs
ai-vault schedule --list
```

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
│   ├── conversations/
│   │   └── conv-123/
│   │       ├── conversation.json
│   │       └── conversation.md
│   ├── media/
│   │   ├── images/
│   │   ├── videos/
│   │   └── documents/
│   ├── index.json
│   └── media-registry.json
├── grok-x/            # X-integrated Grok conversations
│   └── ... (same structure)
├── chatgpt/
└── claude/
```

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

- [x] Project setup and architecture
- [x] Native import support (Grok ✓, ChatGPT & Claude coming soon)
- [x] Storage layer with JSON + Markdown export
- [x] Media downloader with SHA256 deduplication
- [ ] Grok provider (API + scraping) - in progress
- [ ] ChatGPT provider (import + scraping)
- [ ] Claude provider (import + scraping)
- [ ] Smart filtering system
- [ ] Scheduling with cron/launchd
- [ ] Gemini provider
- [ ] Perplexity provider
- [ ] Export to knowledge management tools (Obsidian, Notion)
- [ ] Search across all archived conversations
- [ ] Web UI for browsing archives

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
