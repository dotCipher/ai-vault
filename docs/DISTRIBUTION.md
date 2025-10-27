# Distribution Guide

## Package Managers

AI Vault is distributed through multiple package managers for easy installation.

### npm (All Platforms) ✅ Available

```bash
npm install -g ai-vault
```

**Published to:** https://www.npmjs.com/package/ai-vault

**Update:** Automatic via semantic-release on every commit to main

### pnpm (All Platforms) ✅ Available

```bash
pnpm install -g ai-vault
```

### Homebrew (macOS) 🚧 Coming Soon

**Option 1: Via npm (current)**

```bash
brew install node@22
npm install -g ai-vault
```

**Option 2: Native formula (planned)**

```bash
brew tap dotCipher/ai-vault
brew install ai-vault
```

See `homebrew/README.md` for setup instructions.

### Other Package Managers (Planned)

- **apt** (Debian/Ubuntu) - `.deb` packages
- **yum/dnf** (RedHat/Fedora) - `.rpm` packages
- **Chocolatey** (Windows) - `choco install ai-vault`
- **Scoop** (Windows) - `scoop install ai-vault`
- **pkgx** (Cross-platform) - `pkgx install ai-vault`
- **asdf** (Version manager) - `asdf plugin add ai-vault`

## Publishing Checklist

When releasing a new version:

1. ✅ **Commit with conventional commit message**

   ```bash
   git commit -m "feat: add new feature"
   ```

2. ✅ **Push to main** - Triggers automated release

   ```bash
   git push origin main
   ```

3. ✅ **Automated actions happen**:
   - Semantic-release analyzes commits
   - Bumps version in package.json
   - Creates CHANGELOG.md entry
   - Publishes to npm registry
   - Creates GitHub release with notes
   - Builds and uploads artifacts

4. 🚧 **Manual Homebrew update** (until automated):
   - Update `homebrew/ai-vault.rb` with new version and SHA256
   - Push to homebrew tap repository

## NPM Publishing Configuration

**Authentication:** Uses `NPM_TOKEN` environment variable (set in GitHub Actions secrets)

**Automatic Publishing:**

- Enabled in `.releaserc.json`
- Runs on every release
- Publishes only `dist/`, `README.md`, and `LICENSE`

**Pre-publish hooks:**

- `prepublishOnly` - Builds TypeScript before publishing

## Binary Builds (Future)

For standalone binaries without Node.js dependency:

### Using pkg

```bash
npm install -g pkg

pkg . --targets node22-linux-x64,node22-macos-x64,node22-win-x64
```

### Using esbuild + node

```bash
pnpm add -D esbuild

# Bundle into single file
esbuild src/cli.ts --bundle --platform=node --outfile=dist/ai-vault.cjs
```

### GitHub Actions Binary Release

Add to `.github/workflows/release.yml`:

```yaml
- name: Build Binaries
  run: |
    pnpm install -g pkg
    pkg . --targets node22-linux-x64 --output dist/ai-vault-linux
    pkg . --targets node22-macos-x64 --output dist/ai-vault-macos
    pkg . --targets node22-win-x64 --output dist/ai-vault-win.exe

- name: Upload Binaries
  uses: softprops/action-gh-release@v1
  with:
    files: |
      dist/ai-vault-linux
      dist/ai-vault-macos
      dist/ai-vault-win.exe
```

## Versioning

We use **Semantic Versioning** via semantic-release:

- `feat:` commits → **Minor** version bump (0.X.0)
- `fix:` commits → **Patch** version bump (0.0.X)
- `BREAKING CHANGE:` → **Major** version bump (X.0.0)

**Current Version:** See `package.json` or `npm view ai-vault version`

## Download Statistics

- **npm:** https://www.npmjs.com/package/ai-vault
- **GitHub Releases:** https://github.com/dotCipher/ai-vault/releases
- **Homebrew Analytics:** (once tap is created)
