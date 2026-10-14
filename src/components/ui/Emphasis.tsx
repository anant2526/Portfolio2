import { Fragment } from "react";

/** Renders `*word*` segments as italic serif accents. */
export default function Emphasis({ text, className = "font-serif italic text-signal" }: { text: string; className?: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") ? (
          <em key={i} className={className}>
            {p.slice(1, -1)}
          </em>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
