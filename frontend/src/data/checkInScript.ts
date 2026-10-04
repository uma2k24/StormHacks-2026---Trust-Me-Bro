/**
 * The morning briefing. The check-in is disguised as a little morning radio show: each segment
 * reads a short, useful brief (weather, a score, local news) and then asks for the listener's
 * opinion. Their answers are the conversational audio the screening needs.
 *
 * Live segments come from /api/briefing (Gemini + Google Search, weather from Open-Meteo, shaped
 * by the listener's profile) and are read aloud by ElevenLabs via /api/briefing/speech. Which two
 * interests the show covers is decided on the device from what the listener has responded to
 * (learning.ts), so Gemini only writes the words. Without API keys the mock show below plays.
 * Mirrored in ios/VoiceReadiness/Models/CheckInScript.swift.
 */

import type { InterestId, Profile } from "@/data/profile";

/** "weather" and "news" are always available; every interest is also a kind. */
export type SegmentKind = "weather" | "news" | InterestId;

export type BriefingSegment = {
  id: string;
  kind: SegmentKind;
  /** Short label for the radio's screen, e.g. "Weather". */
  topic: string;
  /** What the radio reads first: one or two spoken sentences. */
  brief: string;
  /** The open question that invites a real answer. */
  question: string;
  /** The sample answer played when there is no microphone or transcription to hear a real one. */
  mockReply: string;
};

export type Briefing = {
  source: "live" | "mock";
  segments: BriefingSegment[];
};

type MockLine = Pick<BriefingSegment, "topic" | "brief" | "question" | "mockReply">;

const MOCK_LINES: Record<InterestId, MockLine> = {
  sports: {
    topic: "Sports",
    brief: "The Canucks won four to two last night, with a late goal to seal it.",
    question: "Did you catch any of the game?",
    mockReply: "Just the third period. That last goal had me right out of my chair.",
  },
  local: {
    topic: "Local",
    brief: "The farmers market is open until noon, and the first apples of the season are in.",
    question: "What would you pick up if you went?",
    mockReply: "Some apples for a pie, and maybe a loaf of that sourdough.",
  },
  garden: {
    topic: "Garden",
    brief: "It's a good week to plant spring bulbs, while the soil is still soft after the rain.",
    question: "What's growing in your garden right now?",
    mockReply: "The last of the tomatoes, and my dahlias are still putting on a show.",
  },
  music: {
    topic: "Music",
    brief: "A grey morning is perfect for an old favourite record, the kind you can hum along to.",
    question: "What's a song that takes you right back?",
    mockReply: "Anything by Nat King Cole. My mother used to sing along in the kitchen.",
  },
  food: {
    topic: "Cooking",
    brief: "Soup season has arrived, and squash and apples are at their very best right now.",
    question: "What do you like to cook when the weather turns cool?",
    mockReply: "A big pot of chicken soup, and an apple crumble if I'm feeling fancy.",
  },
  nature: {
    topic: "Nature",
    brief: "The geese are starting to head south, so keep an ear out for them overhead this week.",
    question: "Have you spotted any birds or wildlife lately?",
    mockReply: "A heron down by the creek yesterday, standing perfectly still.",
  },
  history: {
    topic: "History",
    brief: "Long ago, whole families gathered around the radio each evening for their favourite shows.",
    question: "What did you love listening to when you were young?",
    mockReply: "The Lone Ranger on Saturday mornings. We'd all sit on the floor and listen.",
  },
  arts: {
    topic: "Books",
    brief: "Libraries are putting out their new books this month, so there's plenty to pick from.",
    question: "What's the best book or film you've enjoyed lately?",
    mockReply: "I just finished a mystery set in Venice. I couldn't put it down.",
  },
};

/** When someone picks fewer than two interests, the show fills up with these. */
const FILLER_INTERESTS: InterestId[] = ["local", "history", "nature"];

/**
 * The two interests for a show nobody has chosen picks for (see chooseInterests in learning.ts
 * for how they are normally chosen): their first two, topped up from FILLER_INTERESTS. Used by
 * the mock show and by the server when a request names no picks.
 * Mirrored in CheckInScript.fallbackPicks(for:) on iOS.
 */
export function fallbackPicks(profile: Pick<Profile, "interests">): InterestId[] {
  const picks = profile.interests.slice(0, 2);
  for (const filler of FILLER_INTERESTS) {
    if (picks.length < 2 && !picks.includes(filler)) picks.push(filler);
  }
  return picks;
}

