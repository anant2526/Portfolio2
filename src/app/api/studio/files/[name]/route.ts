import { readFile } from "node:fs/promises";
import { notAvailable, projectPath, studioEnabled } from "@/lib/studio-server";

/** Serves MediaPipe's runtime + the face landmark model to the local Twin Studio. */
const WASM = "node_modules/@mediapipe/tasks-vision/wasm";
const FILES: Record<string, { file: string; type: string }> = {
  "vision_wasm_internal.js": { file: `${WASM}/vision_wasm_internal.js`, type: "text/javascript" },
  "vision_wasm_internal.wasm": { file: `${WASM}/vision_wasm_internal.wasm`, type: "application/wasm" },
  "vision_wasm_nosimd_internal.js": { file: `${WASM}/vision_wasm_nosimd_internal.js`, type: "text/javascript" },
  "vision_wasm_nosimd_internal.wasm": { file: `${WASM}/vision_wasm_nosimd_internal.wasm`, type: "application/wasm" },
  "face_landmarker.task": { file: "studio-assets/face_landmarker.task", type: "application/octet-stream" },
};

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!studioEnabled()) return notAvailable();
  const { name } = await params;
  const entry = FILES[name];
  if (!entry) return Response.json({ error: "Unknown file" }, { status: 404 });
  const body = await readFile(projectPath(entry.file));
  return new Response(new Uint8Array(body), {
    headers: { "content-type": entry.type, "cache-control": "public, max-age=3600" },
  });
}
