"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { pointer } from "@/lib/pointer";
import { mouth, updateMouth } from "@/lib/voice/mouth";
import type { FaceRig } from "@/lib/face/rig";
import { buildBodyShell, buildContourPoints, buildShell, eyeAnchor, type FaceCut } from "./holo-geometry";

const SIGNAL = "#d4ff3a";
const HOT = "#f4ffd0";
const BG = "#08090a";

/** Shared mouth deformation, used by both the point cloud and the shell. */
const DEFORM = /* glsl */ `
  uniform float uJaw;
  uniform float uWide;
  uniform float uRound;
  uniform float uPress;
  attribute float aJaw;
  attribute float aLip;

  vec3 deform(vec3 p) {
    p.x *= 1.0 + aLip * (uWide * 0.16 - uRound * 0.3);
    p.z += aLip * (uRound * 0.05 - uPress * 0.012);
    // Jaw hinges open around a pivot near the ears.
    float a = aJaw * uJaw * 0.42;
    vec3 pivot = vec3(0.0, -0.16, -0.12);
    vec3 q = p - pivot;
    float c = cos(a);
    float s = sin(a);
    q = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
    return q + pivot;
  }
`;

const POINTS_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uScan;
  uniform float uLevel;
  attribute vec3 aNormal;
  attribute float aRand;
  varying float vAlpha;
  varying float vHot;
  ${DEFORM}

  void main() {
    vec3 p = deform(position);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    vec3 n = normalize(normalMatrix * aNormal);
    vec3 v = normalize(-mv.xyz);
    float facing = clamp(dot(n, v), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.6);
    // View-space key light from the upper left: shading reveals brow, nose, lips and chin.
    float diff = clamp(dot(n, normalize(vec3(-0.62, 0.5, 0.6))), 0.0, 1.0);
    float lit = 0.025 + 1.05 * pow(diff, 2.4) + 0.6 * rim;
    float scan = exp(-pow((p.y - uScan) * 10.0, 2.0));
    float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + aRand * 3.0) + aRand * 50.0);
    float fade = smoothstep(-2.15, -1.45, p.y) * (1.0 - 0.5 * smoothstep(-0.78, -0.98, p.y));

    vHot = scan + uLevel * aLip * 1.5;
    vAlpha = fade * (twinkle * lit + scan * 0.8 + uLevel * 0.2 * aLip);
    gl_PointSize = uSize * uPixelRatio * (0.75 + aRand * 0.6) * (1.0 + scan * 0.6) / -mv.z;
  }
`;

const POINTS_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  varying float vAlpha;
  varying float vHot;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    gl_FragColor = vec4(mix(uColor, uHot, clamp(vHot, 0.0, 1.0)), a);
  }
`;

