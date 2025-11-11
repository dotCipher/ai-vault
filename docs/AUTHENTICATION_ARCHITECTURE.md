# Authentication Architecture - Priority 6: Improve Authentication UX

## Executive Summary

This document describes the improved authentication architecture for AI Vault, implementing **Priority 6** from the product strategy: improving authentication UX with better extensibility, future-proofing, and API-first approaches.

## Problem Statement

### Original Issues

1. **No Official API Support**: Despite providers like Claude and ChatGPT having official APIs (Anthropic API, OpenAI API), AI Vault only used cookie-based browser scraping.

2. **Limited Extensibility**: Each provider implemented auth differently with no shared patterns, making it difficult to add new providers or auth methods.

3. **Future-Proofing Concerns**:
   - Cookie-based auth breaks when providers update web interfaces
   - Stealth scraping is a cat-and-mouse game with bot detection
   - Browser automation is slower and more resource-intensive

4. **No Auth Abstraction**: No strategy pattern for authentication, leading to code duplication.

5. **Unused OAuth Support**: Despite OAuth being in the interface definition, no provider implemented it.

## Solution: Pluggable Authentication Strategy System

### Architecture Overview

```
┌───────────────────────────────────────────────────┐
│             Provider (e.g., Claude)               │
│  ┌─────────────────────────────────────────────┐ │
│  │      AuthStrategyManager                    │ │
│  │  1. API Key (Priority 1 - Preferred)        │ │
│  │  2. Cookie + API (Priority 2 - Fallback)    │ │
│  │  3. OAuth (Priority 3 - Future)             │ │
│  └─────────────────────────────────────────────┘ │
│              │                                     │
│              ├─→ Strategy Selection                │
│              ├─→ Authentication                    │
│              └─→ Resource Cleanup                  │
└───────────────────────────────────────────────────┘
```

### Key Components

#### 1. Authentication Strategies

**Base Interface:**
```typescript
interface AuthStrategy {
  readonly name: string;
  readonly priority: number; // Lower = higher priority
  canAuthenticate(config: ProviderConfig): boolean;
  authenticate(config: ProviderConfig): Promise<AuthContext>;
  isValid(context: AuthContext): Promise<boolean>;
  cleanup?(context: AuthContext): Promise<void>;
}
```

**Implemented Strategies:**

| Strategy | Priority | Use Case | Providers |
|----------|----------|----------|-----------|
| `AnthropicApiKeyStrategy` | 1 | Official Anthropic API | Claude |
| `OpenAIApiKeyStrategy` | 1 | Official OpenAI API | ChatGPT |
| `CookieApiStrategy` | 2 | Web platform APIs | Claude, ChatGPT, Grok |
| `OAuthStrategy` | 3 | OAuth flows (future) | TBD |

#### 2. Strategy-Based Provider Base Class

```typescript
abstract class StrategyBasedProvider implements Provider {
  protected strategyManager: AuthStrategyManager;
  protected authContext?: AuthContext;

  constructor() {
    this.strategyManager = new AuthStrategyManager();
    this.registerAuthStrategies(); // Subclasses register their strategies
  }

  protected abstract registerAuthStrategies(): void;

  async authenticate(config: ProviderConfig): Promise<boolean> {
    this.authContext = await this.strategyManager.authenticate(config);
    return true;
  }

  // Helper methods
  protected getHttpClient() { /* Returns authenticated HTTP client */ }
  protected getScraper() { /* Returns authenticated browser scraper */ }
  protected getActiveStrategy() { /* Returns current strategy name */ }
}
```

#### 3. Improved Provider Implementations

**New Files:**
- `src/providers/auth/strategies.ts` - All auth strategies
- `src/providers/auth/base-strategy-provider.ts` - Base class
- `src/providers/claude/api-provider.ts` - Improved Claude provider
- `src/providers/chatgpt/api-provider.ts` - Improved ChatGPT provider

