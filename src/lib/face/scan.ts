import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { CANONICAL_VERTICES, LANDMARK } from "./topology";
import type { FaceData } from "./types";

/*
 * Photo → 3D face, entirely in the browser:
 *  1. MediaPipe Face Landmarker finds 468 3D landmarks (searching smaller crops
 *     if the face is small in the photo, e.g. full-body shots).
 *  2. A similarity transform (Horn's method) rotates them to face the camera
 *     in the canonical face model's centimetre space — keeping YOUR proportions.
 *  3. The face region of the photo becomes the texture; landmark positions
 *     become the UVs.
 */

const FILES = "/api/studio/files";
const N = 468;

let landmarker: Promise<FaceLandmarker> | null = null;

function getLandmarker() {
  landmarker ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(FILES);
    const create = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${FILES}/face_landmarker.task`, delegate },
        runningMode: "IMAGE",
        numFaces: 1,
      });
    try {
      return await create("GPU");
    } catch {
      return create("CPU");
    }
  })();
  landmarker.catch(() => {
    landmarker = null;
  });
  return landmarker;
}

type Region = { x: number; y: number; w: number; h: number };
/** Landmarks in full-image pixels; z uses the same pixel scale. */
type PixelLandmarks = { x: number; y: number; z: number }[];

function detectIn(fl: FaceLandmarker, img: CanvasImageSource, r: Region, size: number): PixelLandmarks | null {
  const canvas = document.createElement("canvas");
  const s = size / Math.max(r.w, r.h);
  canvas.width = Math.round(r.w * s);
  canvas.height = Math.round(r.h * s);
  canvas.getContext("2d")!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  const res = fl.detect(canvas);
  const lm: NormalizedLandmark[] | undefined = res.faceLandmarks[0];
  if (!lm || lm.length < N) return null;
  return lm.slice(0, N).map((p) => ({ x: r.x + p.x * r.w, y: r.y + p.y * r.h, z: p.z * r.w }));
}

function bounds(lm: PixelLandmarks) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of lm) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

function clampRegion(r: Region, W: number, H: number): Region {
  const x = Math.max(0, r.x), y = Math.max(0, r.y);
  return { x, y, w: Math.min(W, r.x + r.w) - x, h: Math.min(H, r.y + r.h) - y };
}

/** Finds the face anywhere in the photo, then re-runs on a tight crop for precise landmarks. */
async function locate(img: HTMLImageElement | HTMLCanvasElement, W: number, H: number) {
  const fl = await getLandmarker();
  let found = detectIn(fl, img, { x: 0, y: 0, w: W, h: H }, 1024);

  // Small face (full-body shot)? Scan overlapping crops at shrinking sizes.
  for (const frac of [0.6, 0.4, 0.26]) {
    if (found) break;
    const side = frac * Math.min(W, H);
    const step = side / 2;
    for (let y = 0; y + side <= H + 1 && !found; y += step) {
      for (let x = 0; x + side <= W + 1 && !found; x += step) {
        found = detectIn(fl, img, { x, y, w: side, h: side }, 640);
      }
    }
  }
  if (!found) return null;

  // Refine on a square crop around the face.
  const b = bounds(found);
  const side = Math.max(b.w, b.h) * 2.2;
  const refined = detectIn(fl, img, clampRegion({ x: b.cx - side / 2, y: b.cy - side / 2, w: side, h: side }, W, H), 768);
  return refined ?? found;
}

/** Best rotation + uniform scale + translation mapping `src` onto `dst` (Horn 1987, quaternion form). */
function alignSimilarity(src: Float64Array, dst: Float32Array): Float32Array {
  const n = src.length / 3;
  const cs = [0, 0, 0], cd = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    cs[k] += src[i * 3 + k] / n;
    cd[k] += dst[i * 3 + k] / n;
  }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      S[a][b] += (src[i * 3 + a] - cs[a]) * (dst[i * 3 + b] - cd[b]);
    }
  }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const Nm = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  // Largest eigenvector via shifted power iteration.
  let shift = 0;
  for (const row of Nm) for (const v of row) shift += Math.abs(v);
  let q = [1, 0, 0, 0];
  for (let it = 0; it < 300; it++) {
    const nq = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
      nq[r] = shift * q[r];
      for (let c = 0; c < 4; c++) nq[r] += Nm[r][c] * q[c];
    }
    const len = Math.hypot(...nq) || 1;
    q = nq.map((v) => v / len);
  }
  const [w, x, y, z] = q;
  const R = [
    [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
  ];
  let num = 0, den = 0;
  const rotated = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = [src[i * 3] - cs[0], src[i * 3 + 1] - cs[1], src[i * 3 + 2] - cs[2]];
    for (let a = 0; a < 3; a++) {
      const v = R[a][0] * s[0] + R[a][1] * s[1] + R[a][2] * s[2];
      rotated[i * 3 + a] = v;
      num += v * (dst[i * 3 + a] - cd[a]);
      den += s[a] * s[a];
    }
  }
  const scale = num / (den || 1);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) out[i] = rotated[i] * scale + cd[i % 3];
  return out;
}

export type ScanResult = {
  data: FaceData;
  /** JPEG data URL of the face crop used as the texture. */
  texture: string;
  /** Landmarks in source-image pixels, for drawing an overlay. */
  landmarks: { x: number; y: number }[];
  warnings: string[];
};

export async function scanFace(img: HTMLImageElement): Promise<ScanResult> {
  const W = img.naturalWidth, H = img.naturalHeight;
  const lm = await locate(img, W, H);
  if (!lm) {
    throw new Error("No face found. Try a brighter photo where your face is clearly visible and facing the camera.");
  }

  const warnings: string[] = [];
  const b = bounds(lm);
  if (b.w < 180) warnings.push(`Your face is only ${Math.round(b.w)}px wide in this photo — a closer shot (300px+) gives a sharper 3D face.`);
  const nose = lm[LANDMARK.noseTip], rc = lm[LANDMARK.rightCheek], lc = lm[LANDMARK.leftCheek];
  const yaw = (nose.x - rc.x) / (lc.x - rc.x || 1);
  if (yaw < 0.38 || yaw > 0.62) warnings.push("Your head is turned — a straight-on photo gives the most accurate face.");

  // Texture: the face plus a margin, upscaled so the GPU has enough texels.
  const margin = 0.14;
  const crop = clampRegion(
    { x: b.x0 - b.w * margin, y: b.y0 - b.h * margin, w: b.w * (1 + 2 * margin), h: b.h * (1 + 2 * margin) },
    W,
    H,
  );
  const texSize = 1024;
  const ts = texSize / Math.max(crop.w, crop.h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.w * ts);
  canvas.height = Math.round(crop.h * ts);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
  const texture = canvas.toDataURL("image/jpeg", 0.92);

  const uvs: number[] = [];
  const src = new Float64Array(N * 3);
  lm.forEach((p, i) => {
    uvs.push((p.x - crop.x) / crop.w, 1 - (p.y - crop.y) / crop.h);
    // Image space (y down, z away) → right-handed y-up, z towards camera.
    src[i * 3] = p.x;
    src[i * 3 + 1] = -p.y;
    src[i * 3 + 2] = -p.z;
  });
  const aligned = alignSimilarity(src, CANONICAL_VERTICES);

  return {
    data: { version: 1, positions: Array.from(aligned, (v) => Math.round(v * 1000) / 1000), uvs: uvs.map((v) => Math.round(v * 100000) / 100000) },
    texture,
    landmarks: lm.map((p) => ({ x: p.x, y: p.y })),
    warnings,
  };
}
