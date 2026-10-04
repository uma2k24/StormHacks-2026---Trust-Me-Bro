"use client";

import { useEffect, useRef, type CSSProperties } from "react";

type WaveformProps = {
  bars?: number;
  /** Dances when true, rests as a calm line of dots when false. */
  active?: boolean;
  /**
   * How loud the microphone is right now (0...1). When given, the bars stop dancing and follow it
   * instead: a calm line of dots while it's quiet, rising as the person talks, so they can see the
   * radio hears them.
   */
  level?: () => number;
};

/** A bar at rest, as a fraction of its full height: the calm line of dots. */
const REST = 0.12;

/** Equalizer bars. Colour follows the parent's text colour. Mirrors WaveformView.swift. */
export function Waveform({ bars = 14, active = true, level }: WaveformProps) {
  const box = useRef<HTMLDivElement>(null);
  const read = useRef(level);
  const live = level !== undefined;

  useEffect(() => {
    read.current = level;
  });

  // Follows the microphone a frame at a time, straight on the bars (no re-rendering).
  useEffect(() => {
    const spans = Array.from(box.current?.children ?? []) as HTMLElement[];
    if (!live || !spans.length) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const middle = Math.max((spans.length - 1) / 2, 1);
    let shown = 0;
    let last = 0;
    let frame = 0;

    const step = (now: number) => {
      const target = read.current?.() ?? 0;
      // rises quickly and settles slowly, like a needle on a meter; gentler still when motion is reduced
      const rate = target > shown ? (calm ? 0.15 : 0.4) : calm ? 0.05 : 0.12;
      const frames = last ? Math.min((now - last) / 16.7, 4) : 1;
      last = now;
      shown += (target - shown) * (1 - Math.pow(1 - rate, frames));

      spans.forEach((span, index) => {
        // the middle bars reach highest, and each wavers a little (not when motion is reduced)
        const shape = 0.55 + 0.45 * Math.cos(((index - middle) / middle) * (Math.PI / 2));
        const waver = calm ? 1 : 0.82 + 0.18 * Math.sin(now / 170 + index * 1.9);
        span.style.transform = `scaleY(${REST + (1 - REST) * shown * shape * waver})`;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      spans.forEach((span) => span.style.removeProperty("transform"));
    };
  }, [live, bars]);

  return (
    <div ref={box} className="eq" data-active={active} data-live={live} aria-hidden="true">
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
