import React, { useSyncExternalStore } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { Banner } from './banner/index.js';
import { UIState, UIStore } from './store.js';

export interface AppProps {
  store: UIStore;
  version?: string;
  width?: number;
  height?: number;
  onExit?: () => void;
}

export const App: React.FC<AppProps> = ({
  store,
  version = '0.0.0-dev',
  width: customWidth,
  height: customHeight,
  onExit,
}) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const state: UIState = useSyncExternalStore(store.subscribe, store.getState);

  const columns = customWidth ?? (stdout?.columns || 100);
  const rows = customHeight ?? (stdout?.rows || 30);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (onExit) onExit();
      exit();
    }
  });

  const getStatusDisplay = () => {
    switch (state.status) {
      case 'ready':
        return { text: '⚡ Ready!', color: 'green', shortIcon: '⚡' };
      case 'working': {
        const detail = state.statusDetail ?? 'running tasks';
        const text = detail.startsWith('Working…') ? `◐ ${detail}` : `◐ Working… ${detail}`;
        return {
          text,
          color: 'cyan',
          shortIcon: '◐',
        };
      }
      case 'waiting_approval':
        return { text: '● Waiting for approval', color: 'yellow', shortIcon: '●' };
      case 'exhausted':
        return { text: '✖ Free pool exhausted', color: 'red', shortIcon: '✖' };
      case 'no_providers':
        return {
          text: '○ No providers — press / then "providers add"',
          color: 'yellow',
          shortIcon: '○',
        };
    }
  };

  const status = getStatusDisplay();
  const isWorking = state.nodes.length > 0;

  // Responsive tiers per CLIDesign §4.1
  const isFullOrWordmark = columns >= 70;
  const isCompact = columns >= 45 && columns < 70;
  const isMinimal = columns < 45 || rows < 18;

  const ruleLine = '─'.repeat(Math.max(10, columns - 2));

  return (
    <Box flexDirection="column" paddingX={1} width={columns}>
      {/* Zone A: Collapsed header when working, or top spacing */}
      {isWorking && (
        <Box marginBottom={1} flexDirection="row" justifyContent="space-between">
          <Text bold color="yellow">
            FLAPPY<Text color="cyan">CODE</Text> <Text dimColor>v{version}</Text>
          </Text>
          {state.projectPath && (
            <Text dimColor>
              Project: {state.projectPath.split(/[/\\]/).pop()}
            </Text>
          )}
        </Box>
      )}

      {/* Zone B: Banner (only on home/empty screen) */}
      {!isWorking && !isMinimal && (
        <Box flexDirection="column" alignItems="center" marginBottom={1}>
          <Banner width={columns} height={rows} />
        </Box>
      )}

      {/* Zone C: Taglines (only on home screen) */}
      {!isWorking && !isMinimal && (
        <Box flexDirection="column" alignItems="center" marginBottom={1}>
          {isFullOrWordmark && (
            <Text bold color="white">
              Multi-Provider • Multi-Agent • Free Models • One Assistant
            </Text>
          )}
          {(isFullOrWordmark || isCompact) && (
            <Text color="cyan">
              Your connected providers. All the free models. One powerful coding agent.
            </Text>
          )}
        </Box>
      )}

      {/* Zone D: Input Box */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        marginY={1}
        flexDirection="column"
        minHeight={3}
      >
        <Text color="cyan">
          <Text bold>{'>_ '}</Text>
          <Text color="blueBright">Type your coding request here...</Text>
        </Text>
        {state.providersCount === 0 && (
          <Box marginTop={1}>
            <Text dimColor color="yellow">
              [i] No provider connected. Run /providers add or flappycode providers add to connect free models.
            </Text>
          </Box>
        )}
      </Box>

      {/* Active task nodes when working */}
      {isWorking && (
        <Box flexDirection="column" marginY={1}>
          <Text bold color="cyan">
            Active Tasks:
          </Text>
          {state.nodes.map((node) => (
            <Text key={node.nodeId}>
              {'  • '}
              <Text bold color="yellow">
                {node.agent}
              </Text>{' '}
              ({node.model}) - <Text color="cyan">{node.status}</Text>
              {node.delta ? ` [${node.delta}]` : ''}
            </Text>
          ))}
        </Box>
      )}

      {/* Pending approval notice */}
      {state.pendingApproval && (
        <Box
          borderStyle="single"
          borderColor="yellow"
          paddingX={1}
          marginY={1}
          flexDirection="column"
        >
          <Text bold color="yellow">
            Approval Needed: {state.pendingApproval.kind}
          </Text>
          <Text>{state.pendingApproval.description}</Text>
        </Box>
      )}

      {/* Zone E: Status Bar */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="cyan" dimColor>
          {ruleLine}
        </Text>

        {isFullOrWordmark ? (
          // Full 3-part status bar (>= 70 cols)
          <Box flexDirection="row" justifyContent="space-between" paddingY={0}>
            <Text>
              <Text color="yellow">{'<o) '}</Text>FlappyCode v{version}
            </Text>
            <Text>
              {columns >= 110 ? (
                <>
                  [📶] Providers: <Text bold color="green">{state.providersCount}</Text> connected │ Free models: <Text bold color="green">{state.freeModelCount}</Text> available
                </>
              ) : (
                <>
                  [📶] <Text bold color="green">{state.providersCount}</Text> providers │ <Text bold color="green">{state.freeModelCount}</Text> free models
                </>
              )}
            </Text>
            <Text color={status.color as 'green' | 'cyan' | 'yellow' | 'red'}>
              {status.text}
            </Text>
          </Box>
        ) : isCompact ? (
          // Compact status bar (45-69 cols)
          <Box flexDirection="row" justifyContent="space-between">
            <Text>v{version}</Text>
            <Text>
              {state.providersCount} prov │ {state.freeModelCount} free
            </Text>
            <Text color={status.color as 'green' | 'cyan' | 'yellow' | 'red'}>
              {status.shortIcon} {state.status}
            </Text>
          </Box>
        ) : (
          // Minimal status bar (< 45 cols)
          <Box flexDirection="row" justifyContent="space-between">
            <Text>FlappyCode</Text>
            <Text color={status.color as 'green' | 'cyan' | 'yellow' | 'red'}>
              {status.shortIcon}
            </Text>
          </Box>
        )}

        <Text color="cyan" dimColor>
          {ruleLine}
        </Text>
      </Box>
    </Box>
  );
};
