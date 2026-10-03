"use client";

import { useCallback, useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { ActiveScreen } from "@/components/ActiveScreen";
import { AppBar } from "@/components/AppBar";
import { Confetti } from "@/components/Confetti";
import { IdleScreen } from "@/components/IdleScreen";
import { ProcessingScreen } from "@/components/ProcessingScreen";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { mockResults } from "@/data/mockResults";
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

  useEffect(() => {
    setScreen(screenFromQuery());
  }, []);

  const startCheckIn = useCallback(() => setScreen("recording"), []);
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
              yesterdayScore={mockResults.yesterdayScore}
              yesterdayLabel={mockResults.yesterdayLabel}
              onStart={startCheckIn}
            />
          ) : null}

          {screen === "recording" ? (
            <ActiveScreen onComplete={finishRecording} />
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
