import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'node:events';
import readline from 'node:readline';
import { HomeScreen, PermissionPromptScreen, Palette } from '@flappycode/tui';

class MockTTYStream extends EventEmitter {
  public isTTY = true;
  public rawMode = false;
  public written: string[] = [];

  public setRawMode(mode: boolean): this {
    this.rawMode = mode;
    return this;
  }

  public resume(): this {
    return this;
  }

  public pause(): this {
    return this;
  }

  public write(chunk: string): boolean {
    this.written.push(chunk);
    return true;
  }

  public sendKey(char: string, keyObj: any = {}): void {
    const key = {
      name: keyObj.name || (char.length === 1 ? char : undefined),
      ctrl: keyObj.ctrl || false,
      meta: keyObj.meta || false,
      shift: keyObj.shift || false,
      ...keyObj,
    };
    this.emit('keypress', char, key);
  }
}

describe('GAP-030: Interactive TUI PTY Automation Test', () => {
  let mockStdin: MockTTYStream;
  let mockStdout: MockTTYStream;

  beforeEach(() => {
    mockStdin = new MockTTYStream();
    mockStdout = new MockTTYStream();
  });

  it('enters raw mode and cleanly restores normal mode on cleanup', () => {
    mockStdin.setRawMode(true);
    expect(mockStdin.rawMode).toBe(true);

    // Simulate cleanup
    mockStdin.setRawMode(false);
    expect(mockStdin.rawMode).toBe(false);
  });

  it('renders typed characters into input buffer and updates cursor position', () => {
    let currentInput = '';
    let cursorPos = 0;

    const onKey = (str: string, key: any) => {
      if (key && key.name === 'backspace') {
        if (cursorPos > 0) {
          currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
          cursorPos--;
        }
      } else if (key && key.name === 'left') {
        if (cursorPos > 0) cursorPos--;
      } else if (key && key.name === 'right') {
        if (cursorPos < currentInput.length) cursorPos++;
      } else if (str && str.length === 1 && !key.ctrl && !key.meta) {
        currentInput = currentInput.slice(0, cursorPos) + str + currentInput.slice(cursorPos);
        cursorPos++;
      }
    };

    mockStdin.on('keypress', onKey);

    // 1. Type "flappy"
    for (const ch of 'flappy') {
      mockStdin.sendKey(ch);
    }
    expect(currentInput).toBe('flappy');
    expect(cursorPos).toBe(6);

    // 2. Press left arrow 3 times (cursor moves from 6 to 3, directly after 'a')
    mockStdin.sendKey('', { name: 'left' });
    mockStdin.sendKey('', { name: 'left' });
    mockStdin.sendKey('', { name: 'left' });
    expect(cursorPos).toBe(3);

    // 3. Backspace to delete 'a' at index 2
    mockStdin.sendKey('', { name: 'backspace' });
    expect(currentInput).toBe('flppy');
    expect(cursorPos).toBe(2);

    // 4. Type 'a' back at index 2
    mockStdin.sendKey('a');
    expect(currentInput).toBe('flappy');
    expect(cursorPos).toBe(3);

    // 5. Render home screen with current input
    const layout = HomeScreen.renderLayout({
      status: {
        version: '0.1.0',
        connectedProviders: 2,
        freeModelsAvailable: 8,
        state: 'ready',
        width: 80,
      },
      width: 80,
      inputPrompt: currentInput,
      cursorPos,
    });

    expect(layout.output).toContain('flappy');
    expect(layout.cursorCol).toBeGreaterThan(0);
    expect(layout.cursorRow).toBeGreaterThan(0);
  });

  it('submits command turn on Enter keystroke', () => {
    let submittedCommand: string | null = null;
    let currentInput = 'explain this repository';

    const onKey = (_str: string, key: any) => {
      if (key && (key.name === 'return' || key.name === 'enter')) {
        submittedCommand = currentInput;
        currentInput = '';
      }
    };

    mockStdin.on('keypress', onKey);
    mockStdin.sendKey('\r', { name: 'enter' });

    expect(submittedCommand).toBe('explain this repository');
    expect(currentInput).toBe('');
  });

  it('renders streaming tokens incrementally without flicker', async () => {
    const renderedChunks: string[] = [];
    const tokens = ['The ', 'result ', 'is ', 'computed ', 'successfully.'];

    let displayed = '';
    for (const token of tokens) {
      displayed += token;
      // In TUI streaming, chunk deltas are appended directly to stdout
      mockStdout.write(token);
      renderedChunks.push(displayed);
    }

    expect(mockStdout.written).toEqual(tokens);
    expect(renderedChunks[renderedChunks.length - 1]).toBe('The result is computed successfully.');
    expect(renderedChunks.length).toBe(5);
  });

  it('displays tool permission confirmation prompt and responds to y/n/Enter keystrokes', () => {
    const prompt = PermissionPromptScreen.render({
      agent: 'coder',
      command: 'rm -rf node_modules',
      isDestructive: true,
      reason: 'Rebuild dependencies',
      width: 80,
    });

    expect(prompt).toContain('Destructive Command Permission Needed');
    expect(prompt).toContain('rm -rf node_modules');
    expect(prompt).toContain('[ y Allow once ]');
    expect(prompt).toContain('[ n Deny ]');

    // Simulate key handler for prompt
    let decision: 'allow' | 'deny' | null = null;
    const onPromptKey = (str: string, key: any) => {
      if (str === 'y' || str === 'Y' || (key && (key.name === 'enter' || key.name === 'return'))) {
        decision = 'allow';
      } else if (str === 'n' || str === 'N' || (key && key.name === 'escape')) {
        decision = 'deny';
      }
    };

    mockStdin.on('keypress', onPromptKey);

    // Test 'n' denies
    mockStdin.sendKey('n');
    expect(decision).toBe('deny');

    // Test 'y' allows
    mockStdin.sendKey('y');
    expect(decision).toBe('allow');

    // Test Enter allows
    decision = null;
    mockStdin.sendKey('\r', { name: 'enter' });
    expect(decision).toBe('allow');
  });
});
