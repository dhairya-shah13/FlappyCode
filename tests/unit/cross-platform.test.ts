import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { getUserConfigPath } from '@flappycode/core';
import { getLogDir } from '@flappycode/core';
import { getDefaultDatabasePath } from '@flappycode/storage';
import { FsJail } from '@flappycode/core';

describe('GAP-059: Cross-Platform Verification Tests', () => {
  const origEnv = { ...process.env };
  const origPlatform = process.platform;

  beforeEach(() => {
    delete process.env.FLAPPYCODE_CONFIG_PATH;
    delete process.env.FLAPPYCODE_LOG_DIR;
    delete process.env.FLAPPYCODE_DB_PATH;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    Object.defineProperty(process, 'platform', { value: origPlatform });
  });

  describe('User Config Path Resolution Across Platforms', () => {
    it('resolves %APPDATA%\\flappycode\\config.json on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.APPDATA = 'C:\\Users\\TestUser\\AppData\\Roaming';
      const configPath = getUserConfigPath();
      expect(configPath).toBe(path.join('C:\\Users\\TestUser\\AppData\\Roaming', 'flappycode', 'config.json'));
    });

    it('resolves ~/Library/Application Support/flappycode/config.json on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      delete process.env.APPDATA;
      const configPath = getUserConfigPath();
      expect(configPath).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'flappycode', 'config.json'));
    });

    it('resolves ~/.config/flappycode/config.json or $XDG_CONFIG_HOME on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      delete process.env.APPDATA;
      process.env.XDG_CONFIG_HOME = '/custom/xdg/config';
      const configPath = getUserConfigPath();
      expect(configPath).toBe(path.join('/custom/xdg/config', 'flappycode', 'config.json'));

      delete process.env.XDG_CONFIG_HOME;
      const defaultLinuxPath = getUserConfigPath();
      expect(defaultLinuxPath).toBe(path.join(os.homedir(), '.config', 'flappycode', 'config.json'));
    });
  });

  describe('Log Directory Resolution Across Platforms', () => {
    it('resolves %LOCALAPPDATA%\\flappycode\\logs on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.LOCALAPPDATA = 'C:\\Users\\TestUser\\AppData\\Local';
      const logDir = getLogDir();
      expect(logDir).toBe(path.join('C:\\Users\\TestUser\\AppData\\Local', 'flappycode', 'logs'));
    });

    it('resolves ~/Library/Logs/flappycode on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const logDir = getLogDir();
      expect(logDir).toBe(path.join(os.homedir(), 'Library', 'Logs', 'flappycode'));
    });

    it('resolves $XDG_STATE_HOME/flappycode/logs or fallback on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_STATE_HOME = '/custom/state';
      const logDir = getLogDir();
      expect(logDir).toBe(path.join('/custom/state', 'flappycode', 'logs'));
    });
  });

  describe('Database Path Resolution Across Platforms', () => {
    it('resolves %LOCALAPPDATA%\\flappycode\\flappycode.db on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const tempLocal = path.join(os.tmpdir(), `flappy_localappdata_${Date.now()}`);
      fs.mkdirSync(tempLocal, { recursive: true });
      process.env.LOCALAPPDATA = tempLocal;
      const dbPath = getDefaultDatabasePath();
      expect(dbPath).toContain('flappycode.db');
      expect(dbPath).toContain(tempLocal);
      try {
        fs.rmSync(tempLocal, { recursive: true, force: true });
      } catch {}
    });

    it('resolves ~/Library/Application Support/flappycode/flappycode.db on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const dbPath = getDefaultDatabasePath();
      expect(dbPath).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'flappycode', 'flappycode.db'));
    });

    it('resolves $XDG_DATA_HOME/flappycode/flappycode.db on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_DATA_HOME = '/custom/share';
      const dbPath = getDefaultDatabasePath();
      expect(dbPath).toBe(path.join('/custom/share', 'flappycode', 'flappycode.db'));
    });
  });

  describe('FsJail Path Normalization Across Path Formats', () => {
    const tempRoot = path.join(os.tmpdir(), `flappy_xplat_${Date.now()}`);
    let jail: FsJail;

    beforeEach(() => {
      fs.mkdirSync(tempRoot, { recursive: true });
      jail = new FsJail(tempRoot);
    });

    afterEach(() => {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {}
    });

    it('normalizes forward slash paths correctly regardless of platform', () => {
      const safe = jail.resolveSafePath('src/components/button.tsx');
      expect(safe).toBe(path.normalize(path.join(tempRoot, 'src/components/button.tsx')));
    });

    it('normalizes backslash paths correctly regardless of platform', () => {
      const safe = jail.resolveSafePath('src\\components\\button.tsx');
      expect(safe).toBe(path.normalize(path.join(tempRoot, 'src/components/button.tsx')));
    });

    it('treats leading slash as repo-relative rather than root drive escape', () => {
      const safe = jail.resolveSafePath('/src/index.ts');
      expect(safe).toBe(path.normalize(path.join(tempRoot, 'src/index.ts')));
    });

    it('prevents parent directory traversal escapes (../)', () => {
      expect(() => {
        jail.resolveSafePath('../../escaped.txt');
      }).toThrow(/Security Violation/);
    });
  });
});
