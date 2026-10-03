import type { ScreeningResults, StatusColor } from "@/types/screening";

export const mockResults: ScreeningResults = {
  user: "David",
  readinessScore: 68,
  statusColor: "yellow",
  aiSummary:
    "Your speech pacing is a bit slower than your usual baseline today. It might be a good idea to rest and hydrate.",
  metrics: {
    vocalEnergy: {
      status: "Slightly Low",
      deviation: -10,
      isWarning: false,
    },
    vocalControl: {
      status: "Steady",
      deviation: 0,
      isWarning: false,
    },
    cognitivePacing: {
      status: "15% Slower",
      deviation: -15,
      isWarning: true,
    },
    expressionLevel: {
      status: "Normal",
      deviation: -2,
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

export const statusHex: Record<StatusColor, string> = {
  green: "#3DDC84",
  yellow: "#F5C518",
  red: "#FF6B6B",
};
