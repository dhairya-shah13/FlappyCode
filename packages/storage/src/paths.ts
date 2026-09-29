import os from 'node:os';
import path from 'node:path';

export function getStorageDir(customHome?: string): string {
  if (customHome) {
    return path.resolve(customHome);
  }

  if (process.env.FLAPPYCODE_HOME) {
    return path.resolve(process.env.FLAPPYCODE_HOME);
  }

  const platform = process.platform;

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      return path.join(localAppData, 'flappycode');
    }
    const appData = process.env.APPDATA;
    if (appData) {
      return path.join(appData, 'flappycode');
    }
    return path.join(os.homedir(), 'AppData', 'Local', 'flappycode');
  }

  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'flappycode');
  }

  // Linux / BSD / other POSIX
  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return path.join(xdgDataHome, 'flappycode');
  }
  return path.join(os.homedir(), '.local', 'share', 'flappycode');
}

export function getDatabasePath(customPath?: string): string {
  if (customPath) {
    return customPath === ':memory:' ? ':memory:' : path.resolve(customPath);
  }

  if (process.env.FLAPPYCODE_DB_PATH) {
    return process.env.FLAPPYCODE_DB_PATH === ':memory:'
      ? ':memory:'
      : path.resolve(process.env.FLAPPYCODE_DB_PATH);
  }

  return path.join(getStorageDir(), 'flappycode.db');
}
