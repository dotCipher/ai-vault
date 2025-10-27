# Provider Template

This template provides a starting point for implementing new AI platform providers.

## Quick Start

1. **Copy this directory**:
   ```bash
   cp -r src/providers/_template src/providers/yourplatform
   ```

2. **Update the class**:
   - Rename `TemplateProvider` to `YourPlatformProvider`
   - Change `name` to match your provider
   - Update `displayName` to human-readable name
   - Set `supportedAuthMethods`

3. **Implement authentication**:
   - Add API key logic
   - Or cookie-based authentication
   - Or OAuth flow

4. **Implement data fetching**:
   - `listConversations()` - Get conversation list
   - `fetchConversation()` - Get full conversation
   - Transform API responses to standard format

5. **Test your provider**:
   ```bash
   npm run dev archive -- --provider yourplatform --dry-run
   ```

6. **Add documentation**:
   - Create `docs/providers/yourplatform.md`
   - Document authentication setup
   - Add example configuration

7. **Register the provider**:
   ```typescript
   // src/providers/index.ts
   export const providers = {
     yourplatform: YourPlatformProvider,
   };
   ```

## API Response Mapping

Most AI platforms have different API structures. Here's how to map common patterns:

### Example API Response
```json
{
  "conversation_id": "abc123",
  "name": "My Chat",
  "turns": [
    {
      "author": "user",
      "text": "Hello",
      "created": 1234567890
    }
  ]
}
```

### Map to Standard Format
```typescript
{
  id: data.conversation_id,
  title: data.name,
  messages: data.turns.map(turn => ({
    id: `${data.conversation_id}-${turn.created}`,
    role: turn.author === 'user' ? 'user' : 'assistant',
    content: turn.text,
    timestamp: new Date(turn.created * 1000)
  }))
}
```

## Common Patterns

### Rate Limiting
```typescript
import { RateLimitError } from '../../types/provider';

if (error.response?.status === 429) {
  const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
  throw new RateLimitError('Rate limit exceeded', retryAfter);
}
```

### Pagination
```typescript
async listConversations(options?: ListConversationsOptions) {
  let allConversations: ConversationSummary[] = [];
  let offset = options?.offset || 0;
  const limit = options?.limit || 100;

  while (true) {
    const batch = await this.fetchConversationBatch(offset, limit);
    allConversations.push(...batch);

    if (batch.length < limit) break;
    offset += limit;
  }

  return allConversations;
}
```

### Web Scraping Fallback
If no API is available, use Playwright:

```typescript
import { chromium } from 'playwright';

async listConversations() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Set cookies for authentication
  await page.context().addCookies(
    Object.entries(this.config!.cookies!).map(([name, value]) => ({
      name,
      value,
      domain: '.yourplatform.com',
      path: '/',
    }))
  );

  await page.goto('https://yourplatform.com/conversations');

  // Extract conversation list
  const conversations = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.conversation')).map(el => ({
      id: el.getAttribute('data-id'),
      title: el.querySelector('.title')?.textContent,
    }));
  });

  await browser.close();
  return conversations;
}
```

## Need Help?

- Check existing providers in `src/providers/grok/` or `src/providers/chatgpt/`
- See `docs/architecture.md` for system overview
- Open an issue on GitHub
