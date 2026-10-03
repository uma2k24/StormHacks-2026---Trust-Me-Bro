"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import { ActiveScreen } from "@/components/ActiveScreen";
import { AppBar } from "@/components/AppBar";
import { Confetti } from "@/components/Confetti";
import { IdleScreen } from "@/components/IdleScreen";
import { ProcessingScreen } from "@/components/ProcessingScreen";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { type Briefing, mockBriefing } from "@/data/checkInScript";
import { mockResults } from "@/data/mockResults";
import { prefetchClip, unlockRadioVoice } from "@/lib/radioVoice";
import type { AppScreen } from "@/types/screening";

function screenFromQuery(): AppScreen {
  const value = new URLSearchParams(window.location.search).get("screen");
  if (value === "recording" || value === "chat") return "recording";
  if (value === "processing") return "processing";
  if (value === "results") return "results";
  return "idle";
}

export default function Home() {
  const [screen, setScreen] = useState<AppScreen>("idle");
  // Today's show: the mock plays until the live briefing arrives. It's frozen once the show starts.
  const [briefing, setBriefing] = useState<Briefing>(mockBriefing);
  const [onAir, setOnAir] = useState<Briefing | null>(null);
  const briefingRef = useRef(briefing);

  useEffect(() => {
    setScreen(screenFromQuery());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/briefing?name=${encodeURIComponent(mockResults.user)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? (response.json() as Promise<Briefing>) : null))
      .then((data) => {
        if (!data?.segments?.length) return;
        briefingRef.current = data;
        setBriefing(data);
        // have the opening line ready so Play starts talking straight away
        prefetchClip(data.segments[0].brief);
      })
      .catch(() => {
        // offline or no backend: the mock show is fine
      });
    return () => controller.abort();
  }, []);

  const startCheckIn = useCallback(() => {
    unlockRadioVoice(); // inside the tap, so the browser lets the radio speak
    setOnAir(briefingRef.current);
    setScreen("recording");
  }, []);
  const finishRecording = useCallback(() => setScreen("processing"), []);
  const showResults = useCallback(() => setScreen("results"), []);
  const restart = useCallback(() => setScreen("idle"), []);

  return (
    // reducedMotion="user" makes framer-motion honour the OS "reduce motion" setting.
    <MotionConfig reducedMotion="user">
      <Confetti />
      <div className="app-shell flex flex-col" data-screen={screen}>
        <AppBar />

        <main className="shell app-main">
          {screen === "idle" ? (
            <IdleScreen
              userName={mockResults.user}
              segments={briefing.segments}
              onStart={startCheckIn}
            />
          ) : null}

          {screen === "recording" ? (
            <ActiveScreen
              segments={(onAir ?? briefing).segments}
              onComplete={finishRecording}
            />
          ) : null}

          {screen === "processing" ? (
            <ProcessingScreen onComplete={showResults} />
          ) : null}

          {screen === "results" ? (
            <ResultsDashboard results={mockResults} onRestart={restart} />
          ) : null}
        </main>
      </div>
    </MotionConfig>
  );
}
