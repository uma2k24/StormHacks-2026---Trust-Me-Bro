export type AppScreen = "idle" | "recording" | "processing" | "results";

export type StatusColor = "green" | "yellow" | "red";

export type Metric = {
  status: string;
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
    vocalEnergy: Metric;
    vocalControl: Metric;
    cognitivePacing: Metric;
    expressionLevel: Metric;
  };
  trendData: TrendPoint[];
  yesterdayScore: number;
  yesterdayLabel: string;
};
