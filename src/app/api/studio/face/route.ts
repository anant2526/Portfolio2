import { mkdir, rm, writeFile } from "node:fs/promises";
import type { AvatarConfig, FaceData } from "@/lib/face/types";
import { notAvailable, projectPath, studioEnabled } from "@/lib/studio-server";

const CONFIG = ["src", "content", "avatar.json"];

function validFace(d: unknown): d is FaceData {
  if (!d || typeof d !== "object") return false;
  const f = d as FaceData;
  return (
    f.version === 1 &&
    Array.isArray(f.positions) && f.positions.length === 468 * 3 &&
    Array.isArray(f.uvs) && f.uvs.length === 468 * 2 &&
    [...f.positions, ...f.uvs].every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/** Saves a scan as YOUR avatar: public/avatar/face.{json,jpg} + src/content/avatar.json. */
export async function POST(req: Request) {
  if (!studioEnabled()) return notAvailable();
  const body = (await req.json().catch(() => null)) as { data?: unknown; texture?: unknown } | null;
  const prefix = "data:image/jpeg;base64,";
  if (!body || !validFace(body.data) || typeof body.texture !== "string" || !body.texture.startsWith(prefix)) {
    return Response.json({ error: "Expected { data: FaceData, texture: JPEG data URL }." }, { status: 400 });
  }
  const jpeg = Buffer.from(body.texture.slice(prefix.length), "base64");
  if (jpeg.length > 8 * 1024 * 1024) return Response.json({ error: "Texture too large." }, { status: 413 });

  await mkdir(projectPath("public", "avatar"), { recursive: true });
  await writeFile(projectPath("public", "avatar", "face.json"), JSON.stringify(body.data));
  await writeFile(projectPath("public", "avatar", "face.jpg"), jpeg);
  const config: AvatarConfig = {
    face: { data: "/avatar/face.json", texture: "/avatar/face.jpg", updatedAt: new Date().toISOString() },
  };
  await writeFile(projectPath(...CONFIG), JSON.stringify(config, null, 2) + "\n");
  return Response.json({ ok: true, ...config });
}

/** Goes back to the built-in hologram head. */
export async function DELETE() {
  if (!studioEnabled()) return notAvailable();
  await rm(projectPath("public", "avatar", "face.json"), { force: true });
  await rm(projectPath("public", "avatar", "face.jpg"), { force: true });
  const config: AvatarConfig = { face: null };
  await writeFile(projectPath(...CONFIG), JSON.stringify(config, null, 2) + "\n");
  return Response.json({ ok: true });
}
