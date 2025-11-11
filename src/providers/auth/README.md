## Authentication Strategy System

### Overview

This module provides a pluggable authentication architecture for AI Vault providers. It enables providers to support multiple authentication methods with automatic fallback, making the system more robust and future-proof.

### Architecture

```
┌─────────────────────────────────────┐
│   Provider (e.g., ClaudeApiProvider)│
│   ┌───────────────────────────────┐ │
│   │  AuthStrategyManager          │ │
│   │  - Registers strategies       │ │
│   │  - Selects best strategy      │ │
│   │  - Handles authentication     │ │
│   └───────────────────────────────┘ │
└─────────────────────────────────────┘
         │
         ├─→ Priority 1: API Key Strategy
         │   (Official APIs: Anthropic, OpenAI)
         │
         ├─→ Priority 2: Cookie + API Strategy
         │   (Web platforms: claude.ai, chatgpt.com)
         │
         └─→ Priority 3: OAuth Strategy
             (Future: OAuth 2.0 flows)
```

### Key Components

#### 1. `AuthStrategy` Interface

All authentication strategies implement this interface:

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

#### 2. `AuthContext`

The authenticated session returned by strategies:

```typescript
interface AuthContext {
  strategy: string;
  config: ProviderConfig;
  httpClient?: AxiosInstance;    // For API-based auth
  scraper?: BrowserScraper;      // For cookie-based auth
  metadata?: Record<string, any>; // Provider-specific data
}
```

#### 3. Built-in Strategies

**API Key Strategies:**
- `AnthropicApiKeyStrategy` - For Anthropic API
- `OpenAIApiKeyStrategy` - For OpenAI API

**Cookie Strategies:**
- `CookieApiStrategy` - Cookie-based web auth

**Future:**
- `OAuthStrategy` - OAuth 2.0 flows (placeholder)

### Usage

#### Creating a Provider

```typescript
import { StrategyBasedProvider } from '../auth/index.js';
import { AnthropicApiKeyStrategy, CookieApiStrategy } from '../auth/strategies.js';

export class MyProvider extends StrategyBasedProvider {
  readonly name = 'my-provider' as const;
  readonly displayName = 'My Provider';
  readonly supportedAuthMethods = ['api-key', 'cookies'];

  protected registerAuthStrategies(): void {
    // Register strategies in priority order
    this.strategyManager.register(new AnthropicApiKeyStrategy());
    this.strategyManager.register(new CookieApiStrategy('.example.com', 'https://example.com'));
  }

  async listConversations(options?) {
    this.requireAuth();

    // Check which strategy is active
    const strategy = this.getActiveStrategy();

    if (strategy === 'api-key') {
      return this.listViaApi(options);
    } else {
      return this.listViaWeb(options);
    }
  }

  // ... implement other methods
}
```

#### Implementing Custom Strategies

```typescript
export class CustomAuthStrategy implements AuthStrategy {
  readonly name = 'custom';
  readonly priority = 1;

  canAuthenticate(config: ProviderConfig): boolean {
    // Return true if this strategy can handle the config
    return config.authMethod === 'custom';
  }

  async authenticate(config: ProviderConfig): Promise<AuthContext> {
    // Perform authentication
    // Return AuthContext with authenticated client
  }

  async isValid(context: AuthContext): Promise<boolean> {
    // Check if auth is still valid
    return true;
  }

  async cleanup(context: AuthContext): Promise<void> {
    // Clean up resources
  }
}
```

### Benefits

1. **Extensibility**: Easy to add new auth methods
2. **Future-Proof**: Automatic fallback when APIs change
3. **Flexibility**: Users can choose their preferred auth method
4. **Maintainability**: Centralized auth logic
5. **Testing**: Easy to mock individual strategies

### Migration Guide

**Old Approach (BaseProvider):**
```typescript
export class OldProvider extends BaseProvider {
  async authenticate(config: ProviderConfig) {
    // Hardcoded cookie auth only
    this.scraper = new BrowserScraper();
    // ...
  }
}
```

**New Approach (StrategyBasedProvider):**
```typescript
export class NewProvider extends StrategyBasedProvider {
  protected registerAuthStrategies() {
    // Support multiple auth methods
    this.strategyManager.register(new ApiKeyStrategy());
    this.strategyManager.register(new CookieStrategy());
  }

  async listConversations(options?) {
    // Use appropriate method based on active strategy
    const strategy = this.getActiveStrategy();
    if (strategy === 'api-key') return this.listViaApi();
    return this.listViaWeb();
  }
}
```

### API Limitations

**Important Notes:**

1. **Claude (Anthropic API)**: The official API doesn't support conversation history retrieval. Cookie-based auth is required to archive from claude.ai.

2. **ChatGPT (OpenAI API)**: The official API is stateless and doesn't provide conversation history. Cookie-based auth is required to archive from chatgpt.com.

3. **Recommended Approach**: For archival/backup use cases, always use cookie-based authentication to access the full conversation history from the web platforms.

### Future Enhancements

- [ ] OAuth 2.0 support for providers that support it
- [ ] Session refresh strategies
- [ ] Multi-factor authentication handling
- [ ] Credential rotation and security improvements
- [ ] Provider-specific API clients (when official conversation APIs become available)
