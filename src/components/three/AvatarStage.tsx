"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { Component, Suspense, useEffect, type ReactNode } from "react";
import * as THREE from "three";
import avatarConfig from "@/content/avatar.json";
import { profile } from "@/content/profile";
import type { AvatarConfig } from "@/lib/face/types";
import { installPointerTracking } from "@/lib/pointer";
import HaloRings from "./HaloRings";
import HoloHead, { type LoadedFace } from "./HoloHead";
import ModelAvatar from "./ModelAvatar";
import Particles from "./Particles";
import ScannedHead from "./ScannedHead";

const savedAvatar = avatarConfig as AvatarConfig;

class AvatarErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[avatar] Couldn't load the GLB avatar, using the holographic head instead.", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Picks the avatar, in order of preference:
 *  1. a GLB model (profile.avatar.modelUrl)
 *  2. your scanned face from the Twin Studio (src/content/avatar.json)
 *  3. the built-in holographic head
 */
function Avatar({ y, previewFace }: { y: number; previewFace?: LoadedFace | null }) {
  const holo = <HoloHead position={[0, y, 0]} />;
  if (previewFace) return <HoloHead key="preview" position={[0, y, 0]} face={previewFace} />;
  const url = profile.avatar.modelUrl;
  const scan = savedAvatar.face;
  if (!url && scan) {
    const v = `?v=${encodeURIComponent(scan.updatedAt)}`;
    return (
      <AvatarErrorBoundary fallback={holo}>
        <Suspense fallback={holo}>
          <ScannedHead data={scan.data + v} texture={scan.texture + v} position={[0, y, 0]} />
        </Suspense>
      </AvatarErrorBoundary>
    );
  }
  if (!url) return holo;
  return (
    <AvatarErrorBoundary fallback={holo}>
      <Suspense fallback={holo}>
        <ModelAvatar url={url} scale={profile.avatar.scale} offset={profile.avatar.offset} position={[0, y, 0]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[2, 2.5, 4]} intensity={2.2} color="#fff6ea" />
        <directionalLight position={[-3, 1, -2]} intensity={3} color="#d4ff3a" />
        <directionalLight position={[3, 0.5, -2]} intensity={2} color="#ff4d2e" />
        <Environment resolution={64}>
          <Lightformer form="rect" intensity={2} position={[0, 2, 4]} scale={[4, 2, 1]} />
          <Lightformer form="ring" intensity={1.5} color="#d4ff3a" position={[-3, 0, -2]} scale={2} />
        </Environment>
      </Suspense>
    </AvatarErrorBoundary>
  );
}

/** Pulls the camera back on narrow (portrait) screens so the head still fits. */
function ResponsiveCamera({ baseZ }: { baseZ: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    camera.position.z = aspect < 0.8 ? baseZ * Math.pow(0.8 / aspect, 0.55) : baseZ;
    camera.updateProjectionMatrix();
  }, [camera, size, baseZ]);
  return null;
}

type Props = {
  variant: "hero" | "room";
  /** Pauses rendering entirely when false (offscreen / hidden). */
  active?: boolean;
  /** Twin Studio: show an unsaved scan instead of the saved avatar. */
  previewFace?: LoadedFace | null;
};

export default function AvatarStage({ variant, active = true, previewFace }: Props) {
  useEffect(() => installPointerTracking(), []);
  const hero = variant === "hero";
  const camZ = hero ? 5.8 : 5.6;

  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, camZ], fov: 32, near: 0.1, far: 40 }}
      gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}
      aria-hidden
    >
      <ResponsiveCamera baseZ={camZ} />
      <color attach="background" args={["#08090a"]} />
      <fog attach="fog" args={["#08090a", 7, 16]} />
      <Avatar y={hero ? 0.25 : 0.05} previewFace={previewFace} />
      <HaloRings y={hero ? 0.25 : 0.05} radius={hero ? 1.6 : 1.5} />
      <Particles count={hero ? 1400 : 900} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={0.95} luminanceThreshold={0.16} luminanceSmoothing={0.35} radius={0.7} />
        <ChromaticAberration offset={new THREE.Vector2(0.0006, 0.0009)} radialModulation={false} modulationOffset={0} />
        <Noise opacity={0.04} premultiply />
        <Vignette offset={0.25} darkness={0.85} />
      </EffectComposer>
    </Canvas>
  );
}
