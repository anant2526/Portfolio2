"use client";

import { useTexture } from "@react-three/drei";
import { use, useMemo } from "react";
import * as THREE from "three";
import { buildFaceRig } from "@/lib/face/rig";
import type { FaceData } from "@/lib/face/types";
import HoloHead from "./HoloHead";

const cache = new Map<string, Promise<FaceData>>();

function loadFace(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Couldn't load ${url} (${r.status})`);
      return r.json() as Promise<FaceData>;
    });
    cache.set(url, p);
  }
  return p;
}

/** The hologram head wearing your scanned face (saved by the Twin Studio). */
export default function ScannedHead({
  data,
  texture,
  position,
}: {
  data: string;
  texture: string;
  position: [number, number, number];
}) {
  const face = use(loadFace(data));
  const map = useTexture(texture);
  const loaded = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return { rig: buildFaceRig(face), texture: map };
  }, [face, map]);
  return <HoloHead position={position} face={loaded} />;
}
