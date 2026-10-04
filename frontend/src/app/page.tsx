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
import { TodayScreen } from "@/components/TodayScreen";
import { UploadScreen } from "@/components/UploadScreen";
import { type Briefing, type BriefingSegment, mockBriefingFor } from "@/data/checkInScript";
import { demoHistory, lastSevenDays, planForToday, streakOf, trendBefore, yesterdayScore } from "@/data/daily";
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
import { readinessFrom, resultsFrom } from "@/data/voiceReading";
import { prefetchClip, unlockRadioVoice } from "@/lib/radioVoice";
import { primeMicrophone } from "@/lib/recorder";
import { analyseUpload, analyseVoice, type Captured, type Upload } from "@/lib/voiceClient";
import {
  loadLearned,
  loadTodaysShow,
  recordCheckIn,
  saveLearned,
  saveProfile,
  saveTodaysShow,
  takeFixedLine,
  toggleDone,
  useHistory,
  useProfile,
  useTextSize,
  useTodaysShow,
} from "@/lib/storage";
import type { AppScreen } from "@/types/screening";
import type { VoiceAnalysis } from "@/types/voice";

type Launch = { screen: AppScreen; step: number; demo: boolean };

/** Demo links: ?screen=signup|settings|idle|recording|processing|results|today|upload (and ?step=0-10 for sign-up). */
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
  if (value === "today") return { screen: "today", step, demo };
  if (value === "upload") return { screen: "upload", step, demo };
  return { screen: "idle", step, demo };
}

const neverChanges = () => () => {};

// How long to hold Play for a live Gemini show before falling back to the mock.
const LIVE_SHOW_WAIT_MS = 22_000;

// What the upload screen says when the voice couldn't be checked (a show that can't be measured just shows a sample).
const UPLOAD_TOO_QUIET = "I couldn’t hear enough of a voice in that. Please try a longer or louder recording.";
const UPLOAD_UNAVAILABLE = "I couldn’t check that just now. Please try again in a moment.";

