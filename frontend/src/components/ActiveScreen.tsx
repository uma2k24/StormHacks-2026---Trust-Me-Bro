"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic } from "lucide-react";
import { Waveform } from "@/components/Waveform";
import {
  ACKNOWLEDGE_MS,
  checkInScript,
  LISTEN_MS,
  MIN_HOLD_MS,
  RECEIVE_MS,
} from "@/data/checkInScript";

/**
 * The conversation is one little radio with one line of text on its screen:
 *   speaking  - the question arrives
 *   ready     - the question stays up while you decide to answer
 *   listening - "Listening…"
 *   heard     - your own words, briefly, before the next question
 * Talking works both ways: hold the button and let go to send (walkie-talkie),
 * or just tap once to start and tap again when you're done (voice mode).
 */
type Phase = "speaking" | "ready" | "listening" | "heard";

type ActiveScreenProps = {
  onComplete: () => void;
};

export function ActiveScreen({ onComplete }: ActiveScreenProps) {
  const [turnIndex, setTurnIndex] = useState(0);
  const [phase, setPhaseState] = useState<Phase>("speaking");
  const phaseRef = useRef<Phase>("speaking");
  const timers = useRef<number[]>([]);
  const listenTimer = useRef<number | null>(null);
  const pressStartedAt = useRef<number | null>(null);

  const totalTurns = checkInScript.length;
  const turn = checkInScript[Math.min(turnIndex, totalTurns - 1)];
  const questionNumber = Math.min(turnIndex + 1, totalTurns);

  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Each new question "arrives" for a moment, then the talk button wakes up.
  useEffect(() => {
    const id = window.setTimeout(() => setPhase("ready"), RECEIVE_MS);
    return () => window.clearTimeout(id);
  }, [turnIndex]);

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
      setTurnIndex(next);
      setPhase("speaking");
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
    phase === "listening"
      ? "Listening…"
      : phase === "heard"
        ? `“${turn.mockReply}”`
        : turn.assistant;
  const captionKey =
    phase === "listening" ? "listening" : phase === "heard" ? `${turn.id}-reply` : `${turn.id}-question`;

  const canPress = phase === "ready" || phase === "listening";

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">
        Question {questionNumber} of {totalTurns}
      </h1>

      <div className="radio">
        <div className="radio-top">
          <div className="radio-grille" aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </div>
          <div
            className="leds"
            role="progressbar"
            aria-label="Check-in progress"
            aria-valuemin={1}
            aria-valuemax={totalTurns}
            aria-valuenow={questionNumber}
            aria-valuetext={`Question ${questionNumber} of ${totalTurns}`}
          >
            {checkInScript.map((item, index) => (
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
          <AnimatePresence mode="wait">
            <motion.p
              key={captionKey}
              className="radio-caption"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.26 }}
            >
              {caption}
            </motion.p>
          </AnimatePresence>
          <Waveform bars={9} active={phase === "speaking" || phase === "listening"} />
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
