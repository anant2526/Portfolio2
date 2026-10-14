"use client";

import { motion, useScroll } from "motion/react";
import { useRef } from "react";
import { profile } from "@/content/profile";
import Scramble from "@/components/ui/Scramble";

export default function Journey() {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.75", "end 0.6"] });

  return (
    <section id="journey" className="relative px-[var(--gutter)] py-[16vh]">
      <div className="grid gap-12 md:grid-cols-12">
        <div className="md:sticky md:top-28 md:col-span-4 md:self-start">
          <p className="label">
            (04) <Scramble text="Journey" />
          </p>
          <h2 className="mt-3 font-display text-[clamp(2.5rem,6vw,5.5rem)] leading-[0.9] font-extrabold tracking-[-0.04em]">
            Signal <span className="font-serif font-normal text-signal italic">log</span>
          </h2>
          <p className="mt-5 max-w-[22rem] text-mute">
            Where I&apos;ve been, what I&apos;ve shipped, and what I learned on the way.
          </p>
        </div>

        <ol ref={ref} className="relative md:col-span-8">
          <div className="absolute top-2 bottom-2 left-[7px] w-px bg-line" aria-hidden />
          <motion.div
            className="absolute top-2 bottom-2 left-[7px] w-px origin-top bg-signal shadow-[0_0_12px_#d4ff3a]"
            style={{ scaleY: scrollYProgress }}
            aria-hidden
          />
          {profile.experience.map((e, i) => (
            <motion.li
              key={`${e.when}-${e.role}`}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="group relative grid gap-2 pb-14 pl-10 last:pb-0 sm:grid-cols-[9rem_1fr] sm:gap-8"
            >
              <span className="absolute top-1.5 left-0 grid h-[15px] w-[15px] place-items-center rounded-full border border-signal/50 bg-ink">
                <span className="h-[5px] w-[5px] rounded-full bg-signal transition-transform duration-500 group-hover:scale-[2]" />
              </span>
              <span className="label pt-1">{e.when}</span>
              <div>
                <h3 className="font-display text-[clamp(1.5rem,2.6vw,2.25rem)] leading-tight font-bold tracking-[-0.02em]">
                  {e.role}
                </h3>
                <p className="mt-1 font-serif text-xl text-signal italic">{e.org}</p>
                <p className="mt-3 max-w-[48ch] leading-relaxed text-mute">{e.summary}</p>
              </div>
              <span className="absolute top-0 right-0 hidden font-mono text-[10px] text-dim sm:block">
                {String(i + 1).padStart(2, "0")}
              </span>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
