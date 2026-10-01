import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const SERVICE_NAME = 'flappycode';

export interface SecretStore {
  setSecret(providerId: string, secret: string): Promise<void>;
  getSecret(providerId: string): Promise<string | null>;
  deleteSecret(providerId: string): Promise<void>;
  resolveSecretRef(ref: string | undefined): Promise<string | null>;
  isKeychainActive(): boolean;
}

export class HybridSecretStore implements SecretStore {
  private useFallback: boolean = false;
  private readonly fallbackFilePath: string;
  private readonly fallbackKey: Buffer;
  private keyringModule: any = null;

  constructor(customFallbackPath?: string, passphrase?: string) {
    const isWindows = process.platform === 'win32';
    let baseDir: string;
    if (isWindows) {
      baseDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    } else {
      baseDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    }
    const flappyDir = path.join(baseDir, 'flappycode');
    if (!fs.existsSync(flappyDir)) {
      fs.mkdirSync(flappyDir, { recursive: true });
    }
    this.fallbackFilePath = customFallbackPath || path.join(flappyDir, 'secrets.enc');
    const saltPath = path.join(flappyDir, 'salt.bin');

    // GAP-037: Never derive encryption key from predictable machine attributes (hostname, username, platform).
    // Use a randomly generated per-install salt and strong KDF (scrypt) with a passphrase or secure per-install secret.
    let salt: Buffer;
    if (fs.existsSync(saltPath)) {
      salt = fs.readFileSync(saltPath);
    } else {
      salt = crypto.randomBytes(32);
      fs.writeFileSync(saltPath, salt, { mode: 0o600 });
    }

    const effectivePassphrase =
      passphrase ||
      process.env.FLAPPYCODE_PASSPHRASE ||
      (() => {
        const keyFile = path.join(flappyDir, 'key.bin');
        if (!fs.existsSync(keyFile)) {
          const generated = crypto.randomBytes(32).toString('hex');
          fs.writeFileSync(keyFile, generated, { mode: 0o600 });
          return generated;
        }
        return fs.readFileSync(keyFile, 'utf8').trim();
      })();

    this.fallbackKey = crypto.scryptSync(effectivePassphrase, salt, 32, {
      N: 16384,
      r: 8,
      p: 1,
    });

    try {
      // Attempt to load native keyring
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.keyringModule = require('@napi-rs/keyring');
      this.useFallback = false;
    } catch {
      this.useFallback = true;
    }
  }

  public isKeychainActive(): boolean {
    return !this.useFallback && this.keyringModule !== null;
  }

  public async setSecret(providerId: string, secret: string): Promise<void> {
    const account = `provider:${providerId}`;
    if (!this.useFallback && this.keyringModule) {
      try {
        await this.keyringModule.setPassword(SERVICE_NAME, account, secret);
        return;
      } catch {
        // Fall back to encrypted file if keychain operation fails
        this.useFallback = true;
      }
    }

    const secrets = this.readEncryptedStore();
    secrets[account] = secret;
    this.writeEncryptedStore(secrets);
  }

  public async getSecret(providerId: string): Promise<string | null> {
    const account = `provider:${providerId}`;
    if (!this.useFallback && this.keyringModule) {
      try {
        const password = await this.keyringModule.getPassword(SERVICE_NAME, account);
        if (password) return password;
      } catch {
        this.useFallback = true;
      }
    }

    const secrets = this.readEncryptedStore();
    return secrets[account] || null;
  }

  public async deleteSecret(providerId: string): Promise<void> {
    const account = `provider:${providerId}`;
    if (!this.useFallback && this.keyringModule) {
      try {
        await this.keyringModule.deletePassword(SERVICE_NAME, account);
      } catch {
        this.useFallback = true;
      }
    }

    const secrets = this.readEncryptedStore();
    if (account in secrets) {
      delete secrets[account];
      this.writeEncryptedStore(secrets);
    }
  }

  public async resolveSecretRef(ref: string | undefined): Promise<string | null> {
    if (!ref) return null;
    if (ref.startsWith('env:')) {
      const varName = ref.slice(4);
      return process.env[varName] || null;
    }
    if (ref.startsWith('keychain:') || ref.startsWith('provider:')) {
      const providerId = ref.split(':')[1];
      return this.getSecret(providerId);
    }
    // Return direct string if passed as value
    return ref;
  }

  private readEncryptedStore(): Record<string, string> {
    if (!fs.existsSync(this.fallbackFilePath)) {
      return {};
    }
    try {
      const raw = fs.readFileSync(this.fallbackFilePath, 'utf8');
      const data = JSON.parse(raw);
      if (!data.iv || !data.tag || !data.ciphertext) {
        return {};
      }
      const iv = Buffer.from(data.iv, 'hex');
      const tag = Buffer.from(data.tag, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.fallbackKey, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(data.ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch {
      return {};
    }
  }

  private writeEncryptedStore(secrets: Record<string, string>): void {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.fallbackKey, iv);
    let ciphertext = cipher.update(JSON.stringify(secrets), 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag();

    const payload = {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      ciphertext,
    };
    fs.writeFileSync(this.fallbackFilePath, JSON.stringify(payload, null, 2), {
      mode: 0o600,
    });
  }
}
