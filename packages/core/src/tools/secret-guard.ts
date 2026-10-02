export class SecretGuard {
  private knownSecrets: Set<string> = new Set();
  private static SECRET_PATTERNS = [
    /\b(sk-[a-zA-Z0-9_-]{20,})\b/g, // OpenAI / Anthropic key
    /\b(gsk_[a-zA-Z0-9_-]{20,})\b/g, // Groq key
    /\b(AIzaSy[a-zA-Z0-9_-]{33})\b/g, // Google API key
    /\b(xox[baprs]-[0-9a-zA-Z]{10,48})\b/g, // Slack token
    /\b(ghp_[a-zA-Z0-9]{36})\b/g, // GitHub PAT
    /\b(ey[a-zA-Z0-9_-]{20,}\.ey[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})\b/g, // JWT
  ];

  public addSecret(secret: string): void {
    if (secret && secret.length >= 6) {
      this.knownSecrets.add(secret);
    }
  }

  public redact(text: string): string {
    if (!text) return text;
    let redacted = text;

    // Redact known secrets
    for (const secret of this.knownSecrets) {
      if (redacted.includes(secret)) {
        redacted = redacted.replaceAll(secret, '[REDACTED_SECRET]');
      }
    }

    // Redact regex patterns
    for (const pattern of SecretGuard.SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, '[REDACTED_KEY]');
    }

    return redacted;
  }

  public containsSecret(text: string): boolean {
    if (!text) return false;
    for (const secret of this.knownSecrets) {
      if (text.includes(secret)) return true;
    }
    for (const pattern of SecretGuard.SECRET_PATTERNS) {
      if (pattern.test(text)) return true;
    }
    return false;
  }
}
