import React from 'react';
import { render } from 'ink';
import { EventBus } from '@flappycode/protocol';
import { App } from './app.js';
import { createUIStore, bindStoreToBus, UIStore } from './store.js';

export const TUI_VERSION = '1.0.0';

export * from './store.js';
export * from './replay.js';
export * from './app.js';
export * from './banner/index.js';

export interface RenderAppOptions {
  bus: EventBus;
  store?: UIStore;
  version?: string;
  isTTY?: boolean;
}

/**
 * Render the Ink application bound to the engine event bus.
 */
export function renderApp(options: RenderAppOptions) {
  const {
    bus,
    store = createUIStore(),
    version = '0.0.0-dev',
    isTTY = process.stdin.isTTY,
  } = options;

  // Non-TTY guard per G1 acceptance requirements
  if (!isTTY && process.env.NODE_ENV !== 'test') {
    console.error('FlappyCode interactive TUI requires a TTY terminal.');
    console.error('For automated/non-interactive workflows, use headless mode: flappycode run "<prompt>"');
    process.exit(2);
  }

  // Bind store to event bus
  const unsubscribeBus = bindStoreToBus(store, bus);

  const instance = render(React.createElement(App, { store, version }));

  return {
    store,
    waitUntilExit: instance.waitUntilExit,
    unmount: () => {
      unsubscribeBus();
      instance.unmount();
    },
    clear: instance.clear,
  };
}
