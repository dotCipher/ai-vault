/**
 * CLI UI helpers that are safe in headless/non-TTY environments.
 */

import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { isInteractive } from './interactive.js';

export interface Spinner {
  start(text?: string): Spinner;
  stop(text?: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  warn(text?: string): void;
  text?: string;
}

export interface CliUI {
  isInteractive: boolean;
  intro(message: string): void;
  outro(message: string): void;
  cancel(message: string): void;
  isCancel(value: unknown): boolean;
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    success(message: string): void;
    step(message: string): void;
  };
  confirm(options: { message: string }): Promise<boolean>;
  select<T extends string>(options: {
    message: string;
    options: Array<{ value: T; label: string }>;
  }): Promise<T>;
  spinner(): Spinner;
}

function createHeadlessSpinner(initialText = ''): Spinner {
  let currentText = initialText;
  return {
    start(text?: string) {
      if (text) currentText = text;
      if (currentText) {
        console.log(currentText);
      }
      return this;
    },
    stop(text?: string) {
      if (text) console.log(text);
    },
    succeed(text?: string) {
      if (text) console.log(text);
    },
    fail(text?: string) {
      if (text) console.error(text);
    },
    warn(text?: string) {
      if (text) console.warn(text);
    },
    get text() {
      return currentText;
    },
    set text(value: string | undefined) {
      if (value) currentText = value;
    },
  };
}

export function createCliUI(): CliUI {
  const interactive = isInteractive();

  if (interactive) {
    return {
      isInteractive: true,
      intro: (message) => clack.intro(message),
      outro: (message) => clack.outro(message),
      cancel: (message) => clack.cancel(message),
      isCancel: (value) => clack.isCancel(value),
      log: {
        info: (message) => clack.log.info(message),
        warn: (message) => clack.log.warn(message),
        error: (message) => clack.log.error(message),
        success: (message) => clack.log.success(message),
        step: (message) => clack.log.step(message),
      },
      confirm: (options) => clack.confirm(options) as Promise<boolean>,
      select: (options) => clack.select(options) as Promise<any>,
      spinner: () => clack.spinner() as Spinner,
    };
  }

  return {
    isInteractive: false,
    intro: (message) => console.log(message),
    outro: (message) => console.log(message),
    cancel: (message) => console.log(message),
    isCancel: () => false,
    log: {
      info: (message) => console.log(message),
      warn: (message) => console.warn(chalk.yellow(message)),
      error: (message) => console.error(chalk.red(message)),
      success: (message) => console.log(chalk.green(message)),
      step: (message) => console.log(message),
    },
    confirm: async () => {
      throw new Error('Interactive prompt required. Run with --yes or use a TTY.');
    },
    select: async () => {
      throw new Error('Interactive prompt required. Provide a provider or use a TTY.');
    },
    spinner: () => createHeadlessSpinner(),
  };
}
