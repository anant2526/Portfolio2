"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useState } from "react";
import { profile } from "@/content/profile";
import { useTwin } from "@/components/twin/TwinProvider";
import { useScrollTo } from "./SmoothScroll";

const LINKS = [
  { id: "about", label: "About" },
  { id: "skills", label: "Toolkit" },
  { id: "work", label: "Work" },
  { id: "journey", label: "Journey" },
  { id: "contact", label: "Contact" },
];

function Clock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: profile.timezone,
    });
    const tick = () => setNow(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {now ?? "--:--:--"}
    </span>
  );
}

export default function Nav() {
  const { openRoom, speech } = useTwin();
  const scrollTo = useScrollTo();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setHidden(y > prev && y > 400);
    setScrolled(y > 40);
  });

  return (
    <motion.header
      className="fixed inset-x-0 top-0 z-50"
      animate={{ y: hidden ? "-110%" : "0%" }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={`flex items-center justify-between gap-4 px-[var(--gutter)] py-4 transition-colors duration-500 ${
          scrolled ? "bg-ink/70 backdrop-blur-md" : ""
        }`}
      >
        <button
          onClick={() => scrollTo("top")}
          className="group flex items-center gap-2.5 font-mono text-xs tracking-wider uppercase"
          data-cursor="Top"
        >
          <span className="relative grid h-7 w-7 place-items-center rounded-full border border-line">
            <span className="h-2 w-2 rounded-full bg-signal transition-transform duration-500 group-hover:scale-150" />
          </span>
          <span className="hidden sm:inline">
            {profile.firstName.toLowerCase()}
            <span className="text-mute">.twin</span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
          {LINKS.map((l, i) => (
            <button
              key={l.id}
              onClick={() => scrollTo(l.id)}
              className="group relative px-3 py-1.5 font-mono text-[11px] tracking-wider text-mute uppercase transition-colors hover:text-bone"
            >
              <span className="mr-1 text-dim group-hover:text-signal">0{i + 1}</span>
              {l.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <span className="label hidden lg:inline">
            {profile.timezone === "UTC" ? "UTC" : profile.location.split(",")[0]} · <Clock />
          </span>
          <button
            onClick={() => openRoom()}
            data-cursor="Talk"
            className="group relative flex items-center gap-2 overflow-hidden rounded-full border border-signal/40 bg-signal/5 py-2 pr-4 pl-3 font-mono text-[11px] tracking-wider text-signal uppercase transition-colors hover:bg-signal hover:text-ink"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-signal" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-signal group-hover:bg-ink" />
            </span>
            {speech.speaking ? "Speaking…" : "Talk to my twin"}
          </button>
        </div>
      </div>
    </motion.header>
  );
}
