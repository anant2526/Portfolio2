"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { LoadedFace } from "@/components/three/HoloHead";
import { buildFaceRig } from "@/lib/face/rig";
import type { ScanResult } from "@/lib/face/scan";
import { charToViseme, setMouthSource } from "@/lib/voice/mouth";
import type { SpeechEngine } from "@/lib/voice/speech-engine";

const AvatarStage = dynamic(() => import("@/components/three/AvatarStage"), { ssr: false });

type Phase = "idle" | "scanning" | "ready" | "saving" | "saved" | "error";

const TIPS = [
  "Face the camera straight on, chin level.",
  "Bright, even light on your face (a window in front of you is perfect).",
  "Fill the frame: your face should be at least ~300px wide. Close-up selfies beat full-body shots.",
  "Mouth closed or a soft smile works best for lip-sync.",
  "Glasses are fine (the twin will wear them), but dark lenses hide your eyes and blinks.",
];

export default function FaceStudio({ engine }: { engine: SpeechEngine }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [preview, setPreview] = useState<LoadedFace | null>(null);
  const [camOn, setCamOn] = useState(false);
  const vizRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  // Draw the scan: the face crop with every landmark the model found.
  useEffect(() => {
    const canvas = vizRef.current;
    if (!canvas || !scan) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "rgba(8,9,10,0.35)";
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.fillStyle = "#d4ff3a";
      const uv = scan.data.uvs;
      for (let i = 0; i < uv.length; i += 2) {
        ctx.beginPath();
        ctx.arc(uv[i] * img.width, (1 - uv[i + 1]) * img.height, Math.max(1.5, img.width / 380), 0, Math.PI * 2);
        ctx.fill();
      }
    };
    img.src = scan.texture;
  }, [scan]);

  async function runScan(img: HTMLImageElement) {
    setPhase("scanning");
    setError(null);
    setScan(null);
    setPreview(null);
    try {
      const { scanFace } = await import("@/lib/face/scan");
      const result = await scanFace(img);
      const texture = await new THREE.TextureLoader().loadAsync(result.texture);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      setScan(result);
      setPreview({ rig: buildFaceRig(result.data), texture });
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That isn't an image. Use a JPG or PNG photo.");
      setPhase("error");
      return;
    }
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(file));
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setCamOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      setError("Couldn't open the camera — check the browser's camera permission.");
      setPhase("error");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1); // un-mirror the selfie preview
    ctx.drawImage(video, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
    canvas.toBlob((b) => b && pickFile(new File([b], "webcam.jpg", { type: "image/jpeg" })), "image/jpeg", 0.95);
  }

  async function save() {
    if (!scan) return;
    setPhase("saving");
    const res = await fetch("/api/studio/face", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: scan.data, texture: scan.texture }),
    });
    if (res.ok) setPhase("saved");
    else {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Saving failed.");
      setPhase("error");
    }
  }

  async function resetToHologram() {
    await fetch("/api/studio/face", { method: "DELETE" });
    setPhase("idle");
    setScan(null);
    setPreview(null);
    setPhoto(null);
  }

  /** Silent check of the rig: steps through mouth shapes as if saying a phrase. */
  function mouthTest() {
    engine.stop();
    const text = "hello, my name is twin. wow, look at me go!";
    const start = performance.now();
    setMouthSource(() => {
      const i = Math.floor((performance.now() - start) / 85);
      if (i >= text.length) return null;
      return { viseme: charToViseme(text, i), level: 0.8 };
    });
    window.setTimeout(() => setMouthSource(null), text.length * 85 + 100);
  }

  function testLipSync() {
    engine.unlock();
    engine.stop();
    engine.enqueue("Hey! This is my digital twin talking. Do I look like me yet?");
  }

  return (
    <section className="rounded-3xl border border-line bg-ink-2/60 p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">01 — Face</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Scan your face <span className="font-serif font-normal text-signal italic">from one photo</span>
          </h2>
          <p className="mt-2 max-w-xl text-mute">
            Your photo never leaves your computer during the scan. It becomes a 3D mesh of your real face shape,
            textured with your photo, rigged to talk and blink.
          </p>
        </div>
        {phase === "saved" && (
          <a href="/" className="rounded-full bg-signal px-4 py-2 font-mono text-xs text-ink uppercase">
            See it on the homepage →
          </a>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Input */}
        <div className="flex flex-col gap-3">
          <div
            className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl border border-dashed border-line bg-ink"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files[0]);
            }}
          >
            {camOn ? (
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            ) : scan ? (
              <canvas ref={vizRef} className="h-full w-full object-contain" />
            ) : photo ? (
              <img
                src={photo}
                alt="Your photo"
                className="h-full w-full object-contain"
                onLoad={(e) => runScan(e.currentTarget)}
              />
            ) : (
              <button onClick={() => fileRef.current?.click()} className="p-8 text-center">
                <span className="block font-display text-2xl font-bold">Drop a photo here</span>
                <span className="mt-1 block text-sm text-mute">or click to choose one · JPG / PNG</span>
              </button>
            )}
            {phase === "scanning" && (
              <div className="absolute inset-0 grid place-items-center bg-ink/70 font-mono text-xs text-signal uppercase">
                <span className="animate-pulse">Scanning your face…</span>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-line px-4 py-2 font-mono text-xs uppercase transition-colors hover:border-signal hover:text-signal"
            >
              Upload photo
            </button>
            {camOn ? (
              <button onClick={capture} className="rounded-full bg-ember px-4 py-2 font-mono text-xs text-ink uppercase">
                Take photo
              </button>
            ) : (
              <button
                onClick={startCamera}
                className="rounded-full border border-line px-4 py-2 font-mono text-xs uppercase transition-colors hover:border-signal hover:text-signal"
              >
                Use webcam
              </button>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="flex flex-col gap-3">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-line">
            <AvatarStage variant="room" previewFace={preview} />
            <span className="absolute top-3 left-3 rounded-full bg-ink/70 px-2.5 py-1 font-mono text-[10px] text-mute uppercase backdrop-blur">
              {preview ? "Your scan · move your mouse" : "Current: hologram"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={testLipSync}
              disabled={!preview}
              className="rounded-full border border-line px-4 py-2 font-mono text-xs uppercase transition-colors enabled:hover:border-signal enabled:hover:text-signal disabled:opacity-30"
            >
              Test lip-sync
            </button>
            <button
              onClick={mouthTest}
              disabled={!preview}
              className="rounded-full border border-line px-4 py-2 font-mono text-xs uppercase transition-colors enabled:hover:border-signal enabled:hover:text-signal disabled:opacity-30"
            >
              Mouth test (silent)
            </button>
            <button
              onClick={save}
              disabled={!scan || phase === "saving"}
              className="rounded-full bg-signal px-4 py-2 font-mono text-xs text-ink uppercase disabled:opacity-30"
            >
              {phase === "saving" ? "Saving…" : phase === "saved" ? "Saved ✓" : "Save as my avatar"}
            </button>
            <button
              onClick={resetToHologram}
              className="ml-auto rounded-full px-3 py-2 font-mono text-[11px] text-mute uppercase hover:text-ember"
            >
              Reset to hologram
            </button>
          </div>
        </div>
      </div>

      {(error || scan?.warnings.length) && (
        <div className="mt-6 space-y-2">
          {error && <p className="rounded-xl border border-ember/40 bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p>}
          {scan?.warnings.map((w) => (
            <p key={w} className="rounded-xl border border-line px-4 py-3 text-sm text-bone/80">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      <ul className="mt-6 grid gap-x-8 gap-y-1.5 text-sm text-mute sm:grid-cols-2">
        {TIPS.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="text-signal">→</span>
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}
