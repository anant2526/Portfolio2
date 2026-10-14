/** Shared types for the /api/chat NDJSON stream and /api/tts responses. */

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatEvent =
  | { type: "meta"; mode: "live" | "demo" }
  | { type: "delta"; text: string }
  /** Discard text received so far for this reply (e.g. the model chain refused). */
  | { type: "reset" }
  | { type: "done" }
  | { type: "error"; message: string };

export type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type TtsResponse = {
  /** base64-encoded MP3 */
  audio: string;
  alignment: Alignment | null;
};
