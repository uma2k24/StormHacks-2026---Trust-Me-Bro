/**
 * What POST /api/voice/analyze answers. Mirrored in ios/VoiceReadiness/Models/VoiceAnalysis.swift.
 */

export type VoiceTaskId = "vowel" | "speech";

export type VoiceTask = {
  id: VoiceTaskId;
  /** The classifier's number for this part of the check-in, 0...1 (averaged over its four-second windows). */
  probability: number;
  /** How much of the final number this part counts for, 0...1 (the parts that were heard add up to 1). */
  weight: number;
  /** Seconds of voice the classifier listened to (silences left out). */
  seconds: number;
  /** How many four-second windows that was. */
  windows: number;
};

export type VoiceAnalysis = {
  /** The final number, 0...1: the tasks' numbers weighed together. */
  probability: number;
  /** At or above this the voice is "flagged" (resembles the Parkinson's group more than the controls). */
  threshold: number;
  tasks: VoiceTask[];
  /** Measured on the sustained "ahhh"; null when there wasn't a steady stretch of voice to measure. */
  measures: { jitter: number; shimmer: number; hnr: number; f0: number } | null;
};
