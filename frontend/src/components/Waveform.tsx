"use client";

import { motion } from "framer-motion";

const BAR_COUNT = 36;
const COMPACT_BAR_COUNT = 18;

type WaveformProps = {
  compact?: boolean;
};

export function Waveform({ compact = false }: WaveformProps) {
  const barCount = compact ? COMPACT_BAR_COUNT : BAR_COUNT;

  if (compact) {
    return (
      <div
        className="flex h-10 w-full max-w-xs items-center justify-center gap-1"
        aria-hidden="true"
      >
        {Array.from({ length: barCount }).map((_, index) => {
          const delay = (index % 6) * 0.07;
          const min = 8 + ((index * 5) % 10);
          const max = 28 + ((index * 9) % 14);

          return (
            <motion.span
              key={index}
              className="w-1 rounded-full bg-amber-300"
              animate={{ height: [`${min}px`, `${max}px`, `${min}px`] }}
              transition={{
                duration: 0.7 + (index % 4) * 0.1,
                repeat: Infinity,
                ease: "easeInOut",
                delay,
              }}
              style={{ height: `${min}px` }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(245,197,24,0.18),_transparent_55%)]" />
      <div className="flex h-48 w-full max-w-3xl items-center justify-center gap-1.5 px-6 sm:gap-2">
        {Array.from({ length: barCount }).map((_, index) => {
          const delay = (index % 8) * 0.08;
          const min = 18 + ((index * 7) % 20);
          const max = 70 + ((index * 13) % 90);

          return (
            <motion.span
              key={index}
              className="w-1.5 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(245,197,24,0.55)] sm:w-2"
              animate={{ height: [`${min}px`, `${max}px`, `${min}px`] }}
              transition={{
                duration: 0.9 + (index % 5) * 0.12,
                repeat: Infinity,
                ease: "easeInOut",
                delay,
              }}
              style={{ height: `${min}px` }}
            />
          );
        })}
      </div>
    </div>
  );
}
