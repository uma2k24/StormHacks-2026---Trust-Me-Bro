"use client";

import { useEffect, useState } from "react";
import { Square } from "lucide-react";
import { CircularProgress } from "@/components/CircularProgress";
import { Waveform } from "@/components/Waveform";

const RECORDING_SECONDS = 30;

type ActiveScreenProps = {
  onComplete: () => void;
};

export function ActiveScreen({ onComplete }: ActiveScreenProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const next = Math.min(
        RECORDING_SECONDS,
        (Date.now() - startedAt) / 1000,
      );
      setElapsed(next);
      if (next >= RECORDING_SECONDS) {
        window.clearInterval(interval);
        onComplete();
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [onComplete]);

  const progress = elapsed / RECORDING_SECONDS;
  const secondsLeft = Math.max(0, Math.ceil(RECORDING_SECONDS - elapsed));

  return (
    <section className="relative flex min-h-full flex-1 flex-col overflow-hidden px-6 py-8 sm:px-10">
      <Waveform />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-between gap-8">
        <div className="w-full max-w-3xl text-center">
          <p className="text-lg font-semibold uppercase tracking-[0.18em] text-amber-300">
            Listening
          </p>
          <p className="mt-4 text-2xl font-medium text-slate-200 sm:text-3xl">
            Please say:
          </p>
          <h2 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-5xl">
            &ldquo;The quick brown fox jumps over the lazy dog.&rdquo;
          </h2>
        </div>

        <CircularProgress progress={progress} secondsLeft={secondsLeft} />

        <div className="w-full max-w-xl pb-2">
          <button
            type="button"
            onClick={onComplete}
            className="flex h-20 w-full items-center justify-center gap-3 rounded-2xl bg-white text-2xl font-bold text-slate-950 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-amber-300 active:scale-[0.99]"
          >
            <Square className="h-7 w-7 fill-current" aria-hidden="true" />
            Done
          </button>
        </div>
      </div>
    </section>
  );
}
