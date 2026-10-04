/**
 * Server-only: the three "voice quality" numbers measured on a sustained vowel ("ahhh"), the way
 * Praat reports them:
 *
 *   jitter  - how much the length of one vocal-fold cycle differs from the next (local jitter, %)
 *   shimmer - how much the loudness of one cycle differs from the next (local shimmer, %)
 *   hnr     - harmonics-to-noise ratio: clear tone against breathy noise (dB)
 *
 * The recording is 16 kHz mono. The steadiest stretch of voiced sound is found, its first and last
 * moments (where a voice starts and fades) are dropped, and each cycle of the voice is followed by
 * matching the waveform with the one after it. Cycle lengths and heights come from that.
 * Validated against Praat (parselmouth) on synthetic vowels; see frontend/README.md, "Voice analysis".
 */

export const SAMPLE_RATE = 16000;

const MIN_F0 = 75; // Hz: the lowest voice we look for
const MAX_F0 = 500; // Hz: the highest
const FRAME_HOP = Math.round(0.01 * SAMPLE_RATE); // 10 ms between looks at the voice
const PITCH_FRAME = Math.round(0.04 * SAMPLE_RATE); // 40 ms to find the pitch in
const MIN_LAG = Math.floor(SAMPLE_RATE / MAX_F0);
const MAX_LAG = Math.ceil(SAMPLE_RATE / MIN_F0);

/** A voice has to be this periodic (0...1) to count as voiced. */
const VOICED_R = 0.6;
/** For the HNR, frames below this correlation between neighbouring cycles are left out. */
const HNR_VOICED_R = 0.45;
/** Each HNR look compares two stretches this many periods of the lowest voice long (a Hann-shaped window). */
const HNR_PERIODS = 1.5;
/** Quieter than this fraction of the loud parts is silence, not voice. */
const SILENCE_FRACTION = 0.15;
/** Onset and fade of the voice are left out: they are never steady. */
const TRIM_SECONDS = 0.25;
/** Less steady voice than this and the numbers would mean little. */
export const MIN_VOWEL_SECONDS = 1.5;

// Praat's own limits for what counts as a neighbouring cycle (Get jitter / shimmer defaults).
const PERIOD_FLOOR = 0.0001 * SAMPLE_RATE;
const PERIOD_CEILING = 0.02 * SAMPLE_RATE;
const MAX_PERIOD_FACTOR = 1.3;
const MAX_AMPLITUDE_FACTOR = 1.6;

export type VowelMeasures = {
  /** Local jitter, percent. */
  jitter: number;
  /** Local shimmer, percent. */
  shimmer: number;
  /** Harmonics-to-noise ratio, dB. */
  hnr: number;
  /** Average pitch, Hz. */
  f0: number;
  /** How many seconds of steady voice these were measured on. */
  seconds: number;
};

// ---------- small helpers ---------------------------------------------------

function hann(length: number): Float32Array {
  const window = new Float32Array(length);
  for (let i = 0; i < length; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / length);
  return window;
}

