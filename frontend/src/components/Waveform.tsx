"use client";

import type { CSSProperties } from "react";

type WaveformProps = {
  bars?: number;
  /** Dances when true, rests as a calm line of dots when false. */
  active?: boolean;
};

/** Equalizer bars. Colour follows the parent's text colour. */
export function Waveform({ bars = 14, active = true }: WaveformProps) {
  return (
    <div className="eq" data-active={active} aria-hidden="true">
      {Array.from({ length: bars }).map((_, index) => (
        <span
          key={index}
          style={
            {
              "--d": `${0.65 + ((index * 7) % 5) * 0.14}s`,
              "--o": `${-((index * 3) % 7) * 0.13}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
