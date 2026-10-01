import { PlanProposal } from '@flappycode/protocol';
import { Palette } from '../palette.js';

export class PlanApprovalScreen {
  public static render(plan: PlanProposal, width = 80): string {
    const boxRule = '─'.repeat(Math.max(20, width - 4));
    let content = `╭─ ${Palette.bold('Implementation Plan')} ── planner: ${plan.planner_model} ${boxRule.slice(40)}╮\n`;
    content += `│ Goal: ${plan.goal.slice(0, 65).padEnd(65)}  │\n`;
    content += `│                                                                              │\n`;

    plan.graph.nodes.forEach((n, idx) => {
      const idxStr = `${idx + 1}.`.padEnd(3);
      const agentStr = n.agent.padEnd(14);
      const desc = n.description.slice(0, 40).padEnd(42);
      content += `│  ${idxStr} ${Palette.cyan(agentStr)} ${desc}  │\n`;
    });

    content += `│                                                                              │\n`;
    const filesStr = plan.files_to_modify.length > 0 ? plan.files_to_modify.join(', ') : 'None';
    content += `│ Files that may change: ${filesStr.slice(0, 50).padEnd(50)} │\n`;
    if (plan.assumptions.length > 0) {
      content += `│ Assumptions: ${plan.assumptions.join('; ').slice(0, 60).padEnd(60)} │\n`;
    }
    content += `│                                                                              │\n`;
    content += `│  ${Palette.ok('[ ↵ Approve plan ]')}   ${Palette.dim('[ e Edit ]')}   ${Palette.dim('[ Esc Reject ]')}                        │\n`;
    content += `╰${boxRule}╯\n`;
    return content;
  }
}
