/**
 * Setup Command - Interactive provider configuration
 */

import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { saveProviderConfig, loadConfig, isProviderConfigured } from '../utils/config.js';
import type { ProviderConfig } from '../types/index.js';
import { getProvider } from '../providers/index.js';
import { createCliUI } from '../utils/cli-ui.js';
import * as clack from '@clack/prompts';

interface SetupOptions {
  cookiesFile?: string;
  provider?: string;
}

const VALID_PROVIDERS = ['grok-web', 'grok-x', 'chatgpt', 'claude'];

export async function setupCommand(options: SetupOptions = {}): Promise<void> {
  const ui = createCliUI();
  ui.intro(chalk.bold.blue('AI Vault Setup'));

  // Check existing configuration
  const config = await loadConfig();
  const configuredProviders = Object.keys(config.providers);

  if (configuredProviders.length > 0) {
    ui.log.info(`Currently configured: ${configuredProviders.join(', ')}`);
  }

  let providerName: string;

  // Use provider from argument if provided
  if (options.provider) {
    if (!VALID_PROVIDERS.includes(options.provider)) {
      ui.log.error(`Invalid provider: ${options.provider}`);
      ui.log.info(`Valid providers: ${VALID_PROVIDERS.join(', ')}`);
      process.exit(1);
    }
    providerName = options.provider;
    ui.log.info(`Configuring provider: ${providerName}`);
  } else {
    if (!ui.isInteractive) {
      ui.log.error('Provider selection requires a TTY. Pass a provider name explicitly.');
      process.exit(1);
    }
    // Select provider interactively
    const provider = await clack.select({
      message: 'Which provider do you want to configure?',
      options: [
        { value: 'grok-web', label: 'Grok (grok.com)', hint: 'grok.com' },
        { value: 'grok-x', label: 'Grok on X (x.com)', hint: 'x.com/grok' },
        { value: 'chatgpt', label: 'ChatGPT (OpenAI)', hint: 'chatgpt.com' },
        { value: 'claude', label: 'Claude (Anthropic)', hint: 'claude.ai' },
      ],
    });

    if (clack.isCancel(provider)) {
      ui.cancel('Setup cancelled');
      process.exit(0);
    }

    providerName = provider as string;
  }

  // Check if already configured
  if (await isProviderConfigured(providerName)) {
    if (!ui.isInteractive) {
      if (!options.cookiesFile) {
        ui.log.error(
          `${providerName} is already configured. Run setup in a TTY to overwrite or pass --cookies-file.`
        );
        process.exit(1);
      }
      ui.log.warn(`${providerName} is already configured. Overwriting with provided cookies file.`);
    } else {
      const overwrite = await clack.confirm({
        message: `${providerName} is already configured. Overwrite?`,
      });

      if (clack.isCancel(overwrite) || !overwrite) {
        ui.cancel('Setup cancelled');
        process.exit(0);
      }
    }
  }

  // Configure based on provider
  switch (providerName) {
    case 'grok-web':
    case 'grok-x':
      await setupGrok(providerName, options);
      break;
    case 'chatgpt':
      await setupChatGPT(options);
      break;
    case 'claude':
      await setupClaude(options);
      break;
    default:
      ui.log.error(`${providerName} provider is not yet implemented`);
      process.exit(1);
  }

  ui.outro(chalk.green('✓ Setup complete! Run `ai-vault archive` to start archiving.'));
}