const SHELL_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  varying vec3 vObj;
  ${DEFORM}

  void main() {
    vObj = position;
    vec3 p = deform(position);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vY = p.y;
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uBg;
  uniform float uScan;
  uniform float uLevel;
  uniform vec4 uCut;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  varying vec3 vObj;

  void main() {
    // A scanned face replaces this part of the shell.
    if (uCut.z > 0.0 && vObj.z > 0.0) {
      vec2 e = (vObj.xy - uCut.xy) / uCut.zw;
      if (dot(e, e) < 1.0) discard;
    }
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float rim = pow(1.0 - clamp(dot(n, vV), 0.0, 1.0), 3.0);
    float diff = clamp(dot(n, normalize(vec3(-0.5, 0.55, 0.68))), 0.0, 1.0);
    float scan = exp(-pow((vY - uScan) * 10.0, 2.0));
    vec3 col = uBg * 0.4 + uColor * (rim * (0.1 + uLevel * 0.1) + diff * diff * 0.012 + scan * 0.02);
    float fade = smoothstep(-2.1, -1.3, vY);
    gl_FragColor = vec4(mix(uBg, col, fade), 1.0);
  }
`;

/** Your scanned face: photo texture with a holographic grade, rigged for speech and blinking. */
const FACE_VERT = /* glsl */ `
  uniform float uJaw;
  uniform float uWide;
  uniform float uRound;
  uniform float uBlink;
  uniform vec3 uMouth;
  uniform vec3 uPivot;
  uniform float uFaceK;
  uniform float uFaceY;
  attribute float aJaw;
  attribute float aLip;
  attribute float aBlink;
  attribute float aEdge;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  varying float vEdge;
  varying float vHeadY;

  void main() {
    vec3 p = position;
    p.x = uMouth.x + (p.x - uMouth.x) * (1.0 + aLip * (uWide * 0.1 - uRound * 0.2));
    p.z += aLip * uRound * 0.45;
    p.y += aBlink * uBlink;
    float a = aJaw * uJaw * 0.26;
    vec3 q = p - uPivot;
    float c = cos(a);
    float s = sin(a);
    q = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
    p = q + uPivot;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vUv = uv;
    vEdge = aEdge;
    vHeadY = p.y * uFaceK + uFaceY;
    gl_Position = projectionMatrix * mv;
  }
`;

const FACE_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uScan;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  varying float vEdge;
  varying float vHeadY;

  void main() {
    vec3 tex = texture2D(uMap, vUv).rgb;
    vec3 n = normalize(vN);
    float facing = clamp(dot(n, vV), 0.0, 1.0);
    float rim = pow(1.0 - facing, 2.5);
    float diff = clamp(dot(n, normalize(vec3(-0.5, 0.55, 0.68))), 0.0, 1.0);
    float lines = 0.9 + 0.1 * sin(gl_FragCoord.y * 1.7 + uTime * 6.0);
    float scan = exp(-pow((vHeadY - uScan) * 10.0, 2.0));
    vec3 col = tex * (0.8 + 0.28 * diff) * lines;
    col = mix(col, col * vec3(0.92, 1.04, 0.86), 0.35);
    col += uColor * (rim * 0.4 + scan * 0.25);
    float alpha = 1.0 - smoothstep(0.2, 0.95, vEdge);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export type LoadedFace = { rig: FaceRig; texture: THREE.Texture };

/** Fits the hologram skull around a scanned face (all values in head space). */
function fitFace(rig: FaceRig) {
  const chin = -0.68;
  const k = 1.3 / rig.height; // scene units per centimetre
  const halfW = (k * rig.width) / 2;
  // Skull a little wider than the face outline, with a fuller crown.
  const sx = halfW / (0.72 * 0.8);
  const sz = 0.92;
  const cut: FaceCut = { cx: 0, cy: (chin + 0.65) / 1.04, rx: (halfW / sx) * 0.97, ry: 0.65 / 1.04 };
  return {
    k,
    headScale: [sx, 1.04, sz] as [number, number, number],
    cut,
    facePosition: [-k * rig.centerX, chin - k * rig.chinY, 0.28 - k * rig.edgeZ] as [number, number, number],
  };
}

type Props = {
  position?: [number, number, number];
  scale?: number;
  /** A scanned face from the Twin Studio; replaces the hologram's own face. */
  face?: LoadedFace;
};

export default function HoloHead({ position = [0, 0, 0], scale = 1, face }: Props) {
  const group = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group[]>([]);
  const pupils = useRef<THREE.Mesh[]>([]);
  const blink = useRef({ next: 2.5, start: -1 });
  const { gl, size } = useThree();

  const quality = size.width < 700 ? 0.65 : 1;
  const fit = useMemo(() => (face ? fitFace(face.rig) : null), [face]);
  const points = useMemo(() => buildContourPoints(quality, fit?.cut), [quality, fit]);
  const shell = useMemo(() => buildShell(), []);
  const body = useMemo(() => buildBodyShell(), []);
  const eyePos = useMemo(() => [eyeAnchor(1), eyeAnchor(-1)], []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uJaw: { value: 0 },
      uWide: { value: 0 },
      uRound: { value: 0 },
      uPress: { value: 0 },
      uLevel: { value: 0 },
      uScan: { value: 2 },
      uSize: { value: 14 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color(SIGNAL) },
      uHot: { value: new THREE.Color(HOT) },
      uBg: { value: new THREE.Color(BG) },
      uCut: { value: new THREE.Vector4(0, 0, 0, 0) },
      uBlink: { value: 0 },
    }),
    [],
  );

  const faceUniforms = useMemo(() => {
    if (!face || !fit) return null;
    return {
      ...uniforms,
      uMap: { value: face.texture },
      uMouth: { value: face.rig.mouth },
      uPivot: { value: face.rig.pivot },
      uFaceK: { value: fit.k },
      uFaceY: { value: fit.facePosition[1] },
    };
  }, [face, fit, uniforms]);

  // Materials are built here (not as JSX props) so they share the live `uniforms`
  // objects: R3F copies a `uniforms` prop, which would freeze per-frame updates.
  const materials = useMemo(
    () => ({
      shell: new THREE.ShaderMaterial({ uniforms, vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, side: THREE.DoubleSide }),
      body: new THREE.ShaderMaterial({ uniforms, vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG }),
      points: new THREE.ShaderMaterial({
        uniforms,
        vertexShader: POINTS_VERT,
        fragmentShader: POINTS_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    }),
    [uniforms],
  );
  const faceMaterial = useMemo(
    () =>
      faceUniforms
        ? new THREE.ShaderMaterial({ uniforms: faceUniforms, vertexShader: FACE_VERT, fragmentShader: FACE_FRAG, transparent: true })
        : null,
    [faceUniforms],
  );
  useEffect(
    () => () => {
      materials.shell.dispose();
      materials.body.dispose();
      materials.points.dispose();
    },
    [materials],
  );
  useEffect(() => () => faceMaterial?.dispose(), [faceMaterial]);

  useEffect(() => {
    const c = fit?.cut;
    uniforms.uCut.value.set(c?.cx ?? 0, c?.cy ?? 0, c?.rx ?? 0, c?.ry ?? 0);
  }, [fit, uniforms]);

  useEffect(() => {
    uniforms.uPixelRatio.value = gl.getPixelRatio();
  }, [gl, uniforms, size]);

  useEffect(
    () => () => {
      points.dispose();
      shell.dispose();
      body.dispose();
    },
    [points, shell, body],
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    updateMouth();
    uniforms.uTime.value = t;
    uniforms.uJaw.value = mouth.jaw;
    uniforms.uWide.value = mouth.wide;
    uniforms.uRound.value = mouth.round;
    uniforms.uPress.value = mouth.press;
    uniforms.uLevel.value = mouth.level;
    uniforms.uScan.value = 1.3 - ((t * 0.32) % 1) * 4.2;

    const g = group.current;
    if (g) {
      const yaw = pointer.x * 0.42 + Math.sin(t * 0.31) * 0.07;
      const pitch = -pointer.y * 0.2 + Math.sin(t * 0.43) * 0.03 + mouth.level * 0.05;
      g.rotation.y = THREE.MathUtils.damp(g.rotation.y, yaw, 3.2, dt);
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, pitch, 3.2, dt);
      g.rotation.z = Math.sin(t * 0.27) * 0.02;
      g.position.y = position[1] + Math.sin(t * 0.8) * 0.025;
    }

    // Blinking, every 2–6 s.
    const b = blink.current;
    if (t > b.next && b.start < 0) b.start = t;
    let open = 1;
    if (b.start >= 0) {
      const k = (t - b.start) / 0.16;
      open = k < 1 ? Math.abs(1 - 2 * k) : 1;
      if (k >= 1) {
        b.start = -1;
        b.next = t + 2 + Math.random() * 4;
      }
    }
    uniforms.uBlink.value = 1 - open;
    for (const e of eyes.current) if (e) e.scale.y = Math.max(0.06, open);
    for (const p of pupils.current) {
      if (!p) continue;
      p.position.x = THREE.MathUtils.damp(p.position.x, pointer.x * 0.012, 6, dt);
      p.position.y = THREE.MathUtils.damp(p.position.y, pointer.y * 0.008, 6, dt);
    }
  });

  return (
    <group ref={group} position={position} scale={scale}>
      <group scale={fit?.headScale ?? 1}>
        <mesh geometry={shell} material={materials.shell} renderOrder={0} />
        <mesh geometry={body} material={materials.body} renderOrder={0} />
        <points geometry={points} material={materials.points} renderOrder={2} />
      </group>
      {face && fit && faceMaterial && (
        <group position={fit.facePosition} scale={fit.k}>
          <mesh geometry={face.rig.geometry} material={faceMaterial} renderOrder={1} />
        </group>
      )}
      {!face && eyePos.map((p, i) => (
        <group
          key={i}
          position={p}
          rotation={[0, (i === 0 ? 1 : -1) * 0.18, 0]}
          ref={(el) => {
            if (el) eyes.current[i] = el;
          }}
        >
          <mesh renderOrder={2}>
            <ringGeometry args={[0.028, 0.044, 40]} />
            <meshBasicMaterial color={SIGNAL} toneMapped={false} transparent opacity={0.9} />
          </mesh>
          <mesh
            renderOrder={2}
            position={[0, 0, 0.002]}
            ref={(el) => {
              if (el) pupils.current[i] = el;
            }}
          >
            <circleGeometry args={[0.014, 24]} />
            <meshBasicMaterial color={HOT} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
