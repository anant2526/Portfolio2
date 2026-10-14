"use client";

import { useEffect, useRef, useState } from "react";
import { profile } from "@/content/profile";
import type { SpeechEngine } from "@/lib/voice/speech-engine";
import { getCtor, type Recognition } from "@/lib/voice/use-speech-recognition";
import { toWav } from "@/lib/voice/wav";

const PROMPTS = [
  {
    title: "Introduce yourself",
    text: `Hi, I'm ${profile.firstName}. Thanks for stopping by my portfolio. I build things for the web — mostly interfaces that move, talk and react — and honestly, I'm happiest when an idea goes from a rough sketch to something people can actually play with.`,
  },
  {
    title: "Get excited",
    text: "Wait, really? That's amazing! Okay, so here's the plan: we prototype it tonight, break it tomorrow, and fix it by Friday. Sounds chaotic, I know — but that's usually where the best ideas show up.",
  },
  {
    title: "Explain something",
    text: "When I start a new project, I ask three questions. Who is this for? What should it feel like? And what's the smallest version I can ship this week? Everything else — the stack, the colours, the clever tricks — comes after that.",
  },
  {
    title: "Just talk (most important)",
    text: "Talk freely for 30–60 seconds, exactly like you'd talk to a friend: what you're building, a trip you loved, your favourite food — anything. This teaches the twin your natural rhythm, and it's transcribed so the twin also learns how you phrase things.",
    free: true,
  },
];

