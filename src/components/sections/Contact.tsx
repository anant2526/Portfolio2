"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { profile } from "@/content/profile";
import { useTwin } from "@/components/twin/TwinProvider";
import Magnetic from "@/components/ui/Magnetic";
import Scramble from "@/components/ui/Scramble";
import { useScrollTo } from "@/components/ui/SmoothScroll";

const LINES = [
  { text: "Let's build", style: "" },
  { text: "something", style: "text-outline" },
  { text: "loud.", style: "font-serif font-normal italic text-signal tracking-[-0.02em]" },
];

export default function Contact() {
  const { openRoom } = useTwin();
  const scrollTo = useScrollTo();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profile.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${profile.email}`;
    }
  };

  return (
    <section id="contact" className="relative flex min-h-[100svh] flex-col justify-between overflow-hidden px-[var(--gutter)] pt-[14vh] pb-8">
      <div
        className="pointer-events-none absolute -right-[20vw] -bottom-[30vw] h-[70vw] w-[70vw] rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, #d4ff3a 0%, transparent 60%)" }}
        aria-hidden
      />

      <div>
        <p className="label">
          (05) <Scramble text="Contact" />
        </p>
        <h2 className="mt-6 font-display text-[clamp(3.2rem,12vw,13rem)] leading-[0.82] font-extrabold tracking-[-0.03em] uppercase [font-stretch:80%]">
          {LINES.map((l, i) => (
            <span key={l.text} className="block overflow-hidden">
              <motion.span
                className={`block ${l.style}`}
                initial={{ y: "100%" }}
                whileInView={{ y: "0%" }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 1, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              >
                {l.text}
              </motion.span>
            </span>
          ))}
        </h2>
      </div>

      <div className="relative mt-14 grid items-end gap-10 md:grid-cols-12">
        <div className="md:col-span-5">
          <Magnetic strength={0.25} className="inline-block">
            <a
              href={`mailto:${profile.email}`}
              data-cursor="Email"
              className="grid h-40 w-40 place-items-center rounded-full bg-signal text-center font-mono text-xs tracking-wider text-ink uppercase transition-transform duration-500 hover:scale-105 sm:h-48 sm:w-48"
            >
              Say
              <br />
              hello ↗
            </a>
          </Magnetic>
          <button onClick={copy} className="mt-6 block font-mono text-sm text-bone/80 transition-colors hover:text-signal">
            {copied ? "copied to clipboard ✓" : profile.email}
          </button>
        </div>

        <ul className="divide-y divide-line border-y border-line md:col-span-4">
          {[...profile.socials, ...(profile.resumeUrl ? [{ label: "Résumé", href: profile.resumeUrl }] : [])].map((s) => (
            <li key={s.label}>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between py-3.5 text-lg transition-colors hover:text-signal"
              >
                <Scramble text={s.label} hover />
                <span className="transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
              </a>
            </li>
          ))}
        </ul>

        <div className="md:col-span-3">
          <button
            onClick={() => openRoom()}
            data-cursor="Talk"
            className="group w-full rounded-2xl border border-line p-5 text-left transition-colors hover:border-signal"
          >
            <span className="label">Can&apos;t wait?</span>
            <span className="mt-2 block font-display text-2xl leading-tight font-bold">
              Ask my <span className="font-serif font-normal text-signal italic">twin</span> right now →
            </span>
          </button>
        </div>
      </div>

      <footer className="relative mt-16 flex flex-col gap-3 border-t border-line pt-5 font-mono text-[11px] text-mute sm:flex-row sm:items-center sm:justify-between">
        <span>
          © {new Date().getFullYear()} {profile.name}
        </span>
        <span className="text-dim">Built with Next.js · Three.js · Claude · ElevenLabs</span>
        <button onClick={() => scrollTo("top")} className="text-left uppercase transition-colors hover:text-signal">
          Back to top ↑
        </button>
      </footer>
    </section>
  );
}
