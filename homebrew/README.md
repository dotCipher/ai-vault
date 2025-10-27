# Homebrew Formula for AI Vault

## Installation via Homebrew

### Option 1: Using npm (Recommended for now)

```bash
# Install Node.js if not already installed
brew install node@22

# Install ai-vault globally via npm
npm install -g ai-vault
```

### Option 2: Custom Tap (Coming Soon)

Once we create a tap, you'll be able to install with:

```bash
brew tap dotCipher/ai-vault
brew install ai-vault
```

## Creating a Homebrew Tap

To publish this formula to a Homebrew tap:

1. **Create a tap repository**:

   ```bash
   # Create a new repo: homebrew-ai-vault
   gh repo create homebrew-ai-vault --public
   ```

2. **Add the formula**:

   ```bash
   cp homebrew/ai-vault.rb path/to/homebrew-ai-vault/Formula/ai-vault.rb
   ```

3. **Update the formula** with correct SHA256:

   ```bash
   # Download the tarball
   curl -L https://github.com/dotCipher/ai-vault/archive/refs/tags/v1.0.0.tar.gz -o ai-vault.tar.gz

   # Calculate SHA256
   shasum -a 256 ai-vault.tar.gz

   # Update the sha256 field in the formula
   ```

4. **Commit and push**:

   ```bash
   git add Formula/ai-vault.rb
   git commit -m "Add ai-vault formula"
   git push
   ```

5. **Users can now install**:
   ```bash
   brew tap dotCipher/ai-vault
   brew install ai-vault
   ```

## Automated Updates

To automate formula updates on each release, add this to `.github/workflows/release.yml`:

```yaml
- name: Update Homebrew Formula
  if: steps.semantic.outputs.new_release_published == 'true'
  env:
    GITHUB_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
  run: |
    VERSION=${{ steps.semantic.outputs.new_release_version }}

    # Download tarball and calculate SHA
    curl -L https://github.com/dotCipher/ai-vault/archive/refs/tags/v${VERSION}.tar.gz -o ai-vault.tar.gz
    SHA256=$(shasum -a 256 ai-vault.tar.gz | cut -d' ' -f1)

    # Update formula
    sed -i "s|url \".*\"|url \"https://github.com/dotCipher/ai-vault/archive/refs/tags/v${VERSION}.tar.gz\"|" homebrew/ai-vault.rb
    sed -i "s|sha256 \".*\"|sha256 \"${SHA256}\"|" homebrew/ai-vault.rb

    # Commit to tap repo
    git clone https://github.com/dotCipher/homebrew-ai-vault.git
    cp homebrew/ai-vault.rb homebrew-ai-vault/Formula/ai-vault.rb
    cd homebrew-ai-vault
    git add Formula/ai-vault.rb
    git commit -m "Update ai-vault to v${VERSION}"
    git push
```