**Provider Example:**
```typescript
export class ClaudeApiProvider extends StrategyBasedProvider {
  protected registerAuthStrategies(): void {
    // Try API key first (preferred)
    this.strategyManager.register(new AnthropicApiKeyStrategy());

    // Fall back to cookie-based auth
    this.strategyManager.register(new CookieApiStrategy('.claude.ai', 'https://claude.ai'));
  }

  async listConversations(options?) {
    const strategy = this.getActiveStrategy();

    if (strategy === 'api-key') {
      // Note: Anthropic API doesn't support conversation listing
      throw new Error('Use cookie auth for archival');
    }

    return this.listConversationsViaWeb(options);
  }
}
```

## API Limitations & Recommendations

### Important Notes

1. **Claude (Anthropic API)**:
   - ✅ Supports: Message generation, streaming, model info
   - ❌ Does NOT support: Conversation history retrieval, conversation listing
   - **Recommendation**: Use cookie-based auth for archival from claude.ai

2. **ChatGPT (OpenAI API)**:
   - ✅ Supports: Chat completions, model info, fine-tuning
   - ❌ Does NOT support: Conversation history retrieval, conversation listing
   - **Recommendation**: Use cookie-based auth for archival from chatgpt.com

3. **Grok**:
   - Currently uses cookie + API hybrid approach
   - No official API available yet

### Strategy Selection Flow

```
User Config
    │
    ├─→ Has API Key? ──→ Try API Strategy
    │                   │
    │                   ├─→ Success? ──→ Use API
    │                   │
    │                   └─→ Fail ──→ Try next strategy
    │
    └─→ Has Cookies? ──→ Try Cookie Strategy
                        │
                        ├─→ Success? ──→ Use Cookies
                        │
                        └─→ Fail ──→ Authentication Error
```

## Benefits

### 1. Extensibility
- Easy to add new auth methods per provider
- Simple to add new providers with multiple auth options
- Clear patterns for implementing custom strategies

### 2. Future-Proofing
- Automatic fallback when preferred methods fail
- Support for emerging auth standards (OAuth, etc.)
- Prepared for when providers add official conversation APIs

### 3. User Experience
- Users can choose their preferred auth method
- Clear error messages for each strategy
- Seamless fallback without user intervention

### 4. Maintainability
- Centralized auth logic
- No code duplication across providers
- Easy to test individual strategies

### 5. Performance
- API-based auth is faster than browser automation
- Reduced resource usage when API keys are available
- Better rate limit handling

## Migration Path

### For Existing Users

**No breaking changes** - Existing cookie-based authentication continues to work.

**To use API keys:**

1. **Claude:**
   ```bash
   ai-vault setup claude
   # Choose "api-key" as auth method
   # Enter Anthropic API key from: https://console.anthropic.com/
   ```

2. **ChatGPT:**
   ```bash
   ai-vault setup chatgpt
   # Choose "api-key" as auth method
   # Enter OpenAI API key from: https://platform.openai.com/api-keys
   ```

**Note**: For archival/backup, cookie-based auth is still required due to API limitations.

### For Provider Developers

**Old approach:**
```typescript
export class MyProvider extends BaseProvider {
  async authenticate(config: ProviderConfig) {
    // Hardcoded single auth method
    if (config.authMethod !== 'cookies') {
      throw new Error('Only cookies supported');
    }
    this.scraper = new BrowserScraper();
    // ...
  }
}
```

**New approach:**
```typescript
export class MyProvider extends StrategyBasedProvider {
  protected registerAuthStrategies(): void {
    // Register multiple strategies
    this.strategyManager.register(new MyApiKeyStrategy());
    this.strategyManager.register(new CookieApiStrategy('.example.com', 'https://example.com'));
  }

  async listConversations(options?) {
    // Handle different strategies appropriately
    const strategy = this.getActiveStrategy();
    if (strategy === 'api-key') return this.listViaApi();
    return this.listViaWeb();
  }
}
```

## Implementation Details

### File Structure

