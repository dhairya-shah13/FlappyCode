import React, { useSyncExternalStore } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { UIStore, UIState } from './store.js';

export interface AppProps {
  store: UIStore;
  version?: string;
  onExit?: () => void;
}

export const App: React.FC<AppProps> = ({ store, version = '0.0.0-dev', onExit }) => {
  const { exit } = useApp();
  const state: UIState = useSyncExternalStore(store.subscribe, store.getState);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (onExit) onExit();
      exit();
    }
  });

  const getStatusDisplay = () => {
    switch (state.status) {
      case 'ready':
        return { text: '⚡ Ready!', color: 'green' };
      case 'working':
        return {
          text: `◐ Working… ${state.statusDetail ?? 'running tasks'}`,
          color: 'cyan',
        };
      case 'waiting_approval':
        return { text: '● Waiting for approval', color: 'yellow' };
      case 'exhausted':
        return { text: '✖ Free pool exhausted', color: 'red' };
      case 'no_providers':
        return { text: '○ No providers connected', color: 'yellow' };
    }
  };

  const status = getStatusDisplay();

  return (
    <Box flexDirection="column" padding={1}>
      {/* Banner / Header */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="yellow">
          FLAPPY
          <Text color="cyan">CODE</Text>
        </Text>
        <Text color="white">
          Multi-Provider • Multi-Agent • Free Models • One Assistant
        </Text>
        <Text color="blueBright">
          Your connected providers. All the free models. One powerful coding agent.
        </Text>
      </Box>

      {/* Input box placeholder */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        marginY={1}
        flexDirection="column"
      >
        <Text color="cyan">
          {'>_ ' }
          <Text color="blueBright">Type your coding request here...</Text>
        </Text>
      </Box>

      {/* Active task nodes if working */}
      {state.nodes.length > 0 && (
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

      {/* Status Bar */}
      <Box
        borderStyle="single"
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor="cyan"
        paddingTop={1}
        justifyContent="space-between"
      >
        <Text>FlappyCode v{version}</Text>
        <Text>
          Providers: <Text color="green">{state.providersCount}</Text> connected │ Free
          models: <Text color="green">{state.freeModelCount}</Text> available
        </Text>
        <Text color={status.color as 'green' | 'cyan' | 'yellow' | 'red'}>{status.text}</Text>
      </Box>
    </Box>
  );
};
