"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { pointer } from "@/lib/pointer";
import { mouth, updateMouth } from "@/lib/voice/mouth";
import { buildBodyShell, buildContourPoints, buildShell, eyeAnchor } from "./holo-geometry";

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
  ${DEFORM}

  void main() {
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
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;

  void main() {
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

type Props = {
  position?: [number, number, number];
  scale?: number;
};

export default function HoloHead({ position = [0, 0, 0], scale = 1 }: Props) {
  const group = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group[]>([]);
  const pupils = useRef<THREE.Mesh[]>([]);
  const blink = useRef({ next: 2.5, start: -1 });
  const { gl, size } = useThree();

  const quality = size.width < 700 ? 0.65 : 1;
  const points = useMemo(() => buildContourPoints(quality), [quality]);
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
    }),
    [],
  );

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
    for (const e of eyes.current) if (e) e.scale.y = Math.max(0.06, open);
    for (const p of pupils.current) {
      if (!p) continue;
      p.position.x = THREE.MathUtils.damp(p.position.x, pointer.x * 0.012, 6, dt);
      p.position.y = THREE.MathUtils.damp(p.position.y, pointer.y * 0.008, 6, dt);
    }
  });

  return (
    <group ref={group} position={position} scale={scale}>
      <mesh geometry={shell} renderOrder={0}>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={SHELL_VERT}
          fragmentShader={SHELL_FRAG}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={body} renderOrder={0}>
        <shaderMaterial uniforms={uniforms} vertexShader={SHELL_VERT} fragmentShader={SHELL_FRAG} />
      </mesh>
      <points geometry={points} renderOrder={1}>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={POINTS_VERT}
          fragmentShader={POINTS_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      {eyePos.map((p, i) => (
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
