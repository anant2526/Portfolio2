import Anthropic from "@anthropic-ai/sdk";
import { demoReply } from "@/lib/demo";
import { buildSystemPrompt } from "@/lib/persona";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import type { ChatEvent, ChatTurn } from "@/lib/chat-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];
const EFFORT: Effort = EFFORTS.includes(process.env.ANTHROPIC_EFFORT as Effort)
  ? (process.env.ANTHROPIC_EFFORT as Effort)
  : "low"; // chat replies are short and spoken; low effort keeps latency down
// Server-side refusal fallbacks are only accepted by these models.
const SUPPORTS_FALLBACKS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-sonnet-5-5",
]);

const SYSTEM_PROMPT = buildSystemPrompt();
const MAX_TURNS = 16;
const MAX_USER_CHARS = 800;
const MAX_ASSISTANT_CHARS = 2400;

const REFUSAL_LINE =
  "Hmm, that's not something my twin can answer. Ask me about my work, my projects, or how this site works!";
const ERROR_LINE =
  "Sorry, my brain glitched for a second there. Mind asking that again?";

let client: Anthropic | null = null;

function sanitize(input: unknown): ChatTurn[] | null {
  if (!Array.isArray(input)) return null;
  const turns: ChatTurn[] = [];
  for (const m of input.slice(-MAX_TURNS)) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const text = content.trim().slice(0, role === "user" ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS);
    if (!text) continue;
    turns.push({ role, content: text });
  }
  // The API requires the conversation to start with a user turn.
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

const encoder = new TextEncoder();
const line = (e: ChatEvent) => encoder.encode(JSON.stringify(e) + "\n");

function ndjson(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

/** Streams a canned reply word by word so demo mode feels like the real thing. */
function demoStream(text: string) {
  const words = text.split(/(\s+)/);
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line({ type: "meta", mode: "demo" }));
      for (const w of words) {
        controller.enqueue(line({ type: "delta", text: w }));
        await new Promise((r) => setTimeout(r, 18));
      }
      controller.enqueue(line({ type: "done" }));
      controller.close();
    },
  });
}

/** Lets the UI show which brain / voice is active before the first message. */
export async function GET() {
  const live = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const cloned = Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
  return Response.json(
    { mode: live ? "live" : "demo", voice: cloned ? "cloned" : "browser" },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { messages?: unknown } | null;
  const messages = sanitize(body?.messages);
  if (!messages) {
    return Response.json({ error: "Expected { messages: [...] } ending with a user turn." }, { status: 400 });
  }

  if (!rateLimit(`chat:${clientKey(req)}`, 30, 5 * 60_000)) {
    return Response.json({ error: "You're talking faster than I can think — try again in a minute." }, { status: 429 });
  }

  const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (!hasCredentials) {
    return ndjson(demoStream(demoReply(messages[messages.length - 1].content)));
  }

  client ??= new Anthropic();
  const useFallbacks = SUPPORTS_FALLBACKS.has(MODEL);

  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      // Replies are deliberately short (they're spoken aloud); this also caps cost on a public endpoint.
      max_tokens: 4096,
      output_config: { effort: EFFORT },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal: req.signal },
  );

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line({ type: "meta", mode: "live" }));
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(line({ type: "delta", text: event.delta.text }));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          // Every model in the fallback chain declined: drop any partial text.
          controller.enqueue(line({ type: "reset" }));
          controller.enqueue(line({ type: "delta", text: REFUSAL_LINE }));
        }
        controller.enqueue(line({ type: "done" }));
      } catch (err) {
        if (!req.signal.aborted) {
          if (err instanceof Anthropic.AuthenticationError) {
            console.error("[chat] Invalid ANTHROPIC_API_KEY");
          } else if (err instanceof Anthropic.RateLimitError) {
            console.error("[chat] Anthropic rate limit hit");
          } else if (err instanceof Anthropic.APIError) {
            console.error(`[chat] Anthropic API error ${err.status}:`, err.message);
          } else {
            console.error("[chat] Unexpected error:", err);
          }
          controller.enqueue(line({ type: "error", message: ERROR_LINE }));
        }
      } finally {
        try {
          controller.close();
        } catch {
          // stream already closed by the client disconnecting
        }
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return ndjson(readable);
}