export default function Home() {
  const stored = useProfile(); // undefined until the browser has been asked
  const textSize = useTextSize();
  const savedHistory = useHistory();
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
  // This morning's voice analysis: in flight while the Processing screen shows, then its answer
  const [work, setWork] = useState<Promise<void> | null>(null);
  const [analysis, setAnalysis] = useState<VoiceAnalysis | null>(null);
  // Set when an uploaded recording couldn't be checked: Processing then goes back to Upload, not to the results.
  const [uploadProblem, setUploadProblem] = useState<string | null>(null);
  // The day this page opened on: a tab left open overnight keeps the show it has.
  const [today] = useState(dayKey);
  // Today's first check-in has just happened: today's lamp lights up the next time home is shown.
  const [lightLamp, setLightLamp] = useState(false);
  // Play stays off until the live show is in (or the wait times out / the request gives up).
  const [briefingWaitOver, setBriefingWaitOver] = useState(false);

  // The text size is a page-wide setting, so it lives on <html> where the CSS reads it.
  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
  }, [textSize]);

  const profile: Profile | null | undefined =
    stored === undefined ? undefined : (stored ?? (launch.demo ? demoProfile : null));
  const key = profile ? profileKey(profile) : null;
  // Today's show for this profile, kept on the device so it is only ever asked for once a day.
  const todays = useTodaysShow(key, today);
  // Prefer the live show; mock is only used if Gemini never arrives. Frozen once Play starts.
  const briefing: Briefing =
    todays?.briefing ?? mockBriefingFor(profile ?? demoProfile, todays?.picks);
  const playReady = Boolean(todays?.briefing) || briefingWaitOver;

  // The mornings they've tuned in. A demo link has no listener, so it borrows a lived-in week.
  const history = stored ? savedHistory : { ...demoHistory(today), ...savedHistory };
  const doneToday = Boolean(history[today]);
  // The dashboard is worked out from this morning's voice. Demo links, and a morning that couldn't be
  // measured, show placeholder numbers (marked as a sample on the screen).
  const results = analysis
    ? resultsFrom(profile?.name ?? "", analysis, trendBefore(history, today), yesterdayScore(history, today))
    : { ...mockResults, user: profile?.name ?? "" };
  const todaysList = planForToday({
    profile: profile ?? demoProfile,
    status: results.statusColor,
    metrics: results.metrics,
    weather: (onAir ?? briefing).segments.find((segment) => segment.kind === "weather")?.brief,
  });
  const ticked = history[today]?.done ?? [];

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
      setBriefingWaitOver(true);
      prefetchClip(plan.briefing.segments[0].brief); // so Play starts talking straight away
      return;
    }

    setBriefingWaitOver(false);

    const params = new URLSearchParams({
      name: profile.name,
      city: profile.city,
      interests: profile.interests.join(","),
      extras: profile.extras,
      picks: plan.picks.join(","),
    });
    const controller = new AbortController();
    // Don't hold Play forever if Gemini is slow or the network is stuck.
    const timeout = window.setTimeout(() => setBriefingWaitOver(true), LIVE_SHOW_WAIT_MS);
    const unlock = () => {
      window.clearTimeout(timeout);
      setBriefingWaitOver(true);
    };

    fetch(`/api/briefing?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Briefing>) : null))
      .then((data) => {
        // A mock show (no Gemini key) isn't kept: it costs nothing to make again.
        if (data?.source === "live" && data.segments?.length) {
          saveTodaysShow({ ...plan, briefing: data });
          prefetchClip(data.segments[0].brief);
        }
      })
      .catch(() => {
        // offline or no backend: the mock show is fine
      })
      .finally(() => {
        if (!controller.signal.aborted) unlock();
      });
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
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
    if (!playReady) return;
    unlockRadioVoice(); // inside the tap, so the browser lets the radio speak
    // The fixed show has several lines for each topic: the ones heard now are chosen as it starts (and
    // remembered), so a show isn't the same as the last one. A live show is played as written.
    setOnAir(
      briefing.source === "mock" ? mockBriefingFor(profile ?? demoProfile, todays?.picks, takeFixedLine) : briefing,
    );
    // Ask for the microphone now, so the browser's question comes before the show and never in the
    // middle of it. (If it is left unanswered the show starts anyway, and says so when it needs to listen.)
    await Promise.race([primeMicrophone(), new Promise((resolve) => window.setTimeout(resolve, 15000))]);
    setScreen("recording");
  }, [briefing, playReady, profile, todays?.picks]);
  const finishRecording = useCallback(
    (captured: Captured) => {
      if (!doneToday) setLightLamp(true);
      recordCheckIn(today, mockResults.readinessScore); // today's show is done, whatever happens next
      setAnalysis(null);
      setUploadProblem(null);
      setWork(
        analyseVoice(captured).then((outcome) => {
          if (outcome.status !== "done") return;
          setAnalysis(outcome.analysis);
          recordCheckIn(today, readinessFrom(outcome.analysis.probability, outcome.analysis.threshold), true);
        }),
      );
      setScreen("processing");
    },
    [today, doneToday],
  );
  // An uploaded recording stands in for the show. Unlike a show it only counts as today's check-in
  // once it has been measured, and a failure sends them back to choose again, not to a sample dashboard.
  const analyseUploaded = useCallback(
    (upload: Upload) => {
      setUploadProblem(null);
      setWork(
        analyseUpload(upload).then((outcome) => {
          if (outcome.status !== "done") {
            setUploadProblem(outcome.status === "too-quiet" ? UPLOAD_TOO_QUIET : UPLOAD_UNAVAILABLE);
            return;
          }
          if (!doneToday) setLightLamp(true);
          setAnalysis(outcome.analysis);
          recordCheckIn(today, readinessFrom(outcome.analysis.probability, outcome.analysis.threshold), true);
        }),
      );
      setScreen("processing");
    },
    [today, doneToday],
  );
  const lampLit = useCallback(() => setLightLamp(false), []);
  const openUpload = useCallback(() => {
    setUploadProblem(null);
    setScreen("upload");
  }, []);
  const showResults = useCallback(() => setScreen(uploadProblem ? "upload" : "results"), [uploadProblem]);
  const goHome = useCallback(() => setScreen("idle"), []);
  const openToday = useCallback(() => setScreen("today"), []);
  const openSettings = useCallback(() => setScreen("settings"), []);
  const tick = useCallback(
    (id: string) => {
      // a demo link can open the list before any show has been heard
      if (!savedHistory[today]) recordCheckIn(today, mockResults.readinessScore);
      toggleDone(today, id);
    },
    [savedHistory, today],
  );
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
              profile={profile}
              segments={briefing.segments}
              doneToday={doneToday}
              playReady={playReady}
              week={lastSevenDays(history, today)}
              streak={streakOf(history, today)}
              lightToday={lightLamp}
              onLampLit={lampLit}
              listDone={todaysList.filter((item) => ticked.includes(item.id)).length}
              listTotal={todaysList.length}
              onStart={startCheckIn}
              onUpload={openUpload}
              onOpenToday={openToday}
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

          {current === "upload" && profile ? (
            <UploadScreen problem={uploadProblem} onAnalyse={analyseUploaded} onBack={goHome} />
          ) : null}

          {current === "processing" ? <ProcessingScreen work={work} onComplete={showResults} /> : null}

          {current === "results" && profile ? (
            <ResultsDashboard results={results} onFinish={openToday} />
          ) : null}

          {current === "today" && profile ? (
            <TodayScreen
              profile={profile}
              status={results.statusColor}
              items={todaysList}
              done={ticked}
              onToggle={tick}
              onDone={goHome}
            />
          ) : null}
        </main>
      </div>
    </MotionConfig>
  );
}
