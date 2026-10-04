"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BellRing, Mic } from "lucide-react";
import { HoldBar } from "@/components/HoldBar";
import { SegmentIcon } from "@/components/SegmentIcon";
import { Waveform } from "@/components/Waveform";
import {
  ACKNOWLEDGE_MS,
  AFTER_REPLY_MS,
  type BriefingSegment,
  extraTurn,
  fallbackReply,
  followUpTurn,
  GIVE_UP_LINE,
  HANDS_FREE_GAP_MS,
  LISTEN_MS,
  MAX_EXTRA_QUESTIONS,
  MIC_BLOCKED_LINE,
  MIC_MISSING_LINE,
  MIN_HOLD_MS,
  MIN_SPEECH_MS,
  MISSED_LINE,
  RECEIVE_MS,
  THINKING_LINE,
  VOWEL_AGAIN_LINE,
  VOWEL_LISTENING_LINE,
  VOWEL_MIN_MS,
  VOWEL_TARGET_MS,
  VOWEL_TRIES,
  vowelSignOff,
  vowelTurn,
  wordsSpoken,
} from "@/data/checkInScript";
import { reminderLine } from "@/data/daily";
import { type AnswerTiming, chooseFollowUp, dayKey } from "@/data/learning";
import type { Profile } from "@/data/profile";
import { fetchReply, transcribeAnswer } from "@/lib/conversationClient";
import { prefetchClip, prepareClip, speak, wait } from "@/lib/radioVoice";
import { MicError, type Recorder, type Recording, startRecording } from "@/lib/recorder";
import { loadLearned, takeFixedLine } from "@/lib/storage";
import type { Captured } from "@/lib/voiceClient";

/**
 * The morning show is one little radio with one line of text on its screen, and nobody has to
 * touch it once it has started:
 *   briefing  - the radio reads the segment's brief (weather, a score, local news)
 *   speaking  - then asks what you think
 *   ready     - (a moment) the question stays up, then the microphone opens by itself
 *   listening - "Listening…" while your answer is recorded; a pause after you've spoken sends it
 *   thinking  - "Just a moment…" while it is turned into words
 *   heard     - your own words, while the host thinks of a reply
 *   replying  - the host's reply, read aloud, then on to the next segment
 *   notice    - something to say before it listens again (it didn't catch that, no microphone)
 *   closing   - after the last segment, the listener's own daily reminder ("take your pill"), then done
 * Whatever the radio says appears word by word as it is said, and the text scrolls up by itself
 * when it is longer than the screen. The sign on top reads "On air" while the radio talks and
 * "Mic on" while the microphone is open, when the bars follow the listener's voice.
 * The Talk / Done button is still there: tap it to send an answer early, or hold it and let go.
 *
 * It's a real conversation: the answer is recorded, ElevenLabs turns it into words, and Gemini writes
 * the host's reply (with a light fun fact or news for what you're into). Without a microphone,
 * a key or a backend it falls back to a sample answer after a moment, so the show still plays.
 *
 * The answers are also what the voice analysis listens to, so the show keeps asking questions after
 * the last briefing segment until enough talking has been heard. Those are made up on the spot: when
 * more is needed, Gemini writes the next question inside the same request as its reply to the answer
 * before (about an interest the app picks from what the listener enjoys, see chooseFollowUp), so a
 * question costs no request of its own. Only if it can't (no key, an error) are the fixed "chat"
 * questions asked. The show always ends with the sustained "ahhh" (the "vowel" turn): the jitter, shimmer and HNR are measured
 * on it, and a bar under the screen fills as it is held, so they can see how long is left.
 * Everything that was recorded is handed to onComplete.
 * Mirrored in ios/VoiceReadiness/Views/RecordingView.swift.
 */
type Phase =
  | "briefing"
  | "speaking"
  | "ready"
  | "listening"
  | "thinking"
  | "heard"
  | "replying"
  | "notice"
  | "closing";