/** Where the parabola through three neighbouring points peaks, as an offset from the middle one (-0.5...0.5). */
function parabolicOffset(before: number, middle: number, after: number): number {
  const denominator = before - 2 * middle + after;
  if (denominator >= 0 || !Number.isFinite(denominator)) return 0;
  return Math.max(-0.5, Math.min(0.5, (0.5 * (before - after)) / denominator));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

// ---------- finding the voice -----------------------------------------------

type Frame = { rms: number; strength: number; lag: number };

/** Looks at the recording every 10 ms: how loud, and how periodic (the best autocorrelation) with what lag. */
function lookAtFrames(x: Float32Array): Frame[] {
  const window = hann(PITCH_FRAME);
  // the window's own autocorrelation, so a window doesn't make everything look less periodic
  const windowCorrelation = new Float64Array(MAX_LAG + 2);
  for (let lag = 0; lag <= MAX_LAG + 1; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < PITCH_FRAME; i++) sum += window[i] * window[i + lag];
    windowCorrelation[lag] = sum;
  }

  const frames: Frame[] = [];
  const windowed = new Float32Array(PITCH_FRAME);
  const correlation = new Float64Array(MAX_LAG + 2);
  for (let start = 0; start + PITCH_FRAME <= x.length; start += FRAME_HOP) {
    let energy = 0;
    for (let i = 0; i < PITCH_FRAME; i++) {
      windowed[i] = x[start + i] * window[i];
      energy += x[start + i] * x[start + i];
    }
    const rms = Math.sqrt(energy / PITCH_FRAME);

    let zero = 0;
    for (let i = 0; i < PITCH_FRAME; i++) zero += windowed[i] * windowed[i];
    let bestLag = 0;
    let best = 0;
    if (zero > 1e-12) {
      for (let lag = MIN_LAG - 1; lag <= MAX_LAG + 1; lag++) {
        let sum = 0;
        for (let i = 0; i + lag < PITCH_FRAME; i++) sum += windowed[i] * windowed[i + lag];
        correlation[lag] = sum / zero / (windowCorrelation[lag] / windowCorrelation[0]);
      }
      for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
        const here = correlation[lag];
        // a local peak, and not much of an octave-down bias: a longer lag has to be clearly better
        if (here > correlation[lag - 1] && here >= correlation[lag + 1] && here > best * 1.05) {
          best = here;
          bestLag = lag;
        }
      }
      if (bestLag) bestLag += parabolicOffset(correlation[bestLag - 1], correlation[bestLag], correlation[bestLag + 1]);
    }
    frames.push({ rms, strength: best, lag: bestLag });
  }
  return frames;
}

/** The longest steady voiced stretch, as sample positions [from, to), with the onset and fade left out. */
function steadiestVoice(x: Float32Array, frames: Frame[]): { from: number; to: number; period: number } | null {
  const loud = percentile(frames.map((frame) => frame.rms), 0.9);
  const voiced = frames.map(
    (frame) => frame.lag > 0 && frame.strength >= VOICED_R && frame.rms >= SILENCE_FRACTION * loud,
  );

  // runs of voiced frames; a gap of up to three frames (30 ms) does not break one
  let best: { start: number; end: number } | null = null;
  let start = -1;
  let gap = 0;
  for (let i = 0; i <= voiced.length; i++) {
    if (i < voiced.length && voiced[i]) {
      if (start < 0) start = i;
      gap = 0;
      continue;
    }
    if (start < 0) continue;
    gap += 1;
    if (i === voiced.length || gap > 3) {
      const end = i - gap + 1;
      if (!best || end - start > best.end - best.start) best = { start, end };
      start = -1;
      gap = 0;
    }
  }
  if (!best) return null;

  // frame k looks at x[k * hop ... k * hop + frame): its middle is the moment it describes
  const centre = (frame: number) => frame * FRAME_HOP + PITCH_FRAME / 2;
  const trim = Math.round(TRIM_SECONDS * SAMPLE_RATE);
  const from = Math.round(centre(best.start)) + trim;
  const to = Math.min(x.length, Math.round(centre(best.end - 1))) - trim;
  if ((to - from) / SAMPLE_RATE < MIN_VOWEL_SECONDS) return null;

  const lags: number[] = [];
  for (let i = best.start; i < best.end; i++) if (voiced[i] && centre(i) >= from && centre(i) <= to) lags.push(frames[i].lag);
  const period = median(lags);
  return period > 0 ? { from, to, period } : null;
}

// ---------- jitter and shimmer ----------------------------------------------

/**
 * Follows the voice cycle by cycle. From the loudest point, each next cycle starts one period later,
 * where the waveform around it best matches the waveform around the last one (found to a fraction of
 * a sample). Returns where the cycles start, in (fractional) samples.
 */
