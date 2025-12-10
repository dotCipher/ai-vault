## [3.2.2](https://github.com/dotCipher/ai-vault/compare/v3.2.1...v3.2.2) (2025-12-10)

### Bug Fixes

- prevent duplicate conversations in Claude provider pagination ([114996b](https://github.com/dotCipher/ai-vault/commit/114996b6c625e27733caf130f7cf906c8c7852f4))

## [3.2.1](https://github.com/dotCipher/ai-vault/compare/v3.2.0...v3.2.1) (2025-12-05)

### Bug Fixes

- prevent string overflow when fetching large conversation lists ([292ec36](https://github.com/dotCipher/ai-vault/commit/292ec365579e7a9481aed701f6771fc0fa0ebd34))
- update test mocks to match new pagination API structure ([d573c5d](https://github.com/dotCipher/ai-vault/commit/d573c5d3adc20c6790b996df22ae76191cd362ab))

# [3.2.0](https://github.com/dotCipher/ai-vault/compare/v3.1.3...v3.2.0) (2025-12-05)

### Bug Fixes

- auto install playwright if not installed ([c8d47bc](https://github.com/dotCipher/ai-vault/commit/c8d47bc8f533f083df224189e84fae488f681808))

### Features

- **scraper:** auto-install Playwright browsers if missing ([a4f9b00](https://github.com/dotCipher/ai-vault/commit/a4f9b00f6b1cb07d2ec04f581341e6c778dcabbd))

## [3.1.3](https://github.com/dotCipher/ai-vault/compare/v3.1.2...v3.1.3) (2025-11-22)

### Bug Fixes

- **grok-web:** improve DOM scraping role detection ([576c7e0](https://github.com/dotCipher/ai-vault/commit/576c7e0c691e2b13c30a17d7a91f97f325130919))

## [3.1.2](https://github.com/dotCipher/ai-vault/compare/v3.1.1...v3.1.2) (2025-11-22)

### Bug Fixes

- **grok-x:** normalize sender role to lowercase ([847a35b](https://github.com/dotCipher/ai-vault/commit/847a35b6a89b18cca86199bd5ab51af9913333de))

## [3.1.1](https://github.com/dotCipher/ai-vault/compare/v3.1.0...v3.1.1) (2025-11-22)

### Bug Fixes

- **grok-web:** normalize sender role to lowercase ([fca7d02](https://github.com/dotCipher/ai-vault/commit/fca7d021933738f619273018c37af2c895560df8))

# [3.1.0](https://github.com/dotCipher/ai-vault/compare/v3.0.2...v3.1.0) (2025-11-22)

### Features

- add stealth plugin for Cloudflare bypass ([5a6091d](https://github.com/dotCipher/ai-vault/commit/5a6091df8bee7d23d80e7445d6a23f989946ae47))

## [3.0.2](https://github.com/dotCipher/ai-vault/compare/v3.0.1...v3.0.2) (2025-11-19)

### Bug Fixes

- include full node path in cron jobs for portability ([4b314a7](https://github.com/dotCipher/ai-vault/commit/4b314a7291c4846958cdb371a00e67a1fb9fb82e))

## [3.0.1](https://github.com/dotCipher/ai-vault/compare/v3.0.0...v3.0.1) (2025-11-19)

### Bug Fixes

- add UI files to NPM package and implement comprehensive build validation ([81e95cc](https://github.com/dotCipher/ai-vault/commit/81e95ccf4eb872778fbc43532af441f58b464493))
- use full path for ai-vault in cron jobs ([c13adf3](https://github.com/dotCipher/ai-vault/commit/c13adf3d3d1a7f858bba39c7a6f7de898d4f5aba))

# [3.0.0](https://github.com/dotCipher/ai-vault/compare/v2.1.0...v3.0.0) (2025-11-11)

### Bug Fixes

- **auth:** clarify cookie-only reality, prioritize user experience ([627960d](https://github.com/dotCipher/ai-vault/commit/627960d610c2acbd37a5c1b5c0f3cb86ca2c6dbe))
- **lint:** resolve all ESLint errors in auth providers ([fc75dfc](https://github.com/dotCipher/ai-vault/commit/fc75dfc67def3fdaa08499b0c69208e50d4beee3))
- resolve TypeScript and ESLint errors in API code ([c8246e8](https://github.com/dotCipher/ai-vault/commit/c8246e86a783877d7af109e4e34a1c3f86dd0482))
- **tests:** update scheduler tests to expect 'backup' command ([ab45f21](https://github.com/dotCipher/ai-vault/commit/ab45f214c0a51c652d62c65a8815a7260f3041e1))

### Features

- add web UI and local API server with full-text search ([2a29d54](https://github.com/dotCipher/ai-vault/commit/2a29d549803fa6e569a307e2898613ef86d5ecf2))
- **auth:** add strategy-based Grok providers for consistency ([554c232](https://github.com/dotCipher/ai-vault/commit/554c232071172e2d039e88e40a8a6fdcece62172))
- **auth:** implement pluggable authentication strategy system ([a4327c8](https://github.com/dotCipher/ai-vault/commit/a4327c81d394bee17eabfd91d2bbee10db4d9f3d))

### BREAKING CHANGES

- **auth:** None - fully backward compatible

# [2.1.0](https://github.com/dotCipher/ai-vault/compare/v2.0.1...v2.1.0) (2025-11-11)

### Bug Fixes

- **scheduler:** use full executable path in cron jobs ([42794d9](https://github.com/dotCipher/ai-vault/commit/42794d99ab8f11f68fe0334f309e5f05bbb07726))

### Features

- implement schedule status tracking for backup runs ([d31bbb6](https://github.com/dotCipher/ai-vault/commit/d31bbb67779ffb8b3ced439f4f0a914e1f21363c))

## [2.0.1](https://github.com/dotCipher/ai-vault/compare/v2.0.0...v2.0.1) (2025-11-09)

### Bug Fixes

- improve media download error messages for expired files ([1e8f249](https://github.com/dotCipher/ai-vault/commit/1e8f2495004ff6058eff175f738fa068f04d98f5))

# [2.0.0](https://github.com/dotCipher/ai-vault/compare/v1.17.0...v2.0.0) (2025-11-09)

### Bug Fixes

- **grok-web:** prevent 'Invalid string length' error in page.evaluate() ([#17](https://github.com/dotCipher/ai-vault/issues/17)) ([7d46046](https://github.com/dotCipher/ai-vault/commit/7d460466e0b8207565b7de61ecb1f5e3ea380031))

### BREAKING CHANGES

- **grok-web:** The primary command is now 'backup' instead of 'archive'.
  The 'archive' command remains available as a deprecated alias with a warning.

Changes:

- Renamed 'archive' command to 'backup' in CLI
- Added 'archive' as deprecated alias with warning message
- Updated all help text to use 'backup' terminology
- Updated scheduler to use 'backup' command
- Updated package.json description
- Archive alias will be removed in version 2.0.0

* fix(grok-web): prevent 'Invalid string length' error in page.evaluate()

Removed console.log inside page.evaluate() that could cause massive string
output when scraping many conversations, leading to 'Invalid string length'
errors and segfaults.

Also added:

- Cloudflare challenge detection and waiting
- API with DOM scraping fallback for listConversations
- Support for new Grok URL format (/c/ instead of /chat/)
- Better error handling for authentication
- Browser stealth enhancements (Firefox support, bot detection bypass)

Fixes the segfault issue when running full backups with many conversations.

- fix(types): disable eslint ban-ts-comment rule for stealth modifications

Added eslint-disable-next-line comments to suppress ban-ts-comment warnings
where @ts-ignore is intentionally used instead of @ts-expect-error (because
these are not actual TypeScript errors, just warnings we want to suppress).

# [1.17.0](https://github.com/dotCipher/ai-vault/compare/v1.16.0...v1.17.0) (2025-11-06)

### Bug Fixes

- **grok:** use correct API field names for conversation timestamps ([815e9d4](https://github.com/dotCipher/ai-vault/commit/815e9d4471054a1a2cadee2843cb9538394d0301))
- **release:** add NPM_TOKEN back for provenance fallback ([d7fa6f8](https://github.com/dotCipher/ai-vault/commit/d7fa6f854bd56b6b7e47f6b04d02095ea7eca8d9))
- **release:** set NODE_AUTH_TOKEN for setup-node npmrc ([eee5667](https://github.com/dotCipher/ai-vault/commit/eee566735f51f17a8fb847168004f04a03037fc8))
- **status:** stop spinners on error to prevent hanging ([14ccd33](https://github.com/dotCipher/ai-vault/commit/14ccd33e04b47271394ab2c05742860427b39fcf))

### Features

- **release:** switch to NPM provenance authentication ([c0f5422](https://github.com/dotCipher/ai-vault/commit/c0f5422ef3e3349d6a8496e41e1dbac60673adf7))
- **status:** improve error messaging for authentication failures ([0a4ef6e](https://github.com/dotCipher/ai-vault/commit/0a4ef6e33c9a53b77ff98a94221d2bd6f350c8d9))

# [1.16.0](https://github.com/dotCipher/ai-vault/compare/v1.15.0...v1.16.0) (2025-11-03)

### Features

- **claude:** add Claude provider with import and archiving support ([#14](https://github.com/dotCipher/ai-vault/issues/14)) ([2b55aae](https://github.com/dotCipher/ai-vault/commit/2b55aae36007cdf113e7919643a3a20e319be6f9))

# [1.15.0](https://github.com/dotCipher/ai-vault/compare/v1.14.0...v1.15.0) (2025-11-03)

### Features

- **grok:** add pagination, rate limiting, and improved error handling ([#13](https://github.com/dotCipher/ai-vault/issues/13)) ([2c64de0](https://github.com/dotCipher/ai-vault/commit/2c64de0aed5a9440d545cc4fab11db2f8931b585))

# [1.14.0](https://github.com/dotCipher/ai-vault/compare/v1.13.0...v1.14.0) (2025-11-01)

### Features

- **chatgpt:** massive media coverage improvements (61% → 96%) ([#12](https://github.com/dotCipher/ai-vault/issues/12)) ([090e782](https://github.com/dotCipher/ai-vault/commit/090e782b9455caca5176670f627762657069ed8a))

# [1.13.0](https://github.com/dotCipher/ai-vault/compare/v1.12.2...v1.13.0) (2025-11-01)

### Features

- **chatgpt:** automatically unarchive archived conversations during archiving ([3b48ed4](https://github.com/dotCipher/ai-vault/commit/3b48ed4eed26d55c95dd462117e400cbaa794887))

## [1.12.2](https://github.com/dotCipher/ai-vault/compare/v1.12.1...v1.12.2) (2025-11-01)

### Bug Fixes

- validation script grep exit code handling ([a63c0f5](https://github.com/dotCipher/ai-vault/commit/a63c0f5f329713c4aa9421db9fdac93747413624))

## [1.12.1](https://github.com/dotCipher/ai-vault/compare/v1.12.0...v1.12.1) (2025-11-01)

### Bug Fixes

- prevent vitest worker processes from hanging ([74407f1](https://github.com/dotCipher/ai-vault/commit/74407f19907feaebcae6d3ceaff7e47da27a4e37))

# [1.12.0](https://github.com/dotCipher/ai-vault/compare/v1.11.1...v1.12.0) (2025-11-01)

### Features

- add validation tooling and reliability improvements ([#11](https://github.com/dotCipher/ai-vault/issues/11)) ([1f0aff1](https://github.com/dotCipher/ai-vault/commit/1f0aff1ae8a50cb6347b1087e3aa19a8acf5db0c))

## [1.11.1](https://github.com/dotCipher/ai-vault/compare/v1.11.0...v1.11.1) (2025-11-01)

### Bug Fixes

- resolve ENOENT race condition in concurrent media downloads ([3933c58](https://github.com/dotCipher/ai-vault/commit/3933c585ec4fe1be9f36290fdeef3bede6849c5e))

# [1.11.0](https://github.com/dotCipher/ai-vault/compare/v1.10.5...v1.11.0) (2025-11-01)

### Features

- platform-agnostic hierarchy tracking for conversations ([#10](https://github.com/dotCipher/ai-vault/issues/10)) ([0132c7b](https://github.com/dotCipher/ai-vault/commit/0132c7b7c18f990eb22c97c41e3580139479d68d))

## [1.10.5](https://github.com/dotCipher/ai-vault/compare/v1.10.4...v1.10.5) (2025-10-31)

### Bug Fixes

- check temp file existence before cleanup in media downloads ([#9](https://github.com/dotCipher/ai-vault/issues/9)) ([f4d42ac](https://github.com/dotCipher/ai-vault/commit/f4d42acb7ae2f13b8e0c9bd0354126afc00f504b))

## [1.10.4](https://github.com/dotCipher/ai-vault/compare/v1.10.3...v1.10.4) (2025-10-31)

### Bug Fixes

- remove duplicate progress counters in archive output ([12ed200](https://github.com/dotCipher/ai-vault/commit/12ed2003bf5ae5f5c7ed17546559b76a904b493d))

## [1.10.3](https://github.com/dotCipher/ai-vault/compare/v1.10.2...v1.10.3) (2025-10-31)

### Bug Fixes

- handle race conditions in parallel media downloads ([9a1b2da](https://github.com/dotCipher/ai-vault/commit/9a1b2da1c76e9f1c118d6855c6561b3330bc340d))

## [1.10.2](https://github.com/dotCipher/ai-vault/compare/v1.10.1...v1.10.2) (2025-10-31)

### Bug Fixes

- load media registry from disk before archiving ([761b6c9](https://github.com/dotCipher/ai-vault/commit/761b6c9ca2413dd3360dc7523c7e5468d6d677cd))

## [1.10.1](https://github.com/dotCipher/ai-vault/compare/v1.10.0...v1.10.1) (2025-10-30)

### Bug Fixes

- show status for all configured providers when none specified ([9497e04](https://github.com/dotCipher/ai-vault/commit/9497e0410180c4b0b26502e09b3785b4111f28a6))

# [1.10.0](https://github.com/dotCipher/ai-vault/compare/v1.9.0...v1.10.0) (2025-10-30)

### Features

- performance optimizations (30-300x faster archiving) ([#8](https://github.com/dotCipher/ai-vault/issues/8)) ([e418319](https://github.com/dotCipher/ai-vault/commit/e41831905178a98334bbde367249b5b79fb3afd0))

# [1.9.0](https://github.com/dotCipher/ai-vault/compare/v1.8.0...v1.9.0) (2025-10-30)

### Features

- add assets/workspaces archiving, fix media downloads, and prevent config corruption ([#7](https://github.com/dotCipher/ai-vault/issues/7)) ([a243250](https://github.com/dotCipher/ai-vault/commit/a2432505161ea9b6a0f21040be1fd669e0b5982c))

# [1.8.0](https://github.com/dotCipher/ai-vault/compare/v1.7.0...v1.8.0) (2025-10-29)

### Features

- add bearer token caching for ChatGPT provider ([#6](https://github.com/dotCipher/ai-vault/issues/6)) ([46e8d59](https://github.com/dotCipher/ai-vault/commit/46e8d59ae09a2cb17b1b5756b8aaca51d9299052))

# [1.7.0](https://github.com/dotCipher/ai-vault/compare/v1.6.0...v1.7.0) (2025-10-29)

### Features

- add status command and clean up debug logging ([#5](https://github.com/dotCipher/ai-vault/issues/5)) ([a9df300](https://github.com/dotCipher/ai-vault/commit/a9df30012468a4d8756c95909b2736f0ad597b18))

# [1.6.0](https://github.com/dotCipher/ai-vault/compare/v1.5.0...v1.6.0) (2025-10-29)

### Features

- add compact data diff summaries for import and archive ([#4](https://github.com/dotCipher/ai-vault/issues/4)) ([b5e72b7](https://github.com/dotCipher/ai-vault/commit/b5e72b7a5ebe3cb03231fdb632ba24caacd829d7))
- complete message retrieval for grok-web conversations ([#3](https://github.com/dotCipher/ai-vault/issues/3)) ([d871561](https://github.com/dotCipher/ai-vault/commit/d871561bcbe5509b2c86645afe7951d5ebeefe2f))

# [1.5.0](https://github.com/dotCipher/ai-vault/compare/v1.4.0...v1.5.0) (2025-10-28)

### Features

- ChatGPT provider implementation with ZIP import and media support ([#2](https://github.com/dotCipher/ai-vault/issues/2)) ([f935221](https://github.com/dotCipher/ai-vault/commit/f93522100fa2a50f1eff2844e676965b837b5b7a))

# [1.4.0](https://github.com/dotCipher/ai-vault/compare/v1.3.0...v1.4.0) (2025-10-28)

### Features

- Grok provider split, smart filtering, list command, and scheduling system ([#1](https://github.com/dotCipher/ai-vault/issues/1)) ([3ad790d](https://github.com/dotCipher/ai-vault/commit/3ad790d1995dc6e9c873fa06057517944708ac3f))

# [1.3.0](https://github.com/dotCipher/ai-vault/compare/v1.2.2...v1.3.0) (2025-10-27)

### Features

- add self-upgrade command and multiple version flags ([d4d9baf](https://github.com/dotCipher/ai-vault/commit/d4d9bafebce1d30ba75c1d4191f22513467eba47))

## [1.2.2](https://github.com/dotCipher/ai-vault/compare/v1.2.1...v1.2.2) (2025-10-27)

### Bug Fixes

- update CLI description and suppress install warnings ([b010056](https://github.com/dotCipher/ai-vault/commit/b010056061a4d35c7fbea9af65c2b53d0ee91df7))

## [1.2.1](https://github.com/dotCipher/ai-vault/compare/v1.2.0...v1.2.1) (2025-10-27)

### Bug Fixes

- improve install script output formatting ([ddfe0dc](https://github.com/dotCipher/ai-vault/commit/ddfe0dc34319d150ff8ba08eb7242ec5de55cfad))

# [1.2.0](https://github.com/dotCipher/ai-vault/compare/v1.1.1...v1.2.0) (2025-10-27)

### Bug Fixes

- add NPM_TOKEN to release workflow environment ([7430b70](https://github.com/dotCipher/ai-vault/commit/7430b70fe0da9e9024aa3a6cbf6d0c4a92dee6e3))

### Features

- enable npm package publishing ([80e2d9c](https://github.com/dotCipher/ai-vault/commit/80e2d9cf5616023bf2d3c81649b8ac410eea0da6))

## [1.1.1](https://github.com/dotCipher/ai-vault/compare/v1.1.0...v1.1.1) (2025-10-27)

### Bug Fixes

- improve Homebrew formula automation reliability ([a30c3bd](https://github.com/dotCipher/ai-vault/commit/a30c3bd78f26dcbc7e08c3ec8721603081c5a37e))

# [1.1.0](https://github.com/dotCipher/ai-vault/compare/v1.0.0...v1.1.0) (2025-10-27)

### Features

- add package manager distribution support ([aa845bd](https://github.com/dotCipher/ai-vault/commit/aa845bd693d4268805cc054bdfaed3b886bf54b8))
- streamline multi-platform installation ([2a31e5f](https://github.com/dotCipher/ai-vault/commit/2a31e5fc14a39d7b7d99db7a50ba347a5c152365))

# 1.0.0 (2025-10-27)

### Bug Fixes

- add pnpm lockfile and resolve ESLint errors for CI ([34e20e7](https://github.com/dotCipher/ai-vault/commit/34e20e7a5e8ebc34f16a432c48b56d04253411e3))
- update release workflow to use Node.js 22 ([3bb306b](https://github.com/dotCipher/ai-vault/commit/3bb306b04b54f3f27e12343f6faf30cea45ebc9a))

### Features

- initial project setup with provider architecture ([75e4588](https://github.com/dotCipher/ai-vault/commit/75e4588bc1a813946dbb78779b919905dc9d952f))
