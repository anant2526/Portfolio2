import { readFile, writeFile } from "node:fs/promises";
import { notAvailable, projectPath, studioEnabled } from "@/lib/studio-server";

const FILE = projectPath("src", "content", "speech-samples.json");
const MAX_SAMPLES = 20;

type Samples = { samples: string[] };

async function read(): Promise<Samples> {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as Samples;
    return Array.isArray(parsed.samples) ? parsed : { samples: [] };
  } catch {
    return { samples: [] };
  }
}

/**
 * Transcripts of you talking naturally. The twin's persona reads these so it
 * picks up how you phrase things, not just facts about you.
 */
export async function GET() {
  if (!studioEnabled()) return notAvailable();
  return Response.json(await read());
}

export async function POST(req: Request) {
  if (!studioEnabled()) return notAvailable();
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (text.split(" ").length < 8) return Response.json({ error: "Transcript is too short." }, { status: 400 });
  const data = await read();
  data.samples = [...data.samples, text.slice(0, 2000)].slice(-MAX_SAMPLES);
  await writeFile(FILE, JSON.stringify(data, null, 2) + "\n");
  return Response.json(data);
}

export async function DELETE() {
  if (!studioEnabled()) return notAvailable();
  await writeFile(FILE, JSON.stringify({ samples: [] }, null, 2) + "\n");
  return Response.json({ samples: [] });
}