type ActiveScreenProps = {
  segments: BriefingSegment[];
  /** Who is listening: the host's replies are written for them. */
  profile: Profile;
  /** Called each time the listener finishes an answer, with how they went about it. */
  onAnswer: (segment: BriefingSegment, timing: AnswerTiming) => void;
  /** The show is over, with what was recorded for the voice analysis. */
  onComplete: (captured: Captured) => void;
};

/** Longer text reads a size down so it usually fits; whatever still doesn't fit scrolls. */
function captionSize(text: string): "large" | "medium" | "small" {
  if (text.length <= 60) return "large";
  if (text.length <= 120) return "medium";
  return "small";
}

/** Whether the caption overflows its box, and if so whether there's more below. */
type ScrollState = "none" | "more" | "end";

/** What the recording says about how they answered: how soon they started, and how long they really talked. */
const timingOf = (recording: Recording, askedAt: number): AnswerTiming => ({
  latencyMs: recording.startedAt - askedAt + (recording.speechStartMs ?? recording.durationMs),
  talkedMs: recording.speechStartMs === null ? recording.durationMs : recording.speechMs,
});

/**
 * A line of text whose words are all laid out from the start (so nothing shifts) but only show once
 * they have been said. `data-word` lets the screen scroll to the one being spoken.
 */
function LiveWords({ text, revealed }: { text: string; revealed: number }) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => (
      <Fragment key={index}>
        {index > 0 ? " " : null}
        <span className="live-word" data-word={index} data-said={index < revealed}>
          {word}
        </span>
      </Fragment>
    ));
}

