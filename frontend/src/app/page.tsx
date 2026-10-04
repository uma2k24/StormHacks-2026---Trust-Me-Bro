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
import { type Briefing, type BriefingSegment, mockBriefingFor } from "@/data/checkInScript";
import {
  type AnswerTiming,
  chooseInterests,
  dayKey,
  engagementOf,
  learnFrom,
  type TodaysShow,
} from "@/data/learning";
import { mockResults } from "@/data/mockResults";
import { demoProfile, type Profile, profileKey } from "@/data/profile";
import { prefetchClip, unlockRadioVoice } from "@/lib/radioVoice";
import { primeMicrophone } from "@/lib/recorder";
import {
  loadLearned,
  loadTodaysShow,
  saveLearned,
  saveProfile,
  saveTodaysShow,
  useProfile,
  useTextSize,
  useTodaysShow,
} from "@/lib/storage";
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
  // The day this page opened on: a tab left open overnight keeps the show it has.
  const [today] = useState(dayKey);

  // The text size is a page-wide setting, so it lives on <html> where the CSS reads it.
  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
  }, [textSize]);

  const profile: Profile | null | undefined =
    stored === undefined ? undefined : (stored ?? (launch.demo ? demoProfile : null));
  const key = profile ? profileKey(profile) : null;
  // Today's show for this profile, kept on the device so it is only ever asked for once a day.
  const todays = useTodaysShow(key, today);
  // The mock plays until the live briefing arrives. It's frozen once the show starts.
  const briefing: Briefing =
    todays?.briefing ?? mockBriefingFor(profile ?? demoProfile, todays?.picks);

  useEffect(() => {
    if (!profile || !key) return;

    // The two interests are chosen here from what the listener has responded to, so Gemini is
    // only asked to write the show, never to decide it. The choice is saved with the day's show,
    // so learning more later today can't change it (a new choice would mean a new Gemini call).
    const saved = loadTodaysShow(key, today);
    const plan: TodaysShow = saved ?? {
      day: today,
      key,
      picks: chooseInterests(profile, loadLearned(), today),
    };
    if (!saved) saveTodaysShow(plan);

    if (plan.briefing) {
      prefetchClip(plan.briefing.segments[0].brief); // so Play starts talking straight away
      return;
    }

    const params = new URLSearchParams({
      name: profile.name,
      city: profile.city,
      interests: profile.interests.join(","),
      extras: profile.extras,
      picks: plan.picks.join(","),
    });
    const controller = new AbortController();
    fetch(`/api/briefing?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Briefing>) : null))
      .then((data) => {
        // A mock show (no Gemini key) isn't kept: it costs nothing to make again.
        if (data?.source !== "live" || !data.segments?.length) return;
        saveTodaysShow({ ...plan, briefing: data });
        prefetchClip(data.segments[0].brief);
      })
      .catch(() => {
        // offline or no backend: the mock show is fine
      });
    return () => controller.abort();
    // key stands for every field of the profile that shapes the show
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Each answer teaches the radio a little about what this listener enjoys.
  const recordAnswer = useCallback(
    (segment: BriefingSegment, timing: AnswerTiming) => {
      if (!stored) return; // a demo link isn't a real listener, so there is nothing to learn
      saveLearned(learnFrom(loadLearned(), segment, engagementOf(timing), dayKey()));
    },
    [stored],
  );

  const startCheckIn = useCallback(async () => {
    unlockRadioVoice(); // inside the tap, so the browser lets the radio speak
    setOnAir(briefing);
    // Ask for the microphone now, so the browser's question comes before the show and never in the
    // middle of it. (If it is left unanswered the show starts anyway, and says so when it needs to listen.)
    await Promise.race([primeMicrophone(), new Promise((resolve) => window.setTimeout(resolve, 15000))]);
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

          {current === "recording" && profile ? (
            <ActiveScreen
              segments={(onAir ?? briefing).segments}
              profile={profile}
              onAnswer={recordAnswer}
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
