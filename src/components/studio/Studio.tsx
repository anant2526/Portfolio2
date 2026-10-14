"use client";

import { useEffect, useMemo } from "react";
import { profile } from "@/content/profile";
import { SpeechEngine } from "@/lib/voice/speech-engine";
import FaceStudio from "./FaceStudio";
import VoiceStudio from "./VoiceStudio";

/** Local-only workshop for making the twin look and sound like you. */
export default function Studio() {
  const engine = useMemo(() => new SpeechEngine(profile.speechLang), []);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((s: { voice: "cloned" | "browser" }) => engine.setClonedAvailable(s.voice === "cloned"))
      .catch(() => {});
    return () => engine.stop();
  }, [engine]);

  return (
    <main className="mx-auto max-w-6xl px-[var(--gutter)] py-10 sm:py-16">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <a href="/" className="label hover:text-signal">
            ← back to portfolio
          </a>
          <h1 className="mt-4 font-display text-[clamp(3rem,8vw,6.5rem)] leading-[0.85] font-extrabold tracking-[-0.045em] [font-stretch:80%]">
            Twin <span className="font-serif font-normal tracking-[-0.02em] text-signal italic">studio</span>
          </h1>
          <p className="mt-4 max-w-xl text-mute">
            Make the AI twin look and sound like you. Everything here runs on your machine and only exists while you
            run <code className="font-mono text-bone">npm run dev</code> — it&apos;s never part of the public site.
          </p>
        </div>
        <span className="rounded-full border border-line px-3 py-1.5 font-mono text-[10px] text-mute uppercase">
          localhost only
        </span>
      </header>
      <div className="space-y-8">
        <FaceStudio engine={engine} />
        <VoiceStudio engine={engine} />
      </div>
    </main>
  );
}
