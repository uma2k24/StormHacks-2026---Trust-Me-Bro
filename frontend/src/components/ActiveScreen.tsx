"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic } from "lucide-react";
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

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, listenState]);

  useEffect(() => {
    return () => {
      if (listenTimerRef.current !== null) {
        window.clearTimeout(listenTimerRef.current);
      }
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const handleMicTap = () => {
    if (listenState !== "idle" || isFinished || !currentTurn) return;

    setListenState("listening");

    listenTimerRef.current = window.setTimeout(() => {
      const reply: Message = {
        id: `${currentTurn.id}-user`,
        role: "user",
        text: currentTurn.mockReply,
      };

      setMessages((prev) => [...prev, reply]);
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

  const questionLabel = Math.min(turnIndex + 1, totalTurns);

  return (
    <section className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 px-6 pb-3 pt-8 text-center sm:px-10">
        <p className="text-lg font-semibold text-amber-300">
          Question {questionLabel} of {totalTurns}
        </p>
        <p className="mt-1 text-base text-slate-400">
          Answer out loud when you&apos;re ready
        </p>
      </header>

      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-10"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className={
                message.role === "assistant"
                  ? "flex justify-start"
                  : "flex justify-end"
              }
            >
              <div
                className={
                  message.role === "assistant"
                    ? "max-w-[92%] rounded-3xl rounded-bl-lg border border-amber-400/30 bg-amber-400/15 px-5 py-4 text-xl leading-snug text-slate-50 sm:max-w-[80%] sm:text-2xl"
                    : "max-w-[92%] rounded-3xl rounded-br-lg bg-slate-700/90 px-5 py-4 text-xl leading-snug text-white sm:max-w-[80%] sm:text-2xl"
                }
              >
                {message.role === "assistant" ? (
                  <span className="mb-2 block text-sm font-semibold uppercase tracking-wide text-amber-300/90">
                    Check-in
                  </span>
                ) : null}
                {message.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="shrink-0 border-t border-slate-700/60 bg-slate-950/70 px-6 pb-8 pt-5 backdrop-blur-sm sm:px-10">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4">
          {listenState === "listening" ? (
            <div className="flex w-full flex-col items-center gap-2">
              <Waveform compact />
              <p className="text-xl font-medium text-amber-200" aria-live="polite">
                Listening…
              </p>
            </div>
          ) : null}

          {listenState === "acknowledged" ? (
            <p className="text-xl font-medium text-emerald-300" aria-live="polite">
              Got it
            </p>
          ) : null}

          {listenState === "idle" && !isFinished ? (
            <p className="text-xl font-medium text-slate-200">Tap to answer</p>
          ) : null}

          <button
            type="button"
            onClick={handleMicTap}
            disabled={listenState !== "idle" || isFinished}
            className="relative flex h-24 w-24 items-center justify-center rounded-full bg-amber-300 text-slate-950 shadow-[0_0_32px_rgba(245,197,24,0.4)] transition enabled:hover:bg-amber-200 enabled:active:scale-[0.98] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={
              listenState === "listening"
                ? "Listening to your answer"
                : "Tap to answer with your voice"
            }
          >
            {listenState === "listening" ? (
              <motion.span
                className="absolute inset-0 rounded-full bg-amber-300/40"
                animate={{ scale: [1, 1.25, 1], opacity: [0.55, 0.15, 0.55] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                aria-hidden="true"
              />
            ) : null}
            <Mic className="relative h-11 w-11 stroke-[2.25]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
