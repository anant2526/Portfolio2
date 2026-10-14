"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { profile } from "@/content/profile";
import { markBooted } from "@/lib/boot";

const LINES = [
  "mounting persona.core",
  "loading memories",
  "calibrating voiceprint",
  "sculpting hologram",
  "syncing lips to soul",
];

/** One-time terminal-style boot sequence. Skipped on repeat visits in a session. */
export default function BootLoader() {
  const [show, setShow] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("twin-booted") === "1";
    } catch {
      // storage unavailable (private mode) — just play it
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShow(false);
      markBooted();
      return;
    }
    const timers = LINES.map((_, i) => window.setTimeout(() => setStep(i + 1), 180 + i * 230));
    timers.push(
      window.setTimeout(() => {
        setShow(false);
        markBooted();
        try {
          sessionStorage.setItem("twin-booted", "1");
        } catch {
          // ignore
        }
      }, 180 + LINES.length * 230 + 450),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const pct = Math.round((step / LINES.length) * 100);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="boot"
          className="fixed inset-0 z-[120] flex flex-col justify-between bg-ink p-[var(--gutter)] font-mono text-xs text-mute"
          exit={{ clipPath: "inset(0 0 100% 0)" }}
          initial={{ clipPath: "inset(0 0 0% 0)" }}
          transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="flex justify-between uppercase">
            <span>{profile.handle}.twin</span>
            <span>boot sequence</span>
          </div>
          <div className="space-y-1.5">
            {LINES.slice(0, step).map((l, i) => (
              <div key={l} className="flex gap-3">
                <span className="text-dim">{String(i).padStart(2, "0")}</span>
                <span className="text-bone">&gt; {l}</span>
                <span className="text-signal">ok</span>
              </div>
            ))}
            <div className="flex gap-3">
              <span className="text-dim">{String(step).padStart(2, "0")}</span>
              <span className="animate-blink text-signal">█</span>
            </div>
          </div>
          <div className="flex items-end justify-between gap-6">
            <div className="font-display text-[clamp(4rem,16vw,14rem)] leading-[0.8] font-extrabold tracking-[-0.04em] text-bone">
              {pct}
              <span className="text-signal">%</span>
            </div>
            <div className="mb-3 h-px flex-1 bg-line">
              <motion.div className="h-px bg-signal" animate={{ width: `${pct}%` }} transition={{ ease: "easeOut" }} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
