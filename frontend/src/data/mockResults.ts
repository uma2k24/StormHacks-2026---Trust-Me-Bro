import type { ScreeningResults, StatusColor } from "@/types/screening";

/** Placeholder numbers: shown for demo links, and when nothing could be measured. */
export const mockResults: ScreeningResults = {
  source: "sample",
  user: "David",
  readinessScore: 68,
  statusColor: "yellow",
  aiSummary:
    "Your pitch wobbles a little today, and your voice sounds a bit breathy. Rest and hydrate may help.",
  metrics: {
    jitter: {
      status: "A bit higher",
      description: "How much the pitch wobbles",
      deviation: 12,
      isWarning: true,
      reading: { value: 0.84, zone: "borderline" },
    },
    shimmer: {
      status: "Steady",
      description: "How much the volume shakes",
      deviation: 0,
      isWarning: false,
      reading: { value: 5.6, zone: "healthy" },
    },
    hnr: {
      status: "Slightly lower",
      description: "How clear vs. breathy the voice is",
      deviation: -10,
      isWarning: true,
      reading: { value: 14.1, zone: "borderline" },
    },
  },
  detail: {
    probability: 0.52,
    threshold: 0.646,
    flagged: false,
    tasks: [
      { label: "Sustained vowel", probability: 0.55, weight: 0.41 },
      { label: "Conversation", probability: 0.5, weight: 0.59 },
    ],
  },
  trendData: [
    { day: "2 weeks ago", score: 90 },
    { day: "2", score: 87 },
    { day: "3", score: 91 },
    { day: "4", score: 86 },
    { day: "5", score: 84 },
    { day: "6", score: 88 },
    { day: "7", score: 83 },
    { day: "Mon", score: 85 },
    { day: "Tue", score: 88 },
    { day: "Wed", score: 82 },
    { day: "Thu", score: 79 },
    { day: "Fri", score: 81 },
    { day: "Sat", score: 75 },
    { day: "Today", score: 68 },
  ],
  yesterdayScore: 82,
  yesterdayLabel: "Optimal",
};

export function readinessLabel(score: number): string {
  if (score >= 80) return "Ready";
  if (score >= 60) return "Pay Attention";
  return "Rest Recommended";
}

export function statusColorForScore(score: number): StatusColor {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

// Zone fills shared by the gauge and the trend chart bands: teal for ready, then warmer coral the further from ready.
export const statusHex: Record<StatusColor, string> = {
  green: "#41cbbc",
  yellow: "#ffc6b2",
  red: "#ff9873",
};
