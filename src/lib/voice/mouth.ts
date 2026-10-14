/**
 * Lip-sync state shared between the speech engine (writer) and the 3D avatars
 * (readers). It's a plain mutable singleton read inside `useFrame`, so mouth
 * movement never triggers React re-renders.
 */

/** The 15 Oculus/Meta visemes — the de-facto standard for avatar mouth shapes. */
export const VISEMES = [
  "sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U",
] as const;
export type Viseme = (typeof VISEMES)[number];

/** Each viseme as a blend of three simple mouth parameters (used by the holo head + ARKit rigs). */
const SHAPES: Record<Viseme, { jaw: number; wide: number; round: number; press: number }> = {
  sil: { jaw: 0, wide: 0, round: 0, press: 0 },
  PP: { jaw: 0, wide: 0, round: 0.1, press: 1 },
  FF: { jaw: 0.12, wide: 0.25, round: 0, press: 0.4 },
  TH: { jaw: 0.22, wide: 0.15, round: 0, press: 0 },
  DD: { jaw: 0.28, wide: 0.25, round: 0, press: 0 },
  kk: { jaw: 0.34, wide: 0.15, round: 0, press: 0 },
  CH: { jaw: 0.22, wide: 0, round: 0.55, press: 0 },
  SS: { jaw: 0.1, wide: 0.55, round: 0, press: 0 },
  nn: { jaw: 0.16, wide: 0.15, round: 0, press: 0 },
  RR: { jaw: 0.22, wide: 0, round: 0.45, press: 0 },
  aa: { jaw: 0.85, wide: 0.3, round: 0, press: 0 },
  E: { jaw: 0.5, wide: 0.6, round: 0, press: 0 },
  I: { jaw: 0.32, wide: 0.75, round: 0, press: 0 },
  O: { jaw: 0.6, wide: 0, round: 0.8, press: 0 },
  U: { jaw: 0.32, wide: 0, round: 1, press: 0 },
};

const VOWEL_CYCLE: Viseme[] = ["aa", "E", "O", "I", "aa", "U", "E"];

/** Maps the character at `i` (with one char of lookahead for digraphs) to a viseme. */
export function charToViseme(chars: ArrayLike<string>, i: number): Viseme {
  const c = (chars[i] ?? "").toLowerCase();
  const next = (chars[i + 1] ?? "").toLowerCase();
  const prev = (chars[i - 1] ?? "").toLowerCase();
  if ((c === "t" && next === "h") || (c === "h" && prev === "t")) return "TH";
  if ((c === "s" || c === "c") && next === "h") return "CH";
  if (c === "h" && (prev === "s" || prev === "c")) return "CH";
  switch (c) {
    case "a": return "aa";
    case "e": return "E";
    case "i": case "y": return "I";
    case "o": return "O";
    case "u": case "w": return "U";
    case "p": case "b": case "m": return "PP";
    case "f": case "v": return "FF";
    case "t": case "d": case "l": return "DD";
    case "n": return "nn";
    case "k": case "g": case "c": case "q": case "x": return "kk";
    case "j": return "CH";
    case "s": case "z": return "SS";
    case "r": return "RR";
    case "h": return "E";
    default: return "sil";
  }
}

export type MouthSample = {
  /** Current viseme, or null to drive the mouth from audio level alone. */
  viseme: Viseme | null;
  /** Loudness 0..1. */
  level: number;
};

export const mouth = {
  weights: Object.fromEntries(VISEMES.map((v) => [v, 0])) as Record<Viseme, number>,
  jaw: 0,
  wide: 0,
  round: 0,
  press: 0,
  level: 0,
  speaking: false,
};

let source: (() => MouthSample | null) | null = null;
let last = 0;
let wobble = 0;

/** The speech engine registers a sampler while audio is playing. */
export function setMouthSource(fn: (() => MouthSample | null) | null) {
  source = fn;
}

const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

/**
 * Advances the smoothed mouth state. Safe to call from several canvases in
 * the same frame — only the first call per ~frame does any work.
 */
export function updateMouth(now = performance.now()) {
  const elapsed = now - last;
  if (elapsed < 4) return;
  last = now;
  const dt = Math.min(0.1, elapsed / 1000);

  const sample = source?.() ?? null;
  mouth.speaking = sample !== null;
  mouth.level = approach(mouth.level, sample?.level ?? 0, sample ? 22 : 10, dt);

  let target: Viseme = "sil";
  if (sample?.viseme) {
    target = sample.viseme;
  } else if (sample && sample.level > 0.06) {
    // No timing data: cycle through vowels driven by loudness.
    wobble += dt * (6 + sample.level * 8);
    target = VOWEL_CYCLE[Math.floor(wobble) % VOWEL_CYCLE.length];
  }

  let jaw = 0, wide = 0, round = 0, press = 0;
  for (const v of VISEMES) {
    const goal = v === target ? 1 : 0;
    const w = approach(mouth.weights[v], goal, goal > mouth.weights[v] ? 26 : 14, dt);
    mouth.weights[v] = w;
    const s = SHAPES[v];
    jaw += s.jaw * w;
    wide += s.wide * w;
    round += s.round * w;
    press += s.press * w;
  }
  // Louder speech opens the mouth wider — makes syllables pop.
  const gain = sample ? 0.55 + 0.75 * mouth.level : 1;
  mouth.jaw = Math.min(1, jaw * gain);
  mouth.wide = Math.min(1, wide);
  mouth.round = Math.min(1, round);
  mouth.press = Math.min(1, press);
}
