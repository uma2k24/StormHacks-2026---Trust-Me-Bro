import type { ScreeningResults, StatusColor } from "@/types/screening";

export const mockResults: ScreeningResults = {
  user: "David",
  readinessScore: 68,
  statusColor: "yellow",
  aiSummary:
    "Your pitch wobbles a little more than usual today, and your voice sounds a bit breathier. Rest and hydrate may help.",
  metrics: {
    jitter: {
      status: "A bit higher",
      description: "How much the pitch wobbles",
      deviation: 12,
      isWarning: true,
    },
    shimmer: {
      status: "Steady",
      description: "How much the volume shakes",
      deviation: 0,
      isWarning: false,
    },
    hnr: {
      status: "Slightly lower",
      description: "How clear vs. breathy the voice is",
      deviation: -10,
      isWarning: true,
    },
    mpp: {
      status: "Mostly regular",
      description: "How regular the vocal cords vibrate",
      deviation: -4,
      isWarning: false,
    },
  },
  trendData: [
    { day: "1", score: 90 },
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

// Zone fills shared by the gauge, the trend chart bands and the status chips.
export const statusHex: Record<StatusColor, string> = {
  green: "#6fdca3",
  yellow: "#ffc72c",
  red: "#ff8a78",
};
