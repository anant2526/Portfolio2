"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { profile } from "@/content/profile";
import type { ChatEvent, ChatTurn } from "@/lib/chat-protocol";
import { SpeechEngine, type EngineState } from "@/lib/voice/speech-engine";
import { SentenceChunker, cleanForSpeech } from "@/lib/voice/text";

export type TwinMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Error / system notices are shown but never sent back to the model. */
  error?: boolean;
};

export type TwinStatus = "idle" | "thinking" | "replying";

type TwinApi = {
  open: boolean;
  openRoom: (question?: string) => void;
  closeRoom: () => void;
  messages: TwinMessage[];
  status: TwinStatus;
  /** "demo" when no Claude key is configured on the server. */
  mode: "live" | "demo" | null;
  send: (text: string) => void;
  stop: () => void;
  voiceOn: boolean;
  setVoiceOn: (on: boolean) => void;
  speech: EngineState;
};

const TwinContext = createContext<TwinApi | null>(null);

let idCounter = 0;
const uid = () => `m${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function TwinProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<SpeechEngine | null>(null);
  engineRef.current ??= new SpeechEngine(profile.speechLang);
  const engine = engineRef.current;

  const [speech, setSpeech] = useState<EngineState>(engine.state);
  useEffect(() => engine.subscribe(setSpeech), [engine]);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TwinMessage[]>([]);
  const [status, setStatus] = useState<TwinStatus>("idle");
  const [mode, setMode] = useState<"live" | "demo" | null>(null);
  const [voiceOn, setVoiceOnState] = useState(true);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const abortRef = useRef<AbortController | null>(null);
  const greetedRef = useRef(false);

  // Ask the server which brain / voice are configured.
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/chat", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { mode: "live" | "demo"; voice: "cloned" | "browser" } | null) => {
        if (!s) return;
        setMode((m) => m ?? s.mode);
        engine.setClonedAvailable(s.voice === "cloned");
      })
      .catch(() => {});
    return () => ac.abort();
  }, [engine]);

  const speak = useCallback(
    (text: string) => {
      if (voiceOnRef.current) engine.enqueue(text);
    },
    [engine],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    engine.stop();
    setStatus("idle");
  }, [engine]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      engine.unlock();
      stop(); // barge-in: a new question interrupts the current answer
      greetedRef.current = true;

      const userMsg: TwinMessage = { id: uid(), role: "user", content: text };
      const replyId = uid();
      const history: ChatTurn[] = [...messagesRef.current, userMsg]
        .filter((m) => !m.error && m.content)
        .map(({ role, content }) => ({ role, content }));
      setMessages((prev) => [...prev, userMsg, { id: replyId, role: "assistant", content: "" }]);
      setStatus("thinking");

      const ac = new AbortController();
      abortRef.current = ac;
      const chunker = new SentenceChunker(speak);
      let full = "";
      const setReply = (content: string, error = false) =>
        setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, content, error } : m)));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          setReply(err?.error ?? "Something went wrong — try again?", true);
          return;
        }

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const lineText = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!lineText) continue;
            const ev = JSON.parse(lineText) as ChatEvent;
            if (ev.type === "meta") {
              setMode(ev.mode);
            } else if (ev.type === "delta") {
              full += ev.text;
              setStatus("replying");
              setReply(full);
              chunker.push(ev.text);
            } else if (ev.type === "reset") {
              full = "";
              engine.stop();
              chunker.reset();
              setReply("");
            } else if (ev.type === "error") {
              setReply(full ? `${full}\n\n${ev.message}` : ev.message, !full);
              chunker.push(` ${ev.message}`);
            }
          }
        }
        chunker.flush();
      } catch {
        if (!ac.signal.aborted) setReply(full || "Lost connection to my brain — try again?", !full);
      } finally {
        if (abortRef.current === ac) {
          abortRef.current = null;
          setStatus("idle");
        }
      }
    },
    [engine, speak, stop],
  );

  const openRoom = useCallback(
    (question?: string) => {
      engine.unlock();
      setOpen(true);
      if (question) {
        void send(question);
      } else if (!greetedRef.current && messagesRef.current.length === 0) {
        greetedRef.current = true;
        setMessages([{ id: uid(), role: "assistant", content: profile.twin.greeting }]);
        speak(cleanForSpeech(profile.twin.greeting));
      }
    },
    [engine, send, speak],
  );

  const closeRoom = useCallback(() => {
    stop();
    setOpen(false);
  }, [stop]);

  const setVoiceOn = useCallback(
    (on: boolean) => {
      setVoiceOnState(on);
      if (!on) engine.stop();
      else engine.unlock();
    },
    [engine],
  );

  // Global shortcut: press "T" anywhere (outside inputs) to talk to the twin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "t" && !open) {
        e.preventDefault();
        openRoom();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openRoom]);

  const api = useMemo<TwinApi>(
    () => ({
      open,
      openRoom,
      closeRoom,
      messages,
      status,
      mode,
      send: (t: string) => void send(t),
      stop,
      voiceOn,
      setVoiceOn,
      speech,
    }),
    [open, openRoom, closeRoom, messages, status, mode, send, stop, voiceOn, setVoiceOn, speech],
  );

  return <TwinContext.Provider value={api}>{children}</TwinContext.Provider>;
}

export function useTwin(): TwinApi {
  const ctx = useContext(TwinContext);
  if (!ctx) throw new Error("useTwin must be used inside <TwinProvider>");
  return ctx;
}
