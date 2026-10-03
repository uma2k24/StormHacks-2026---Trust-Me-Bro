"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic } from "lucide-react";
import { SegmentIcon } from "@/components/SegmentIcon";
import { Waveform } from "@/components/Waveform";
import {
  ACKNOWLEDGE_MS,
  type BriefingSegment,
  LISTEN_MS,
  MIN_HOLD_MS,
  RECEIVE_MS,
} from "@/data/checkInScript";
import { prefetchClip, speak, wait } from "@/lib/radioVoice";

/**
 * The morning show is one little radio with one line of text on its screen:
 *   briefing  - the radio reads the segment's brief (weather, a score, local news)
 *   speaking  - then asks what you think
 *   ready     - the question stays up while you decide to answer
 *   listening - "Listening…"
 *   heard     - your own words, briefly, before the next segment
 * Talking works both ways: hold the button and let go to send (walkie-talkie),
 * or just tap once to start and tap again when you're done (voice mode).
 */
type Phase = "briefing" | "speaking" | "ready" | "listening" | "heard";

type ActiveScreenProps = {
  segments: BriefingSegment[];
  onComplete: () => void;
};

/** Longer text reads a size down so it usually fits; whatever still doesn't fit scrolls. */
function captionSize(text: string): "large" | "medium" | "small" {
  if (text.length <= 60) return "large";
  if (text.length <= 120) return "medium";
  return "small";
}

/** Whether the caption overflows its box, and if so whether there's more below. */
type ScrollState = "none" | "more" | "end";