async function setupGrok(providerName: string, options: SetupOptions): Promise<void> {
  const ui = createCliUI();
  const displayName = providerName === 'grok-web' ? 'Grok (grok.com)' : 'Grok on X (x.com/grok)';
  ui.log.step(`Configuring ${displayName}`);

  // If cookies file provided, skip to cookie auth
  let authMethod: string;
  if (options.cookiesFile) {
    authMethod = 'cookies';
    ui.log.info(`Using cookies from file: ${options.cookiesFile}`);
  } else {
    if (!ui.isInteractive) {
      ui.log.error('Interactive auth selection requires a TTY. Pass --cookies-file.');
      process.exit(1);
    }
    // Choose auth method
    const selected = await clack.select({
      message: 'Authentication method:',
      options: [
        { value: 'api-key', label: 'API Key', hint: 'console.x.ai' },
        { value: 'cookies', label: 'Browser Cookies', hint: 'grok.com' },
      ],
    });

    if (clack.isCancel(selected)) {
      ui.cancel('Setup cancelled');
      process.exit(0);
    }

    authMethod = selected as string;
  }

  let providerConfig: ProviderConfig;

  if (authMethod === 'api-key') {
    const apiKey = await clack.text({
      message: 'Enter your Grok API key:',
      placeholder: 'xai-...',
      validate: (value) => {
        if (!value) return 'API key is required';
        if (!value.startsWith('xai-')) return 'API key should start with "xai-"';
      },
    });

    if (clack.isCancel(apiKey)) {
      clack.cancel('Setup cancelled');
      process.exit(0);
    }

    const customEndpoint = await clack.text({
      message: 'Custom API endpoint (press Enter to use default):',
      placeholder: 'https://api.x.ai',
    });

    if (clack.isCancel(customEndpoint)) {
      clack.cancel('Setup cancelled');
      process.exit(0);
    }

    providerConfig = {
      providerName: providerName as any,
      authMethod: 'api-key',
      apiKey: apiKey as string,
      ...(customEndpoint && { customEndpoint: customEndpoint as string }),
    };
  } else {
    let cookies: Record<string, string>;

    // Read from file if provided
    if (options.cookiesFile) {
      try {
        const filePath = resolve(options.cookiesFile);
        const fileContent = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(fileContent);

        if (Array.isArray(parsed)) {
          // Convert array format to object format
          cookies = Object.fromEntries(parsed.map((cookie: any) => [cookie.name, cookie.value]));
        } else {
          // Already in object format
          cookies = parsed;
        }

        ui.log.success(`Loaded ${Object.keys(cookies).length} cookies from file`);
      } catch (error) {
        ui.log.error(
          `Failed to read cookies file: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    } else {
      if (!ui.isInteractive) {
        ui.log.error('Interactive cookie entry requires a TTY. Pass --cookies-file.');
        process.exit(1);
      }
      // Interactive prompt for each cookie
      const websiteUrl = providerName === 'grok-web' ? 'grok.com' : 'x.com/grok';
      ui.log.info(`To get cookies from ${displayName}:`);
      ui.log.info(`1. Open ${websiteUrl} in your browser and log in`);
      ui.log.info('2. Open Developer Tools (F12 or Cmd+Option+I)');
      ui.log.info(`3. Go to Application → Cookies → https://${websiteUrl.split('/')[0]}`);
      ui.log.info('4. Find each cookie below and copy its VALUE');
      console.log();

      cookies = {};

      // Prompt for sso cookie first
      const ssoValue = await clack.text({
        message: 'Enter value for cookie "sso" (SSO session token):',
        placeholder: 'Starts with eyJ...',
        validate: (val) => {
          if (!val || val.trim().length === 0) {
            return 'sso is required';
          }
          if (!val.trim().startsWith('eyJ')) {
            return 'sso should start with "eyJ"';
          }
          return undefined;
        },
      });

      if (clack.isCancel(ssoValue)) {
        ui.cancel('Setup cancelled');
        process.exit(0);
      }

      cookies['sso'] = (ssoValue as string).trim();

      // Prompt for sso-rw cookie (allow using same value as sso)
      const ssoRwValue = await clack.text({
        message: 'Enter value for cookie "sso-rw" (SSO read-write token):',
        placeholder: 'Press Enter to use same value as "sso", or paste different value',
        validate: (val) => {
          // Allow empty - will use sso value
          if (!val || val.trim().length === 0) {
            return undefined;
          }
          // If provided, validate format
          if (!val.trim().startsWith('eyJ')) {
            return 'sso-rw should start with "eyJ"';
          }
          return undefined;
        },
      });

      if (clack.isCancel(ssoRwValue)) {
        ui.cancel('Setup cancelled');
        process.exit(0);
      }

      // Use sso value if sso-rw is empty
      const ssoRwTrimmed = ssoRwValue ? (ssoRwValue as string).trim() : '';
      cookies['sso-rw'] = ssoRwTrimmed.length > 0 ? ssoRwTrimmed : cookies['sso'];

      if (ssoRwTrimmed.length === 0) {
        ui.log.info('Using same value as "sso" for "sso-rw"');
      }

      // Prompt for stblid cookie
      const stblidValue = await clack.text({
        message: 'Enter value for cookie "stblid" (Stable ID):',
        placeholder: 'UUID format (e.g., xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)',
        validate: (val) => {
          if (!val || val.trim().length === 0) {
            return 'stblid is required';
          }
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(val.trim())) {
            return 'stblid should be a valid UUID';
          }
          return undefined;
        },
      });

      if (clack.isCancel(stblidValue)) {
        ui.cancel('Setup cancelled');
        process.exit(0);
      }

      cookies['stblid'] = (stblidValue as string).trim();

      ui.log.success('All cookies collected successfully!');
    }

    providerConfig = {
      providerName: providerName as any,
      authMethod: 'cookies',
      cookies,
    };
  }

  // Test authentication
  const spinner = ui.spinner();
  spinner.start('Testing authentication...');

  try {
    const provider = getProvider(providerConfig.providerName as any);
    await provider.authenticate(providerConfig);
    const isAuth = await provider.isAuthenticated();
    await provider.cleanup?.();

    if (!isAuth) {
      spinner.stop('Authentication failed');
      ui.log.error('Could not authenticate with provided credentials');
      process.exit(1);
    }

    spinner.stop('✓ Authentication successful!');
  } catch (error) {
    spinner.stop('Authentication failed');
    ui.log.error('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }

  // Save configuration
  await saveProviderConfig(providerConfig);
  ui.log.success('Configuration saved to ~/.ai-vault/config.json');

  // Configure archive directory
  const config = await loadConfig();
  if (!config.settings?.archiveDir) {
    console.log();
    if (!ui.isInteractive) {
      ui.log.info('Using default archive directory (~/ai-vault-data)');
      return;
    }
    const customDir = await clack.text({
      message: 'Archive directory (press Enter for default):',
      placeholder: '~/ai-vault-data',
    });

    if (!clack.isCancel(customDir) && customDir) {
      config.settings = config.settings || {};
      config.settings.archiveDir = customDir as string;
      const { saveConfig } = await import('../utils/config.js');
      await saveConfig(config);
      ui.log.info(`Archive directory set to: ${customDir}`);
    }
  }
}

async function setupChatGPT(options: SetupOptions): Promise<void> {
  const ui = createCliUI();
  ui.log.step('Configuring ChatGPT (OpenAI)');

  let cookies: Record<string, string>;

  // Read from file if provided
  if (options.cookiesFile) {
    try {
      const filePath = resolve(options.cookiesFile);
      const fileContent = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(fileContent);

      if (Array.isArray(parsed)) {
        // Convert array format to object format
        cookies = Object.fromEntries(parsed.map((cookie: any) => [cookie.name, cookie.value]));
      } else {
        // Already in object format
        cookies = parsed;
      }

      ui.log.success(`Loaded ${Object.keys(cookies).length} cookies from file`);
    } catch (error) {
      ui.log.error(
        `Failed to read cookies file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  } else {
    if (!ui.isInteractive) {
      ui.log.error('Interactive cookie entry requires a TTY. Pass --cookies-file.');
      process.exit(1);
    }
    // Interactive prompt for each cookie
    ui.log.info('To get cookies from ChatGPT:');
    ui.log.info('1. Open chatgpt.com in your browser and log in');
    ui.log.info('2. Open Developer Tools (F12 or Cmd+Option+I)');
    ui.log.info('3. Go to Application → Cookies → https://chatgpt.com');
    ui.log.info('4. Find the cookies below and copy their VALUES');
    ui.log.info('');
    ui.log.warn('⚠️  Important: Some cookies may not be present for all users.');
    ui.log.warn('   Press Enter to skip optional cookies.');
    console.log();

    const optionalCookies = [
      {
        name: '__Host-next-auth.csrf-token',
        description: 'CSRF token (optional, may improve reliability)',
        hint: 'Long alphanumeric string - press Enter to skip if not found',
        required: false,
      },
      {
        name: '__Secure-next-auth.callback-url',
        description: 'Callback URL (optional)',
        hint: 'Usually https://chatgpt.com - press Enter to skip if not found',
        required: false,
      },
    ];

    cookies = {};

    ui.log.warn('   Some accounts now split the session token into .0 and .1 cookies.');
    ui.log.warn('   Provide either the single session token or both .0 and .1 parts.');
    console.log();

    const baseTokenValue = await clack.text({
      message:
        'Enter value for cookie "__Secure-next-auth.session-token" (optional if using .0/.1):',
      placeholder: 'Long JWT-like token - press Enter to use .0/.1 cookies',
    });

    if (clack.isCancel(baseTokenValue)) {
      ui.cancel('Setup cancelled');
      process.exit(0);
    }

    const tokenPart0Value = await clack.text({
      message: 'Enter value for cookie "__Secure-next-auth.session-token.0" (optional):',
      placeholder: 'First chunk - press Enter to skip if not found',
    });

    if (clack.isCancel(tokenPart0Value)) {
      ui.cancel('Setup cancelled');
      process.exit(0);
    }

    const tokenPart1Value = await clack.text({
      message: 'Enter value for cookie "__Secure-next-auth.session-token.1" (optional):',
      placeholder: 'Second chunk - press Enter to skip if not found',
    });

    if (clack.isCancel(tokenPart1Value)) {
      ui.cancel('Setup cancelled');
      process.exit(0);
    }

    const baseToken = (baseTokenValue as string)?.trim();
    const tokenPart0 = (tokenPart0Value as string)?.trim();
    const tokenPart1 = (tokenPart1Value as string)?.trim();

    if (!baseToken && (!tokenPart0 || !tokenPart1)) {
      ui.log.error(
        'Missing required session token. Provide "__Secure-next-auth.session-token" or both ".0" and ".1" parts.'
      );
      process.exit(1);
    }

    if (baseToken) {
      cookies['__Secure-next-auth.session-token'] = baseToken;
    }
    if (tokenPart0) {
      cookies['__Secure-next-auth.session-token.0'] = tokenPart0;
    }
    if (tokenPart1) {
      cookies['__Secure-next-auth.session-token.1'] = tokenPart1;
    }

    // Prompt for optional cookies
    for (const cookieInfo of optionalCookies) {
      const value = await clack.text({
        message: `Enter value for cookie "${cookieInfo.name}" (${cookieInfo.description}):`,
        placeholder: `${cookieInfo.hint} (press Enter to skip)`,
      });

      if (clack.isCancel(value)) {
        ui.cancel('Setup cancelled');
        process.exit(0);
      }

      const trimmedValue = (value as string)?.trim();
      if (trimmedValue && trimmedValue.length > 0) {
        cookies[cookieInfo.name] = trimmedValue;
      }
    }

    ui.log.success(
      `Collected ${Object.keys(cookies).length} cookie${Object.keys(cookies).length > 1 ? 's' : ''} successfully!`
    );
  }

  const providerConfig: ProviderConfig = {
    providerName: 'chatgpt',
    authMethod: 'cookies',
    cookies,
  };

  // Test authentication
  const spinner = ui.spinner();
  spinner.start('Testing authentication...');

  try {
    const provider = getProvider(providerConfig.providerName as any);
    await provider.authenticate(providerConfig);
    const isAuth = await provider.isAuthenticated();
    await provider.cleanup?.();

    if (!isAuth) {
      spinner.stop('Authentication failed');
      ui.log.error('Could not authenticate with provided credentials');
      process.exit(1);
    }

    spinner.stop('✓ Authentication successful!');
  } catch (error) {
    spinner.stop('Authentication failed');
    ui.log.error('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }

  // Save configuration
  await saveProviderConfig(providerConfig);
  ui.log.success('Configuration saved to ~/.ai-vault/config.json');

  // Configure archive directory
  const config = await loadConfig();
  if (!config.settings?.archiveDir) {
    console.log();
    if (!ui.isInteractive) {
      ui.log.info('Using default archive directory (~/ai-vault-data)');
      return;
    }
    const customDir = await clack.text({
      message: 'Archive directory (press Enter for default):',
      placeholder: '~/ai-vault-data',
    });

    if (!clack.isCancel(customDir) && customDir) {
      config.settings = config.settings || {};
      config.settings.archiveDir = customDir as string;
      const { saveConfig } = await import('../utils/config.js');
      await saveConfig(config);
      ui.log.info(`Archive directory set to: ${customDir}`);
    }
  }
}

async function setupClaude(options: SetupOptions): Promise<void> {
  const ui = createCliUI();
  ui.log.step('Configuring Claude (Anthropic)');

  let cookies: Record<string, string>;

  // Read from file if provided
  if (options.cookiesFile) {
    try {
      const filePath = resolve(options.cookiesFile);
      const fileContent = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(fileContent);

      if (Array.isArray(parsed)) {
        // Convert array format to object format
        cookies = Object.fromEntries(parsed.map((cookie: any) => [cookie.name, cookie.value]));
      } else {
        // Already in object format
        cookies = parsed;
      }

      ui.log.success(`Loaded ${Object.keys(cookies).length} cookies from file`);
    } catch (error) {
      ui.log.error(
        `Failed to read cookies file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  } else {
    if (!ui.isInteractive) {
      ui.log.error('Interactive cookie entry requires a TTY. Pass --cookies-file.');
      process.exit(1);
    }
    // Interactive prompt for sessionKey cookie
    ui.log.info('To get your sessionKey cookie from Claude:');
    ui.log.info('1. Open claude.ai in your browser and log in');
    ui.log.info('2. Open Developer Tools (F12 or Cmd+Option+I)');
    ui.log.info('3. Go to Application → Cookies → https://claude.ai');
    ui.log.info('4. Find the "sessionKey" cookie and copy its VALUE');
    console.log();

    const sessionKey = await clack.text({
      message: 'Enter value for cookie "sessionKey":',
      placeholder: 'sk-ant-... (108 characters total)',
      validate: (val) => {
        if (!val || val.trim().length === 0) {
          return 'sessionKey is required';
        }
        const trimmed = val.trim();
        if (!trimmed.startsWith('sk-ant-')) {
          return 'sessionKey should start with "sk-ant-"';
        }
        if (trimmed.length !== 108) {
          return `sessionKey should be exactly 108 characters (found ${trimmed.length})`;
        }
        return undefined;
      },
    });

    if (clack.isCancel(sessionKey)) {
      ui.cancel('Setup cancelled');
      process.exit(0);
    }

    cookies = {
      sessionKey: (sessionKey as string).trim(),
    };

    ui.log.success('sessionKey collected successfully!');
  }

  const providerConfig: ProviderConfig = {
    providerName: 'claude',
    authMethod: 'cookies',
    cookies,
  };

  // Test authentication
  const spinner = ui.spinner();
  spinner.start('Testing authentication...');

  try {
    const provider = getProvider(providerConfig.providerName as any);
    await provider.authenticate(providerConfig);
    const isAuth = await provider.isAuthenticated();
    await provider.cleanup?.();

    if (!isAuth) {
      spinner.stop('Authentication failed');
      ui.log.error('Could not authenticate with provided credentials');
      process.exit(1);
    }

    spinner.stop('✓ Authentication successful!');
  } catch (error) {
    spinner.stop('Authentication failed');
    ui.log.error('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }

  // Save configuration
  await saveProviderConfig(providerConfig);
  ui.log.success('Configuration saved to ~/.ai-vault/config.json');

  // Configure archive directory
  const config = await loadConfig();
  if (!config.settings?.archiveDir) {
    console.log();
    if (!ui.isInteractive) {
      ui.log.info('Using default archive directory (~/ai-vault-data)');
      return;
    }
    const customDir = await clack.text({
      message: 'Archive directory (press Enter for default):',
      placeholder: '~/ai-vault-data',
    });

    if (!clack.isCancel(customDir) && customDir) {
      config.settings = config.settings || {};
      config.settings.archiveDir = customDir as string;
      const { saveConfig } = await import('../utils/config.js');
      await saveConfig(config);
      ui.log.info(`Archive directory set to: ${customDir}`);
    }
  }
}
