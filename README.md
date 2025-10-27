# 🏛️ AI Vault

**Own your data.** Open-source CLI tool for automated archival of AI conversations across multiple platforms.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

## 🎯 Mission

Your AI conversations are valuable. They contain your thoughts, research, creative work, and problem-solving. But they live in silos, controlled by different companies, subject to data loss or policy changes.

**AI Vault** gives you back control with:

- 🔄 **Automated daily backups** - Set it and forget it
- 🎯 **Smart targeting** - Archive what matters, skip the noise
- 📦 **Multi-platform support** - ChatGPT, Claude, Grok, Gemini, and more
- 🖼️ **Media preservation** - Images, videos, diagrams with deduplication
- 🏠 **Local-first** - Your data stays on your machine
- 🔌 **Plugin architecture** - Easy to extend with new providers

## ✨ Features

### Supported Platforms

| Platform        | Status         | API Support | Web Scraping | Media Download |
| --------------- | -------------- | ----------- | ------------ | -------------- |
| **Grok (X.AI)** | 🚧 In Progress | ✅          | ✅           | ✅             |
| **ChatGPT**     | 📋 Planned     | ✅          | ✅           | ✅             |
| **Claude**      | 📋 Planned     | ✅          | ✅           | ✅             |
| **Gemini**      | 📋 Planned     | ⚠️ Partial  | ✅           | ✅             |
| **Perplexity**  | 📋 Planned     | ❌          | ✅           | ✅             |

### Smart Features

- **Incremental Backups** - Only fetch new/updated conversations
- **Media Deduplication** - Don't store the same image twice
- **Flexible Scheduling** - Daily, weekly, or custom cron expressions
- **Rich Export Formats** - JSON, Markdown, HTML with metadata
- **Automatic Cookie Management** - Extract session cookies from your browser
- **Filtering & Targeting** - Date ranges, conversation importance, custom queries

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Interactive setup wizard
npm run dev setup

# Run your first archive
npm run dev archive

# Schedule automated backups
npm run dev schedule
```

## 📖 Usage

### Setup

```bash
ai-vault setup
```

The interactive wizard will:

1. Choose which AI platforms to archive
2. Configure authentication (API keys or browser cookies)
3. Set your backup preferences
4. Choose export formats

### Archive Now

```bash
# Archive all configured platforms
ai-vault archive

# Archive specific platform
ai-vault archive --provider grok

# Archive with date filter
ai-vault archive --since 2025-01-01

# Dry run (see what would be archived)
ai-vault archive --dry-run
```

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

## 🏗️ Architecture

AI Vault uses a **plugin-based provider architecture** that makes it easy to add new AI platforms:

```
src/
├── providers/          # Pluggable AI platform providers
│   ├── base.ts        # Abstract Provider interface
│   ├── grok/          # Grok (X.AI) implementation
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
- [ ] Grok provider (API + scraping)
- [ ] ChatGPT provider
- [ ] Claude provider
- [ ] Media downloader with deduplication
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
