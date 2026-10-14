"use client";

import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { profile } from "@/content/profile";
import Scramble from "@/components/ui/Scramble";

function Word({
  children,
  progress,
  range,
  accent,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
  accent: boolean;
}) {
  const opacity = useTransform(progress, range, [0.12, 1]);
  const blur = useTransform(progress, range, ["blur(6px)", "blur(0px)"]);
  return (
    <motion.span
      style={{ opacity, filter: blur }}
      className={`mr-[0.25em] inline-block ${accent ? "font-serif font-normal text-signal italic" : ""}`}
    >
      {children}
    </motion.span>
  );
}

export default function About() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.5"] });

  // `*word*` in the bio becomes an accent word.
  const words = profile.bio.split(/\s+/).map((w) => {
    const accent = /^\*.*\*[.,!?]?$/.test(w);
    return { text: w.replace(/\*/g, ""), accent };
  });

  return (
    <section id="about" className="relative px-[var(--gutter)] py-[16vh]">
      <div className="grid gap-10 md:grid-cols-12">
        <div className="md:col-span-3">
          <p className="label">
            (01) <Scramble text="About me" />
          </p>
          <p className="mt-3 max-w-[16rem] font-mono text-[11px] leading-relaxed text-dim">
            The human behind the hologram. Ask the twin if you want the long version.
          </p>
        </div>
        <p
          ref={ref}
          className="font-display text-[clamp(1.7rem,4.2vw,4.25rem)] leading-[1.04] font-semibold tracking-[-0.03em] md:col-span-9"
        >
          {words.map((w, i) => (
            <Word
              key={i}
              progress={scrollYProgress}
              range={[i / words.length, Math.min(1, (i + 2) / words.length)]}
              accent={w.accent}
            >
              {w.text}
            </Word>
          ))}
        </p>
      </div>

      <div className="mt-[10vh] grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {profile.stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="group relative bg-ink p-6 sm:p-8"
          >
            <div className="font-display text-[clamp(3rem,7vw,6rem)] leading-none font-extrabold tracking-[-0.05em] transition-colors duration-500 group-hover:text-signal">
              {s.value}
            </div>
            <div className="label mt-3">{s.label}</div>
            <span className="absolute top-5 right-5 font-mono text-[10px] text-dim">0{i + 1}</span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
