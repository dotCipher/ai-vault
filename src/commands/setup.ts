/**
 * Setup Command - Interactive provider configuration
 */

import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { saveProviderConfig, loadConfig, isProviderConfigured } from '../utils/config.js';
import type { ProviderConfig } from '../types/index.js';
import { getProvider } from '../providers/index.js';

interface SetupOptions {
  cookiesFile?: string;
}

export async function setupCommand(options: SetupOptions = {}): Promise<void> {
  clack.intro(chalk.bold.blue('AI Vault Setup'));

  // Check existing configuration
  const config = await loadConfig();
  const configuredProviders = Object.keys(config.providers);

  if (configuredProviders.length > 0) {
    clack.log.info(`Currently configured: ${configuredProviders.join(', ')}`);
  }

  // Select provider
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
    clack.cancel('Setup cancelled');
    process.exit(0);
  }

  // Check which provider to configure
  const providerName = provider as string;

  // Check if not yet implemented
  if (providerName === 'claude') {
    clack.log.error(`${providerName} provider is not yet implemented`);
    process.exit(1);
  }

  // Check if already configured
  if (await isProviderConfigured(providerName)) {
    const overwrite = await clack.confirm({
      message: `${providerName} is already configured. Overwrite?`,
    });

    if (clack.isCancel(overwrite) || !overwrite) {
      clack.cancel('Setup cancelled');
      process.exit(0);
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
    default:
      clack.log.error(`${providerName} provider is not yet implemented`);
      process.exit(1);
  }

  clack.outro(chalk.green('✓ Setup complete! Run `ai-vault archive` to start archiving.'));
}

