import * as THREE from "three";

/*
 * Procedural head sculpt. Every point starts as a direction on the unit sphere
 * (x right, y up, z towards the camera) and is pushed/pulled into a stylised
 * human head: tapered jaw, brow, eye sockets, nose, lips, chin and ears.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const g2 = (dx: number, dy: number, sx: number, sy: number) =>
  Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy));

export const MOUTH_Y = -0.375;

export type Sculpted = { x: number; y: number; z: number; jaw: number; lip: number };

export function sculpt(dx: number, dy: number, dz: number): Sculpted {
  let x = dx * 0.74;
  // Compress the underside so the chin becomes the lowest point of the face.
  let y = dy > -0.6 ? dy * 0.98 : -0.588 + (dy + 0.6) * 0.6;
  let z = dz * 0.84;

  if (dz < 0) z *= 1 + 0.12 * smooth(-0.3, 0.6, dy); // fuller back of the skull
  const low = smooth(0.0, -0.95, y);
  x *= 1 - 0.36 * low; // jaw taper
  x *= 1 - 0.03 * smooth(0.3, 1.0, y); // slightly narrower crown
  x *= 1 - 0.07 * g2(0, y - 0.32, 1, 0.12) * smooth(0.2, 0.7, dz); // temples
  z *= 1 - 0.12 * low * (dz < 0 ? 1.6 : 1);

  const front = smooth(0.25, 0.85, dz);
  z -= front * 0.05 * (1 - Math.abs(dx)); // flatten the face plane

  const ax = Math.abs(x);
  z += front * 0.06 * g2(0, y - 0.24, 1, 0.05) * (1 - smooth(0.3, 0.5, ax)); // brow
  z -= front * 0.1 * (g2(x - 0.24, y - 0.12, 0.095, 0.07) + g2(x + 0.24, y - 0.12, 0.095, 0.07)); // eye sockets
  z += front * 0.05 * (g2(x - 0.37, y + 0.06, 0.1, 0.09) + g2(x + 0.37, y + 0.06, 0.1, 0.09)); // cheekbones
  z -= front * 0.035 * (g2(x - 0.3, y + 0.3, 0.09, 0.14) + g2(x + 0.3, y + 0.3, 0.09, 0.14)); // cheek hollows

  // Nose: a ridge that widens and protrudes towards the tip.
  const noseT = smooth(0.16, -0.17, y) * (1 - smooth(-0.17, -0.25, y));
  const noseW = 0.045 + 0.04 * smooth(0.1, -0.2, y);
  z += front * 0.26 * noseT * Math.exp(-(x * x) / (2 * noseW * noseW)) * (0.35 + 0.65 * smooth(0.14, -0.17, y));
  z += front * 0.035 * (g2(x - 0.075, y + 0.2, 0.035, 0.03) + g2(x + 0.075, y + 0.2, 0.035, 0.03)); // nostrils

  z += front * 0.07 * g2(x, y + 0.325, 0.15, 0.03); // upper lip
  z += front * 0.075 * g2(x, y + 0.43, 0.13, 0.035); // lower lip
  z -= front * 0.04 * g2(x, y - MOUTH_Y, 0.16, 0.012); // mouth line
  z -= front * 0.03 * g2(x, y + 0.53, 0.14, 0.04); // groove under the lip
  z += front * 0.08 * g2(x, y + 0.67, 0.12, 0.075); // chin

  const side = smooth(0.55, 0.9, Math.abs(dx));
  x += Math.sign(dx) * side * 0.045 * g2(y + 0.02, dz + 0.08, 0.13, 0.08); // ears

  // Weights used by the shader to animate the mouth.
  const jaw = smooth(MOUTH_Y + 0.005, MOUTH_Y - 0.035, y) * smooth(-0.4, 0.1, dz);
  const lip = front * g2(x, y - MOUTH_Y, 0.2, 0.09);

  return { x, y, z, jaw, lip };
}

/** Outward surface normal of the sculpted head at a sphere direction (finite differences). */
function sculptNormal(dx: number, dy: number, dz: number): [number, number, number] {
  // Tangent basis around the direction.
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dy) > 0.95) {
    ux = 1;
    uy = 0;
  }
  let t1x = uy * dz - uz * dy, t1y = uz * dx - ux * dz, t1z = ux * dy - uy * dx;
  const l1 = Math.hypot(t1x, t1y, t1z) || 1;
  t1x /= l1; t1y /= l1; t1z /= l1;
  const t2x = dy * t1z - dz * t1y, t2y = dz * t1x - dx * t1z, t2z = dx * t1y - dy * t1x;

  const e = 0.012;
  const at = (x: number, y: number, z: number) => {
    const l = Math.hypot(x, y, z);
    return sculpt(x / l, y / l, z / l);
  };
  const p0 = sculpt(dx, dy, dz);
  const pa = at(dx + t1x * e, dy + t1y * e, dz + t1z * e);
  const pb = at(dx + t2x * e, dy + t2y * e, dz + t2z * e);
  const ax = pa.x - p0.x, ay = pa.y - p0.y, az = pa.z - p0.z;
  const bx = pb.x - p0.x, by = pb.y - p0.y, bz = pb.z - p0.z;
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const ln = Math.hypot(nx, ny, nz) || 1;
  nx /= ln; ny /= ln; nz /= ln;
  if (nx * dx + ny * dy + nz * dz < 0) {
    nx = -nx; ny = -ny; nz = -nz;
  }
  return [nx, ny, nz];
}

