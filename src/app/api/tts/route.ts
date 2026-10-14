import type { Alignment, TtsResponse } from "@/lib/chat-protocol";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 700;

type ElevenLabsTimestampsResponse = {
  audio_base64: string;
  alignment?: Alignment | null;
  normalized_alignment?: Alignment | null;
};

/**
 * Text → speech in YOUR cloned voice (ElevenLabs), with per-character timings
 * that drive the avatar's lip-sync. Returns 501 when not configured so the
 * client can fall back to the browser's built-in voice.
 */
export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return Response.json({ error: "Voice cloning is not configured." }, { status: 501 });
  }

  const body = (await req.json().catch(() => null)) as { text?: unknown; previousText?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_CHARS) {
    return Response.json({ error: `Expected { text } of 1–${MAX_CHARS} characters.` }, { status: 400 });
  }
  const previousText =
    typeof body?.previousText === "string" ? body.previousText.slice(-MAX_CHARS) : undefined;

  if (!rateLimit(`tts:${clientKey(req)}`, 120, 5 * 60_000)) {
    return Response.json({ error: "Too many voice requests." }, { status: 429 });
  }

  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        // Lets ElevenLabs keep intonation continuous across sentence chunks.
        ...(previousText ? { previous_text: previousText } : {}),
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.85,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
      signal: req.signal,
    });
  } catch (err) {
    if (!req.signal.aborted) console.error("[tts] Network error:", err);
    return Response.json({ error: "Voice service unreachable." }, { status: 502 });
  }

  if (!res.ok) {
    console.error(`[tts] ElevenLabs ${res.status}:`, (await res.text()).slice(0, 300));
    return Response.json({ error: "Voice synthesis failed." }, { status: 502 });
  }

  const data = (await res.json()) as ElevenLabsTimestampsResponse;
  const payload: TtsResponse = {
    audio: data.audio_base64,
    // normalized_alignment follows the spoken form ("2026" → "twenty twenty-six"), better for mouth shapes.
    alignment: data.normalized_alignment ?? data.alignment ?? null,
  };
  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
