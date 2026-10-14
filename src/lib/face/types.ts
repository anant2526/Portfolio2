/** A scanned face, as saved to public/avatar/face.json by the Twin Studio. */
export type FaceData = {
  version: 1;
  /** 468 vertices (x, y, z), centimetres, rotated to face the camera. */
  positions: number[];
  /** 468 texture coordinates (u, v) into the saved face texture. */
  uvs: number[];
};

/** Pointer to the saved scan, stored in src/content/avatar.json. */
export type AvatarConfig = {
  face: { data: string; texture: string; updatedAt: string } | null;
};
