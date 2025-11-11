/**
 * Authentication Module
 *
 * Exports all authentication strategies and utilities
 */

export {
  AuthStrategy,
  AuthContext,
  ApiKeyAuthStrategy,
  AnthropicApiKeyStrategy,
  OpenAIApiKeyStrategy,
  CookieApiStrategy,
  OAuthStrategy,
  AuthStrategyManager,
} from './strategies.js';

export { StrategyBasedProvider } from './base-strategy-provider.js';
