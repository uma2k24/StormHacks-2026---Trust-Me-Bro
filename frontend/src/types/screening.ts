export type AppScreen = "signup" | "settings" | "idle" | "recording" | "processing" | "results";

export type StatusColor = "green" | "yellow" | "red";

export type Metric = {
  status: string;
  description: string;
  deviation: number;
  isWarning: boolean;
};

export type TrendPoint = {
  day: string;
  score: number;
};

export type ScreeningResults = {
  user: string;
  readinessScore: number;
  statusColor: StatusColor;
  aiSummary: string;
  metrics: {
    jitter: Metric;
    shimmer: Metric;
    hnr: Metric;
    mpp: Metric;
  };
  trendData: TrendPoint[];
  yesterdayScore: number;
  yesterdayLabel: string;
};