export function ActiveScreen({ segments, onComplete }: ActiveScreenProps) {
  const [turnIndex, setTurnIndex] = useState(0);
  const [phase, setPhaseState] = useState<Phase>("briefing");
  const phaseRef = useRef<Phase>("briefing");
  const timers = useRef<number[]>([]);
  const listenTimer = useRef<number | null>(null);
  const pressStartedAt = useRef<number | null>(null);
  const captionScroll = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollState>("none");

  const totalTurns = segments.length;
  const turn = segments[Math.min(turnIndex, totalTurns - 1)];
  const segmentNumber = Math.min(turnIndex + 1, totalTurns);

  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Each segment: read the brief, ask the question, then wake the talk button.
  useEffect(() => {
    const segment = segments[turnIndex];
    if (!segment) return;
    const controller = new AbortController();
    const { signal } = controller;

    prefetchClip(segment.brief);
    prefetchClip(segment.question);
    // warm up the next segment while this one plays
    const upcoming = segments[turnIndex + 1];
    if (upcoming) {
      prefetchClip(upcoming.brief);
      prefetchClip(upcoming.question);
    }

    (async () => {
      setPhase("briefing");
      await speak(segment.brief, signal);
      if (signal.aborted) return;
      setPhase("speaking");
      await Promise.all([speak(segment.question, signal), wait(RECEIVE_MS, signal)]);
      if (signal.aborted) return;
      setPhase("ready");
    })();

    return () => controller.abort();
  }, [turnIndex, segments]);

  const measureScroll = useCallback(() => {
    const box = captionScroll.current;
    if (!box) return;
    const hidden = box.scrollHeight - box.clientHeight;
    setScrollState(hidden <= 2 ? "none" : hidden - box.scrollTop > 2 ? "more" : "end");
  }, []);

  // Re-measure when the screen resizes (rotation, keyboard, window); new text re-measures itself.
  useEffect(() => {
    const box = captionScroll.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureScroll);
    observer.observe(box);
    return () => observer.disconnect();
  }, [measureScroll]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
      if (listenTimer.current !== null) window.clearTimeout(listenTimer.current);
    };
  }, []);

  const finish = () => {
    if (phaseRef.current !== "listening") return;
    if (listenTimer.current !== null) {
      window.clearTimeout(listenTimer.current);
      listenTimer.current = null;
    }
    pressStartedAt.current = null;
    setPhase("heard");

    const next = turnIndex + 1;
    later(() => {
      if (next >= totalTurns) {
        onComplete();
        return;
      }
      setPhase("briefing");
      setTurnIndex(next);
    }, ACKNOWLEDGE_MS);
  };

  const startListening = () => {
    if (phaseRef.current !== "ready") return;
    setPhase("listening");
    // The mock sends itself after a moment, like a voice assistant noticing you've stopped.
    listenTimer.current = window.setTimeout(finish, LISTEN_MS);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (phaseRef.current === "ready") {
      event.currentTarget.setPointerCapture(event.pointerId);
      pressStartedAt.current = Date.now();
      startListening();
    } else if (phaseRef.current === "listening") {
      // already listening after a tap: tap again to send
      finish();
    }
  };

  const handlePointerUp = () => {
    if (pressStartedAt.current === null) return;
    const heldFor = Date.now() - pressStartedAt.current;
    pressStartedAt.current = null;
    // A real hold sends when you let go; a quick tap just keeps listening.
    if (heldFor >= MIN_HOLD_MS) finish();
  };

  // Keyboard and assistive tech activate with a click that has no pointer behind it (detail 0).
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    if (phaseRef.current === "ready") startListening();
    else if (phaseRef.current === "listening") finish();
  };

  const caption =
    phase === "briefing"
      ? turn.brief
      : phase === "listening"
        ? "Listening…"
        : phase === "heard"
          ? `“${turn.mockReply}”`
          : turn.question;
  const captionKey =
    phase === "briefing"
      ? `${turn.id}-brief`
      : phase === "listening"
        ? "listening"
        : phase === "heard"
          ? `${turn.id}-reply`
          : `${turn.id}-question`;

  const canPress = phase === "ready" || phase === "listening";

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">
        Segment {segmentNumber} of {totalTurns}: {turn.topic}
      </h1>

      <div className="radio">
        <div className="radio-top">
          <div className="radio-grille" aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </div>
          <div
            className="leds"
            role="progressbar"
            aria-label="Show progress"
            aria-valuemin={1}
            aria-valuemax={totalTurns}
            aria-valuenow={segmentNumber}
            aria-valuetext={`Segment ${segmentNumber} of ${totalTurns}`}
          >
            {segments.map((item, index) => (
              <span
                key={item.id}
                className="led"
                data-state={
                  index < turnIndex ? "done" : index === turnIndex ? "current" : "todo"
                }
              />
            ))}
          </div>
        </div>

        <div className="radio-screen" data-phase={phase} aria-live="polite" aria-atomic="true">
          <p className="radio-topic">
            <SegmentIcon kind={turn.kind} className="h-5 w-5" strokeWidth={2.5} />
            {turn.topic}
          </p>
          {/* Long text scrolls inside the screen instead of running off it. */}
          <div
            ref={captionScroll}
            className="radio-scroll"
            data-scroll={scrollState}
            tabIndex={scrollState === "none" ? undefined : 0}
            onScroll={measureScroll}
          >
            <AnimatePresence
              mode="wait"
              onExitComplete={() => captionScroll.current?.scrollTo({ top: 0 })}
            >
              <motion.p
                key={captionKey}
                className="radio-caption"
                data-size={captionSize(caption)}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.26 }}
                onAnimationComplete={measureScroll}
              >
                {caption}
              </motion.p>
            </AnimatePresence>
          </div>
          <Waveform
            bars={9}
            active={phase === "briefing" || phase === "speaking" || phase === "listening"}
          />
        </div>

        <div className="radio-controls">
          <div
            className={`sonar rounded-full ${
              phase === "listening" ? "sonar-fast" : phase === "ready" ? "" : "sonar-off"
            }`}
          >
            <button
              type="button"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onClick={handleClick}
              disabled={!canPress}
              className={`orb orb-lg ${phase === "listening" ? "orb-down" : ""}`}
              aria-label={
                phase === "listening" ? "Done talking — send my answer" : "Talk — answer with your voice"
              }
            >
              <Mic className="h-9 w-9" strokeWidth={2.5} aria-hidden="true" />
              <span className="display text-[1.15rem]">
                {phase === "listening" ? "Done" : "Talk"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