/**
 * The mock show: the weather, then a segment for each of the two picks.
 * Mirrored in CheckInScript.mockBriefing(for:picks:) on iOS.
 */
export function mockBriefingFor(
  profile: Pick<Profile, "name" | "city" | "interests">,
  picks: InterestId[] = fallbackPicks(profile),
): Briefing {
  const name = profile.name || "friend";
  const place = profile.city ? ` in ${profile.city.split(",")[0].trim()}` : "";

  return {
    source: "mock",
    segments: [
      {
        id: "weather",
        kind: "weather",
        topic: "Weather",
        brief: `Good morning, ${name}. It's going to rain all afternoon${place}, clearing up around six.`,
        question: "Do you think you'll still get your walk in?",
        mockReply: "Probably this morning, before it starts. I'll take the long way round the lake.",
      },
      ...picks.map((id): BriefingSegment => ({ id, kind: id, ...MOCK_LINES[id] })),
    ],
  };
}

// Timings for the radio screen. Mirrored in ios/VoiceReadiness/Models/CheckInScript.swift.
export const RECEIVE_MS = 900; // the question "arrives" before the microphone opens
export const LISTEN_MS = 2500; // a sample answer listens this long, then sends itself
export const ACKNOWLEDGE_MS = 1600; // your own words stay on the screen this long
export const MIN_HOLD_MS = 280; // a press shorter than this is a tap, not a hold
export const READ_MS_PER_WORD = 330; // without a voice, a brief stays up about as long as reading it aloud
export const MIN_READ_MS = 2200;

// Real answers (see lib/recorder.ts). Mirrored in ios/VoiceReadiness/Models/CheckInScript.swift.
export const SPEECH_DB = -40; // louder than this (in dBFS) counts as talking
export const SILENCE_END_MS = 2200; // this long without talking, after they have talked, sends the answer
export const NO_SPEECH_MS = 15000; // this long without ever talking sends it anyway: nothing was heard
export const MAX_ANSWER_MS = 45000; // the longest one answer can be
export const AFTER_REPLY_MS = 600; // a breath after the radio's reply before the next segment
export const HANDS_FREE_GAP_MS = 400; // after the radio stops talking the microphone opens this much later, so it doesn't hear itself

/** The radio's own lines for when the conversation can't go to plan. The radio carries on by itself after each. */
export const MISSED_LINE = "Sorry, I didn't catch that. Could you say it again?";
export const GIVE_UP_LINE = "That's all right. Let's move on.";
export const MIC_BLOCKED_LINE = "The microphone is blocked, so I'll use a sample answer.";
export const MIC_MISSING_LINE = "I can't find a microphone, so I'll use a sample answer.";
export const THINKING_LINE = "Just a moment…";

/**
 * How many words of a line have been spoken once `fraction` (0...1) of its audio has played, so the
 * words can appear on screen as the voice reaches them. Longer words and the pause after a comma or
 * a full stop take longer to say, so they take more of the line. A word shows a touch before it is
 * heard: the text is never behind the voice.
 * Mirrored in CheckInScript.wordsSpoken(in:fraction:) on iOS.
 */
export function wordsSpoken(text: string, fraction: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (fraction >= 1) return words.length;

  const pause = (word: string) => (/[.!?…]$/.test(word) ? 6 : /[,;:—]$/.test(word) ? 3 : 0);
  const weights = words.map((word) => Math.max(2, word.length) + pause(word));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let before = 0;
  let count = 0;
  for (const weight of weights) {
    if (before / total > fraction + 0.015) break;
    count += 1;
    before += weight;
  }
  return count;
}

const THANKS = [
  "Thank you for telling me that, {name}. I always enjoy hearing from you.",
  "That sounds lovely, {name}. Thanks for sharing it with me.",
  "I like hearing that, {name}. Thank you for chatting.",
];
const SIGN_OFF = "Thank you for sharing that, {name}. That's the show for today. Have a lovely day.";

/**
 * What the radio says back when Gemini can't write a reply (no key, offline, an error): a warm,
 * fixed line that never claims to know anything. The last segment signs off the show.
 * Mirrored in CheckInScript.fallbackReply(for:segmentIndex:last:) on iOS.
 */
export function fallbackReply(name: string, segmentIndex: number, last: boolean): string {
  const line = last ? SIGN_OFF : THANKS[segmentIndex % THANKS.length];
  return line.replace("{name}", name.trim() || "friend");
}

/** How long to leave text on screen when there is no audio to wait for. */
export function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(MIN_READ_MS, words * READ_MS_PER_WORD);
}