export function ActiveScreen({ segments, profile, onAnswer, onComplete }: ActiveScreenProps) {
  // The briefing's segments, then (as needed) extra questions, then the "ahhh". Grows as the show goes.
  const [turns, setTurns] = useState(segments);
  const turnsRef = useRef(segments);
  const [turnIndex, setTurnIndex] = useState(0);
  const [phase, setPhaseState] = useState<Phase>("briefing");
  // what they said (shown while the host thinks), and the radio's own line when it isn't the segment's
  const [said, setSaid] = useState("");
  const [spoken, setSpoken] = useState("");
  // how many words of the radio's current line have been said so far; null when the line is simply shown
  const [revealed, setRevealed] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();
  const phaseRef = useRef<Phase>("briefing");
  const timers = useRef<number[]>([]);
  const listenTimer = useRef<number | null>(null);
  const pressStartedAt = useRef<number | null>(null);
  // when the question finished: how soon they answer is part of what the radio learns from
  const askedAt = useRef(0);
  // the microphone: opened by itself when a question has been asked (permission was asked for at Play)
  const recorder = useRef<Promise<Recorder> | null>(null);
  const recorderReady = useRef(false);
  // the microphone once it is really open, for the bars and the "Mic on" sign
  const openMic = useRef<Recorder | null>(null);
  const [micOpen, setMicOpen] = useState(false);
  // true once real answers aren't possible (no microphone, no transcription): the sample answer plays instead
  const sample = useRef(false);
  // answers that came back empty, for this segment
  const missed = useRef(0);
  // true once transcription isn't possible (no key, no backend): the answers are still recorded, the show plays sample answers
  const noTranscript = useRef(false);
  // what has been recorded for the voice analysis, and how much of it is talking
  const captured = useRef<Captured>({ speech: [], vowel: null });
  const talkedMs = useRef(0);
  const extrasAsked = useRef(0);
  // the next question, once Gemini has written it with its last reply; asked when the show needs more talking
  const upNext = useRef<BriefingSegment | null>(null);
  const vowelTries = useRef(0);
  // the last question went unanswered twice: more questions won't help
  const gaveUp = useRef(false);
  // what they said earlier in the show, so a reply can pick up where they left off
  const earlier = useRef<{ topic: string; said: string }[]>([]);
  // everything that happens once an answer is in; aborted when they tap Talk to answer early, or leave
  const pipeline = useRef<AbortController | null>(null);
  // the latest finish() and startListening(), for the recorder and the show's timers to call
  const endRef = useRef<() => void>(() => {});
  const beginRef = useRef<() => void>(() => {});
  const captionScroll = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollState>("none");

  // One lamp for each briefing segment and one for the last stretch (any extra questions, then the "ahhh").
  const totalTurns = segments.length + 1;
  const lampIndex = Math.min(turnIndex, segments.length);
  const turn = turns[Math.min(turnIndex, turns.length - 1)];
  const segmentNumber = lampIndex + 1;

  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /** The radio says a line: it is read aloud, and its words appear as they are said. */
  const say = useCallback(async (text: string, signal: AbortSignal) => {
    setRevealed(0);
    await speak(text, signal, (fraction) => setRevealed(wordsSpoken(text, fraction)));
    if (!signal.aborted) setRevealed(null);
  }, []);

  /** How loud the open microphone is (0...1): what the bars follow while it listens. */
  const micLevel = useCallback(() => openMic.current?.level() ?? 0, []);

  /** How long the "ahhh" has been held so far: what the bar under the screen fills with. */
  const heldMs = useCallback(() => openMic.current?.voicedMs() ?? 0, []);

  // Each segment: read the brief, ask the question, then open the microphone by itself.
  useEffect(() => {
    const segment = turnsRef.current[turnIndex];
    if (!segment) return;
    const controller = new AbortController();
    const { signal } = controller;
    missed.current = 0;

    prefetchClip(segment.brief);
    prefetchClip(segment.question);
    // warm up the next segment while this one plays (after the last one, the "ahhh")
    const upcoming = turnsRef.current[turnIndex + 1] ?? (turnIndex === segments.length - 1 ? vowelTurn() : undefined);
    if (upcoming) {
      prefetchClip(upcoming.brief);
      prefetchClip(upcoming.question);
    }

    (async () => {
      setPhase("briefing");
      await say(segment.brief, signal);
      if (signal.aborted) return;
      await prepareClip(segment.question, signal); // its voice is ready, so its words start with it
      if (signal.aborted) return;
      setPhase("speaking");
      await Promise.all([say(segment.question, signal), wait(RECEIVE_MS, signal)]);
      if (signal.aborted) return;
      // a beat so the microphone doesn't hear the end of the question, then it opens by itself
      await wait(HANDS_FREE_GAP_MS, signal);
      if (signal.aborted) return;
      askedAt.current = Date.now();
      setPhase("ready");
      beginRef.current();
    })();

    return () => controller.abort();
    // the turns are read from a ref: asking another question must not restart the one being asked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnIndex, say]);

  const measureScroll = useCallback(() => {
    const box = captionScroll.current;
    if (!box) return;
    const hidden = box.scrollHeight - box.clientHeight;
    setScrollState(hidden <= 2 ? "none" : hidden - box.scrollTop > 2 ? "more" : "end");
  }, []);

  // Re-measure when the screen resizes (rotation, keyboard, window); new text re-measures itself.
  useEffect(() => {
    const box = captionScroll.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureScroll);
    observer.observe(box);
    return () => observer.disconnect();
  }, [measureScroll]);

  // As the radio speaks, the text scrolls up by itself to keep the word being said in view.
  useEffect(() => {
    if (!revealed) return;
    const box = captionScroll.current;
    const word = box?.querySelector<HTMLElement>(`[data-word="${revealed - 1}"]`);
    if (!box || !word) return;
    const bottom = word.getBoundingClientRect().bottom - box.getBoundingClientRect().top + box.scrollTop;
    const top = bottom - box.clientHeight * 0.6;
    if (top <= box.scrollTop + 1) return;
    // glide when there is room, but never let the word being said sit below the screen while a glide catches up
    const offScreen = bottom > box.scrollTop + box.clientHeight;
    box.scrollTo({ top, behavior: reduceMotion || offScreen ? "auto" : "smooth" });
  }, [revealed, reduceMotion]);

  // Leaving the screen stops everything: timers, a line being read, and above all the microphone.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
      if (listenTimer.current !== null) window.clearTimeout(listenTimer.current);
      pipeline.current?.abort();
      recorder.current?.then((open) => open.cancel()).catch(() => {});
    };
  }, []);

  /** The show is over: the radio reads their daily reminder, if they have one, then hands over. */
  const closeShow = async () => {
    const line = reminderLine(profile);
    if (!line) {
      onComplete(captured.current);
      return;
    }
    pipeline.current?.abort();
    const controller = new AbortController();
    pipeline.current = controller;
    const { signal } = controller;
    setSpoken(line);
    await prepareClip(line, signal);
    if (signal.aborted) return;
    setPhase("closing");
    await say(line, signal);
    await wait(AFTER_REPLY_MS, signal);
    if (!signal.aborted) onComplete(captured.current);
  };

  /** Less than MIN_SPEECH_MS of talking has been heard so far (and they haven't left the last question unanswered). */
  const needsMore = () =>
    !gaveUp.current && talkedMs.current < MIN_SPEECH_MS && extrasAsked.current < MAX_EXTRA_QUESTIONS;

  /**
   * Another question, when more talking is needed: the one Gemini wrote with its last reply or, if it
   * couldn't, a fixed one. Null when there's enough, or no more questions to ask.
   */
  const moreToSay = () => {
    if (!needsMore()) return null;
    const extra = upNext.current ?? extraTurn(extrasAsked.current, takeFixedLine);
    upNext.current = null;
    if (extra) extrasAsked.current += 1;
    return extra;
  };

  /** Moves to the next turn, which may have to be made up: another question, or the "ahhh". */
  const advance = () => {
    const next = turnIndex + 1;
    if (next >= turnsRef.current.length) {
      // with no microphone there is nothing to measure, so no "ahhh"
      const following =
        turn.kind === "vowel" || sample.current ? null : (moreToSay() ?? vowelTurn());
      if (!following) {
        void closeShow();
        return;
      }
      turnsRef.current = [...turnsRef.current, following];
      setTurns(turnsRef.current);
    }
    setPhase("briefing");
    setRevealed(0);
    setTurnIndex(next);
  };

  /** A sample answer: what the show plays when there is no microphone or transcription. */
  const finishSample = (timing?: AnswerTiming) => {
    setSaid(turn.mockReply);
    setPhase("heard");
    if (timing) onAnswer(turn, timing); // nothing real was heard otherwise, so there is nothing to learn from
    later(advance, ACKNOWLEDGE_MS);
  };

  /** The radio says a line, then listens again by itself. */
  const sayThenListen = async (line: string, signal: AbortSignal) => {
    await say(line, signal);
    if (signal.aborted) return;
    await wait(HANDS_FREE_GAP_MS, signal);
    if (signal.aborted) return;
    askedAt.current = Date.now();
    beginRef.current();
  };

  /** Nothing was heard. The first time the radio asks again; the second time it moves on. */
  const missedAnswer = async (signal: AbortSignal) => {
    missed.current += 1;
    const giveUp = missed.current >= 2;
    const line = giveUp ? GIVE_UP_LINE : MISSED_LINE;
    setSpoken(line);
    await prepareClip(line, signal);
    if (signal.aborted) return;

    if (giveUp) {
      gaveUp.current = true;
      setPhase("replying");
      await say(line, signal);
      await wait(AFTER_REPLY_MS, signal);
      if (!signal.aborted) advance();
      return;
    }
    setPhase("notice");
    await sayThenListen(line, signal);
  };

  /** Keeps what was just recorded for the voice analysis. */
  const keep = (recording: Recording) => {
    captured.current.speech.push(recording);
    talkedMs.current += recording.voicedMs;
  };

  /** The sustained "ahhh" is in. Too short, and the radio asks once more; otherwise it signs off. */
  const finishVowel = async (recording: Recording, signal: AbortSignal) => {
    vowelTries.current += 1;
    const best = captured.current.vowel;
    if (!best || recording.voicedMs > best.voicedMs) captured.current.vowel = recording;

    if (recording.voicedMs < VOWEL_MIN_MS && vowelTries.current < VOWEL_TRIES) {
      setSpoken(VOWEL_AGAIN_LINE);
      await prepareClip(VOWEL_AGAIN_LINE, signal);
      if (signal.aborted) return;
      setPhase("notice");
      await sayThenListen(VOWEL_AGAIN_LINE, signal);
      return;
    }

    const line = vowelSignOff(profile.name);
    setSpoken(line);
    await prepareClip(line, signal);
    if (signal.aborted) return;
    setPhase("replying");
    await say(line, signal);
    await wait(AFTER_REPLY_MS, signal);
    if (!signal.aborted) advance();
  };

  /** The real thing: stop recording, turn it into words, show them, and let the host answer. */
  const finishLive = async () => {
    const segment = turn;
    const index = turnIndex;

    pipeline.current?.abort();
    const controller = new AbortController();
    pipeline.current = controller;
    const { signal } = controller;
    setPhase("thinking");

    let recording: Recording | undefined;
    try {
      recording = await (await recorder.current)?.stop();
    } catch {
      return; // the microphone failed: micFailed has taken over
    }
    recorder.current = null;
    if (!recording) return;
    const timing = timingOf(recording, askedAt.current);

    // an "ahhh" has no words to turn into text
    if (segment.kind === "vowel") {
      await finishVowel(recording, signal);
      return;
    }

    const heard = noTranscript.current ? ({ status: "unavailable" } as const) : await transcribeAnswer(recording.blob, signal);
    if (signal.aborted) return;

    if (heard.status === "unavailable") {
      // No transcription (no key, no backend): the answers are still recorded for the voice analysis,
      // but the rest of the show plays sample answers.
      noTranscript.current = true;
      if (recording.speechStartMs !== null) keep(recording);
      finishSample(timing);
      return;
    }
    if (!heard.text) {
      await missedAnswer(signal);
      return;
    }

    gaveUp.current = false;
    keep(recording);
    setSaid(heard.text);
    setPhase("heard");
    onAnswer(segment, timing);

    // If this answer still isn't enough talking and no question is lined up, the same request that writes
    // the reply also writes the next question: about an interest the app picks from what they enjoy.
    // Only the first question of a show can search the news (see lib/conversation.ts).
    const askNext = needsMore() && index + 1 >= turnsRef.current.length;
    const learned = askNext ? loadLearned() : null;
    const focus = learned ? chooseFollowUp(profile, learned, dayKey(), turnsRef.current.map(({ kind }) => kind)) : null;
    const followUp = learned && focus ? { focus, avoid: learned.recent, asked: extrasAsked.current } : undefined;
    upNext.current = null;

    // Their words stay up for a moment at least. The reply (and its voice) is ready before the screen changes.
    // Gemini writes the reply for the briefing's own segments and for the questions it made up; the last
    // answer before the "ahhh", and the fixed fallback questions, get a fixed warm line (no request).
    const reply = (async () => {
      const written =
        segment.kind === "chat" || (index >= segments.length && !followUp)
          ? null
          : await fetchReply(
              { profile, segment, transcript: heard.text, earlier: earlier.current, index, last: false, followUp },
              signal,
            );
      // the server's own fixed line is dropped for one from this device's rotation, so they take turns
      const text = written?.source === "live" ? written.text : fallbackReply(false, takeFixedLine);
      if (followUp && written?.next) {
        // made up on the spot: its voices are fetched while the reply plays, so the next question starts at once
        const made = followUpTurn(written.next, followUp.focus, extrasAsked.current);
        upNext.current = made;
        prefetchClip(made.brief);
        prefetchClip(made.question);
      }
      await prepareClip(text, signal);
      return text;
    })();
    const [text] = await Promise.all([reply, wait(ACKNOWLEDGE_MS, signal)]);
    if (signal.aborted) return;

    if (segment.kind !== "chat") earlier.current = [...earlier.current, { topic: segment.topic, said: heard.text }];
    setSpoken(text);
    setPhase("replying");
    await say(text, signal);
    await wait(AFTER_REPLY_MS, signal);
    if (!signal.aborted) advance();
  };

  const finish = () => {
    if (phaseRef.current !== "listening") return;
    if (listenTimer.current !== null) {
      window.clearTimeout(listenTimer.current);
      listenTimer.current = null;
    }
    pressStartedAt.current = null;
    openMic.current = null;
    setMicOpen(false);
    if (sample.current) finishSample();
    else void finishLive();
  };

  /** No microphone to listen with: say so, and play the sample answer instead. */
  const micFailed = (error: unknown) => {
    if (phaseRef.current !== "listening" && phaseRef.current !== "thinking") return;
    sample.current = true;
    recorder.current = null;
    pipeline.current?.abort();
    const controller = new AbortController();
    pipeline.current = controller;

    const line = error instanceof MicError && error.problem === "blocked" ? MIC_BLOCKED_LINE : MIC_MISSING_LINE;
    setSpoken(line);
    setPhase("notice");
    void sayThenListen(line, controller.signal);
  };

  const startListening = () => {
    if (phaseRef.current !== "ready" && phaseRef.current !== "notice") return;
    pipeline.current?.abort(); // a line still being read stops: the radio doesn't talk over you
    setRevealed(null);
    setPhase("listening");

    if (sample.current) {
      // The sample answer sends itself after a moment, like a voice assistant noticing you've stopped.
      listenTimer.current = window.setTimeout(() => endRef.current(), LISTEN_MS);
      return;
    }

    recorderReady.current = false;
    const opening = startRecording(
      () => endRef.current(),
      turn.kind === "vowel" ? { untouched: true, voicedTargetMs: VOWEL_TARGET_MS } : {},
    );
    recorder.current = opening;
    opening.then(
      (open) => {
        recorderReady.current = true;
        open.setHeld(pressStartedAt.current !== null);
        if (phaseRef.current !== "listening") return; // already sent while it was opening
        openMic.current = open;
        setMicOpen(true);
      },
      micFailed,
    );
  };

  useEffect(() => {
    endRef.current = finish; // the recorder calls this when it hears the answer end
    beginRef.current = startListening; // and the show calls this to open the microphone
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (phaseRef.current === "ready" || phaseRef.current === "notice") {
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
    if (!sample.current && !recorderReady.current) return; // still waiting on the microphone: keep listening
    if (recorderReady.current) recorder.current?.then((open) => open.setHeld(false));
    // A real hold sends when you let go; a quick tap just keeps listening.
    if (heldFor >= MIN_HOLD_MS) finish();
  };

  // Keyboard and assistive tech activate with a click that has no pointer behind it (detail 0).
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    if (phaseRef.current === "ready" || phaseRef.current === "notice") startListening();
    else if (phaseRef.current === "listening") finish();
  };

  const caption =
    phase === "briefing"
      ? turn.brief
      : phase === "listening"
        ? turn.kind === "vowel"
          ? VOWEL_LISTENING_LINE
          : "Listening…"
        : phase === "thinking"
          ? THINKING_LINE
          : phase === "heard"
            ? `“${said}”`
            : phase === "replying" || phase === "notice" || phase === "closing"
              ? spoken
              : turn.question;
  const captionKey =
    phase === "briefing"
      ? `${turn.id}-brief`
      : phase === "listening" || phase === "thinking"
        ? phase
        : phase === "heard"
          ? `${turn.id}-heard`
          : phase === "replying" || phase === "notice"
            ? `${turn.id}-${phase}`
            : phase === "closing"
              ? "closing"
              : `${turn.id}-question`;

  const canPress = phase === "ready" || phase === "listening" || phase === "notice";
  const live =
    revealed !== null &&
    (phase === "briefing" ||
      phase === "speaking" ||
      phase === "replying" ||
      phase === "notice" ||
      phase === "closing");
  // the sign on top: lit while the radio talks, "Mic on" only while the microphone is really open
  const onAir = micOpen && phase === "listening" ? "mic" : live ? "air" : "off";

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">
        Segment {segmentNumber} of {totalTurns}: {turn.topic}
      </h1>

      <div className="radio">
        <div className="radio-top">
          {/* the screen and the caption already say this out loud, so the sign is for the eyes only */}
          <p className="on-air" data-state={onAir} aria-hidden="true">
            <span className="on-air-lamp" />
            {/* both words share one spot, so the row never shifts when they swap */}
            <span className="on-air-words">
              <span data-shown={onAir !== "mic"}>On air</span>
              <span data-shown={onAir === "mic"}>Mic on</span>
            </span>
          </p>
          <div
            className="leds"
            role="progressbar"
            aria-label="Show progress"
            aria-valuemin={1}
            aria-valuemax={totalTurns}
            aria-valuenow={segmentNumber}
            aria-valuetext={`Segment ${segmentNumber} of ${totalTurns}`}
          >
            {Array.from({ length: totalTurns }, (_, index) => (
              <span
                key={index}
                className="led"
                data-state={
                  index < lampIndex ? "done" : index === lampIndex ? "current" : "todo"
                }
              />
            ))}
          </div>
        </div>

        <div className="radio-screen" data-phase={phase} aria-live="polite" aria-atomic="true">
          {phase === "closing" ? (
            <p className="radio-topic">
              <BellRing className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
              Reminder
            </p>
          ) : (
            <p className="radio-topic">
              <SegmentIcon kind={turn.kind} className="h-5 w-5" strokeWidth={2.5} />
              {turn.topic}
            </p>
          )}
          {/* Long text scrolls inside the screen instead of running off it. */}
          <div
            ref={captionScroll}
            className="radio-scroll"
            data-scroll={scrollState}
            tabIndex={scrollState === "none" ? undefined : 0}
            onScroll={measureScroll}
          >
            <AnimatePresence
              mode="wait"
              onExitComplete={() => captionScroll.current?.scrollTo({ top: 0 })}
            >
              <motion.p
                key={captionKey}
                className="radio-caption"
                data-size={captionSize(caption)}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.26 }}
                onAnimationComplete={measureScroll}
              >
                {live ? <LiveWords text={caption} revealed={revealed} /> : caption}
              </motion.p>
            </AnimatePresence>
          </div>
          <Waveform
            bars={9}
            active={
              phase === "briefing" ||
              phase === "speaking" ||
              phase === "listening" ||
              phase === "replying" ||
              phase === "closing"
            }
            // while it listens the bars follow the microphone: flat in a quiet room, rising as they talk
            level={phase === "listening" ? micLevel : undefined}
          />
          {/* the "ahhh" stops by itself once it has been held long enough: this shows how far along it is */}
          {phase === "listening" && turn.kind === "vowel" ? (
            <HoldBar targetMs={VOWEL_TARGET_MS} heldMs={heldMs} />
          ) : null}
        </div>

        <div className="radio-controls">
          <div
            className={`sonar rounded-full ${
              phase === "listening" ? "sonar-fast" : phase === "ready" || phase === "notice" ? "" : "sonar-off"
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
                phase === "listening" ? "Done talking, send my answer" : "Talk, answer with your voice"
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
