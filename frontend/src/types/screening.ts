export type AppScreen = "signup" | "settings" | "idle" | "recording" | "processing" | "results" | "today";

export type StatusColor = "green" | "yellow" | "red";

/** Where a measurement falls: in the healthy range, between the two, or in the Parkinson's range. */
export type Zone = "healthy" | "borderline" | "elevated";

export type MeasureKey = "jitter" | "shimmer" | "hnr";

/** One measurement from the sustained "ahhh". */
export type Reading = {
  value: number;
  zone: Zone;
};

export type Metric = {
  status: string;
  description: string;
  /** Percent away from the middle of the healthy range (positive is higher). */
  deviation: number;
  isWarning: boolean;
  /** The measurement behind it, shown when someone opens the vital for details. Absent when it couldn't be measured. */
  reading?: Reading;
};

export type TrendPoint = {
  day: string;
  score: number;
};

/** What the classifier made of the whole check-in, shown only when someone opens a vital for details. */
export type ResultDetail = {
  /** 0...1. */
  probability: number;
  /** At or above this the voice is flagged. */
  threshold: number;
  flagged: boolean;
  tasks: { label: string; probability: number; /** 0...1 */ weight: number }[];
};

export type ScreeningResults = {
  /** "measured" is worked out from the listener's voice today; "sample" is placeholder numbers (nothing could be measured). */
  source: "measured" | "sample";
  user: string;
  readinessScore: number;
  statusColor: StatusColor;
  aiSummary: string;
  metrics: {
    jitter: Metric;
    shimmer: Metric;
    hnr: Metric;
  };
  /** The classifier's side of the story; absent for a sample. */
  detail?: ResultDetail;
  trendData: TrendPoint[];
  yesterdayScore: number;
  yesterdayLabel: string;
};
