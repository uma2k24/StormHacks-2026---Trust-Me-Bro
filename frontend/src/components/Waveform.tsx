"use client";

import { motion } from "framer-motion";

const BAR_COUNT = 36;

export function Waveform() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(245,197,24,0.18),_transparent_55%)]" />
      <div className="flex h-48 w-full max-w-3xl items-center justify-center gap-1.5 px-6 sm:gap-2">
        {Array.from({ length: BAR_COUNT }).map((_, index) => {
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
