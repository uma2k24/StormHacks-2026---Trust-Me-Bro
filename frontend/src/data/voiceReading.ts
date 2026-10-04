/**
 * What the voice analysis means, all worked out on the device (nothing here calls Gemini): where
 * each of the three measures falls, the readiness score, the plain-words summary and the
 * ScreeningResults the dashboard shows. The numbers themselves come from POST /api/voice/analyze
 * (lib/voice/, types/voice.ts).
 *
 * Kept gentle: the overview shows readiness plus a short, non-diagnostic Parkinson’s indication.
 * The numeric ranges appear when someone opens a vital to see the details.
 * Mirrored in ios/VoiceReadiness/Models/VoiceReading.swift.
 */

import { readinessLabel, statusColorForScore } from "@/data/mockResults";
import type { MeasureKey, Metric, ResultDetail, ScreeningResults, TrendPoint, Zone } from "@/types/screening";
import type { VoiceAnalysis } from "@/types/voice";

export type Measure = {
  key: MeasureKey;
  label: string;
  /** In plain words, for the vitals list. */
  description: string;
  /** The status chip for each zone, in plain words. */
  statuses: Record<Zone, string>;
  decimals: number;
  unit: string;
  /** What the bar runs from (left) and to (right). HNR runs the other way: lower is worse. */
  scaleFrom: number;
  scaleTo: number;
  /** Past this the reading is no longer healthy, and past `elevatedAt` it is in the Parkinson's range. */
  borderlineAt: number;
  elevatedAt: number;
  /** Middle of the healthy range, to say how far from it a reading is. */
  healthyMid: number;
  healthyRange: string;
  parkinsonRange: string;
  /** For the details: what it is, and which way is better. */
  explanation: string;
};

export const MEASURES: Record<MeasureKey, Measure> = {
  jitter: {
    key: "jitter",
    label: "Jitter",
    description: "How much the pitch wobbles",
    statuses: { healthy: "Steady", borderline: "A bit higher", elevated: "Higher than usual" },
    decimals: 2,
    unit: "%",
    scaleFrom: 0.2,
    scaleTo: 2.5,
    borderlineAt: 0.62,
    elevatedAt: 1.12,
    healthyMid: 0.55,
    healthyRange: "0.4–0.7%",
    parkinsonRange: "0.8–1.5%+",
    explanation: "Pitch wobble from one vocal-fold cycle to the next. Higher is less steady.",
  },
  shimmer: {
    key: "shimmer",
    label: "Shimmer",
    description: "How much the volume shakes",
    statuses: { healthy: "Steady", borderline: "A bit uneven", elevated: "More uneven" },
    decimals: 2,
    unit: "%",
    scaleFrom: 2,
    scaleTo: 15,
    borderlineAt: 6.7,
    elevatedAt: 8.5,
    healthyMid: 6,
    healthyRange: "5–7%",
    parkinsonRange: "8–12%+",
    explanation: "Loudness wobble from one vocal-fold cycle to the next. Higher is less even.",
  },
  hnr: {
    key: "hnr",
    label: "HNR",
    description: "How clear vs. breathy the voice is",
    statuses: { healthy: "Clear", borderline: "Slightly lower", elevated: "Breathier" },
    decimals: 1,
    unit: " dB",
    scaleFrom: 30,
    scaleTo: 5,
    borderlineAt: 14.9,
    elevatedAt: 12.8,
    healthyMid: 18,
    healthyRange: "15–21 dB",
    parkinsonRange: "11–14 dB",
    explanation: "Clear tone versus breathy noise. Lower means more noise.",
  },
};

export const MEASURE_ORDER: MeasureKey[] = ["jitter", "shimmer", "hnr"];

/** The zone's name in the details. */
export const ZONE_LABELS: Record<Zone, string> = {
  healthy: "Healthy",
  borderline: "Borderline",
  elevated: "Parkinson’s range",
};

export function zoneOf(measure: Measure, value: number): Zone {
  // HNR is the other way round: a lower number is the worse one
  const worse = measure.scaleTo < measure.scaleFrom ? (limit: number) => value <= limit : (limit: number) => value >= limit;
  return worse(measure.elevatedAt) ? "elevated" : worse(measure.borderlineAt) ? "borderline" : "healthy";
}

/** Where a value sits along the bar, 0 (left end) ... 1 (right end). */
export function positionOf(measure: Measure, value: number): number {
  const fraction = (value - measure.scaleFrom) / (measure.scaleTo - measure.scaleFrom);
  return Math.min(1, Math.max(0, fraction));
}

/** "0.51%", "14.1 dB" */
export function formatValue(measure: Measure, value: number): string {
  return `${value.toFixed(measure.decimals)}${measure.unit}`;
}

/** The two ends of the bar: "0.20%" and "2.50%+" (the plus where the scale runs on past the end, which is where higher is worse). */
export function scaleLabels(measure: Measure): { from: string; to: string } {
  const runsOn = measure.scaleTo > measure.scaleFrom;
  return { from: formatValue(measure, measure.scaleFrom), to: `${formatValue(measure, measure.scaleTo)}${runsOn ? "+" : ""}` };
}

// ---------- the score --------------------------------------------------------

