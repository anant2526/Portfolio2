"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { useTwin } from "./TwinProvider";

/** Floating "talk" button that appears once the hero is out of view. */
export default function TwinLauncher() {
  const { openRoom, open } = useTwin();
  const { scrollY } = useScroll();
  const [show, setShow] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    // Visible between the hero and the contact section (which has its own "ask my twin" card).
    const nearBottom = y > document.documentElement.scrollHeight - window.innerHeight * 1.6;
    setShow(y > window.innerHeight * 0.8 && !nearBottom);
  });

  return (
    <AnimatePresence>
      {show && !open && (
        <motion.button
          key="launcher"
          onClick={() => openRoom()}
          data-cursor="Talk"
          aria-label="Talk to my AI twin"
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0, rotate: 90 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="fixed right-[var(--gutter)] bottom-6 z-[70] grid h-16 w-16 place-items-center rounded-full bg-signal text-ink shadow-[0_0_40px_rgba(212,255,58,0.35)]"
        >
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-signal/50" aria-hidden />
          <span className="relative flex h-5 items-center gap-[3px]" aria-hidden>
            {[0.5, 1, 0.7, 0.9, 0.4].map((h, i) => (
              <motion.span
                key={i}
                className="w-[3px] rounded-full bg-ink"
                animate={{ height: [`${h * 40}%`, `${h * 100}%`, `${h * 40}%`] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
              />
            ))}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
