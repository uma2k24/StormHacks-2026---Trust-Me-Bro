"use client";

import { motion } from "framer-motion";
import { Mic } from "lucide-react";

type IdleScreenProps = {
  userName: string;
  yesterdayScore: number;
  yesterdayLabel: string;
  onStart: () => void;
};

export function IdleScreen({
  userName,
  yesterdayScore,
  yesterdayLabel,
  onStart,
}: IdleScreenProps) {
  return (
    <section className="flex min-h-full flex-1 flex-col items-center justify-between px-6 py-10 sm:px-10">
      <header className="w-full max-w-xl text-center">
        <p className="text-lg font-medium tracking-wide text-amber-200/90">
          Daily Voice Check-in
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-white sm:text-5xl">
          Good Morning, {userName}.
        </h1>
      </header>

      <div className="flex w-full max-w-xl flex-col items-center gap-8">
        <div className="relative flex items-center justify-center">
          <motion.span
            className="absolute h-56 w-56 rounded-full bg-amber-400/20 sm:h-64 sm:w-64"
            animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0.2, 0.45] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden="true"
          />
          <motion.span
            className="absolute h-44 w-44 rounded-full bg-amber-300/25 sm:h-52 sm:w-52"
            animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.25, 0.55] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.35,
            }}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={onStart}
            className="relative z-10 flex h-40 w-40 items-center justify-center rounded-full bg-amber-300 text-slate-950 shadow-[0_0_40px_rgba(245,197,24,0.45)] transition hover:bg-amber-200 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-[0.98] sm:h-48 sm:w-48"
            aria-label="Tap to start your daily voice check-in"
          >
            <Mic className="h-20 w-20 stroke-[2.25] sm:h-24 sm:w-24" aria-hidden="true" />
          </button>
        </div>

        <p className="max-w-md text-center text-2xl font-medium leading-snug text-slate-100 sm:text-3xl">
          Tap to start your daily voice check-in.
        </p>
      </div>

      <div className="w-full max-w-xl">
        <p className="mx-auto w-fit rounded-full border border-emerald-400/40 bg-emerald-500/15 px-6 py-3 text-xl font-semibold text-emerald-300">
          Yesterday: {yesterdayScore} — {yesterdayLabel}
        </p>
      </div>
    </section>
  );
}
