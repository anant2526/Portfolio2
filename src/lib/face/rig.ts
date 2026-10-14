import * as THREE from "three";
import { EYELID_CREASE, EYELID_PAIRS, FACE_OVAL, FACE_TRIANGLES, LANDMARK, LIPS } from "./topology";
import type { FaceData } from "./types";

const N = 468;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export type FaceRig = {
  /** Face mesh in centimetres with animation attributes (aJaw, aLip, aBlink, aEdge). */
  geometry: THREE.BufferGeometry;
  mouth: THREE.Vector3;
  pivot: THREE.Vector3;
  width: number;
  height: number;
  chinY: number;
  noseZ: number;
  /** Average depth of the face outline at cheek level (cm). */
  edgeZ: number;
  centerX: number;
};

/**
 * Turns a scan into an animatable face:
 *  • aJaw   — how much each vertex follows the jaw when the mouth opens
 *  • aLip   — falloff around the mouth for stretch (ee) / pucker (oo) shapes
 *  • aBlink — vertical distance (cm) each upper-lid vertex travels to close the eye
 *  • aEdge  — 1 at the face outline, fading inwards, so the face blends into the hologram
 * The inner-mouth triangles are split off and pinned to the upper jaw, so when
 * the lower lip drops a dark mouth opens instead of the lips stretching.
 */
export function buildFaceRig(face: FaceData): FaceRig {
  const P = face.positions;
  const v = (i: number) => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  const upper = v(LANDMARK.upperLip), lower = v(LANDMARK.lowerLip);
  const chin = v(LANDMARK.chin), forehead = v(LANDMARK.forehead);
  const mouth = upper.clone().add(lower).multiplyScalar(0.5);
  const width = v(LANDMARK.leftCheek).x - v(LANDMARK.rightCheek).x;
  const drop = mouth.y - chin.y;

  const lowerSet = new Set([...LIPS.lowerInner, ...LIPS.lowerOuter]);
  const upperSet = new Set([...LIPS.upperInner, ...LIPS.upperOuter]);
  const corners = new Set([61, 291, 78, 308]);

  const jaw = new Float32Array(N);
  const lip = new Float32Array(N);
  const blink = new Float32Array(N);
  const edge = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const x = P[i * 3], y = P[i * 3 + 1];
    if (corners.has(i)) jaw[i] = 0.4;
    else if (lowerSet.has(i)) jaw[i] = 1;
    else if (upperSet.has(i)) jaw[i] = 0;
    else {
      // The jaw is rigid: everything below the mouth line moves together,
      // fading out towards the jaw corners so the cheeks stretch instead.
      jaw[i] = smooth(mouth.y - drop * 0.02, mouth.y - drop * 0.14, y) *
        (1 - smooth(width * 0.28, width * 0.48, Math.abs(x - mouth.x)));
    }
    const dx = (x - mouth.x) / (width * 0.17);
    const dy = (y - mouth.y) / (width * 0.09);
    lip[i] = Math.exp(-(dx * dx + dy * dy) / 2);
  }

  const lidTravel = new Map<number, number>();
  for (const [u, l] of EYELID_PAIRS) {
    const d = (P[l * 3 + 1] - P[u * 3 + 1]) * 0.95;
    blink[u] = d;
    lidTravel.set(u, d);
  }
  for (const [crease, lid] of EYELID_CREASE) blink[crease] = (lidTravel.get(lid) ?? 0) * 0.45;

  // Edge rings via triangle adjacency.
  const neighbours: Set<number>[] = Array.from({ length: N }, () => new Set());
  for (let t = 0; t < FACE_TRIANGLES.length; t += 3) {
    const a = FACE_TRIANGLES[t], b = FACE_TRIANGLES[t + 1], c = FACE_TRIANGLES[t + 2];
    neighbours[a].add(b).add(c);
    neighbours[b].add(a).add(c);
    neighbours[c].add(a).add(b);
  }
  let ring = new Set(FACE_OVAL);
  for (const level of [1, 0.6, 0.25]) {
    const next = new Set<number>();
    for (const i of ring) {
      if (edge[i] < level) edge[i] = level;
      for (const nb of neighbours[i]) if (edge[nb] === 0 && !ring.has(nb)) next.add(nb);
    }
    ring = next;
  }

  // Split inner-mouth triangles onto duplicated, upper-jaw-pinned vertices.
  const inner = new Set([...LIPS.upperInner, ...LIPS.lowerInner]);
  const mainIdx: number[] = [];
  const mouthTris: number[] = [];
  for (let t = 0; t < FACE_TRIANGLES.length; t += 3) {
    const tri = [FACE_TRIANGLES[t], FACE_TRIANGLES[t + 1], FACE_TRIANGLES[t + 2]];
    (tri.every((i) => inner.has(i)) ? mouthTris : mainIdx).push(...tri);
  }
  const dupOf = new Map<number, number>();
  const extra: number[] = [];
  for (const i of mouthTris) {
    if (!dupOf.has(i)) {
      dupOf.set(i, N + extra.length);
      extra.push(i);
    }
  }
  const total = N + extra.length;
  const pos = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const aJaw = new Float32Array(total);
  const aLip = new Float32Array(total);
  const aBlink = new Float32Array(total);
  const aEdge = new Float32Array(total);
  pos.set(P.slice(0, N * 3));
  uv.set(face.uvs.slice(0, N * 2));
  aJaw.set(jaw);
  aLip.set(lip);
  aBlink.set(blink);
  aEdge.set(edge);
  extra.forEach((src, k) => {
    const d = N + k;
    pos[d * 3] = P[src * 3];
    pos[d * 3 + 1] = P[src * 3 + 1];
    pos[d * 3 + 2] = P[src * 3 + 2] - 0.2; // sit just behind the lips
    uv[d * 2] = face.uvs[src * 2];
    uv[d * 2 + 1] = face.uvs[src * 2 + 1];
    aLip[d] = lip[src];
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("aJaw", new THREE.BufferAttribute(aJaw, 1));
  geometry.setAttribute("aLip", new THREE.BufferAttribute(aLip, 1));
  geometry.setAttribute("aBlink", new THREE.BufferAttribute(aBlink, 1));
  geometry.setAttribute("aEdge", new THREE.BufferAttribute(aEdge, 1));
  geometry.setIndex([...mainIdx, ...mouthTris.map((i) => dupOf.get(i)!)]);
  geometry.computeVertexNormals();

  return {
    geometry,
    mouth,
    pivot: new THREE.Vector3(mouth.x, mouth.y + drop * 0.6, mouth.z - width * 0.7),
    width,
    height: forehead.y - chin.y,
    chinY: chin.y,
    noseZ: P[LANDMARK.noseTip * 3 + 2],
    edgeZ: [234, 454, 127, 356, 132, 361].reduce((sum, i) => sum + P[i * 3 + 2], 0) / 6,
    centerX: (v(LANDMARK.leftCheek).x + v(LANDMARK.rightCheek).x) / 2,
  };
}
