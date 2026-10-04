"use client";

import { useEffect, useRef } from "react";

type HoldBarProps = {
  /** How long the voice has to be held for the bar to be full, in milliseconds. */
  targetMs: number;
  /** How long the voice has been held so far (pauses not counted): what the bar fills with. */
  heldMs: () => number;
};

/**
 * A bar that fills while the "ahhh" is held, empty when it starts and full when it is long enough, at
 * which point the radio carries on by itself. It follows the time actually spent making the sound,
 * so a pause for breath holds it still instead of running on. Colour follows the parent's text colour.
 * Mirrors HoldBarView in ios/VoiceReadiness/Views/Components/WaveformView.swift.
 */
export function HoldBar({ targetMs, heldMs }: HoldBarProps) {
  const fill = useRef<HTMLSpanElement>(null);
  const read = useRef(heldMs);

  useEffect(() => {
    read.current = heldMs;
  });

  // A frame at a time, straight on the bar (no re-rendering).
  useEffect(() => {
    const bar = fill.current;
    if (!bar) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shown = 0;
    let frame = 0;

    const step = () => {
      const goal = Math.min(1, read.current() / targetMs);
      // the recorder counts in tenths of a second: ease between them so the bar glides (not when motion is reduced)
      shown = calm ? goal : shown + (goal - shown) * 0.2;
      bar.style.width = `${shown * 100}%`;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [targetMs]);

  return (
    <div className="hold" aria-hidden="true">
      <span ref={fill} className="hold-fill" />
    </div>
  );
}
