"use client";

import { useCallback, useState } from "react";
import { ActiveScreen } from "@/components/ActiveScreen";
import { IdleScreen } from "@/components/IdleScreen";
import { ProcessingScreen } from "@/components/ProcessingScreen";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { mockResults } from "@/data/mockResults";
import type { AppScreen } from "@/types/screening";

export default function Home() {
  const [screen, setScreen] = useState<AppScreen>("idle");

  const startCheckIn = useCallback(() => setScreen("recording"), []);
  const finishRecording = useCallback(() => setScreen("processing"), []);
  const showResults = useCallback(() => setScreen("results"), []);
  const restart = useCallback(() => setScreen("idle"), []);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col">
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
  );
}
