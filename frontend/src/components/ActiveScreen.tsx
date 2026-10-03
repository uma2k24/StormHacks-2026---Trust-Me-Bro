"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Mic } from "lucide-react";
import { Waveform } from "@/components/Waveform";
import { checkInScript, LISTEN_MS } from "@/data/checkInScript";

type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type ListenState = "idle" | "listening" | "acknowledged";

type ActiveScreenProps = {
  onComplete: () => void;
};

export function ActiveScreen({ onComplete }: ActiveScreenProps) {
  const [turnIndex, setTurnIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: `${checkInScript[0].id}-assistant`,
      role: "assistant",
      text: checkInScript[0].assistant,
    },
  ]);
  const [listenState, setListenState] = useState<ListenState>("idle");
  const listRef = useRef<HTMLDivElement>(null);
  const listenTimerRef = useRef<number | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  const totalTurns = checkInScript.length;
  const currentTurn = checkInScript[turnIndex];
  const isFinished = turnIndex >= totalTurns;
  const questionLabel = Math.min(turnIndex + 1, totalTurns);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, listenState]);

  useEffect(() => {
    return () => {
      if (listenTimerRef.current !== null) window.clearTimeout(listenTimerRef.current);
      if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const handleMicTap = () => {
    if (listenState !== "idle" || isFinished || !currentTurn) return;

    setListenState("listening");

    listenTimerRef.current = window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${currentTurn.id}-user`,
          role: "user",
          text: currentTurn.mockReply,
        },
      ]);
      setListenState("acknowledged");

      const nextIndex = turnIndex + 1;

      advanceTimerRef.current = window.setTimeout(() => {
        if (nextIndex >= totalTurns) {
          onComplete();
          return;
        }

        const nextTurn = checkInScript[nextIndex];
        setMessages((prev) => [
          ...prev,
          {
            id: `${nextTurn.id}-assistant`,
            role: "assistant",
            text: nextTurn.assistant,
          },
        ]);
        setTurnIndex(nextIndex);
        setListenState("idle");
      }, 900);
    }, LISTEN_MS);
  };

  return (
    <section className="relative flex min-h-0 flex-1 flex-col">
      <header className="shrink-0">
        <div
          className="steps"
          role="progressbar"
          aria-label="Check-in progress"
          aria-valuemin={1}
          aria-valuemax={totalTurns}
          aria-valuenow={questionLabel}
        >
          {checkInScript.map((turn, index) => (
            <span
              key={turn.id}
              className="step"
              data-state={
                index < turnIndex ? "done" : index === turnIndex ? "current" : "todo"
              }
            />
          ))}
        </div>
        <h1 className="display h3 mt-3">
          Question {questionLabel} of {totalTurns}
        </h1>
        <p className="mt-1 text-[1.15rem] text-[var(--ink-soft)]">
          Answer out loud when you&apos;re ready
        </p>
      </header>

      <div ref={listRef} className="chat-well" aria-live="polite">
        <AnimatePresence initial={false}>
          {messages.map((message) => {
            const isAssistant = message.role === "assistant";
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 16, scale: 0.94, rotate: isAssistant ? -1.2 : 1.2 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                style={{ transformOrigin: isAssistant ? "left bottom" : "right bottom" }}
                className={isAssistant ? "flex justify-start" : "flex justify-end"}
              >
                <div
                  className={`bubble ${isAssistant ? "bubble-assistant" : "bubble-user"}`}
                >
                  <span
                    className="bubble-tag"
                    style={isAssistant ? undefined : { background: "var(--white)", color: "var(--ink)" }}
                  >
                    {isAssistant ? "CHECK-IN" : "YOU"}
                  </span>
                  <p className="m-0">{message.text}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="dock">
        <div
          className={`lcd ${listenState === "acknowledged" ? "lcd-mint" : ""} w-full`}
          aria-live="polite"
        >
          {listenState === "listening" ? (
            <>
              <span className="rec-dot" aria-hidden="true" />
              <span className="lcd-text">Listening…</span>
              <Waveform bars={10} />
            </>
          ) : null}

          {listenState === "acknowledged" ? (
            <>
              <Check className="h-8 w-8" strokeWidth={3.5} aria-hidden="true" />
              <span className="lcd-text">Got it</span>
            </>
          ) : null}

          {listenState === "idle" && !isFinished ? (
            <span className="lcd-text">Tap to answer</span>
          ) : null}
        </div>

        <div
          className={`sonar rounded-full ${
            listenState === "listening"
              ? "sonar-fast"
              : listenState === "idle"
                ? ""
                : "sonar-off"
          }`}
        >
          <button
            type="button"
            onClick={handleMicTap}
            disabled={listenState !== "idle" || isFinished}
            className={`orb orb-md ${listenState === "listening" ? "orb-rec" : ""}`}
            style={listenState === "acknowledged" ? { opacity: 0.6 } : undefined}
            aria-label={
              listenState === "listening"
                ? "Listening to your answer"
                : "Tap to answer with your voice"
            }
          >
            <Mic className="h-10 w-10" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
