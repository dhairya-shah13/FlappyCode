import { TaskNode } from '@flappycode/protocol';
import { Palette } from '../palette.js';

/** Run-view status bar state machine (P1-G9). */
export type RunViewState =
  | 'READY'
  | 'WORKING'
  | 'WAITING_APPROVAL'
  | 'POOL_EXHAUSTED'
  | 'CANCELLED'
  | 'COMPLETE';

export interface TaskGraphProps {
  goal: string;
  nodes: TaskNode[];
  plannerModel?: string;
  state: RunViewState;
  width?: number;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  cancelled: '⊘',
  skipped: '⊘',
  waiting_approval: '●',
};

const STATUS_ICONS_ASCII: Record<string, string> = {
  pending: '[ ]',
  running: '[~]',
  completed: '[+]',
  failed: '[x]',
  cancelled: '[-]',
  skipped: '[-]',
  waiting_approval: '[?]',
};

function stateLabel(state: RunViewState): string {
  switch (state) {
    case 'READY': return Palette.ok('Ready');
    case 'WORKING': return Palette.cyan('Working…');
    case 'WAITING_APPROVAL': return Palette.yellow('Waiting for approval');
    case 'POOL_EXHAUSTED': return Palette.error('Pool exhausted');
    case 'CANCELLED': return Palette.error('Cancelled');
    case 'COMPLETE': return Palette.ok('Complete');
  }
}

/**
 * Live reactive DAG task graph screen (P1-G9 / GAP-027).
 * Renders an ASCII/Unicode tree of agents, nodes, statuses, model selections,
 * substitutions, and feedback iterations. Adapts to 60/80/120-column widths.
 */
export class TaskGraphScreen {
  public static render(props: TaskGraphProps): string {
    const width = props.width ?? 80;
    const isAscii = Palette.isAsciiOnly();
    const icons = isAscii ? STATUS_ICONS_ASCII : STATUS_ICONS;
    const boxRule = '─'.repeat(Math.max(20, width - 4));
    const innerWidth = Math.max(16, width - 6);

    const lines: string[] = [];

    // Header
    lines.push(`╭─ ${Palette.bold('Task Graph')} ── ${stateLabel(props.state)} ${boxRule.slice(Math.min(30, width - 30))}╮`);
    lines.push(`│ Goal: ${props.goal.slice(0, innerWidth - 7).padEnd(innerWidth - 7)}  │`);
    if (props.plannerModel) {
      lines.push(`│ Planner: ${Palette.dim(props.plannerModel.slice(0, innerWidth - 11))}${''.padEnd(Math.max(0, innerWidth - 10 - props.plannerModel.length))} │`);
    }
    lines.push(`│${''.padEnd(innerWidth + 1)}│`);

    // Render nodes as a tree
    for (let i = 0; i < props.nodes.length; i++) {
      const node = props.nodes[i];
      const icon = icons[node.status] ?? '?';
      const isLast = i === props.nodes.length - 1;
      const connector = isLast ? '└──' : '├──';
      const continueLine = isLast ? '   ' : '│  ';

      // Primary node line
      const modelTag = node.model_used
        ? ` [${node.model_used.slice(0, width < 70 ? 15 : 25)}]`
        : '';
      const substTag = node.substitutions.length > 0
        ? ` ${Palette.orange(`[subst: ${node.substitutions[node.substitutions.length - 1].slice(0, 20)}]`)}`
        : '';
      const iterTag = (node.iterations ?? 0) > 0
        ? ` ${Palette.yellow(`[iter ${node.iterations}]`)}`
        : '';

      const agentLabel = width >= 100
        ? node.agent.padEnd(18)
        : node.agent.slice(0, 14).padEnd(14);

      let desc = node.description;
      const maxDesc = width < 70 ? 25 : width < 100 ? 35 : 50;
      if (desc.length > maxDesc) desc = desc.slice(0, maxDesc - 1) + '…';

      lines.push(`│  ${connector} ${icon} ${Palette.cyan(agentLabel)} ${desc}${modelTag}${substTag}${iterTag}`);

      // Dependency sub-lines (compact — only show if deps exist)
      if (node.depends_on.length > 0 && width >= 80) {
        const depStr = node.depends_on.join(', ');
        lines.push(`│  ${continueLine}    ${Palette.dim(`depends: ${depStr.slice(0, innerWidth - 18)}`)}`);
      }

      // Error sub-line
      if (node.error) {
        lines.push(`│  ${continueLine}    ${Palette.error(`error: ${node.error.slice(0, innerWidth - 14)}`)}`);
      }
    }

    lines.push(`│${''.padEnd(innerWidth + 1)}│`);

    // Status bar footer
    const completed = props.nodes.filter((n) => n.status === 'completed').length;
    const total = props.nodes.length;
    const running = props.nodes.filter((n) => n.status === 'running').length;
    const failed = props.nodes.filter((n) => n.status === 'failed').length;
    const statusParts = [`${completed}/${total} done`];
    if (running > 0) statusParts.push(`${running} running`);
    if (failed > 0) statusParts.push(`${failed} failed`);
    const statusStr = statusParts.join(' │ ');
    lines.push(`│  ${statusStr.padEnd(innerWidth - 1)}│`);
    lines.push(`╰${boxRule}╯`);

    return lines.join('\n');
  }
}
