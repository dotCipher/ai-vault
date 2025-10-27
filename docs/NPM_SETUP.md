# npm Publishing Setup

To enable automated npm publishing, you need to configure an NPM_TOKEN in GitHub Actions.

## Steps

### 1. Create an npm Account

If you don't have one: https://www.npmjs.com/signup

### 2. Generate an Access Token

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Click **"Generate New Token"**
3. Choose **"Automation"** token type (for CI/CD)
4. Give it a name: `ai-vault-github-actions`
5. Copy the token (you won't see it again!)

### 3. Add Token to GitHub Secrets

1. Go to your repository: https://github.com/dotCipher/ai-vault/settings/secrets/actions
2. Click **"New repository secret"**
3. Name: `NPM_TOKEN`
4. Value: Paste your npm token
5. Click **"Add secret"**

### 4. Test the Setup

On the next release (any commit to main), semantic-release will:

1. Bump the version
2. Build the project
3. Publish to npm registry
4. Create GitHub release

Check the Release workflow logs to verify: https://github.com/dotCipher/ai-vault/actions/workflows/release.yml

### 5. Verify Publication

After the release completes, verify at:

- https://www.npmjs.com/package/ai-vault
- `npm view ai-vault`

## Troubleshooting

### "401 Unauthorized" error

- Token expired or invalid
- Regenerate token and update GitHub secret

### "403 Forbidden" error

- Package name already taken
- You don't have publish rights
- Solution: Change package name in `package.json` or request access

### "ENEEDAUTH" error

- Token not set in GitHub secrets
- Check secret name is exactly `NPM_TOKEN`

### Package not updating

- Check workflow logs: https://github.com/dotCipher/ai-vault/actions
- Ensure commit message follows conventional commits
- Verify semantic-release detected changes

## Publishing Manually (Emergency)

If automated publishing fails:

```bash
# Login to npm
npm login

# Build the project
pnpm run build

# Publish
npm publish

# Or with pnpm
pnpm publish
```

## Scoped Packages (Optional)

To publish under your npm organization (@yourusername/ai-vault):

1. Change package.json:

   ```json
   {
     "name": "@yourusername/ai-vault"
   }
   ```

2. Update installation command in README:
   ```bash
   npm install -g @yourusername/ai-vault
   ```

## Publishing Permissions

If working with multiple maintainers:

1. Add collaborators on npm:
   - Go to package settings on npmjs.com
   - Add maintainers

2. They'll need their own NPM_TOKEN in their forks

## Next Steps

Once published to npm:

- ✅ Users can install with `npm install -g ai-vault`
- ✅ Package appears on npmjs.com
- ✅ Automatic updates on every release
- ✅ Download statistics available
- ✅ Package badges for README

## Additional Resources

- [npm tokens documentation](https://docs.npmjs.com/creating-and-viewing-access-tokens)
- [semantic-release npm plugin](https://github.com/semantic-release/npm)
- [GitHub Actions secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
