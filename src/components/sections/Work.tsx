"use client";

import { motion, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { profile, type Project } from "@/content/profile";
import { useTwin } from "@/components/twin/TwinProvider";
import Scramble from "@/components/ui/Scramble";
import { useScrollTo } from "@/components/ui/SmoothScroll";

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return match;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generative topographic cover — echoes the contour lines of the holographic head. */
function Topo({ seed }: { seed: number }) {
  const paths = useMemo(() => {
    const rand = mulberry32(seed * 977 + 13);
    const cx = 120 + rand() * 160;
    const cy = 80 + rand() * 140;
    const f1 = 2 + Math.floor(rand() * 4);
    const f2 = 4 + Math.floor(rand() * 5);
    const p1 = rand() * 6.28;
    const p2 = rand() * 6.28;
    const out: string[] = [];
    for (let k = 1; k <= 22; k++) {
      const r = k * 13;
      let d = "";
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const rr = r * (1 + 0.16 * Math.sin(f1 * a + p1 + k * 0.15) + 0.08 * Math.sin(f2 * a + p2 - k * 0.2));
        d += `${i ? "L" : "M"}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr * 0.8).toFixed(1)}`;
      }
      out.push(d + "Z");
    }
    return out;
  }, [seed]);

  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <g className="origin-center transition-transform duration-[1.6s] ease-out group-hover:scale-110 group-hover:rotate-6">
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={i % 5 === 0 ? "#d4ff3a" : "#ecebe4"}
            strokeOpacity={i % 5 === 0 ? 0.8 : 0.16 + (i / paths.length) * 0.2}
            strokeWidth={i % 5 === 0 ? 1.2 : 0.7}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const ref = useRef<HTMLElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-9, 9]), { stiffness: 200, damping: 20 });
  const glare = useTransform(
    [px, py],
    ([x, y]: number[]) =>
      `radial-gradient(420px circle at ${x * 100}% ${y * 100}%, rgba(212,255,58,0.14), transparent 60%)`,
  );
  const link = project.href ?? project.repo;

  return (
    <motion.article
      ref={ref}
      style={{ rotateX, rotateY, transformPerspective: 1100 }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = ref.current!.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
      data-cursor={link ? "Open" : "View"}
      className="group relative flex h-[min(72vh,40rem)] w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-line bg-ink-2 md:w-[min(34rem,70vw)]"
    >
      <motion.div
        className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: glare }}
      />
      <div className="relative h-[46%] overflow-hidden border-b border-line bg-ink">
        <Topo seed={index + 1} />
        <span className="absolute bottom-3 left-5 font-display text-[7rem] leading-none font-extrabold tracking-[-0.06em] text-outline [font-stretch:80%]">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="absolute top-4 right-5 rounded-full border border-line bg-ink/70 px-2.5 py-1 font-mono text-[10px] text-mute backdrop-blur">
          {project.year}
        </span>
      </div>
      <div className="relative z-20 flex flex-1 flex-col p-6 sm:p-7">
        <h3 className="font-display text-[clamp(1.6rem,2.6vw,2.4rem)] leading-[0.95] font-bold tracking-[-0.03em]">
          {project.title}
        </h3>
        <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-mute">{project.blurb}</p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-5">
          <ul className="flex flex-wrap gap-1.5">
            {project.tags.map((t) => (
              <li key={t} className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-bone/80">
                {t}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            {project.href && (
              <a
                href={project.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-signal px-3.5 py-1.5 font-mono text-[11px] text-ink uppercase transition-transform hover:-translate-y-0.5"
              >
                Live ↗
              </a>
            )}
            {project.repo && (
              <a
                href={project.repo}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-line px-3.5 py-1.5 font-mono text-[11px] text-bone uppercase transition-colors hover:border-signal hover:text-signal"
              >
                Code ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export default function Work() {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);
  const desktop = useMediaQuery("(min-width: 768px)");
  const { openRoom } = useTwin();
  const scrollTo = useScrollTo();

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setDistance(Math.max(0, el.scrollWidth - window.innerWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [desktop]);

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -distance]);
  const smoothX = useSpring(x, { stiffness: 120, damping: 26, mass: 0.4 });

  return (
    <section
      id="work"
      ref={section}
      className="relative"
      style={{ height: desktop ? `calc(100vh + ${distance}px)` : undefined }}
    >
      <div className={desktop ? "sticky top-0 flex h-screen flex-col justify-center overflow-hidden" : "py-[12vh]"}>
        <div className="mb-8 flex items-end justify-between gap-6 px-[var(--gutter)]">
          <div>
            <p className="label">
              (03) <Scramble text="Selected work" />
            </p>
            <h2 className="mt-3 font-display text-[clamp(2.5rem,6vw,5.5rem)] leading-[0.9] font-extrabold tracking-[-0.04em]">
              Proof of <span className="font-serif font-normal text-signal italic">obsession</span>
            </h2>
          </div>
          <span className="label hidden sm:block">{String(profile.projects.length).padStart(2, "0")} projects →</span>
        </div>

        <motion.div
          ref={track}
          style={desktop ? { x: smoothX } : undefined}
          className="flex flex-col gap-5 px-[var(--gutter)] md:w-max md:flex-row md:gap-6"
        >
          {profile.projects.map((p, i) => (
            <ProjectCard key={p.title} project={p} index={i} />
          ))}
          <div className="flex h-[min(72vh,40rem)] w-full shrink-0 flex-col justify-between rounded-3xl border border-dashed border-signal/40 p-7 md:w-[min(26rem,60vw)]">
            <span className="label">Next</span>
            <p className="font-display text-[clamp(2.2rem,4vw,3.5rem)] leading-[0.95] font-extrabold tracking-[-0.04em]">
              Your idea <span className="font-serif font-normal text-signal italic">could</span> be here.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => scrollTo("contact")}
                className="rounded-full bg-signal px-5 py-3 font-mono text-xs tracking-wider text-ink uppercase"
              >
                Start a project →
              </button>
              <button
                onClick={() => openRoom("Tell me about your best project")}
                className="rounded-full border border-line px-5 py-3 font-mono text-xs tracking-wider text-bone uppercase transition-colors hover:border-signal hover:text-signal"
              >
                Ask the twin about my work
              </button>
            </div>
          </div>
        </motion.div>

        {desktop && (
          <div className="mx-[var(--gutter)] mt-8 h-px bg-line">
            <motion.div className="h-px origin-left bg-signal" style={{ scaleX: scrollYProgress }} />
          </div>
        )}
      </div>
    </section>
  );
}
