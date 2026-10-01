export class Palette {
  public static isNoColor(): boolean {
    return Boolean(process.env.NO_COLOR || process.env.FLAPPYCODE_PLAIN === '1');
  }

  public static isAsciiOnly(): boolean {
    return Boolean(process.env.FLAPPYCODE_ASCII === '1');
  }

  // Hex approximate colors per CLIDesign.md §3.1
  // Yellow: 38;2;255;199;44
  // Cyan: 38;2;0;183;255
  // Light Blue: 38;2;127;178;255
  // Green: 38;2;46;229;157
  // Red: 38;2;255;92;92
  // Orange: 38;2;255;122;47

  public static yellow(text: string): string {
    if (this.isNoColor()) return text;
    return `\x1b[38;2;255;199;44m${text}\x1b[0m`;
  }

  public static cyan(text: string): string {
    if (this.isNoColor()) return text;
    return `\x1b[38;2;0;183;255m${text}\x1b[0m`;
  }

  public static subtle(text: string): string {
    if (this.isNoColor()) return text;
    return `\x1b[38;2;127;178;255m${text}\x1b[0m`;
  }

  public static ok(text: string): string {
    if (this.isNoColor()) return text;
    return `\x1b[38;2;46;229;157m${text}\x1b[0m`;
  }

  public static error(text: string): string {
    if (this.isNoColor()) return text;
    return `\x1b[38;2;255;92;92m${text}\x1b[0m`;
  }

  public static orange(text: string): string {
    if (this.isNoColor()) return text;
    return `\x1b[38;2;255;122;47m${text}\x1b[0m`;
  }

  public static bold(text: string): string {
    if (this.isNoColor()) return text;
    return `\x1b[1m${text}\x1b[0m`;
  }

  public static dim(text: string): string {
    if (this.isNoColor()) return text;
    return `\x1b[2m${text}\x1b[0m`;
  }
}
