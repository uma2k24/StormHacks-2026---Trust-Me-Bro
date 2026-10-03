"use client";

import type { CSSProperties } from "react";

type WaveformProps = {
  bars?: number;
};

/** Equalizer bars that dance while we listen. Colour follows the parent's text colour. */
export function Waveform({ bars = 14 }: WaveformProps) {
  return (
    <div className="eq" aria-hidden="true">
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
