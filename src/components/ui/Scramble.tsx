"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

const GLYPHS = "!<>-_\\/[]{}—=+*^?#01ABXZ$%&";

type Props = {
  text: string;
  className?: string;
  /** Re-run the effect on hover. */
  hover?: boolean;
  delay?: number;
  duration?: number;
};

/** Decodes text from random glyphs when it scrolls into view. */
export default function Scramble({ text, className, hover = false, delay = 0, duration = 700 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const [out, setOut] = useState(text);
  const frame = useRef(0);

  const run = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOut(text);
      return;
    }
    cancelAnimationFrame(frame.current);
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.max(0, (now - start) / duration);
      const revealed = Math.floor(p * text.length);
      let s = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (i < revealed || ch === " ") s += ch;
        else s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setOut(s);
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else setOut(text);
    };
    frame.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (inView) run();
    return () => cancelAnimationFrame(frame.current);
  }, [inView, text]);

  return (
    <span ref={ref} className={className} aria-label={text} onMouseEnter={hover ? run : undefined}>
      <span aria-hidden>{out}</span>
    </span>
  );
}