/**
 * Readiness, 0...100, from the classifier's number. It is anchored on the decision threshold, so
 * "flagged" always lands in Rest Recommended: a number half-way to the threshold is the edge of
 * Ready (80), the threshold itself is the edge of Pay Attention (60), and 1.0 is 20.
 */
export function readinessFrom(probability: number, threshold: number): number {
  const p = Math.min(1, Math.max(0, probability));
  const half = threshold / 2;
  const score =
    p <= half
      ? 100 - (20 * p) / half
      : p <= threshold
        ? 80 - (20 * (p - half)) / (threshold - half)
        : 60 - (40 * (p - threshold)) / (1 - threshold);
  return Math.round(score);
}

// ---------- words ------------------------------------------------------------

const TROUBLES: Record<MeasureKey, string> = {
  jitter: "your pitch wobbled a little more than usual",
  shimmer: "your volume was a little uneven",
  hnr: "your voice sounded a bit breathier",
};

function joined(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The plain-words summary. Never diagnostic: how the voice sounded, and a gentle suggestion. */
export function summaryFor(score: number, metrics: Record<MeasureKey, Metric>): string {
  const off = MEASURE_ORDER.filter((key) => metrics[key].isWarning);
  const trouble = joined(off.map((key) => TROUBLES[key]));
  const lead = trouble ? `Today ${trouble}.` : "";

  if (score >= 80) {
    return trouble
      ? `Your voice sounded mostly clear and steady today. ${lead} Nothing to worry about.`
      : "Your voice sounded clear and steady today. Nothing stood out, so enjoy your day.";
  }
  if (score >= 60) {
    return `${trouble ? `${lead} ` : "Your voice sounded a little different from usual today. "}Rest, a warm drink and a glass of water may help.`;
  }
  return `${trouble ? `${lead} ` : ""}Your voice sounded quite different from usual today. A quiet morning is a good idea, and if it keeps up, mention it to someone you trust or your doctor.`;
}

/**
 * Short Parkinson’s line for the overview, next to the score. Never a diagnosis — just how today’s
 * voice patterns compare. Mirrored in VoiceReading.parkinsonsIndication(score:).
 */
export function parkinsonsIndication(score: number): string {
  if (score >= 80) {
    return "You most likely don’t have Parkinson’s — today’s voice patterns look typical.";
  }
  if (score >= 60) {
    return "Parkinson’s is still unlikely from this check-in, though a few patterns were a little off.";
  }
  return "Today’s patterns looked closer to the Parkinson’s group. This isn’t a diagnosis — mention it to someone you trust or your doctor if it keeps up.";
}

/** "Borderline", and why, for the top of the details. */
export function verdictOf(metrics: Record<MeasureKey, Metric>): { zone: Zone; line: string } | null {
  const readings = MEASURE_ORDER.map((key) => metrics[key].reading).filter((reading) => reading !== undefined);
  if (!readings.length) return null;

  const count = (zone: Zone) => readings.filter((reading) => reading.zone === zone).length;
  const total = readings.length;
  if (count("elevated")) {
    return { zone: "elevated", line: `${count("elevated")} of ${total} measures sit in the Parkinson’s range.` };
  }
  if (count("borderline")) {
    return { zone: "borderline", line: `${count("borderline")} of ${total} measures sit between the healthy and Parkinson’s ranges.` };
  }
  return { zone: "healthy", line: `All ${total} measures are in the healthy range.` };
}

// ---------- the dashboard ----------------------------------------------------

const TASK_LABELS = { vowel: "Sustained vowel", speech: "Conversation" } as const;

function metricFor(measure: Measure, value: number | undefined): Metric {
  if (value === undefined) {
    return { status: "Couldn’t measure", description: measure.description, deviation: 0, isWarning: false };
  }
  const zone = zoneOf(measure, value);
  return {
    status: measure.statuses[zone],
    description: measure.description,
    deviation: Math.round(((value - measure.healthyMid) / measure.healthyMid) * 100),
    isWarning: zone !== "healthy",
    reading: { value, zone },
  };
}

/**
 * The dashboard for one measured check-in. `earlier` are the days before today that were measured
 * (oldest first); `yesterday` is yesterday's score, when there is one.
 */
export function resultsFrom(
  user: string,
  analysis: VoiceAnalysis,
  earlier: TrendPoint[],
  yesterday?: number,
): ScreeningResults {
  const score = readinessFrom(analysis.probability, analysis.threshold);
  const metrics = {
    jitter: metricFor(MEASURES.jitter, analysis.measures?.jitter),
    shimmer: metricFor(MEASURES.shimmer, analysis.measures?.shimmer),
    hnr: metricFor(MEASURES.hnr, analysis.measures?.hnr),
  };
  const detail: ResultDetail = {
    probability: analysis.probability,
    threshold: analysis.threshold,
    flagged: analysis.probability >= analysis.threshold,
    tasks: analysis.tasks.map((task) => ({
      label: TASK_LABELS[task.id],
      probability: task.probability,
      weight: task.weight,
    })),
  };

  return {
    source: "measured",
    user,
    readinessScore: score,
    statusColor: statusColorForScore(score),
    aiSummary: summaryFor(score, metrics),
    metrics,
    detail,
    trendData: [...earlier, { day: "Today", score }],
    yesterdayScore: yesterday ?? score,
    yesterdayLabel: readinessLabel(yesterday ?? score),
  };
}
