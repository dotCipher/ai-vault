## Authentication Strategy System

### Overview

This module provides a pluggable authentication architecture for AI Vault providers. It enables clean separation of authentication logic and makes it easy to add new auth methods in the future.

**Current Reality**: Cookie-based authentication is the only method that works for conversation archival. This module provides the infrastructure for when other methods become available.

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
         ├─→ Priority 1: Cookie + API Strategy ✅
         │   (Web platforms - ONLY method that works)
         │
         ├─→ Priority 5: OAuth Strategy 🔮
         │   (Future)
         │
         └─→ Priority 10: API Key Strategy 🔮
             (Future - when providers add conversation APIs)
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

**Active (Works Today):**
- `CookieApiStrategy` - Cookie-based web auth (Priority 1)

**Future (Infrastructure Ready):**
- `AnthropicApiKeyStrategy` - For when Anthropic adds conversation APIs (Priority 10)
- `OpenAIApiKeyStrategy` - For when OpenAI adds conversation APIs (Priority 10)
- `OAuthStrategy` - OAuth 2.0 flows (Priority 5, placeholder)

### Usage

#### Creating a Provider

```typescript
import { StrategyBasedProvider } from '../auth/index.js';
import { AnthropicApiKeyStrategy, CookieApiStrategy } from '../auth/strategies.js';

export class MyProvider extends StrategyBasedProvider {
  readonly name = 'my-provider' as const;
  readonly displayName = 'My Provider';
  readonly supportedAuthMethods = ['cookies']; // Only what works today!

  protected registerAuthStrategies(): void {
    // Register only what works
    this.strategyManager.register(new CookieApiStrategy('.example.com', 'https://example.com'));

    // Future strategies commented out until they're actually useful
    // this.strategyManager.register(new MyApiKeyStrategy());
  }

  async listConversations(options?) {
    this.requireAuth();
    // Currently only cookie-based works, so implementation is simple
    return this.listViaWeb(options);
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

### Current Limitations & Reality

**What Works:**
- ✅ Cookie-based authentication - Full conversation archival

**What Doesn't Work (Provider API Limitations):**
- ❌ Anthropic API - No conversation history support
- ❌ OpenAI API - No conversation history support

**Why Include Infrastructure for Non-Working Methods?**

Future-proofing! When providers eventually add conversation APIs:
1. Uncomment the strategy registration
2. Implement the API methods
3. Users get the new option automatically

Until then, stick to cookie-based auth.

### Future Enhancements

- [ ] OAuth 2.0 support for providers that support it
- [ ] Session refresh strategies
- [ ] Multi-factor authentication handling
- [ ] Credential rotation and security improvements
- [ ] Provider-specific API clients (when official conversation APIs become available)