/** Neck + shoulders as a lathe profile, so the head reads as a bust. */
function bodyProfile(y: number) {
  const t = smooth(-1.1, -1.75, y);
  return { rx: 0.27 + 0.03 * smooth(-0.8, -1.1, y) + t * 1.15, rz: 0.25 + t * 0.28, cz: -0.12 + t * 0.03 };
}

/**
 * Point cloud arranged as horizontal contour rings — gives the "LIDAR scan"
 * topographic look across the face.
 */
/** Ellipse (in head space) where a scanned face replaces the hologram's own face. */
export type FaceCut = { cx: number; cy: number; rx: number; ry: number };

const insideCut = (cut: FaceCut | undefined, x: number, y: number, dz: number) =>
  !!cut && dz > 0.05 && ((x - cut.cx) / cut.rx) ** 2 + ((y - cut.cy) / cut.ry) ** 2 < 1;

export function buildContourPoints(quality: number, cut?: FaceCut): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const jaws: number[] = [];
  const lips: number[] = [];
  const rands: number[] = [];

  const push = (s: Sculpted, n: [number, number, number]) => {
    if (insideCut(cut, s.x, s.y, n[2])) return;
    positions.push(s.x, s.y, s.z);
    normals.push(n[0], n[1], n[2]);
    jaws.push(s.jaw);
    lips.push(s.lip);
    rands.push(Math.random());
  };

  const rings = Math.round(74 * quality);
  const perRing = Math.round(360 * quality);
  for (let r = 0; r < rings; r++) {
    const dy = 0.985 - (r / (rings - 1)) * 1.97;
    const radius = Math.sqrt(1 - dy * dy);
    const count = Math.max(10, Math.round(perRing * radius));
    const phase = (r % 2) * 0.5;
    for (let i = 0; i < count; i++) {
      const th = ((i + phase) / count) * Math.PI * 2;
      const dx = Math.sin(th) * radius;
      const dz = Math.cos(th) * radius;
      push(sculpt(dx, dy, dz), sculptNormal(dx, dy, dz));
    }
  }

  // Extra fill on the face for detail.
  const fill = Math.round(1400 * quality);
  for (let i = 0; i < fill; i++) {
    const v = new THREE.Vector3().randomDirection();
    if (v.z < 0.35) v.z = Math.abs(v.z) + 0.35;
    v.normalize();
    push(sculpt(v.x, v.y, v.z), sculptNormal(v.x, v.y, v.z));
  }

  // Neck and shoulders.
  // Same ring spacing as the head so the neck reads as one continuous scan.
  const spacing = 1.97 / (rings - 1);
  const bodyRings = Math.round(1.35 / spacing);
  for (let r = 0; r < bodyRings; r++) {
    const y = -0.8 - r * spacing;
    const { rx, rz, cz } = bodyProfile(y);
    const count = Math.round(perRing * (rx / 0.74) * 0.9);
    for (let i = 0; i < count; i++) {
      const th = (i / count) * Math.PI * 2;
      const dx = Math.sin(th);
      const dz = Math.cos(th);
      if (dz < -0.35 && y < -1.3) continue; // skip the hidden back of the shoulders
      push({ x: dx * rx, y, z: cz + dz * rz, jaw: 0, lip: 0 }, [dx, 0, dz]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aNormal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("aJaw", new THREE.Float32BufferAttribute(jaws, 1));
  geo.setAttribute("aLip", new THREE.Float32BufferAttribute(lips, 1));
  geo.setAttribute("aRand", new THREE.Float32BufferAttribute(rands, 1));
  return geo;
}

/** Solid dark "glass" shell that occludes the far side of the point cloud. */
export function buildShell(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 128, 128);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const jaws = new Float32Array(pos.count);
  const lips = new Float32Array(pos.count);
  // SphereGeometry's poles sit on ±y, which matches our convention (z = forward).
  for (let i = 0; i < pos.count; i++) {
    const s = sculpt(pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, s.x * 0.985, s.y * 0.985, s.z * 0.985);
    jaws[i] = s.jaw;
    lips[i] = s.lip;
  }
  geo.setAttribute("aJaw", new THREE.BufferAttribute(jaws, 1));
  geo.setAttribute("aLip", new THREE.BufferAttribute(lips, 1));
  geo.computeVertexNormals();
  return geo;
}

/** Neck/shoulder shell so the body also occludes points behind it. */
export function buildBodyShell(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 40; i++) {
    const y = -0.6 - (i / 40) * 1.55;
    pts.push(new THREE.Vector2(bodyProfile(y).rx * 0.97, y));
  }
  const geo = new THREE.LatheGeometry(pts, 96);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const { rx, rz, cz } = bodyProfile(y);
    // Lathe makes a circle of radius rx; squash z to the profile's depth.
    pos.setZ(i, cz + (pos.getZ(i) / (rx * 0.97)) * rz * 0.97);
  }
  geo.setAttribute("aJaw", new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  geo.setAttribute("aLip", new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  geo.computeVertexNormals();
  return geo;
}

/** Where the eyes sit on the sculpted surface. */
export function eyeAnchor(side: 1 | -1): THREE.Vector3 {
  const dx = (side * 0.24) / 0.74;
  const dy = 0.122;
  const dz = Math.sqrt(1 - dx * dx - dy * dy);
  const s = sculpt(dx, dy, dz);
  return new THREE.Vector3(s.x * 0.985, s.y * 0.985, s.z * 0.985 + 0.012);
}
