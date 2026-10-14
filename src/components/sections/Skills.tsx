"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { profile } from "@/content/profile";
import Scramble from "@/components/ui/Scramble";

/** Draggable 3D sphere of tags, rendered with CSS transforms (no WebGL needed). */
function TagSphere({ items }: { items: string[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tags = Array.from(el.children) as HTMLElement[];
    const n = tags.length;
    const pts = tags.map((_, i) => {
      const y = 1 - (i / Math.max(1, n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = Math.PI * (3 - Math.sqrt(5)) * i;
      return { x: Math.cos(th) * r, y, z: Math.sin(th) * r };
    });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const AUTO = reduced ? 0 : 0.0035;
    let rx = 0.35;
    let ry = 0;
    let vx = 0;
    let vy = AUTO;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let raf = 0;
    let visible = true;

    const render = () => {
      const R = el.clientWidth * 0.4;
      const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const x = p.x * cy + p.z * sy;
        let z = -p.x * sy + p.z * cy;
        const y = p.y * cx - z * sx;
        z = p.y * sx + z * cx;
        const depth = (z + 1) / 2;
        const t = tags[i];
        t.style.transform = `translate(-50%, -50%) translate3d(${(x * R).toFixed(1)}px, ${(y * R).toFixed(1)}px, 0) scale(${(0.7 + depth * 0.45).toFixed(3)})`;
        t.style.opacity = (0.22 + depth * 0.78).toFixed(3);
        t.style.zIndex = String(Math.round(depth * 100));
        t.dataset.front = depth > 0.82 ? "1" : "0";
      }
    };

    const loop = () => {
      if (!dragging) {
        vx += (0 - vx) * 0.03;
        vy += (AUTO - vy) * 0.03;
      }
      rx += vx;
      ry += vy;
      render();
      if (visible) raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    });
    io.observe(el);

    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      vy = (e.clientX - lastX) * 0.004;
      vx = -(e.clientY - lastY) * 0.004;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = () => {
      dragging = false;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    render();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [items]);

  return (
    <div
      ref={ref}
      data-cursor="Drag"
      className="relative mx-auto aspect-square w-full max-w-[34rem] cursor-grab touch-pan-y select-none active:cursor-grabbing"
      aria-label={`Skills: ${items.join(", ")}`}
      role="img"
    >
      {items.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="absolute top-1/2 left-1/2 rounded-full border border-line bg-ink/80 px-3 py-1.5 font-mono text-xs whitespace-nowrap text-bone transition-colors will-change-transform data-[front=1]:border-signal/60 data-[front=1]:text-signal"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function Marquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const row = [...items, ...items];
  return (
    <div className="flex overflow-hidden border-y border-line py-3 select-none" aria-hidden>
      <div
        className={`flex shrink-0 gap-8 pr-8 ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}
        style={{ ["--marquee-duration" as string]: `${items.length * 3.5}s` }}
      >
        {row.map((t, i) => (
          <span
            key={i}
            className={`flex items-center gap-8 font-display text-[clamp(2rem,5vw,4.5rem)] leading-none font-extrabold tracking-[-0.04em] whitespace-nowrap uppercase [font-stretch:80%] ${
              i % 2 ? "text-outline" : "text-bone"
            }`}
          >
            {t}
            <span className="text-[0.45em] text-signal">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Skills() {
  const all = useMemo(() => profile.skills.flatMap((g) => g.items), []);
  const half = Math.ceil(all.length / 2);

  return (
    <section id="skills" className="relative py-[14vh]">
      <div className="mb-[10vh] space-y-3 -rotate-[1.5deg]">
        <Marquee items={all.slice(0, half)} />
        <Marquee items={all.slice(half)} reverse />
      </div>

      <div className="grid items-center gap-12 px-[var(--gutter)] md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="label">
            (02) <Scramble text="Toolkit" />
          </p>
          <h2 className="mt-4 font-display text-[clamp(2.5rem,6vw,5.5rem)] leading-[0.9] font-extrabold tracking-[-0.04em]">
            Things I build <span className="font-serif font-normal text-signal italic">with</span>
          </h2>
          <dl className="mt-10 divide-y divide-line border-y border-line">
            {profile.skills.map((g, i) => (
              <motion.div
                key={g.group}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-5%" }}
                transition={{ duration: 0.6, delay: i * 0.07 }}
                className="group grid grid-cols-[7rem_1fr] gap-4 py-4"
              >
                <dt className="label pt-0.5 transition-colors group-hover:text-signal">{g.group}</dt>
                <dd className="text-[15px] text-bone/85">{g.items.join(" / ")}</dd>
              </motion.div>
            ))}
          </dl>
        </div>
        <div className="md:col-span-7">
          <TagSphere items={all} />
          <p className="label mt-2 text-center">drag to spin</p>
        </div>
      </div>
    </section>
  );
}
