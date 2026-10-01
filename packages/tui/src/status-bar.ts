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
    const rule = '─'.repeat(Math.max(20, props.width));

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

    if (props.width < 70) {
      // Compact status bar per CLIDesign.md §4.1
      const compactText = `${birdIcon} v${props.version} │ ${props.connectedProviders} prov │ ${Palette.ok(
        String(props.freeModelsAvailable)
      )} free │ ${stateStr}`;
      return `${Palette.cyan(rule)}\n ${compactText}\n${Palette.cyan(rule)}`;
    }

    // Full 3-part status bar
    const left = `${birdIcon} FlappyCode v${props.version}`;
    const center = `[📶] Providers: ${Palette.ok(String(props.connectedProviders))} connected │ Free models: ${Palette.ok(
      String(props.freeModelsAvailable)
    )} available`;
    const right = stateStr;

    return `${Palette.cyan(rule)}\n ${left}    ${center}    ${right}\n${Palette.cyan(rule)}`;
  }
}
