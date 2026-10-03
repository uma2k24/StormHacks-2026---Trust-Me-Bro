/**
 * What the radio has learned about one listener, kept on their device. Nothing here calls Gemini:
 * learning is a little arithmetic over how the person answers, and the only thing it changes is
 * which two interests the next show is written about.
 *
 * What someone ticked in Settings stays the foundation. How they actually respond then tilts the
 * odds: an interest they light up about comes up more, one they never respond to comes up less,
 * and one they never ticked but clearly enjoy is added to the regulars.
 * Mirrored in ios/VoiceReadiness/Models/Learning.swift.
 */

import { type Briefing, type BriefingSegment, LISTEN_MS } from "@/data/checkInScript";
import { INTERESTS, type InterestId, isInterestId, type Profile } from "@/data/profile";

/** A running average of how much they responded, with how many answers it is based on. */
export type Taste = {
  /** Answers counted so far; fades with time so old habits are forgotten. */
  n: number;
  /** 0..1, how much they responded compared with how they usually answer (0.5 is their usual). */
  mean: number;
  /** The day (yyyy-mm-dd) of the last answer, for fading. */
  last: string;
};

export type Learned = {
  /** How they answer anything at all: the yardstick each interest is measured against. */
  baseline: Taste;
  interests: Partial<Record<InterestId, Taste>>;
};

export const emptyLearned: Learned = {
  baseline: { n: 0, mean: 0.5, last: "" },
  interests: {},
};

/** What the person did on one segment. The mic is simulated, so this is timing, not words. */
export type AnswerTiming = {
  /** From the question being asked until they pressed Talk. */
  latencyMs: number;
  /** From pressing Talk until they were done. */
  talkedMs: number;
};

// ---- the numbers worth tuning -----------------------------------------------------------------

const QUICK_MS = 1500; // pressing Talk this fast counts as eager
const SLOW_MS = 9000; // and this slow counts as not very interested
const PRIOR_N = 3; // a new interest starts as if it had three "usual" answers
const SHARPNESS = 5; // how strongly evidence tilts the odds of an interest being picked
const MEMORY = 12; // once an interest has this many answers, newer ones count for 1/12
const HALF_LIFE_DAYS = 45; // evidence this old counts half
const EXPLORE = 0.06; // odds of something they never ticked, next to 1 for what they did
const ADOPT_N = 2; // answers needed before an unticked interest can become a regular...
const ADOPT_MEAN = 0.7; // ...and how far above their usual they must have been on average
const MIN_BASELINE = 1; // answers needed before "above their usual" means anything

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// ---- days -------------------------------------------------------------------------------------

/** Today's date on the listener's own clock, e.g. "2026-10-03". */
export function dayKey(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.max(0, (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** A taste with its age taken into account: n shrinks, mean stays. */
function fresh(taste: Taste | undefined, day: string): Taste {
  if (!taste || !taste.last) return { n: 0, mean: 0.5, last: day };
  return { ...taste, n: taste.n * 0.5 ** (daysBetween(taste.last, day) / HALF_LIFE_DAYS) };
}

// ---- learning ---------------------------------------------------------------------------------

/** 0..1: how much of an answer there was. Talking for a while and starting promptly both count. */
export function engagementOf({ latencyMs, talkedMs }: AnswerTiming): number {
  const talked = clamp01(talkedMs / LISTEN_MS);
  const eager = 1 - clamp01((latencyMs - QUICK_MS) / (SLOW_MS - QUICK_MS));
  return 0.6 * talked + 0.4 * eager;
}

function updated(taste: Taste | undefined, value: number, day: string): Taste {
  const current = fresh(taste, day);
  const n = current.n + 1;
  // a plain average while there is little to go on, then a moving one that follows their changes
  return { n, mean: current.mean + (value - current.mean) / Math.min(n, MEMORY), last: day };
}

/**
 * Folds one answered segment into what has been learned. Every answer teaches the yardstick (how
 * they usually answer); one about an interest also teaches how much they like that interest.
 * Weather, and anything else that isn't one of their interests, only teaches the yardstick.
 */
export function learnFrom(
  learned: Learned,
  segment: Pick<BriefingSegment, "kind">,
  engagement: number,
  day: string,
): Learned {
  const usual = fresh(learned.baseline, day);
  const next: Learned = { ...learned, baseline: updated(learned.baseline, engagement, day) };
  if (!isInterestId(segment.kind)) return next;

  // Measured against how they usually answer, so a quiet person isn't taken to dislike everything
  // and a chatty one isn't taken to love it. The very first answer has nothing to be measured against.
  const lift = usual.n < MIN_BASELINE ? 0.5 : clamp01(0.5 + engagement - usual.mean);
  next.interests = { ...learned.interests, [segment.kind]: updated(learned.interests[segment.kind], lift, day) };
  return next;
}

// ---- using what was learned -------------------------------------------------------------------

/** How likely an interest is to be on the show: the odds of their pick, tilted by how they respond. */
function weightOf(id: InterestId, chosen: Set<InterestId>, learned: Learned, day: string): number {
  const { n, mean } = fresh(learned.interests[id], day);
  const regular = chosen.size === 0 || chosen.has(id) || (n >= ADOPT_N && mean >= ADOPT_MEAN);
  const score = (n * mean + PRIOR_N * 0.5) / (n + PRIOR_N); // few answers stay close to "usual"
  return (regular ? 1 : EXPLORE) * Math.exp(SHARPNESS * (score - 0.5));
}

/** A small seeded generator, so the same day gives the same picks. */
function seeded(text: string): () => number {
  let hash = 2166136261; // FNV-1a over the UTF-8 bytes
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 16777619);
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0; // mulberry32
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The two interests for today's show, drawn by weight so favourites come up most days while the
 * odd surprise still gets a turn (that's how a new interest gets noticed). The draw is seeded by
 * the day, so it doesn't change however often the app is opened.
 */
export function chooseInterests(profile: Profile, learned: Learned, day: string): InterestId[] {
  const chosen = new Set(profile.interests);
  const random = seeded(`${day}|${profile.name}`);
  const pool = INTERESTS.map(({ id }) => ({ id, weight: weightOf(id, chosen, learned, day) }));

  const picks: InterestId[] = [];
  while (picks.length < 2 && pool.length > 0) {
    let roll = random() * pool.reduce((sum, item) => sum + item.weight, 0);
    let index = pool.findIndex((item) => (roll -= item.weight) < 0);
    if (index < 0) index = pool.length - 1;
    picks.push(pool.splice(index, 1)[0].id);
  }
  return picks;
}

/** Today's show and the choices behind it, kept so opening the app again doesn't start over. */
export type TodaysShow = {
  day: string;
  /** profileKey() of the profile it was made for. */
  key: string;
  picks: InterestId[];
  /** The live show, once it has arrived. */
  briefing?: Briefing;
};
