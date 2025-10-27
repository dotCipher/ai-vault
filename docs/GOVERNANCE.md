# Project Governance

## Branch Strategy

### Main Branch Protection

The `main` branch is protected with the following rules:

**Required:**
- ✅ Require pull request before merging
- ✅ Require approvals: 1
- ✅ Dismiss stale PR approvals when new commits are pushed
- ✅ Require status checks to pass before merging:
  - `lint` - Linting checks
  - `typecheck` - TypeScript type checking
  - `test` - Test suite
  - `build` - Build verification
- ✅ Require conversation resolution before merging
- ✅ Require signed commits
- ✅ Require linear history (no merge commits)
- ⛔ Do not allow bypassing the above settings
- ⛔ Do not allow force pushes
- ⛔ Do not allow deletions

**Branch Protection Setup (for maintainers):**

To configure branch protection on GitHub:

1. Go to **Settings** > **Branches**
2. Click **Add rule** for branch `main`
3. Configure the settings above
4. Ensure "Include administrators" is checked

## Pull Request Process

### For Contributors

1. **Fork the repository** (or create a branch if you're a maintainer)

2. **Create a feature branch**:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

3. **Make your changes** following our coding standards

4. **Commit with conventional commits**:
   ```bash
   git commit -m "feat: add support for Perplexity provider"
   git commit -m "fix: resolve cookie expiration issue"
   ```

5. **Push and create a Pull Request**:
   ```bash
   git push origin feat/your-feature-name
   ```

6. **Fill out the PR template** completely

7. **Wait for CI checks** to pass (required)

8. **Request review** from maintainers

9. **Address feedback** if requested

10. **Maintainer will merge** once approved and all checks pass

### For Maintainers

- **Never push directly to `main`** - Always use PRs
- **Never force push to `main`** - History must remain intact
- **Use squash merging** for clean history
- **Ensure all CI checks pass** before approving
- **Require meaningful commit messages** following conventional commits

## Commit Convention

We use **Conventional Commits** for all commit messages:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style/formatting (no functional changes)
- `refactor`: Code restructuring (no functional changes)
- `perf`: Performance improvements
- `test`: Adding/updating tests
- `build`: Build system or dependencies
- `ci`: CI/CD changes
- `chore`: Other changes (tooling, etc.)

### Examples

```bash
feat(grok): add support for image generation history
fix(cli): resolve crash when config file is missing
docs(providers): add ChatGPT authentication guide
refactor(scraper): extract common pagination logic
test(api-client): add retry mechanism tests
ci: add pr size validation workflow
```

## Release Process

Releases are **automated** via semantic-release:

1. Commits to `main` trigger the release workflow
2. Semantic-release analyzes commit messages
3. Determines version bump (major/minor/patch)
4. Generates CHANGELOG.md
5. Creates GitHub release
6. Updates package.json version
7. Commits changes with `[skip ci]` tag

### Version Bumps

- `feat:` → **Minor** version (0.X.0)
- `fix:` → **Patch** version (0.0.X)
- `BREAKING CHANGE:` in footer → **Major** version (X.0.0)

## Code Review Standards

Reviewers should check:

- ✅ Code follows project style and conventions
- ✅ Tests are included for new functionality
- ✅ Documentation is updated
- ✅ No security vulnerabilities introduced
- ✅ Performance implications considered
- ✅ Error handling is appropriate
- ✅ API changes are backward compatible (or documented as breaking)

## Contributor Roles

### Contributor
- Can fork and submit PRs
- Changes require 1 approval from maintainer

### Maintainer
- Can review and merge PRs
- Can create releases
- Cannot bypass branch protection on `main`

### Admin
- Repository owner
- Can modify settings
- Should still follow PR process for code changes

## Questions?

Open a [GitHub Discussion](https://github.com/yourusername/ai-vault/discussions) for governance questions.
