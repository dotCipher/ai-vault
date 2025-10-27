# Contributing to AI Vault

Thank you for your interest in contributing to AI Vault! This document provides guidelines and instructions for contributing.

## 🎯 Project Vision

AI Vault's mission is to give users sovereignty over their AI conversation data. We prioritize:

1. **Privacy First** - Data stays local, no telemetry without explicit consent
2. **Ease of Use** - CLI should be intuitive, setup should be effortless
3. **Extensibility** - Adding new providers should be straightforward
4. **Reliability** - Backups must be dependable and recoverable
5. **Open Source** - Transparent, auditable, community-driven

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or pnpm
- Git

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-vault.git
cd ai-vault

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build the project
npm run build
```

## 🏗️ Project Structure

```
ai-vault/
├── src/
│   ├── providers/       # AI platform providers
│   │   ├── base.ts     # Abstract provider interface
│   │   ├── grok/       # Grok implementation
│   │   ├── chatgpt/    # ChatGPT implementation
│   │   └── _template/  # Template for new providers
│   ├── core/           # Core functionality
│   │   ├── archiver.ts # Main orchestration
│   │   ├── storage.ts  # File storage
│   │   ├── media.ts    # Media handling
│   │   └── scheduler.ts # Backup scheduling
│   ├── cli/            # CLI commands
│   │   ├── index.ts    # Main CLI entry
│   │   ├── setup.ts    # Setup wizard
│   │   └── archive.ts  # Archive command
│   └── types/          # Shared TypeScript types
├── docs/               # Documentation
├── examples/           # Example configurations
└── tests/              # Test files
```

## 🔌 Adding a New Provider

Adding support for a new AI platform is one of the most valuable contributions! Here's how:

### 1. Copy the Template

```bash
cp -r src/providers/_template src/providers/yourplatform
```

### 2. Implement the Provider Interface

Edit `src/providers/yourplatform/index.ts`:

```typescript
import { Provider, ProviderConfig, Conversation } from '../../types';

export class YourPlatformProvider implements Provider {
  name = 'yourplatform';
  displayName = 'Your Platform';

  async authenticate(config: ProviderConfig): Promise<boolean> {
    // Implement authentication
    // Return true if successful
  }

  async listConversations(options?: ListOptions): Promise<Conversation[]> {
    // Fetch conversation list
    // Apply filters (date range, etc.)
  }

  async fetchConversation(id: string): Promise<Conversation> {
    // Fetch full conversation with messages
  }

  async downloadMedia(url: string, outputPath: string): Promise<void> {
    // Download images/videos
  }
}
```

### 3. Add Configuration Schema

Define your provider's config in `src/types/config.ts`:

```typescript
export interface YourPlatformConfig {
  apiKey?: string;
  cookies?: {
    sessionToken: string;
    // other cookies
  };
}
```

### 4. Register the Provider

Add to `src/providers/index.ts`:

```typescript
import { YourPlatformProvider } from './yourplatform';

export const providers = {
  grok: GrokProvider,
  chatgpt: ChatGPTProvider,
  yourplatform: YourPlatformProvider, // Add here
};
```

### 5. Test Your Provider

```bash
# Test manually
npm run dev archive -- --provider yourplatform --dry-run

# Add unit tests (coming soon)
npm test
```

### 6. Document

Add documentation:
- Update `README.md` platform support table
- Create `docs/providers/yourplatform.md` with:
  - Authentication methods
  - Required credentials
  - Known limitations
  - Example configuration

## 📝 Code Style

- **TypeScript** - Use strict mode, define types
- **Formatting** - Consistent formatting (we'll add Prettier soon)
- **Naming** - Descriptive names, camelCase for variables, PascalCase for classes
- **Comments** - Document complex logic, add JSDoc for public APIs
- **Error Handling** - Use descriptive error messages

### Example

```typescript
/**
 * Fetches a conversation by ID with full message history
 * @param id - Unique conversation identifier
 * @returns Complete conversation with all messages
 * @throws {AuthenticationError} If session expired
 * @throws {NotFoundError} If conversation doesn't exist
 */
async fetchConversation(id: string): Promise<Conversation> {
  try {
    const response = await this.client.get(`/conversations/${id}`);
    return this.parseConversation(response.data);
  } catch (error) {
    if (error.status === 401) {
      throw new AuthenticationError('Session expired. Please re-authenticate.');
    }
    throw error;
  }
}
```

## 🐛 Reporting Bugs

When reporting bugs, please include:

1. **Description** - What happened vs. what you expected
2. **Steps to reproduce** - How to trigger the bug
3. **Environment** - OS, Node version, provider
4. **Logs** - Run with `--debug` flag and include output
5. **Config** - Sanitized config (remove secrets!)

Use the bug report template in GitHub Issues.

## 💡 Feature Requests

We love feature ideas! Please:

1. Check if it's already requested
2. Describe the use case and benefit
3. Propose implementation approach (optional)
4. Consider if it fits the project vision

## 🔐 Security

**Do NOT** commit:
- API keys or tokens
- Cookies or session data
- Personal conversation archives
- Credentials of any kind

If you find a security vulnerability, please email [security contact] instead of filing a public issue.

## 📜 Pull Request Process

1. **Fork** the repository
2. **Create a branch** - `git checkout -b feature/your-feature`
3. **Make changes** - Follow code style, add tests
4. **Commit** - Use descriptive commit messages
5. **Push** - `git push origin feature/your-feature`
6. **Open PR** - Fill out the PR template

### Commit Message Format

```
type(scope): brief description

Longer description if needed

Fixes #123
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(grok): add support for image generation history`
- `fix(storage): handle corrupted JSON files gracefully`
- `docs(providers): add Claude setup guide`

## 🎉 Recognition

Contributors will be:
- Listed in README.md
- Credited in release notes
- Given credit in relevant documentation

## ❓ Questions?

- Open a GitHub Discussion
- Check existing documentation
- Ask in Issues (we'll create a Q&A label)

---

Thank you for making AI Vault better! 🏛️