type Clip = { id: string; label: string; blob: Blob; url: string; seconds: number };
type Status = { hasKey: boolean; voiceId: string | null };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function VoiceStudio({ engine }: { engine: SpeechEngine }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [recording, setRecording] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [consent, setConsent] = useState(false);
  const [denoise, setDenoise] = useState(true);
  const [name, setName] = useState(`${profile.name} — twin`);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; timer: number; asr: Recognition | null } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/studio/voice")
      .then((r) => r.json())
      .then((s: Status) => setStatus(s))
      .catch(() => setStatus({ hasKey: false, voiceId: null }));
    return () => stopRecording();
  }, []);

  const total = clips.reduce((n, c) => n + c.seconds, 0);

  async function addClip(label: string, blob: Blob) {
    try {
      const { wav, seconds } = await toWav(blob);
      setClips((prev) => [...prev, { id: crypto.randomUUID(), label, blob: wav, url: URL.createObjectURL(wav), seconds }]);
    } catch {
      setMessage({ tone: "err", text: `Couldn't read “${label}”. Try a WAV, MP3 or M4A file.` });
    }
  }

  async function startRecording(i: number) {
    setMessage(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
      });
    } catch {
      setMessage({ tone: "err", text: "Microphone permission denied — allow it in the address bar and try again." });
      return;
    }
    const mr = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => void addClip(PROMPTS[i].title, new Blob(chunks, { type: mr.mimeType }));

    // Live input meter.
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const meter = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 6));
      if (recRef.current) recRef.current.raf = requestAnimationFrame(meter);
    };

    // Transcribe the free-talk prompt so the twin learns your phrasing.
    let asr: Recognition | null = null;
    const Ctor = PROMPTS[i].free ? getCtor() : null;
    if (Ctor) {
      asr = new Ctor();
      asr.lang = profile.speechLang;
      asr.continuous = true;
      asr.interimResults = false;
      asr.onresult = (e) => {
        let text = "";
        for (let k = e.resultIndex; k < e.results.length; k++) if (e.results[k].isFinal) text += e.results[k][0].transcript;
        if (text) setTranscript((t) => `${t} ${text}`.trim());
      };
      asr.onerror = () => {};
      asr.onend = () => {
        // Chrome stops after a pause; keep listening while we're still recording.
        if (recRef.current?.asr === asr) {
          try {
            asr?.start();
          } catch {
            /* already running */
          }
        }
      };
      try {
        asr.start();
      } catch {
        asr = null;
      }
    }

    const started = performance.now();
    recRef.current = {
      mr,
      stream,
      ctx,
      asr,
      raf: requestAnimationFrame(meter),
      timer: window.setInterval(() => setElapsed((performance.now() - started) / 1000), 200),
    };
    mr.start();
    setElapsed(0);
    setRecording(i);
  }

  function stopRecording() {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    cancelAnimationFrame(r.raf);
    clearInterval(r.timer);
    r.asr?.stop();
    if (r.mr.state !== "inactive") r.mr.stop();
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close();
    setRecording(null);
    setLevel(0);
  }

  async function clone() {
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    if (apiKey.trim()) form.append("apiKey", apiKey.trim());
    form.append("name", name);
    form.append("consent", consent ? "yes" : "no");
    form.append("removeNoise", denoise ? "yes" : "no");
    clips.forEach((c, i) => form.append("files", new File([c.blob], `sample-${i + 1}.wav`, { type: "audio/wav" })));
    try {
      const res = await fetch("/api/studio/voice", { method: "POST", body: form });
      const data = (await res.json()) as { voiceId?: string; requiresVerification?: boolean; error?: string };
      if (!res.ok || !data.voiceId) throw new Error(data.error ?? "Cloning failed.");
      if (transcript.trim().split(/\s+/).length >= 8) {
        await fetch("/api/studio/speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: transcript }),
        });
      }
      setStatus({ hasKey: true, voiceId: data.voiceId });
      engine.setClonedAvailable(true);
      setMessage({
        tone: "ok",
        text: data.requiresVerification
          ? `Voice created (${data.voiceId}), but ElevenLabs needs you to verify it in their dashboard before it can speak.`
          : `Your voice is cloned and saved to .env.local (${data.voiceId}). Your twin now speaks as you.`,
      });
    } catch (e) {
      setMessage({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  function hearTwin() {
    engine.unlock();
    engine.stop();
    engine.enqueue(`Hey, it's ${profile.firstName}. Well, technically my digital twin — but this is my voice. Pretty wild, right?`);
  }

  const needsKey = status && !status.hasKey;
  const canClone = clips.length > 0 && consent && (!needsKey || apiKey.trim()) && !busy && recording === null;

  return (
    <section className="rounded-3xl border border-line bg-ink-2/60 p-5 sm:p-8">
      <p className="label">02 — Voice</p>
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Clone your voice <span className="font-serif font-normal text-signal italic">in ~3 minutes</span>
      </h2>
      <p className="mt-2 max-w-2xl text-mute">
        Record the prompts below in a quiet room, at your normal pace and volume. ElevenLabs builds a voice model
        from them; your twin then answers every question in it. Aim for 1–3 minutes in total.
      </p>

      {status?.voiceId && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-signal/40 bg-signal/5 px-4 py-3">
          <span className="font-mono text-xs text-signal uppercase">Voice connected</span>
          <span className="font-mono text-xs text-mute">{status.voiceId}</span>
          <button onClick={hearTwin} className="ml-auto rounded-full bg-signal px-4 py-1.5 font-mono text-xs text-ink uppercase">
            ▶ Hear my twin
          </button>
        </div>
      )}

      {needsKey && (
        <label className="mt-6 block">
          <span className="label">ElevenLabs API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk_…  (elevenlabs.io → Profile → API keys)"
            className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 font-mono text-sm focus:border-signal/60 focus:outline-none"
            autoComplete="off"
          />
          <span className="mt-1.5 block text-xs text-dim">
            Saved only to your local .env.local file. Voice cloning needs a paid ElevenLabs plan.
          </span>
        </label>
      )}

      <ol className="mt-6 grid gap-3 md:grid-cols-2">
        {PROMPTS.map((p, i) => {
          const active = recording === i;
          const done = clips.some((c) => c.label === p.title);
          return (
            <li
              key={p.title}
              className={`flex flex-col rounded-2xl border p-4 transition-colors ${
                active ? "border-ember/70 bg-ember/5" : done ? "border-signal/30" : "border-line"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-mute uppercase">
                  {String(i + 1).padStart(2, "0")} · {p.title}
                </span>
                {done && !active && <span className="font-mono text-[11px] text-signal">✓ recorded</span>}
              </div>
              <p className={`mt-2 flex-1 leading-relaxed ${p.free ? "text-sm text-mute" : "text-[15px] text-bone/90"}`}>
                {p.text}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => (active ? stopRecording() : startRecording(i))}
                  disabled={recording !== null && !active}
                  className={`rounded-full px-4 py-2 font-mono text-xs uppercase disabled:opacity-30 ${
                    active ? "bg-ember text-ink" : "border border-line hover:border-signal hover:text-signal"
                  }`}
                >
                  {active ? `■ Stop · ${fmt(elapsed)}` : done ? "Record again" : "● Record"}
                </button>
                {active && (
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    <span className="block h-full bg-ember transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {transcript && (
        <label className="mt-4 block">
          <span className="label">What you said (your twin studies this — fix any mistakes)</span>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-sm focus:border-signal/60 focus:outline-none"
          />
        </label>
      )}

      <div className="mt-6 rounded-2xl border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="label">
            Samples · {fmt(total)} {total < 60 ? "(aim for 1:00+)" : total > 300 ? "(plenty!)" : "✓"}
          </span>
          <button
            onClick={() => uploadRef.current?.click()}
            className="font-mono text-[11px] text-mute uppercase underline-offset-4 hover:text-signal hover:underline"
          >
            + Upload audio files instead
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => {
              for (const f of Array.from(e.target.files ?? [])) void addClip(f.name, f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-signal transition-[width]" style={{ width: `${Math.min(100, (total / 120) * 100)}%` }} />
        </div>
        {clips.length > 0 && (
          <ul className="mt-4 space-y-2">
            {clips.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="w-44 truncate text-bone/80">{c.label}</span>
                <span className="font-mono text-xs text-mute">{fmt(c.seconds)}</span>
                <audio src={c.url} controls className="h-8 max-w-[16rem] flex-1" />
                <button
                  onClick={() => setClips((prev) => prev.filter((x) => x.id !== c.id))}
                  className="font-mono text-[11px] text-mute hover:text-ember"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-2.5">
          <label className="block">
            <span className="label">Voice name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-ink px-4 py-2.5 text-sm focus:border-signal/60 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-bone/85">
            <input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} className="accent-[#d4ff3a]" />
            Remove background noise
          </label>
          <label className="flex items-center gap-2 text-sm text-bone/85">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="accent-[#d4ff3a]" />
            This is my own voice and I&apos;m allowed to clone it.
          </label>
        </div>
        <button
          onClick={clone}
          disabled={!canClone}
          className="rounded-full bg-signal px-6 py-3 font-mono text-xs tracking-wider text-ink uppercase disabled:opacity-30"
        >
          {busy ? "Cloning your voice…" : "Clone my voice"}
        </button>
      </div>

      {message && (
        <p
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            message.tone === "ok" ? "border-signal/40 bg-signal/5 text-signal" : "border-ember/40 bg-ember/10 text-ember"
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
