import { Palette } from './palette.js';

export interface StatusBarProps {
  version: string;
  connectedProviders: number;
  freeModelsAvailable: number;
  state: 'ready' | 'working' | 'waiting_approval' | 'pool_exhausted' | 'no_providers' | 'offline';
  workingInfo?: string;
  width: number;
}

export class StatusBarRenderer {
  public static render(props: StatusBarProps): string {
    const isAscii = Palette.isAsciiOnly();
    const birdIcon = isAscii ? '<o)' : '🐦';
    const sep = isAscii ? '|' : '│';
    const rule = (isAscii ? '-' : '─').repeat(Math.max(10, props.width));

    let stateStr = '';
    switch (props.state) {
      case 'ready':
        stateStr = Palette.ok(isAscii ? 'Ready!' : '⚡ Ready!');
        break;
      case 'working':
        stateStr = Palette.cyan(props.workingInfo ? `◐ ${props.workingInfo}` : '◐ Working…');
        break;
      case 'waiting_approval':
        stateStr = Palette.yellow('● Waiting for approval');
        break;
      case 'pool_exhausted':
        stateStr = Palette.error('✖ Free pool exhausted');
        break;
      case 'no_providers':
        stateStr = Palette.yellow('○ No providers — press / then "providers add"');
        break;
      case 'offline':
        stateStr = Palette.dim('○ Offline');
        break;
    }

    if (props.width < 45) {
      // Ultra-compact status bar for narrow terminals
      const ultraCompact = `${birdIcon} ${Palette.ok(String(props.freeModelsAvailable))} free ${sep} ${stateStr}`;
      return `${Palette.cyan(rule)}\n ${ultraCompact}\n${Palette.cyan(rule)}`;
    }

    if (props.width < 70) {
      // Compact status bar per CLIDesign.md §4.1
      const compactText = `${birdIcon} v${props.version} ${sep} ${props.connectedProviders} prov ${sep} ${Palette.ok(
        String(props.freeModelsAvailable)
      )} free ${sep} ${stateStr}`;
      return `${Palette.cyan(rule)}\n ${compactText}\n${Palette.cyan(rule)}`;
    }

    // Full 3-part status bar
    const left = `${birdIcon} FlappyCode v${props.version}`;
    const center = `[📶] Providers: ${Palette.ok(String(props.connectedProviders))} connected ${sep} Free models: ${Palette.ok(
      String(props.freeModelsAvailable)
    )} available`;
    const right = stateStr;

    return `${Palette.cyan(rule)}\n ${left}    ${center}    ${right}\n${Palette.cyan(rule)}`;
  }
}
