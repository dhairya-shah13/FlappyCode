import { BannerRenderer } from '../banner.js';
import { StatusBarRenderer, StatusBarProps } from '../status-bar.js';
import { Palette } from '../palette.js';

export interface HomeScreenProps {
  status: StatusBarProps;
  width?: number;
  inputPrompt?: string;
  cursorPos?: number;
}

export interface HomeScreenLayout {
  output: string;
  cursorRow: number;
  cursorCol: number;
}

export class HomeScreen {
  public static renderLayout(props: HomeScreenProps): HomeScreenLayout {
    const width = props.width || process.stdout.columns || 100;
    const banner = BannerRenderer.renderBanner(width);
    const taglines = BannerRenderer.renderTaglines(width);

    // Box dimensions
    const boxWidth = Math.max(30, width - 2);
    const boxRule = '─'.repeat(boxWidth - 2);
    const promptGlyph = Palette.cyan(Palette.bold('>_'));

    // Prefix: `│ >_  `
    // '│ ' (2) + '>_' (2) + '  ' (2) = 6 visible characters
    // Suffix: '│' = 1 visible character
    // Total borders = 7 visible characters
    const innerTextWidth = Math.max(10, boxWidth - 7);

    const hasInput = props.inputPrompt !== undefined && props.inputPrompt.length > 0;
    const rawText = hasInput ? props.inputPrompt! : '';
    const placeholder = 'Type your coding request here...';

    let textContent: string;
    let visibleCursorOffset = 0;

    if (!hasInput) {
      textContent = Palette.subtle(placeholder);
      visibleCursorOffset = 0;
    } else {
      const pos = props.cursorPos !== undefined ? props.cursorPos : rawText.length;
      let windowStart = 0;
      if (pos > innerTextWidth) {
        windowStart = pos - innerTextWidth;
      }
      const windowText = rawText.slice(windowStart, windowStart + innerTextWidth);
      textContent = windowText;
      visibleCursorOffset = Math.min(pos - windowStart, innerTextWidth);
    }

    const textVisibleLength = hasInput ? textContent.length : placeholder.length;
    const paddingCount = Math.max(0, innerTextWidth - textVisibleLength);
    const padding = ' '.repeat(paddingCount);

    const boxTop = `╭${boxRule}╮`;
    const boxInput = `│ ${promptGlyph}  ${textContent}${padding}│`;
    const boxEmpty = `│${' '.repeat(boxWidth - 2)}│`;
    const boxBottom = `╰${boxRule}╯`;
    const inputBox = `${boxTop}\n${boxInput}\n${boxEmpty}\n${boxBottom}`;

    const statusBar = StatusBarRenderer.render({ ...props.status, width });

    const parts: string[] = [];
    if (banner) parts.push(banner);
    if (taglines) parts.push(taglines);
    parts.push(inputBox);
    parts.push(statusBar);

    const output = parts.join('\n\n');

    // Calculate cursorRow: locate 1-indexed line number of boxInput
    const lines = output.split('\n');
    let cursorRow = 1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('╭') && i + 1 < lines.length) {
        cursorRow = i + 2;
        break;
      }
    }

    const cursorCol = 7 + visibleCursorOffset;

    return {
      output,
      cursorRow,
      cursorCol,
    };
  }

  public static render(props: HomeScreenProps): string {
    return HomeScreen.renderLayout(props).output;
  }
}

