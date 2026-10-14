import type { Alignment, TtsResponse } from "@/lib/chat-protocol";
import { charToViseme, setMouthSource } from "./mouth";

export type VoiceKind = "cloned" | "browser";
export type EngineState = {
  speaking: boolean;
  /** The sentence currently being spoken (for live captions). */
  caption: string;
  /** Which voice is actually being used — null until the first sentence plays. */
  voice: VoiceKind | null;
};

type Prepared =
  | { kind: "audio"; buffer: AudioBuffer; alignment: Alignment | null }
  | { kind: "browser" };

type Segment = { text: string; prepared: Promise<Prepared | null> };

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function pickBrowserVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const base = lang.split("-")[0];
  const matching = voices.filter((v) => v.lang === lang || v.lang.startsWith(base));
  return (
    matching.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) ??
    matching.find((v) => /google/i.test(v.name)) ??
    matching[0]
  );
}

/**
 * Turns text chunks into speech, in order, while publishing lip-sync data.
 *
 *  1. Tries /api/tts (your ElevenLabs cloned voice + per-character timings).
 *  2. Falls back to the browser's built-in speechSynthesis if the voice isn't
 *     configured or a request fails.
 *
 * TTS requests run one at a time (friendly to ElevenLabs concurrency limits)
 * but ahead of playback, so the next sentence is usually ready before the
 * current one finishes.
 */
export class SpeechEngine {
  state: EngineState = { speaking: false, caption: "", voice: null };

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeData: Float32Array<ArrayBuffer> | null = null;
  private queue: Segment[] = [];
  private playing = false;
  private generation = 0;
  private prepChain: Promise<unknown> = Promise.resolve();
  private aborts = new Set<AbortController>();
  private current: AudioBufferSourceNode | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private clonedAvailable: boolean | null = null;
  private synthPrimed = false;
  private lastText = "";
  private listeners = new Set<(s: EngineState) => void>();

  constructor(private readonly lang = "en-US") {}

