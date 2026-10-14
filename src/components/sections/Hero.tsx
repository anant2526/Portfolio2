"use client";

import { motion, useInView, useScroll, useTransform } from "motion/react";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { profile } from "@/content/profile";
import { useBooted } from "@/lib/boot";
import { useTwin } from "@/components/twin/TwinProvider";
import Emphasis from "@/components/ui/Emphasis";
import Magnetic from "@/components/ui/Magnetic";

const AvatarStage = dynamic(() => import("@/components/three/AvatarStage"), { ssr: false });

const EASE = [0.16, 1, 0.3, 1] as const;

function SplitWord({ word, delay, outline = false }: { word: string; delay: number; outline?: boolean }) {
  const booted = useBooted();
  return (
    <span className={`inline-flex overflow-hidden ${outline ? "text-outline" : ""}`} aria-hidden>
      {word.split("").map((ch, i) => (
        <motion.span
          key={i}
          className="inline-block"
          initial={{ y: "105%" }}
          animate={booted ? { y: "0%" } : undefined}
          transition={{ duration: 1.1, ease: EASE, delay: delay + i * 0.045 }}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
  const { openRoom, open, speech } = useTwin();
  const booted = useBooted();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const nameY = useTransform(scrollYProgress, [0, 1], ["0%", "35%"]);
  const stageScale = useTransform(scrollYProgress, [0, 1], [1, 0.88]);
  const stageOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.2]);

  const [first, ...rest] = profile.name.toUpperCase().split(" ");
  const last = rest.join(" ");

  const fade = (delay: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: booted ? { opacity: 1, y: 0 } : undefined,
    transition: { duration: 0.9, ease: EASE, delay },
  });

  return (
    <section ref={ref} id="top" className="relative h-[100svh] min-h-[620px] overflow-hidden">
      <motion.div className="absolute inset-0" style={{ scale: stageScale, opacity: stageOpacity }}>
        <AvatarStage variant="hero" active={inView && !open} />
      </motion.div>

      {/* Atmosphere */}
      <div className="scanlines pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-ink via-ink/70 to-transparent" />

      {/* Meta row */}
      <motion.div
        {...fade(0.2)}
        className="absolute inset-x-0 top-20 flex justify-between px-[var(--gutter)] font-mono text-[11px] tracking-wider text-mute uppercase sm:top-24"
      >
        <span>
          <span className="text-dim">[</span> Digital twin <span className="text-signal">●</span> online{" "}
          <span className="text-dim">]</span>
        </span>
        <span className="hidden sm:inline">Portfolio — {new Date().getFullYear()}</span>
      </motion.div>

      {/* Left: who */}
      <motion.div
        {...fade(0.35)}
        className="absolute top-1/2 left-[var(--gutter)] hidden max-w-[19rem] -translate-y-[60%] md:block"
      >
        <p className="label mb-4">( {profile.role} )</p>
        <p className="text-[1.65rem] leading-[1.15] font-medium tracking-tight text-bone/90">
          <Emphasis text={profile.tagline} />
        </p>
        <p className="mt-6 font-mono text-[11px] leading-relaxed text-mute">
          {profile.availability}
          <br />
          {profile.location}
        </p>
      </motion.div>

      {/* Right: ask the twin */}
      <motion.div
        {...fade(0.5)}
        className="absolute top-1/2 right-[var(--gutter)] hidden w-[20rem] -translate-y-[60%] md:block"
      >
        <div className="rounded-2xl border border-line bg-ink/60 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between">
            <span className="label flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
              Ask my AI twin
            </span>
            <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-mute">T</kbd>
          </div>
          <button
            onClick={() => openRoom()}
            data-cursor="Talk"
            className="group flex w-full items-center justify-between rounded-xl border border-line bg-ink-2 px-4 py-3 text-left text-mute transition-colors hover:border-signal/60 hover:text-bone"
          >
            <span>{speech.speaking ? "Listening to me talk…" : "Ask me anything…"}</span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-signal text-ink transition-transform group-hover:rotate-[-45deg]">
              →
            </span>
          </button>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.twin.suggestedQuestions.slice(0, 3).map((q) => (
              <button
                key={q}
                onClick={() => openRoom(q)}
                className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-mute transition-colors hover:border-signal hover:text-signal"
              >
                {q}
              </button>
            ))}
          </div>
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-dim">
            Speaks in my cloned voice · lip-synced in real time · voice or text
          </p>
        </div>
      </motion.div>

      {/* Giant name */}
      <motion.div style={{ y: nameY }} className="absolute inset-x-0 bottom-0 px-[var(--gutter)] pb-[max(1.25rem,3vh)]">
        <motion.div {...fade(0.6)} className="mb-5 flex items-end justify-between gap-4 md:hidden">
          <p className="max-w-[16rem] text-lg leading-tight font-medium text-bone/90">
            <Emphasis text={profile.tagline} />
          </p>
        </motion.div>
        <motion.div {...fade(0.7)} className="mb-4 md:hidden">
          <Magnetic>
            <button
              onClick={() => openRoom()}
              className="flex w-full items-center justify-between rounded-full bg-signal py-2 pr-2 pl-5 font-mono text-xs tracking-wider text-ink uppercase"
            >
              Talk to my AI twin
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-signal">→</span>
            </button>
          </Magnetic>
        </motion.div>
        <h1
          aria-label={profile.name}
          className="flex flex-wrap items-end justify-between gap-x-[0.18em] font-display text-[clamp(3.6rem,13.4vw,16rem)] leading-[0.8] font-extrabold tracking-[-0.045em] [font-stretch:80%]"
        >
          <SplitWord word={first} delay={0.15} />
          {last ? <SplitWord word={last} delay={0.35} outline /> : null}
        </h1>
      </motion.div>
    </section>
  );
}
