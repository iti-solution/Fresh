"use client";

import { Mic, Square, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/primitives";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { formatDayLabel } from "@/modules/orders/domain/orders";
import { AUDIO_MAX_SECONDS, audioExtension } from "@/modules/intake/domain/intake";
import { submitPortalMessage } from "../server/actions";
import type { BuilderPoint } from "./order-builder";

// Minimalne typy rozpoznawania mowy w przeglądarce (Chrome, Edge, Safari — z prefiksem webkit)
type SpeechAlt = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechAlt };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const noopSubscribe = () => () => undefined;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const EXAMPLE =
  "Np. Na jutro poproszę 2 skrzynki pomidorów, 5 kg cebuli, 3 rukole i 10 pęczków natki. Zostawcie w chłodni od zaplecza.";

/** Klient pisze albo mówi, czego potrzebuje — BOK zamienia to na zamówienie i potwierdza. */
export function VoiceComposer({ points }: { points: BuilderPoint[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(submitPortalMessage, {});
  const [, startTransition] = useTransition();
  const [pointId, setPointId] = useState(points[0]?.id ?? "");
  const point = points.find((p) => p.id === pointId) ?? points[0];
  const [date, setDate] = useState(point?.dates[0] ?? "");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepListening = useRef(false);
  const elapsed = useRef(0);
  const stopRef = useRef<() => void>(() => undefined);

  // czy przeglądarka umie dyktować (na serwerze: nie)
  const canDictate = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(recognitionCtor()),
    () => false,
  );
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio.url);
    },
    [audio],
  );

  function choosePoint(id: string) {
    setPointId(id);
    const p = points.find((x) => x.id === id);
    if (p && !p.dates.includes(date)) setDate(p.dates[0] ?? "");
  }

  async function start() {
    setMicError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError("Brak dostępu do mikrofonu. Zezwól na mikrofon w przeglądarce albo wpisz zamówienie.");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(
      (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
    );
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
      setAudio((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    };
    rec.start();
    recorder.current = rec;

    // Dyktowanie na żywo: tekst trafia do pola, klient widzi i może poprawić przed wysłaniem
    const Ctor = recognitionCtor();
    if (Ctor) {
      const r = new Ctor();
      r.lang = "pl-PL";
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let finalText = "";
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript;
          else interimText += res[0].transcript;
        }
        if (finalText) setText((t) => (t ? `${t.trimEnd()} ` : "") + finalText.trim());
        setInterim(interimText);
      };
      r.onerror = () => undefined;
      r.onend = () => {
        if (keepListening.current) {
          try {
            r.start(); // Chrome kończy po ciszy — wznawiamy, dopóki trwa nagranie
          } catch {
            /* już działa */
          }
        }
      };
      keepListening.current = true;
      try {
        r.start();
        recognition.current = r;
      } catch {
        recognition.current = null;
      }
    }

    setSeconds(0);
    setRecording(true);
    elapsed.current = 0;
    timer.current = setInterval(() => {
      elapsed.current += 1;
      setSeconds(elapsed.current);
      if (elapsed.current >= AUDIO_MAX_SECONDS) stopRef.current(); // limit długości nagrania
    }, 1000);
  }

  function stop() {
    keepListening.current = false;
    if (timer.current) clearInterval(timer.current);
    recognition.current?.stop();
    recognition.current = null;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    recorder.current = null;
    setInterim("");
    setRecording(false);
  }

  useEffect(() => {
    stopRef.current = stop;
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (recording) stop();
    const fd = new FormData(e.currentTarget);
    if (audio)
      fd.set("audio", new File([audio.blob], `zamowienie.${audioExtension(audio.blob.type)}`, { type: audio.blob.type }));
    startTransition(() => formAction(fd));
  }

  if (!point)
    return <p className="text-sm text-muted">Do Twojego konta nie ma przypisanego adresu dostawy. Skontaktuj się z hurtownią.</p>;
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <input type="hidden" name="delivery_point_id" value={point.id} />
      <input type="hidden" name="delivery_date" value={date} />

      {points.length > 1 && (
        <label className="flex flex-col gap-1.5">
          <span className="px-1 text-[15px] font-semibold">Dokąd</span>
          <select value={point.id} onChange={(e) => choosePoint(e.target.value)} className={cn(inputClass, "h-12 text-base")}>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <section aria-labelledby="kiedy-msg">
        <h2 id="kiedy-msg" className="mb-2 px-1 text-[15px] font-semibold">
          Na kiedy
        </h2>
        {point.dates.length === 0 ? (
          <p className="rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-[#6e4700]">
            Pod ten adres w najbliższych dniach nie ma dostaw.
          </p>
        ) : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Dzień dostawy">
            {point.dates.map((d) => {
              const [day, dm] = formatDayLabel(d).split(", ");
              const active = d === date;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDate(d)}
                  className={cn(
                    "flex h-16 min-w-[92px] shrink-0 flex-col items-center justify-center rounded-xl border px-3",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface",
                  )}
                >
                  <span className={cn("text-xs capitalize", active ? "text-white/85" : "text-muted")}>{day}</span>
                  <span className="text-lg font-semibold tabular-nums">{dm}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-[var(--shadow-panel)]">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={recording ? stop : start}
            aria-pressed={recording}
            aria-label={recording ? "Zatrzymaj nagrywanie" : "Nagraj zamówienie"}
            className={cn(
              "flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-white shadow-md transition-colors",
              recording ? "live-dot bg-danger" : "bg-primary hover:bg-primary-hover",
            )}
          >
            {recording ? <Square className="size-6 fill-white" /> : <Mic className="size-7" />}
          </button>
          <div className="min-w-0 text-sm">
            {recording ? (
              <>
                <p className="font-semibold text-danger">Nagrywam… {mm}</p>
                <p className="text-muted">Mów naturalnie. Stuknij, gdy skończysz (max {AUDIO_MAX_SECONDS / 60} min).</p>
              </>
            ) : (
              <>
                <p className="font-semibold">Nagraj albo napisz, czego potrzebujesz</p>
                <p className="text-muted">
                  {canDictate ? "Tekst pojawi się poniżej — możesz go poprawić." : "Nagranie odsłucha obsługa klienta."}
                </p>
              </>
            )}
          </div>
        </div>
        {micError && <p className="text-sm text-danger">{micError}</p>}

        <textarea
          name="body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={3000}
          placeholder={EXAMPLE}
          aria-label="Treść zamówienia"
          className={cn(inputClass, "h-auto py-3 text-base leading-relaxed")}
        />
        {interim && <p className="-mt-1 text-sm text-subtle italic">{interim}…</p>}

        {audio && !recording && (
          <div className="flex items-center gap-2">
            <audio src={audio.url} controls className="h-10 min-w-0 flex-1" />
            <button
              type="button"
              onClick={() => setAudio(null)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-subtle hover:bg-danger-soft hover:text-danger"
              aria-label="Usuń nagranie"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </section>

      {state.message && !state.ok && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <X className="mt-0.5 size-4 shrink-0" /> {state.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || (!text.trim() && !audio) || !date} className="w-full">
        {pending ? "Wysyłanie…" : "Wyślij do hurtowni"}
      </Button>
      <p className="-mt-2 px-1 text-center text-xs text-muted">
        Obsługa klienta zamieni wiadomość na zamówienie i je potwierdzi. Status zobaczysz w „Moich zamówieniach”.
      </p>
    </form>
  );
}
