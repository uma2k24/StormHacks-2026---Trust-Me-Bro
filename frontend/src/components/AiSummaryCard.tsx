"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Waveform } from "@/components/Waveform";
import { Window } from "@/components/Window";
import { wordsSpoken } from "@/data/checkInScript";
import { readAloud, unlockRadioVoice } from "@/lib/radioVoice";

type AiSummaryCardProps = {
  summary: string;
  /** Read it aloud as soon as it shows. Off when an earlier morning is being looked at again: it waits to be asked. */
  autoRead?: boolean;
};

/** The summary in plain words. Starts reading aloud on its own; each word lights up as it is said. */
export function AiSummaryCard({ summary, autoRead = true }: AiSummaryCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  // has it been read yet, so the button says "again" only when it is
  const [heard, setHeard] = useState(false);
  // how many words have been read so far while playing
  const [revealed, setRevealed] = useState(0);
  const playback = useRef<AbortController | null>(null);

  const start = (text: string) => {
    playback.current?.abort();
    const controller = new AbortController();
    playback.current = controller;
    setIsPlaying(true);
    setHeard(true);
    setRevealed(0);
    void readAloud(text, controller.signal, (fraction) =>
      setRevealed(wordsSpoken(text, fraction)),
    ).finally(() => {
      if (playback.current !== controller) return;
      playback.current = null;
      setIsPlaying(false);
    });
  };

  // start as soon as this page opens; leaving stops the voice
  useEffect(() => {
    if (autoRead) {
      unlockRadioVoice();
      start(summary);
    }
    return () => playback.current?.abort();
  }, [summary, autoRead]);

  const toggle = () => {
    if (isPlaying) {
      playback.current?.abort();
      playback.current = null;
      setIsPlaying(false);
      return;
    }
    unlockRadioVoice(); // inside the tap, so the browser lets a replay speak
    start(summary);
  };

  const words = summary.trim().split(/\s+/);

  return (
    <Window title="Your Voice Summary">
      <p className="read-along m-0 text-[1.5rem] leading-[1.5]" data-playing={isPlaying}>
        {words.map((word, index) => (
          <Fragment key={index}>
            {index > 0 ? " " : null}
            <span
              className="read-word"
              data-state={
                !isPlaying ? undefined : index === revealed - 1 ? "now" : index < revealed ? "read" : "next"
              }
            >
              {word}
            </span>
          </Fragment>
        ))}
      </p>

      <button
        type="button"
        onClick={toggle}
        className={`btn btn-block mt-7 ${isPlaying ? "btn-teal" : ""}`}
        aria-label={isPlaying ? "Stop reading the summary" : "Read the summary aloud"}
        aria-pressed={isPlaying}
      >
        {isPlaying ? (
          <Pause className="h-6 w-6 fill-current" strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Play className="h-6 w-6 fill-current" strokeWidth={2.5} aria-hidden="true" />
        )}
        <span>{isPlaying ? "Stop" : heard ? "Read it again" : "Read it to me"}</span>
        {isPlaying ? <Waveform bars={5} /> : null}
      </button>
    </Window>
  );
}
