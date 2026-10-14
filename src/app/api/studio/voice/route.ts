import { notAvailable, setEnvVars, studioEnabled } from "@/lib/studio-server";

export const runtime = "nodejs";

const MAX_FILES = 25;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

/** What the studio needs to know before cloning. */
export async function GET() {
  if (!studioEnabled()) return notAvailable();
  return Response.json({
    hasKey: Boolean(process.env.ELEVENLABS_API_KEY),
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? null,
  });
}

/**
 * Clones YOUR voice with ElevenLabs Instant Voice Cloning, then saves the
 * resulting voice ID (and your API key, if you pasted one) to .env.local so
 * the twin starts speaking with it immediately.
 */
export async function POST(req: Request) {
  if (!studioEnabled()) return notAvailable();

  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "Expected multipart form data." }, { status: 400 });

  const pastedKey = String(form.get("apiKey") ?? "").trim();
  const apiKey = pastedKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Add your ElevenLabs API key first." }, { status: 400 });
  }
  if (form.get("consent") !== "yes") {
    return Response.json({ error: "Please confirm this is your own voice." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return Response.json({ error: "Record or upload at least one sample." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `At most ${MAX_FILES} samples.` }, { status: 400 });
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) {
    return Response.json({ error: "Samples are too large in total — keep it to a few minutes of audio." }, { status: 413 });
  }

  const upstream = new FormData();
  upstream.append("name", String(form.get("name") || "My digital twin").slice(0, 100));
  upstream.append("description", "Cloned in the Twin Studio for my portfolio's AI twin.");
  upstream.append("remove_background_noise", form.get("removeNoise") === "yes" ? "true" : "false");
  for (const f of files) upstream.append("files", f, f.name || "sample.wav");

  let res: Response;
  try {
    res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: upstream,
    });
  } catch {
    return Response.json({ error: "Couldn't reach ElevenLabs — check your internet connection." }, { status: 502 });
  }

  const data = (await res.json().catch(() => null)) as
    | { voice_id?: string; requires_verification?: boolean; detail?: { message?: string } | string }
    | null;
  if (!res.ok || !data?.voice_id) {
    const detail = typeof data?.detail === "string" ? data.detail : data?.detail?.message;
    const hint =
      res.status === 401
        ? "Your ElevenLabs API key was rejected."
        : res.status === 402 || res.status === 403
          ? "Voice cloning isn't available on your ElevenLabs plan."
          : "ElevenLabs couldn't create the voice.";
    return Response.json({ error: detail ? `${hint} (${detail})` : hint }, { status: res.status === 401 ? 401 : 502 });
  }

  await setEnvVars({
    ...(pastedKey ? { ELEVENLABS_API_KEY: pastedKey } : {}),
    ELEVENLABS_VOICE_ID: data.voice_id,
  });

  return Response.json({ voiceId: data.voice_id, requiresVerification: Boolean(data.requires_verification) });
}
