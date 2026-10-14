"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { pointer } from "@/lib/pointer";

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aRand;
  attribute float aHot;
  varying float vAlpha;
  varying float vHot;
  void main() {
    vec3 p = position;
    p.y += mod(uTime * (0.03 + aRand * 0.05) + aRand * 10.0, 10.0) - 5.0;
    p.x += sin(uTime * 0.2 + aRand * 20.0) * 0.15;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (6.0 + aRand * 10.0) * uPixelRatio / -mv.z;
    vAlpha = (0.25 + 0.5 * aRand) * smoothstep(5.0, 3.5, abs(p.y));
    vHot = aHot;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uBone;
  varying float vAlpha;
  varying float vHot;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(mix(uBone, uColor, vHot), smoothstep(0.5, 0.0, d) * vAlpha);
  }
`;

/** Slow-drifting dust field with mouse parallax. */
export default function Particles({ count = 1200 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { gl } = useThree();

  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    const hot = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 2.2 + Math.random() * 6;
      const th = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(th) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = Math.sin(th) * r - 3;
      rand[i] = Math.random();
      hot[i] = Math.random() < 0.18 ? 1 : 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
    g.setAttribute("aHot", new THREE.BufferAttribute(hot, 1));
    return g;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: gl.getPixelRatio() },
      uColor: { value: new THREE.Color("#d4ff3a") },
      uBone: { value: new THREE.Color("#ecebe4") },
    }),
    [gl],
  );

  // Built directly (not via a `uniforms` prop, which R3F copies) so uTime updates reach the GPU.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [uniforms],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, dt) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    const p = ref.current;
    if (!p) return;
    p.rotation.y = THREE.MathUtils.damp(p.rotation.y, pointer.x * 0.12, 1.5, dt);
    p.rotation.x = THREE.MathUtils.damp(p.rotation.x, -pointer.y * 0.06, 1.5, dt);
  });

  return (
    <points ref={ref} geometry={geometry} material={material} />
  );
}