async function setupGrok(providerName: string, options: SetupOptions): Promise<void> {
  const displayName = providerName === 'grok-web' ? 'Grok (grok.com)' : 'Grok on X (x.com/grok)';
  clack.log.step(`Configuring ${displayName}`);

  // If cookies file provided, skip to cookie auth
  let authMethod: string;
  if (options.cookiesFile) {
    authMethod = 'cookies';
    clack.log.info(`Using cookies from file: ${options.cookiesFile}`);
  } else {
    // Choose auth method
    const selected = await clack.select({
      message: 'Authentication method:',
      options: [
        { value: 'api-key', label: 'API Key', hint: 'console.x.ai' },
        { value: 'cookies', label: 'Browser Cookies', hint: 'grok.com' },
      ],
    });

    if (clack.isCancel(selected)) {
      clack.cancel('Setup cancelled');
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

        clack.log.success(`Loaded ${Object.keys(cookies).length} cookies from file`);
      } catch (error) {
        clack.log.error(
          `Failed to read cookies file: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    } else {
      // Interactive prompt for each cookie
      const websiteUrl = providerName === 'grok-web' ? 'grok.com' : 'x.com/grok';
      clack.log.info(`To get cookies from ${displayName}:`);
      clack.log.info(`1. Open ${websiteUrl} in your browser and log in`);
      clack.log.info('2. Open Developer Tools (F12 or Cmd+Option+I)');
      clack.log.info(`3. Go to Application → Cookies → https://${websiteUrl.split('/')[0]}`);
      clack.log.info('4. Find each cookie below and copy its VALUE');
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
        clack.cancel('Setup cancelled');
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
        clack.cancel('Setup cancelled');
        process.exit(0);
      }

      // Use sso value if sso-rw is empty
      const ssoRwTrimmed = (ssoRwValue as string).trim();
      cookies['sso-rw'] = ssoRwTrimmed.length > 0 ? ssoRwTrimmed : cookies['sso'];

      if (ssoRwTrimmed.length === 0) {
        clack.log.info('Using same value as "sso" for "sso-rw"');
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
        clack.cancel('Setup cancelled');
        process.exit(0);
      }

      cookies['stblid'] = (stblidValue as string).trim();

      clack.log.success('All cookies collected successfully!');
    }

    providerConfig = {
      providerName: providerName as any,
      authMethod: 'cookies',
      cookies,
    };
  }

  // Test authentication
  const spinner = clack.spinner();
  spinner.start('Testing authentication...');

  try {
    const provider = getProvider(providerConfig.providerName as any);
    await provider.authenticate(providerConfig);
    const isAuth = await provider.isAuthenticated();
    await provider.cleanup?.();

    if (!isAuth) {
      spinner.stop('Authentication failed');
      clack.log.error('Could not authenticate with provided credentials');
      process.exit(1);
    }

    spinner.stop('✓ Authentication successful!');
  } catch (error) {
    spinner.stop('Authentication failed');
    clack.log.error('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }

  // Save configuration
  await saveProviderConfig(providerConfig);
  clack.log.success('Configuration saved to ~/.ai-vault/config.json');

  // Configure archive directory
  const config = await loadConfig();
  if (!config.settings?.archiveDir) {
    console.log();
    const customDir = await clack.text({
      message: 'Archive directory (press Enter for default):',
      placeholder: '~/ai-vault-data',
    });

    if (!clack.isCancel(customDir) && customDir) {
      config.settings = config.settings || {};
      config.settings.archiveDir = customDir as string;
      const { saveConfig } = await import('../utils/config.js');
      await saveConfig(config);
      clack.log.info(`Archive directory set to: ${customDir}`);
    }
  }
}

async function setupChatGPT(options: SetupOptions): Promise<void> {
  clack.log.step('Configuring ChatGPT (OpenAI)');

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

      clack.log.success(`Loaded ${Object.keys(cookies).length} cookies from file`);
    } catch (error) {
      clack.log.error(
        `Failed to read cookies file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  } else {
    // Interactive prompt for each cookie
    clack.log.info('To get cookies from ChatGPT:');
    clack.log.info('1. Open chatgpt.com in your browser and log in');
    clack.log.info('2. Open Developer Tools (F12 or Cmd+Option+I)');
    clack.log.info('3. Go to Application → Cookies → https://chatgpt.com');
    clack.log.info('4. Find the cookies below and copy their VALUES');
    clack.log.info('');
    clack.log.warn('⚠️  Important: Some cookies may not be present for all users.');
    clack.log.warn('   Press Enter to skip optional cookies.');
    console.log();

    // Define required cookies for ChatGPT
    const requiredCookies = [
      {
        name: '__Secure-next-auth.session-token',
        description: 'Session token (REQUIRED)',
        hint: 'Long JWT-like token',
        required: true,
      },
    ];

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

    // Prompt for required cookies
    for (const cookieInfo of requiredCookies) {
      const value = await clack.text({
        message: `Enter value for cookie "${cookieInfo.name}" (${cookieInfo.description}):`,
        placeholder: cookieInfo.hint,
        validate: (val) => {
          if (!val || val.trim().length === 0) {
            return `${cookieInfo.name} is required`;
          }
          return undefined;
        },
      });

      if (clack.isCancel(value)) {
        clack.cancel('Setup cancelled');
        process.exit(0);
      }

      cookies[cookieInfo.name] = (value as string).trim();
    }

    // Prompt for optional cookies
    for (const cookieInfo of optionalCookies) {
      const value = await clack.text({
        message: `Enter value for cookie "${cookieInfo.name}" (${cookieInfo.description}):`,
        placeholder: `${cookieInfo.hint} (press Enter to skip)`,
      });

      if (clack.isCancel(value)) {
        clack.cancel('Setup cancelled');
        process.exit(0);
      }

      const trimmedValue = (value as string)?.trim();
      if (trimmedValue && trimmedValue.length > 0) {
        cookies[cookieInfo.name] = trimmedValue;
      }
    }

    clack.log.success(
      `Collected ${Object.keys(cookies).length} cookie${Object.keys(cookies).length > 1 ? 's' : ''} successfully!`
    );
  }

  const providerConfig: ProviderConfig = {
    providerName: 'chatgpt',
    authMethod: 'cookies',
    cookies,
  };

  // Test authentication
  const spinner = clack.spinner();
  spinner.start('Testing authentication...');

  try {
    const provider = getProvider(providerConfig.providerName as any);
    await provider.authenticate(providerConfig);
    const isAuth = await provider.isAuthenticated();
    await provider.cleanup?.();

    if (!isAuth) {
      spinner.stop('Authentication failed');
      clack.log.error('Could not authenticate with provided credentials');
      process.exit(1);
    }

    spinner.stop('✓ Authentication successful!');
  } catch (error) {
    spinner.stop('Authentication failed');
    clack.log.error('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }

  // Save configuration
  await saveProviderConfig(providerConfig);
  clack.log.success('Configuration saved to ~/.ai-vault/config.json');

  // Configure archive directory
  const config = await loadConfig();
  if (!config.settings?.archiveDir) {
    console.log();
    const customDir = await clack.text({
      message: 'Archive directory (press Enter for default):',
      placeholder: '~/ai-vault-data',
    });

    if (!clack.isCancel(customDir) && customDir) {
      config.settings = config.settings || {};
      config.settings.archiveDir = customDir as string;
      const { saveConfig } = await import('../utils/config.js');
      await saveConfig(config);
      clack.log.info(`Archive directory set to: ${customDir}`);
    }
  }
}
