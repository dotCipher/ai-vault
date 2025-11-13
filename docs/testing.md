# Testing Guide

This document explains the testing strategy and how to run tests for ai-vault.

## Test Structure

We use two types of tests:

### 1. **Unit Tests** (Fast, Run in CI)

- **Location**: `tests/unit/` and `src/**/*.test.ts`
- **Purpose**: Test individual functions and logic in isolation
- **Speed**: ⚡ Very fast (milliseconds)
- **Run on**: Every commit, PR, and push to main
- **Framework**: Vitest with mocking

**Examples:**

- Testing command option parsing
- Testing utility functions
- Testing API route handlers
- Testing with mocked dependencies

### 2. **Integration Tests** (Slower, Manual/Scheduled)

- **Location**: `tests/integration/`
- **Purpose**: Test the actual CLI as users would run it
- **Speed**: 🐢 Slower (seconds to minutes)
- **Run on**: Manual trigger, nightly, or before releases
- **Framework**: Vitest + execa (spawns real processes)

**Examples:**

- Running actual CLI commands via child processes
- Testing command exit codes
- Verifying stdout/stderr output
- Testing real server startup and shutdown

## Running Tests

### Quick Commands

```bash
# Run unit tests (default, fast)
pnpm test
pnpm test:unit

# Run integration tests (requires build first)
pnpm run build
pnpm test:integration

# Run all tests
pnpm test:all

# Run tests in watch mode (unit tests only)
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
pnpm test:coverage:integration

# Run tests with UI
pnpm test:ui
```

### Detailed Workflow

#### Running Unit Tests

Unit tests run automatically in CI and are designed for fast feedback during development:

```bash
# 1. Just run them (no build required)
pnpm test:unit

# 2. Or in watch mode for TDD
pnpm test:watch
```

Unit tests mock external dependencies and test logic in isolation.

#### Running Integration Tests

Integration tests spawn actual CLI processes and require the project to be built first:

```bash
# 1. Build the project
pnpm run build

# 2. Run integration tests
pnpm test:integration
```

**Important**: Integration tests will fail if the project isn't built first, as they execute `node dist/cli.js`.

## CI/CD Testing Strategy

### Pull Requests & Main Branch (Automatic)

The standard CI pipeline runs:

- ✅ Linting
- ✅ Type checking
- ✅ **Unit tests** (fast)
- ✅ Build verification
- ✅ Package validation

### Integration Tests (Manual/Scheduled)

Integration tests run:

- 📅 **Nightly** at 2 AM UTC (scheduled)
- 🔘 **Manual trigger** via GitHub Actions
- 🎯 **Before major releases** (manually triggered)

#### Triggering Integration Tests Manually

1. Go to **Actions** tab in GitHub
2. Select **"Integration Tests"** workflow
3. Click **"Run workflow"**
4. Select branch and click **"Run workflow"**

![Trigger Integration Tests](https://docs.github.com/assets/cb-33095/images/help/actions/workflow-dispatch-button.png)

## Writing Tests

### Writing Unit Tests

Unit tests should be fast and test logic in isolation:

```typescript
// tests/unit/commands/mycommand.test.ts
import { describe, it, expect, vi } from 'vitest';
import { myFunction } from '../../../src/commands/mycommand.js';

describe('MyCommand', () => {
  it('should parse options correctly', () => {
    const result = myFunction({ port: '3000' });
    expect(result).toBeDefined();
  });

  it('should handle errors gracefully', () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Test error'));
    // Test error handling
  });
});
```

### Writing Integration Tests

Integration tests should test real CLI behavior:

```typescript
// tests/integration/mycommand.test.ts
import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { join } from 'path';

const cliPath = join(__dirname, '../../dist/cli.js');

describe('MyCommand - Integration', () => {
  it('should execute successfully', async () => {
    const { stdout, exitCode } = await execa('node', [cliPath, 'mycommand']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('expected output');
  });

  it('should handle errors', async () => {
    const { exitCode, stderr } = await execa('node', [cliPath, 'invalid'], {
      reject: false,
    });

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('error');
  });
});
```

## Test Configuration

### Unit Tests Config

File: `vitest.config.ts`

- Includes: `src/**/*.test.ts` and `tests/unit/**/*.test.ts`
- Excludes: Integration tests
- Timeout: 30 seconds
- Environment: Node.js

### Integration Tests Config

File: `vitest.config.integration.ts`

- Includes: `tests/integration/**/*.test.ts`
- Timeout: 30 seconds (longer for process spawning)
- Environment: Node.js

## Best Practices

### When to Write Unit Tests

✅ **Write unit tests when:**

- Testing individual functions or classes
- Testing parsing logic
- Testing data transformations
- Mocking is appropriate (databases, APIs, file system)
- You need fast feedback during development

### When to Write Integration Tests

✅ **Write integration tests when:**

- Testing actual CLI command execution
- Verifying exit codes and output
- Testing server startup/shutdown
- Testing end-to-end workflows
- Testing as a user would interact with the tool

### Guidelines

1. **Unit tests should be fast** - Aim for < 1 second per test suite
2. **Integration tests can be slower** - It's okay if they take seconds
3. **Mock external dependencies in unit tests** - Don't make real API calls
4. **Don't mock in integration tests** - Test the real behavior
5. **Build before integration tests** - Always ensure `dist/` is up to date
6. **Use descriptive test names** - Make failures easy to understand

## Debugging Tests

### Running a Single Test File

```bash
# Unit test
pnpm vitest tests/unit/commands/ui.test.ts

# Integration test
pnpm run build
pnpm vitest tests/integration/cli.test.ts --config vitest.config.integration.ts
```

### Running Tests with Debugging

```bash
# With Node.js debugging
node --inspect-brk ./node_modules/.bin/vitest tests/unit/mytest.test.ts
```

### Viewing Test Output

```bash
# Verbose output
pnpm vitest --reporter=verbose

# With coverage
pnpm test:coverage
open coverage/index.html
```

## Continuous Improvement

### Adding New Tests

When adding new features:

1. ✅ Write unit tests first (TDD)
2. ✅ Ensure CI passes
3. ⚡ Consider adding integration tests for critical paths
4. 📝 Update this documentation if adding new test patterns

### Measuring Test Quality

```bash
# Check coverage
pnpm test:coverage

# Aim for:
# - Unit tests: >80% coverage
# - Integration tests: Critical user paths
```

## Troubleshooting

### "CLI not built" Error

**Problem**: Integration tests fail with "CLI not built"

**Solution**: Build the project first

```bash
pnpm run build
pnpm test:integration
```

### Timeouts

**Problem**: Tests timing out

**Solution**: Increase timeout in test file

```typescript
it('slow test', async () => {
  // Test code
}, 60000); // 60 second timeout
```

### Port Already in Use

**Problem**: Integration tests fail because port is in use

**Solution**: Use random ports or ensure cleanup

```typescript
const port = 3000 + Math.floor(Math.random() * 1000);
```

## Related Scripts

- `pnpm test` - Run unit tests (default)
- `pnpm test:unit` - Run unit tests explicitly
- `pnpm test:integration` - Run integration tests
- `pnpm test:all` - Run both unit and integration tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:coverage` - Run tests with coverage
- `pnpm test:coverage:integration` - Run integration tests with coverage

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [execa Documentation](https://github.com/sindresorhus/execa)
- [Commander.js Testing](https://github.com/tj/commander.js#testing)
