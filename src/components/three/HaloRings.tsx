"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mouth } from "@/lib/voice/mouth";

const SEGMENTS = 256;

function ringGeometry(radius: number, dashed = false) {
  const pts: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    if (dashed && Math.floor(i / 6) % 2 === 1) continue;
    const a = (i / SEGMENTS) * Math.PI * 2;
    pts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

/**
 * Orbiting rings + an audio-reactive waveform ring behind the head.
 * The waveform reads `mouth.level`, so it pulses with the twin's voice.
 */
export default function HaloRings({ radius = 1.55, y = 0 }: { radius?: number; y?: number }) {
  const wave = useRef<THREE.LineLoop>(null);
  const orbitA = useRef<THREE.Group>(null);
  const orbitB = useRef<THREE.Group>(null);

  const waveGeo = useMemo(() => ringGeometry(radius), [radius]);
  const base = useMemo(() => (waveGeo.attributes.position.array as Float32Array).slice(), [waveGeo]);
  const ringA = useMemo(() => ringGeometry(radius * 1.12, true), [radius]);
  const ringB = useMemo(() => ringGeometry(radius * 1.32), [radius]);
  const ticks = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const r0 = radius * 1.38;
      const r1 = r0 + (i % 6 === 0 ? 0.09 : 0.04);
      pts.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [radius]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const level = mouth.level;
    const line = wave.current;
    if (line) {
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < SEGMENTS; i++) {
        const a = (i / SEGMENTS) * Math.PI * 2;
        const n =
          Math.sin(a * 6 + t * 2.1) * 0.5 +
          Math.sin(a * 13 - t * 3.3) * 0.3 +
          Math.sin(a * 29 + t * 5.7) * 0.2;
        const k = 1 + n * (0.008 + level * 0.09);
        pos.setXYZ(i, base[i * 3] * k, base[i * 3 + 1] * k, 0);
      }
      pos.needsUpdate = true;
      (line.material as THREE.LineBasicMaterial).opacity = 0.35 + level * 0.65;
    }
    if (orbitA.current) orbitA.current.rotation.z = t * 0.12;
    if (orbitB.current) orbitB.current.rotation.z = -t * 0.05;
  });

  return (
    <group position={[0, y, -0.9]}>
      <lineLoop ref={wave} geometry={waveGeo}>
        <lineBasicMaterial color="#d4ff3a" transparent opacity={0.4} toneMapped={false} />
      </lineLoop>
      <group ref={orbitA}>
        <points geometry={ringA}>
          <pointsMaterial color="#ecebe4" size={0.012} transparent opacity={0.35} sizeAttenuation />
        </points>
      </group>
      <group ref={orbitB}>
        <lineLoop geometry={ringB}>
          <lineBasicMaterial color="#ecebe4" transparent opacity={0.08} />
        </lineLoop>
        <lineSegments geometry={ticks}>
          <lineBasicMaterial color="#ecebe4" transparent opacity={0.22} />
        </lineSegments>
      </group>
    </group>
  );
}
