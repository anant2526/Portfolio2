"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { pointer } from "@/lib/pointer";
import { VISEMES, mouth, updateMouth } from "@/lib/voice/mouth";

/*
 * Loads YOUR avatar (.glb) and drives its face from the shared lip-sync state.
 * Supported rigs, auto-detected per mesh:
 *  • Oculus/Meta visemes: viseme_aa, viseme_O, viseme_PP … (Avaturn, many VRChat-style exports)
 *  • ARKit blendshapes:   jawOpen, mouthFunnel, mouthPucker, mouthStretchLeft…
 *  • Simple rigs:         mouthOpen / MouthOpen, or a "Jaw" bone
 */

type Drive = { index: number; read: () => number };
type MeshDrive = { influences: number[]; drives: Drive[]; blinks: number[] };

const ARKIT: Record<string, () => number> = {
  jawOpen: () => mouth.jaw * 0.75,
  mouthFunnel: () => mouth.round * 0.55,
  mouthPucker: () => mouth.round * 0.45,
  mouthStretchLeft: () => mouth.wide * 0.3,
  mouthStretchRight: () => mouth.wide * 0.3,
  mouthSmileLeft: () => 0.08 + mouth.wide * 0.18,
  mouthSmileRight: () => 0.08 + mouth.wide * 0.18,
  mouthPressLeft: () => mouth.press * 0.5,
  mouthPressRight: () => mouth.press * 0.5,
  mouthClose: () => mouth.press * 0.3,
  mouthOpen: () => mouth.jaw,
  MouthOpen: () => mouth.jaw,
  jaw_open: () => mouth.jaw,
};
const BLINK = /^(eyeBlink(Left|Right)|eyesClosed|Blink|blink|Eye_Blink(_L|_R)?)$/;

function buildDrives(root: THREE.Object3D): MeshDrive[] {
  const out: MeshDrive[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.morphTargetDictionary || !m.morphTargetInfluences) return;
    const dict = m.morphTargetDictionary;
    const drives: Drive[] = [];
    const hasVisemes = `viseme_aa` in dict;
    if (hasVisemes) {
      for (const v of VISEMES) {
        const index = dict[`viseme_${v}`];
        if (index === undefined || v === "sil") continue;
        drives.push({ index, read: () => mouth.weights[v] * Math.min(1, 0.55 + mouth.level * 0.8) });
      }
    } else {
      for (const [name, read] of Object.entries(ARKIT)) {
        const index = dict[name];
        if (index !== undefined) drives.push({ index, read });
      }
    }
    const blinks = Object.entries(dict)
      .filter(([name]) => BLINK.test(name))
      .map(([, i]) => i);
    if (drives.length || blinks.length) out.push({ influences: m.morphTargetInfluences, drives, blinks });
  });
  return out;
}

/** Frames the model so its head is ~2 units tall at the origin, matching the holo head. */
function computeFit(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y || 1;
  let head: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!head && /(^|[:_])head$/i.test(o.name)) head = o;
  });

  let headCenterY: number;
  let headSize: number;
  if (head) {
    const p = head.getWorldPosition(new THREE.Vector3());
    headSize = Math.max(0.12, (box.max.y - p.y) * 1.8);
    headCenterY = p.y + headSize * 0.32;
  } else if (height > 1.2) {
    headSize = height / 7.5;
    headCenterY = box.max.y - headSize * 0.5;
  } else {
    headSize = height * 0.5;
    headCenterY = box.max.y - headSize * 0.55;
  }
  const centerX = (box.max.x + box.min.x) / 2;
  const centerZ = (box.max.z + box.min.z) / 2;
  const scale = 1.9 / headSize;
  return { scale, offset: new THREE.Vector3(-centerX, -headCenterY, -centerZ) };
}

type Props = {
  url: string;
  scale?: number;
  offset?: [number, number, number];
  position?: [number, number, number];
};

export default function ModelAvatar({ url, scale = 1, offset = [0, 0, 0], position = [0, 0, 0] }: Props) {
  const gltf = useGLTF(url);
  // Clone so the same model can appear in two canvases (hero + twin room).
  const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene]);
  const group = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(gltf.animations, group);
  const drives = useMemo(() => buildDrives(scene), [scene]);
  const fit = useMemo(() => computeFit(scene), [scene]);
  const jaw = useMemo(() => {
    let bone: THREE.Object3D | undefined;
    scene.traverse((o) => {
      if (!bone && /jaw/i.test(o.name) && (o as THREE.Bone).isBone) bone = o;
    });
    return bone ? { bone, rest: bone.rotation.x } : null;
  }, [scene]);
  const blink = useRef({ next: 2, start: -1 });

  useEffect(() => {
    const idle = names.find((n) => /idle|breath|stand/i.test(n)) ?? names[0];
    if (!idle) return;
    const action = actions[idle];
    action?.reset().fadeIn(0.4).play();
    return () => {
      action?.fadeOut(0.3);
    };
  }, [actions, names]);

  useEffect(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.frustumCulled = false;
    });
  }, [scene]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    updateMouth();

    const b = blink.current;
    if (t > b.next && b.start < 0) b.start = t;
    let closed = 0;
    if (b.start >= 0) {
      const k = (t - b.start) / 0.16;
      closed = k < 1 ? 1 - Math.abs(1 - 2 * k) : 0;
      if (k >= 1) {
        b.start = -1;
        b.next = t + 2 + Math.random() * 4;
      }
    }

    let hasMouthMorph = false;
    for (const d of drives) {
      for (const drive of d.drives) {
        d.influences[drive.index] = THREE.MathUtils.clamp(drive.read(), 0, 1);
        hasMouthMorph = true;
      }
      for (const i of d.blinks) d.influences[i] = closed;
    }
    if (!hasMouthMorph && jaw) jaw.bone.rotation.x = jaw.rest + mouth.jaw * 0.22;

    const g = group.current;
    if (g) {
      g.rotation.y = THREE.MathUtils.damp(g.rotation.y, pointer.x * 0.35 + Math.sin(t * 0.3) * 0.05, 3, dt);
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -pointer.y * 0.12, 3, dt);
    }
  });

  const s = fit.scale * scale;
  return (
    <group position={position}>
      <group ref={group}>
        <group scale={s} position={[offset[0], offset[1], offset[2]]}>
          <primitive object={scene} position={fit.offset} />
        </group>
      </group>
    </group>
  );
}
