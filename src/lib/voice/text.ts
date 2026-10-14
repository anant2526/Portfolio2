/** Strips markdown / URLs so the voice doesn't read out symbols. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "the link")
    .replace(/[*_#>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits streaming text into speakable chunks at sentence boundaries, so the
 * first sentence can be voiced while Claude is still writing the rest.
 */
export class SentenceChunker {
  private buffer = "";
  private emitted = 0;

  constructor(private readonly onChunk: (chunk: string) => void) {}

  push(delta: string) {
    this.buffer += delta;
    // The first chunk is emitted as early as possible for low latency;
    // later chunks are grouped into fuller phrases for natural prosody.
    const min = this.emitted === 0 ? 12 : 60;
    const re = /[.!?…]+["')\]]?(?=\s)|[;:—](?=\s)|\n+/g;
    let cut = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buffer))) {
      const end = m.index + m[0].length;
      if (end >= min) {
        cut = end;
        if (this.emitted === 0) break;
      }
    }
    // Safety valve for very long unpunctuated runs (TTS requests are size-capped).
    if (cut < 0 && this.buffer.length > 360) {
      const space = this.buffer.lastIndexOf(" ");
      if (space > 0) cut = space;
    }
    if (cut > 0) {
      this.emit(this.buffer.slice(0, cut));
      this.buffer = this.buffer.slice(cut);
    }
  }

  flush() {
    this.emit(this.buffer);
    this.buffer = "";
  }

  reset() {
    this.buffer = "";
    this.emitted = 0;
  }

  private emit(raw: string) {
    const text = cleanForSpeech(raw);
    if (/[a-z0-9]/i.test(text)) {
      this.emitted += 1;
      this.onChunk(text);
    }
  }
}