function followCycles(x: Float32Array, from: number, to: number, period: number): number[] {
  // start at the biggest peak in the middle of the stretch
  let start = from;
  let peak = -Infinity;
  const middleFrom = from + Math.floor((to - from) / 4);
  const middleTo = to - Math.floor((to - from) / 4);
  for (let i = middleFrom; i < middleTo; i++) {
    if (x[i] > peak) {
      peak = x[i];
      start = i;
    }
  }

  const follow = (direction: 1 | -1): number[] => {
    const marks: number[] = [];
    let position = start;
    let current = period;
    for (;;) {
      const half = Math.round(current / 2);
      const lagFrom = Math.max(Math.round(current * 0.75), 2);
      const lagTo = Math.round(current * 1.25);
      const anchor = Math.round(position);
      // the waveform that is compared lies from anchor - half ... anchor + half and the same shifted by the lag
      const reach = direction === 1 ? anchor + lagTo + half + 1 : anchor - lagTo - half - 1;
      if (reach >= to || reach < from) break;

      let bestLag = lagFrom;
      let best = -Infinity;
      const scores = new Float64Array(lagTo + 2);
      for (let lag = lagFrom - 1; lag <= lagTo + 1; lag++) {
        let cross = 0;
        let a = 0;
        let b = 0;
        for (let i = -half; i <= half; i++) {
          const first = x[anchor + i];
          const second = x[anchor + direction * lag + i];
          cross += first * second;
          a += first * first;
          b += second * second;
        }
        const score = a > 0 && b > 0 ? cross / Math.sqrt(a * b) : 0;
        scores[lag] = score;
        if (lag >= lagFrom && lag <= lagTo && score > best) {
          best = score;
          bestLag = lag;
        }
      }
      const refined = bestLag + parabolicOffset(scores[bestLag - 1], scores[bestLag], scores[bestLag + 1]);
      position += direction * refined;
      current = refined;
      marks.push(position);
    }
    return marks;
  };

  const backwards = follow(-1).reverse();
  const forwards = follow(1);
  return [...backwards, start, ...forwards];
}

/** The tallest swing of the waveform (highest minus lowest) between two points, in samples. */
function peakToPeak(x: Float32Array, from: number, to: number): number {
  let high = -Infinity;
  let low = Infinity;
  for (let i = Math.max(0, Math.ceil(from)); i <= Math.min(x.length - 1, Math.floor(to)); i++) {
    if (x[i] > high) high = x[i];
    if (x[i] < low) low = x[i];
  }
  return high - low;
}

function jitterAndShimmer(x: Float32Array, marks: number[]): { jitter: number; shimmer: number } | null {
  const periods: number[] = [];
  const amplitudes: number[] = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const period = marks[i + 1] - marks[i];
    periods.push(period);
    // how tall the voice is around this cycle: one period's width, centred on where it starts
    amplitudes.push(peakToPeak(x, marks[i] - period / 2, marks[i] + period / 2));
  }

  const inRange = (period: number) => period >= PERIOD_FLOOR && period <= PERIOD_CEILING;

  // local jitter: the average difference between neighbouring cycle lengths, over the average length
  let jitterSum = 0;
  let jitterPairs = 0;
  let periodSum = 0;
  let periodCount = 0;
  for (let i = 0; i < periods.length; i++) {
    if (inRange(periods[i])) {
      periodSum += periods[i];
      periodCount += 1;
    }
    if (i + 1 >= periods.length) continue;
    const [a, b] = [periods[i], periods[i + 1]];
    if (!inRange(a) || !inRange(b) || a / b > MAX_PERIOD_FACTOR || b / a > MAX_PERIOD_FACTOR) continue;
    jitterSum += Math.abs(a - b);
    jitterPairs += 1;
  }

  // local shimmer: the same for the height of each cycle
  let shimmerSum = 0;
  let shimmerPairs = 0;
  let amplitudeSum = 0;
  let amplitudeCount = 0;
  for (let i = 0; i < amplitudes.length; i++) {
    if (inRange(periods[i]) && amplitudes[i] > 0) {
      amplitudeSum += amplitudes[i];
      amplitudeCount += 1;
    }
    if (i + 1 >= amplitudes.length) continue;
    const [a, b] = [amplitudes[i], amplitudes[i + 1]];
    if (!inRange(periods[i]) || !inRange(periods[i + 1]) || a <= 0 || b <= 0) continue;
    if (periods[i] / periods[i + 1] > MAX_PERIOD_FACTOR || periods[i + 1] / periods[i] > MAX_PERIOD_FACTOR) continue;
    if (a / b > MAX_AMPLITUDE_FACTOR || b / a > MAX_AMPLITUDE_FACTOR) continue;
    shimmerSum += Math.abs(a - b);
    shimmerPairs += 1;
  }

  if (jitterPairs < 20 || shimmerPairs < 20 || !periodCount || !amplitudeCount) return null;
  return {
    jitter: (jitterSum / jitterPairs / (periodSum / periodCount)) * 100,
    shimmer: (shimmerSum / shimmerPairs / (amplitudeSum / amplitudeCount)) * 100,
  };
}

