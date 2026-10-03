"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MotionConfig } from "framer-motion";
import { ActiveScreen } from "@/components/ActiveScreen";
import { AppBar } from "@/components/AppBar";
import { Confetti } from "@/components/Confetti";
import { IdleScreen } from "@/components/IdleScreen";
import { ProcessingScreen } from "@/components/ProcessingScreen";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { SettingsScreen } from "@/components/SettingsScreen";
import { SignUpScreen } from "@/components/SignUpScreen";
import { type Briefing, mockBriefingFor } from "@/data/checkInScript";
import { mockResults } from "@/data/mockResults";
import { demoProfile, type Profile, profileKey } from "@/data/profile";
import { prefetchClip, unlockRadioVoice } from "@/lib/radioVoice";
import { saveProfile, useProfile, useTextSize } from "@/lib/storage";
import type { AppScreen } from "@/types/screening";

type Launch = { screen: AppScreen; step: number; demo: boolean };

/** Demo links: ?screen=signup|settings|idle|recording|processing|results (and ?step=0-5 for sign-up). */
function launchFrom(search: string): Launch {
  const params = new URLSearchParams(search);
  const value = params.get("screen");
  const step = Number(params.get("step")) || 0;
  const demo = value !== null; // jumping straight to a screen: no need to sign up first
  if (value === "signup") return { screen: "signup", step, demo };
  if (value === "settings") return { screen: "settings", step, demo };
  if (value === "recording" || value === "chat") return { screen: "recording", step, demo };
  if (value === "processing") return { screen: "processing", step, demo };
  if (value === "results") return { screen: "results", step, demo };
  return { screen: "idle", step, demo };
}

const neverChanges = () => () => {};

export default function Home() {
  const stored = useProfile(); // undefined until the browser has been asked
  const textSize = useTextSize();
  const search = useSyncExternalStore(
    neverChanges,
    () => window.location.search,
    () => "",
  );
  const launch = useMemo(() => launchFrom(search), [search]);
  // Where the person has navigated to; until they do, the screen the link asked for.
  const [navigated, setScreen] = useState<AppScreen | null>(null);
  const screen = navigated ?? launch.screen;
  const [onAir, setOnAir] = useState<Briefing | null>(null);
  // Today's live show, and which profile it was written for.
  const [live, setLive] = useState<{ key: string; briefing: Briefing } | null>(null);

  // The text size is a page-wide setting, so it lives on <html> where the CSS reads it.
  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
  }, [textSize]);

  const profile: Profile | null | undefined =
    stored === undefined ? undefined : (stored ?? (launch.demo ? demoProfile : null));
  const key = profile ? profileKey(profile) : null;
  // The mock plays until the live briefing arrives. It's frozen once the show starts.
  const briefing: Briefing =
    live && live.key === key ? live.briefing : mockBriefingFor(profile ?? demoProfile);

  useEffect(() => {
    if (!profile || !key) return;
    const params = new URLSearchParams({
      name: profile.name,
      city: profile.city,
      interests: profile.interests.join(","),
      extras: profile.extras,
    });
    const controller = new AbortController();
    fetch(`/api/briefing?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Briefing>) : null))
      .then((data) => {
        if (!data?.segments?.length) return;
        setLive({ key, briefing: data });
        // have the opening line ready so Play starts talking straight away
        prefetchClip(data.segments[0].brief);
      })
      .catch(() => {
        // offline or no backend: the mock show is fine
      });
    return () => controller.abort();
    // key stands for every field of the profile that shapes the show
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const startCheckIn = useCallback(() => {
    unlockRadioVoice(); // inside the tap, so the browser lets the radio speak
    setOnAir(briefing);
    setScreen("recording");
  }, [briefing]);
  const finishRecording = useCallback(() => setScreen("processing"), []);
  const showResults = useCallback(() => setScreen("results"), []);
  const restart = useCallback(() => setScreen("idle"), []);
  const openSettings = useCallback(() => setScreen("settings"), []);
  const saveAndGoHome = useCallback((next: Profile) => {
    saveProfile(next);
    setScreen("idle");
  }, []);

  // Nobody has signed up yet: the only way in is the sign-up flow.
  const current: AppScreen | null =
    profile === undefined ? null : profile === null ? "signup" : screen;

  return (
    // reducedMotion="user" makes framer-motion honour the OS "reduce motion" setting.
    <MotionConfig reducedMotion="user">
      <Confetti />
      <div className="app-shell flex flex-col" data-screen={current ?? "idle"}>
        <AppBar />

        <main className="shell app-main">
          {current === "signup" ? (
            <SignUpScreen onComplete={saveAndGoHome} initialStep={launch.step} />
          ) : null}

          {current === "settings" && profile ? (
            <SettingsScreen profile={profile} onDone={saveAndGoHome} />
          ) : null}

          {current === "idle" && profile ? (
            <IdleScreen
              userName={profile.name}
              segments={briefing.segments}
              onStart={startCheckIn}
              onOpenSettings={openSettings}
            />
          ) : null}

          {current === "recording" ? (
            <ActiveScreen
              segments={(onAir ?? briefing).segments}
              onComplete={finishRecording}
            />
          ) : null}

          {current === "processing" ? <ProcessingScreen onComplete={showResults} /> : null}

          {current === "results" && profile ? (
            <ResultsDashboard
              results={{ ...mockResults, user: profile.name }}
              onRestart={restart}
            />
          ) : null}
        </main>
      </div>
    </MotionConfig>
  );
}