  subscribe(fn: (s: EngineState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private update(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /** Skip /api/tts entirely when the server says no cloned voice is configured. */
  setClonedAvailable(available: boolean) {
    this.clonedAvailable = available;
  }

  /** Call from a user gesture (click / key press) so browsers allow audio playback. */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.15;
      this.analyser.connect(this.ctx.destination);
      this.timeData = new Float32Array(this.analyser.fftSize);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    // iOS only lets speechSynthesis talk after a speak() inside a user gesture,
    // so prime it with a silent utterance for the browser-voice fallback.
    if (!this.synthPrimed && window.speechSynthesis) {
      this.synthPrimed = true;
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  }

  enqueue(text: string) {
    const gen = this.generation;
    const previous = this.lastText;
    this.lastText = text;
    const prepared = this.prepChain
      .then(() => (gen === this.generation ? this.prepare(text, previous) : null))
      .catch(() => null);
    this.prepChain = prepared;
    this.queue.push({ text, prepared });
    void this.pump();
  }

  /** Stops speaking immediately and drops everything queued. */
  stop() {
    this.generation++;
    this.queue = [];
    this.playing = false;
    this.lastText = "";
    for (const a of this.aborts) a.abort();
    this.aborts.clear();
    this.prepChain = Promise.resolve();
    try {
      this.current?.stop();
    } catch {
      // already stopped
    }
    this.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setMouthSource(null);
    if (this.state.speaking || this.state.caption) this.update({ speaking: false, caption: "" });
  }

  private async prepare(text: string, previousText: string): Promise<Prepared | null> {
    if (this.clonedAvailable === false || !this.ctx) return { kind: "browser" };
    const ac = new AbortController();
    this.aborts.add(ac);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, previousText }),
        signal: ac.signal,
      });
      if (res.status === 501) {
        this.clonedAvailable = false;
        return { kind: "browser" };
      }
      if (!res.ok) return { kind: "browser" };
      const data = (await res.json()) as TtsResponse;
      const buffer = await this.ctx.decodeAudioData(base64ToArrayBuffer(data.audio));
      this.clonedAvailable = true;
      return { kind: "audio", buffer, alignment: data.alignment };
    } catch {
      return ac.signal.aborted ? null : { kind: "browser" };
    } finally {
      this.aborts.delete(ac);
    }
  }

  private async pump() {
    if (this.playing) return;
    const seg = this.queue[0];
    if (!seg) {
      setMouthSource(null);
      if (this.state.speaking) this.update({ speaking: false, caption: "" });
      return;
    }
    this.playing = true;
    const gen = this.generation;
    const prepared = await seg.prepared;
    if (gen !== this.generation) return;
    this.queue.shift();
    if (prepared) {
      this.update({
        speaking: true,
        caption: seg.text,
        voice: prepared.kind === "audio" ? "cloned" : "browser",
      });
      if (prepared.kind === "audio") await this.playAudio(prepared.buffer, prepared.alignment);
      else await this.playBrowser(seg.text);
    }
    if (gen !== this.generation) return;
    this.playing = false;
    void this.pump();
  }

  private readLevel(): number {
    if (!this.analyser || !this.timeData) return 0;
    this.analyser.getFloatTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) sum += this.timeData[i] * this.timeData[i];
    const rms = Math.sqrt(sum / this.timeData.length);
    return Math.min(1, Math.max(0, (rms - 0.006) * 7));
  }

  private playAudio(buffer: AudioBuffer, alignment: Alignment | null): Promise<void> {
    const ctx = this.ctx!;
    return new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.analyser!);
      const startAt = ctx.currentTime + 0.03;
      let idx = 0;

      setMouthSource(() => {
        const level = this.readLevel();
        const t = ctx.currentTime - startAt;
        if (!alignment || t < 0) return { viseme: null, level };
        const starts = alignment.character_start_times_seconds;
        const ends = alignment.character_end_times_seconds;
        while (idx < ends.length - 1 && ends[idx] < t) idx++;
        const inside = t >= starts[idx] && t <= ends[idx];
        return { viseme: inside ? charToViseme(alignment.characters, idx) : "sil", level };
      });

      src.onended = () => {
        if (this.current === src) this.current = null;
        resolve();
      };
      this.current = src;
      src.start(startAt);
    });
  }

  private playBrowser(text: string): Promise<void> {
    return new Promise((resolve) => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang;
      const voice = pickBrowserVoice(this.lang);
      if (voice) u.voice = voice;
      u.rate = 1.03;

      const startedAt = performance.now();
      let word = { start: 0, len: 0, at: startedAt };
      let gotBoundary = false;

      // Browser voices don't expose audio, so animate from word-boundary events.
      setMouthSource(() => {
        const now = performance.now();
        if (!gotBoundary) {
          const t = (now - startedAt) / 1000;
          return { viseme: null, level: 0.35 + 0.4 * Math.abs(Math.sin(t * 8.5)) * (0.7 + 0.3 * Math.sin(t * 2.1)) };
        }
        const k = Math.floor((now - word.at) / 65);
        if (k >= word.len) return { viseme: "sil", level: 0.12 };
        return { viseme: charToViseme(text, word.start + k), level: 0.75 };
      });

      u.onboundary = (e) => {
        if (e.name && e.name !== "word") return;
        gotBoundary = true;
        const rest = text.slice(e.charIndex);
        const len = e.charLength || (rest.match(/^\S+/)?.[0].length ?? 4);
        word = { start: e.charIndex, len, at: performance.now() };
      };
      // Some browsers/devices with no installed voices never fire `onend`;
      // don't let that stall the queue forever.
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        resolve();
      };
      const watchdog = window.setTimeout(finish, 2500 + text.length * 110);
      u.onend = finish;
      u.onerror = finish;
      // Keep a reference: Chrome can garbage-collect in-flight utterances and drop `onend`.
      this.utterance = u;
      synth.speak(u);
    });
  }
}
