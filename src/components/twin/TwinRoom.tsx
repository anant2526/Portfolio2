"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { profile } from "@/content/profile";
import { useSpeechRecognition } from "@/lib/voice/use-speech-recognition";
import { useTwin, type TwinMessage } from "./TwinProvider";

const AvatarStage = dynamic(() => import("@/components/three/AvatarStage"), { ssr: false });

const EASE = [0.76, 0, 0.24, 1] as const;

function StatusPill({ label, tone }: { label: string; tone: "signal" | "ember" | "mute" }) {
  const color = tone === "signal" ? "bg-signal" : tone === "ember" ? "bg-ember" : "bg-mute";
  return (
    <span className="flex items-center gap-2 rounded-full border border-line bg-ink/70 px-3 py-1.5 font-mono text-[10px] tracking-wider text-bone uppercase backdrop-blur">
      <span className={`h-1.5 w-1.5 rounded-full ${color} ${tone !== "mute" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

function Message({ m, live }: { m: TwinMessage; live: boolean }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-bone px-4 py-2.5 text-[15px] leading-snug text-ink">
          {m.content}
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-[92%]">
      <p className="mb-1.5 font-mono text-[10px] tracking-wider text-signal uppercase">
        {profile.firstName}.twin
      </p>
      {m.content ? (
        <p
          className={`text-[17px] leading-relaxed whitespace-pre-wrap ${m.error ? "text-ember" : "text-bone/90"}`}
        >
          {m.content}
          {live && <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-blink bg-signal" />}
        </p>
      ) : (
        <p className="flex items-center gap-1 font-mono text-xs text-mute" aria-label="Thinking">
          thinking
          <span className="animate-blink">_</span>
        </p>
      )}
    </div>
  );
}

export default function TwinRoom() {
  const { open, closeRoom, messages, status, mode, send, stop, voiceOn, setVoiceOn, speech } = useTwin();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const mic = useSpeechRecognition(profile.speechLang, (text) => {
    setDraft("");
    send(text);
  });

  const busy = status !== "idle" || speech.speaking;

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 500);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRoom();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closeRoom]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    send(draft);
    setDraft("");
  };

  const toggleMic = () => {
    if (mic.listening) {
      mic.stop();
      return;
    }
    stop(); // don't let the twin hear itself
    mic.start();
  };

  const statusLabel = mic.listening
    ? { label: "Listening", tone: "ember" as const }
    : status === "thinking"
      ? { label: "Thinking", tone: "signal" as const }
      : speech.speaking
        ? { label: "Speaking", tone: "signal" as const }
        : { label: "Online", tone: "mute" as const };

  const onlyGreeting = messages.length <= 1 && status === "idle";
  const lastId = messages[messages.length - 1]?.id;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="twin-room"
          role="dialog"
          aria-modal="true"
          aria-label={`Talk to ${profile.firstName}'s AI twin`}
          className="fixed inset-0 z-[80] flex flex-col bg-ink md:flex-row"
          initial={{ clipPath: "circle(0% at 92% 4%)" }}
          animate={{ clipPath: "circle(150% at 92% 4%)" }}
          exit={{ clipPath: "circle(0% at 92% 4%)" }}
          transition={{ duration: 0.9, ease: EASE }}
          data-lenis-prevent
        >
          {/* ── Stage ───────────────────────────────────────── */}
          <div className="relative h-[42svh] shrink-0 border-b border-line md:h-auto md:flex-[1.35] md:border-r md:border-b-0">
            <AvatarStage variant="room" />
            <div className="scanlines pointer-events-none absolute inset-0 opacity-50" />

            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-6">
              <div>
                <p className="font-mono text-[11px] tracking-wider text-bone uppercase">
                  twin://{profile.handle}
                </p>
                <p className="mt-1 max-w-[60vw] font-mono text-[10px] leading-relaxed text-mute">
                  {mode === "demo" ? "brain: demo (no API key)" : mode === "live" ? "brain: claude" : "brain: …"}
                  <span className="hidden sm:inline">
                    {" · "}
                    {!voiceOn
                      ? "voice: muted"
                      : speech.voice === "browser"
                        ? "voice: browser fallback"
                        : speech.voice === "cloned"
                          ? "voice: cloned"
                          : "voice: ready"}
                  </span>
                </p>
              </div>
              <StatusPill {...statusLabel} />
            </div>

            {/* Live caption */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/80 to-transparent px-5 pt-16 pb-5 sm:px-10 sm:pb-8">
              <AnimatePresence mode="wait">
                {speech.caption && (
                  <motion.p
                    key={speech.caption}
                    initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                    transition={{ duration: 0.35 }}
                    className="mx-auto max-w-2xl text-center font-serif text-[clamp(1.15rem,2.2vw,1.9rem)] leading-snug text-bone"
                  >
                    {speech.caption}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Conversation ───────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-bold tracking-tight">Talk to {profile.firstName}</span>
                <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[9px] text-mute uppercase">
                  AI
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVoiceOn(!voiceOn)}
                  aria-pressed={voiceOn}
                  className={`rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-colors ${
                    voiceOn ? "border-signal/50 text-signal" : "border-line text-mute"
                  }`}
                >
                  {voiceOn ? "Voice on" : "Voice off"}
                </button>
                <button
                  onClick={closeRoom}
                  aria-label="Close"
                  data-cursor="Close"
                  className="grid h-9 w-9 place-items-center rounded-full border border-line text-bone transition-colors hover:border-ember hover:text-ember"
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              ref={listRef}
              className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-6"
              aria-live="polite"
            >
              {messages.map((m) => (
                <Message key={m.id} m={m} live={m.id === lastId && status === "replying"} />
              ))}

              {onlyGreeting && (
                <div className="pt-2">
                  <p className="label mb-3">Try asking</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.twin.suggestedQuestions.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="rounded-full border border-line px-3.5 py-2 text-left text-sm text-bone/85 transition-colors hover:border-signal hover:text-signal"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={submit} className="border-t border-line p-3 sm:p-4">
              {mic.error && <p className="mb-2 px-1 font-mono text-[11px] text-ember">{mic.error}</p>}
              <div className="flex items-center gap-2 rounded-full border border-line bg-ink-2 p-1.5 pl-4 focus-within:border-signal/60">
                <input
                  ref={inputRef}
                  value={mic.listening ? mic.interim : draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={mic.listening ? "Listening… speak now" : "Ask me anything…"}
                  readOnly={mic.listening}
                  maxLength={800}
                  className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-bone placeholder:text-dim focus:outline-none"
                  aria-label="Your message"
                />
                {mic.supported && (
                  <button
                    type="button"
                    onClick={toggleMic}
                    aria-label={mic.listening ? "Stop listening" : "Speak"}
                    aria-pressed={mic.listening}
                    className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
                      mic.listening ? "bg-ember text-ink" : "border border-line text-bone hover:border-signal hover:text-signal"
                    }`}
                  >
                    {mic.listening && (
                      <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ember" aria-hidden />
                    )}
                    <svg viewBox="0 0 24 24" className="relative h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
                {busy ? (
                  <button
                    type="button"
                    onClick={stop}
                    aria-label="Stop"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bone text-ink"
                  >
                    <span className="h-3 w-3 rounded-sm bg-ink" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    aria-label="Send"
                    disabled={!draft.trim()}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-signal text-ink transition-opacity disabled:opacity-30"
                  >
                    ↑
                  </button>
                )}
              </div>
              <p className="mt-2 px-2 text-center font-mono text-[10px] text-dim">
                AI twin trained on {profile.firstName}&apos;s notes — it can be wrong. Press Esc to close.
              </p>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
