"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const MESSAGES = [
  "Analyzing your voice...",
  "Comparing to your normal baseline...",
  "Getting your results...",
] as const;

type ProcessingScreenProps = {
  onComplete: () => void;
};

export function ProcessingScreen({ onComplete }: ProcessingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const messageTimer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % MESSAGES.length);
    }, 1600);

    const finishTimer = window.setTimeout(onComplete, 4800);

    return () => {
      window.clearInterval(messageTimer);
      window.clearTimeout(finishTimer);
    };
  }, [onComplete]);

  return (
    <section className="flex min-h-full flex-1 flex-col items-center justify-center gap-10 px-6 py-10 sm:px-10">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full bg-amber-400/20"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.15, 0.5] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden="true"
        />
        <motion.span
          className="absolute inset-6 rounded-full bg-slate-700/80"
          animate={{ opacity: [0.55, 0.95, 0.55] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden="true"
        />
        <div className="relative h-16 w-16 rounded-full bg-slate-600/90" aria-hidden="true" />
      </div>

      <div className="w-full max-w-xl space-y-5" aria-live="polite">
        <motion.p
          key={MESSAGES[messageIndex]}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-3xl font-semibold leading-snug text-white sm:text-4xl"
        >
          {MESSAGES[messageIndex]}
        </motion.p>

        <div className="space-y-3" aria-hidden="true">
          <div className="h-5 w-full animate-pulse rounded-full bg-slate-700/80" />
          <div className="h-5 w-5/6 animate-pulse rounded-full bg-slate-700/60 mx-auto" />
          <div className="h-5 w-2/3 animate-pulse rounded-full bg-slate-700/50 mx-auto" />
        </div>
      </div>
    </section>
  );
}
