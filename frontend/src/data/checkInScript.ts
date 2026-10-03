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

export const LISTEN_MS = 2500;