// ---------- harmonics-to-noise ratio ----------------------------------------

/**
 * Every 10 ms the voice is compared with itself one cycle later: the closer the two are, the less
 * noise there is. A correlation r between them is a tone-to-noise ratio of r / (1 - r), in dB.
 * The average is taken over the frames that are clearly voiced (as Praat's harmonicity does).
 */
function harmonicsToNoise(x: Float32Array, from: number, to: number): number | null {
  const length = Math.round((HNR_PERIODS * SAMPLE_RATE) / MIN_F0);
  const window = hann(length);
  const first = new Float32Array(length);
  const scores = new Float64Array(MAX_LAG + 2);
  let total = 0;
  let count = 0;

  for (let start = from; start + length + MAX_LAG + 2 <= to; start += FRAME_HOP) {
    let a = 0;
    for (let i = 0; i < length; i++) {
      first[i] = x[start + i] * window[i];
      a += first[i] * first[i];
    }
    if (a <= 0) continue;

    for (let lag = MIN_LAG - 1; lag <= MAX_LAG + 1; lag++) {
      let cross = 0;
      let b = 0;
      for (let i = 0; i < length; i++) {
        const second = x[start + lag + i] * window[i];
        cross += first[i] * second;
        b += second * second;
      }
      scores[lag] = b > 0 ? cross / Math.sqrt(a * b) : 0;
    }

    let best = 0;
    for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
      if (scores[lag] > scores[lag - 1] && scores[lag] >= scores[lag + 1] && scores[lag] > best) best = scores[lag];
    }
    if (best < HNR_VOICED_R) continue; // not clearly voiced
    const r = Math.min(best, 0.999999);
    total += 10 * Math.log10(r / (1 - r));
    count += 1;
  }

  return count >= 20 ? total / count : null;
}

// ---------- all together ----------------------------------------------------

/**
 * Measures a sustained vowel. `samples` are 16 kHz mono, any loudness. Returns null when there is no
 * steady voiced stretch of at least MIN_VOWEL_SECONDS (a whisper, a cough, a very short "ah").
 */
export function measureVowel(samples: Float32Array): VowelMeasures | null {
  if (samples.length < SAMPLE_RATE * (MIN_VOWEL_SECONDS + 2 * TRIM_SECONDS)) return null;

  // no DC offset, so quiet microphones with a bias don't look like a very low voice
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  const x = new Float32Array(samples.length);
  for (let i = 0; i < x.length; i++) x[i] = samples[i] - mean;

  const frames = lookAtFrames(x);
  const voice = steadiestVoice(x, frames);
  if (!voice) return null;

  const marks = followCycles(x, voice.from, voice.to, voice.period);
  const perturbation = jitterAndShimmer(x, marks);
  const hnr = harmonicsToNoise(x, voice.from, voice.to);
  if (!perturbation || hnr === null) return null;

  return {
    jitter: perturbation.jitter,
    shimmer: perturbation.shimmer,
    hnr,
    f0: SAMPLE_RATE / voice.period,
    seconds: (voice.to - voice.from) / SAMPLE_RATE,
  };
}
