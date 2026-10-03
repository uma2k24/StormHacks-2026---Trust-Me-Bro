/**
 * The morning briefing. The check-in is disguised as a little morning radio show: each segment
 * reads a short, useful brief (weather, a score, local news) and then asks for the listener's
 * opinion. Their answers are the conversational audio the screening needs.
 *
 * Live segments come from /api/briefing (Gemini + Google Search, weather from Open-Meteo) and are
 * read aloud by ElevenLabs via /api/briefing/speech. Without API keys the mock show below plays.
 * Mirrored in ios/VoiceReadiness/Models/CheckInScript.swift.
 */

export type SegmentKind = "weather" | "sports" | "news" | "local";

export type BriefingSegment = {
  id: string;
  kind: SegmentKind;
  /** Short label for the radio's screen, e.g. "Weather". */
  topic: string;
  /** What the radio reads first: one or two spoken sentences. */
  brief: string;
  /** The open question that invites a real answer. */
  question: string;
  /** What the mock microphone "hears" (the mic is still simulated). */
  mockReply: string;
};

export type Briefing = {
  source: "live" | "mock";
  segments: BriefingSegment[];
};

export const mockBriefing: Briefing = {
  source: "mock",
  segments: [
    {
      id: "weather",
      kind: "weather",
      topic: "Weather",
      brief:
        "Good morning, David. It's going to rain all afternoon in Coquitlam, clearing up around six.",
      question: "Do you think you'll still get your walk in?",
      mockReply:
        "Probably this morning, before it starts. I'll take the long way round the lake.",
    },
    {
      id: "sports",
      kind: "sports",
      topic: "Sports",
      brief: "The Canucks won four to two last night, with a late goal to seal it.",
      question: "Did you catch any of the game?",
      mockReply: "Just the third period. That last goal had me right out of my chair.",
    },
    {
      id: "local",
      kind: "local",
      topic: "Local",
      brief: "The farmers market is open until noon, and the first apples of the season are in.",
      question: "What would you pick up if you went?",
      mockReply: "Some apples for a pie, and maybe a loaf of that sourdough.",
    },
  ],
};

// Timings for the radio screen. Mirrored in ios/VoiceReadiness/Models/CheckInScript.swift.
export const RECEIVE_MS = 900; // the question "arrives" before the talk button wakes up
export const LISTEN_MS = 2500; // a mock answer listens this long, then sends itself
export const ACKNOWLEDGE_MS = 1600; // your own words stay on the screen this long
export const MIN_HOLD_MS = 280; // a press shorter than this is a tap, not a hold
export const READ_MS_PER_WORD = 330; // without a voice, a brief stays up about as long as reading it aloud
export const MIN_READ_MS = 2200;

/** How long to leave text on screen when there is no audio to wait for. */
export function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(MIN_READ_MS, words * READ_MS_PER_WORD);
}