```
src/providers/
├── auth/
│   ├── strategies.ts              # All auth strategies
│   ├── base-strategy-provider.ts  # Base class with strategy support
│   ├── index.ts                   # Exports
│   └── README.md                  # Module documentation
├── claude/
│   ├── index.ts                   # Original implementation (unchanged)
│   └── api-provider.ts            # NEW: API-first implementation
├── chatgpt/
│   ├── index.ts                   # Original implementation (unchanged)
│   └── api-provider.ts            # NEW: API-first implementation
└── base.ts                        # Original base class (unchanged)
```

### Strategy Priority System

Strategies are tried in priority order (lower number = higher priority):

| Priority | Strategy | When Used |
|----------|----------|-----------|
| 1 | API Key | Official provider APIs (preferred) |
| 2 | Cookie + API | Web platform APIs (current approach) |
| 3 | OAuth | Future OAuth 2.0 flows |
| 4 | DOM Scraping | Last resort fallback |

### Resource Management

Each strategy handles its own cleanup:

```typescript
await provider.cleanup();
// Automatically cleans up:
// - HTTP clients
// - Browser sessions
// - Temporary files
// - Other strategy-specific resources
```

## Testing Approach

### Unit Tests

```typescript
describe('AuthStrategyManager', () => {
  it('should select highest priority strategy', async () => {
    const manager = new AuthStrategyManager();
    manager.register(new ApiKeyStrategy());
    manager.register(new CookieStrategy());

    const config = { authMethod: 'api-key', apiKey: 'test' };
    const strategy = manager.selectStrategy(config);

    expect(strategy?.name).toBe('api-key');
  });
});
```

### Integration Tests

```typescript
describe('ClaudeApiProvider', () => {
  it('should authenticate with API key', async () => {
    const provider = new ClaudeApiProvider();
    const config = { authMethod: 'api-key', apiKey: process.env.ANTHROPIC_API_KEY };

    await provider.authenticate(config);
    expect(provider.getActiveStrategy()).toBe('api-key');
  });

  it('should fall back to cookies', async () => {
    const provider = new ClaudeApiProvider();
    const config = { authMethod: 'cookies', cookies: {...} };

    await provider.authenticate(config);
    expect(provider.getActiveStrategy()).toBe('cookie-api');
  });
});
```

## Security Considerations

### API Key Storage

- API keys stored in `~/.ai-vault/config.json`
- File permissions: `0600` (owner read/write only)
- Encrypted at rest (future enhancement)

### Cookie Security

- Session cookies stored temporarily
- Cleared after provider cleanup
- Not persisted beyond session

### Best Practices

1. **Never commit API keys**: Use environment variables for testing
2. **Rotate keys regularly**: Update keys in config as needed
3. **Use least privilege**: Request minimal required scopes
4. **Monitor usage**: Track API usage for anomalies

## Future Enhancements

### Short Term
- [ ] Add OAuth 2.0 support for providers that offer it
- [ ] Implement session refresh strategies
- [ ] Add MFA handling for web auth

### Medium Term
- [ ] Encrypted credential storage
- [ ] Credential rotation automation
- [ ] Provider-specific rate limit strategies

### Long Term
- [ ] Support for provider conversation APIs when available
- [ ] Federated authentication
- [ ] SSO integration for enterprise users

## Conclusion

The improved authentication architecture provides:

1. **Better UX**: Users can choose their preferred auth method
2. **Future-Proof**: Ready for new auth methods and APIs
3. **Extensible**: Easy to add new providers and strategies
4. **Maintainable**: Clean separation of concerns
5. **Performant**: API-first approach when available

This addresses **Priority 6: Improve Authentication UX** by creating a robust, flexible foundation for authentication that will serve AI Vault well into the future.

## References

- [Anthropic API Documentation](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [OAuth 2.0 RFC](https://datatracker.ietf.org/doc/html/rfc6749)
- [AI Vault Provider Guide](../CONTRIBUTING.md#adding-new-providers)
