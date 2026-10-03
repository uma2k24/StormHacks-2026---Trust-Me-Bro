export type CheckInTurn = {
  id: string;
  assistant: string;
  mockReply: string;
};

export const checkInScript: CheckInTurn[] = [
  {
    id: "feeling",
    assistant: "How are you feeling this morning, David?",
    mockReply: "Pretty good — a little tired.",
  },
  {
    id: "morning",
    assistant: "Tell me about your morning so far.",
    mockReply: "I made coffee and sat by the window for a bit.",
  },
  {
    id: "ready",
    assistant: "One last thing — what's one word for how ready you feel today?",
    mockReply: "Steady.",
  },
];

// Timings for the radio screen. Mirrored in ios/VoiceReadiness/Models/CheckInScript.swift.
export const RECEIVE_MS = 900; // the question "arrives" before the talk button wakes up
export const LISTEN_MS = 2500; // a mock answer listens this long, then sends itself
export const ACKNOWLEDGE_MS = 1600; // your own words stay on the screen this long
export const MIN_HOLD_MS = 280; // a press shorter than this is a tap, not a hold
