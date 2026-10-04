import type { BriefingSegment, FollowUp } from "@/data/checkInScript";
import type { InterestId, Profile } from "@/data/profile";

/**
 * Browser side of talking back: sends a recorded answer to /api/conversation/transcribe and asks
 * /api/conversation/reply for the host's answer to it. The keys stay on the server.
 * Mirrored in ios/VoiceReadiness/Models/ConversationService.swift.
 */

export type Transcription =
  /** `text` is "" when nothing could be heard. */
  | { status: "heard"; text: string }
  /** No key, no backend or Scribe failed: the show carries on with a sample answer. */
  | { status: "unavailable" };

export async function transcribeAnswer(audio: Blob, signal: AbortSignal): Promise<Transcription> {
  try {
    const response = await fetch("/api/conversation/transcribe", {
      method: "POST",
      headers: { "Content-Type": audio.type || "audio/webm" },
      body: audio,
      signal,
    });
    if (!response.ok) return { status: "unavailable" };
    const { text } = (await response.json()) as { text?: unknown };
    return { status: "heard", text: typeof text === "string" ? text.trim() : "" };
  } catch {
    return { status: "unavailable" };
  }
}

export type ReplyContext = {
  profile: Profile;
  segment: Pick<BriefingSegment, "kind" | "topic" | "brief" | "question">;
  transcript: string;
  earlier: { topic: string; said: string }[];
  index: number;
  last: boolean;
  /** Set when the show needs more talking: the same request also writes the next question, about `focus`. */
  followUp?: { focus: InterestId; avoid: string[]; asked: number };
};

export type HostReply = {
  text: string;
  /** "fallback" is the server's fixed line, used when Gemini wasn't available: the caller picks its own, so they take turns. */
  source: "live" | "fallback";
  /** The next question, when one was asked for and written; otherwise the caller asks a fixed one. */
  next: FollowUp | null;
};

/** The host's reply, or null when the backend can't be reached (the caller has a fixed line for that). */
export async function fetchReply(context: ReplyContext, signal: AbortSignal): Promise<HostReply | null> {
  const { profile, ...rest } = context;
  try {
    const response = await fetch("/api/conversation/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.name,
        city: profile.city,
        interests: profile.interests,
        extras: profile.extras,
        ...rest,
      }),
      signal,
    });
    if (!response.ok) return null;
    const { text, source, next } = (await response.json()) as {
      text?: unknown;
      source?: unknown;
      next?: Partial<FollowUp> | null;
    };
    if (typeof text !== "string" || !text.trim()) return null;

    const asked = context.followUp && typeof next?.question === "string" && next.question.trim();
    return {
      text: text.trim(),
      source: source === "live" ? "live" : "fallback",
      next: asked
        ? {
            topic: typeof next?.topic === "string" ? next.topic.trim() : "",
            brief: typeof next?.brief === "string" ? next.brief.trim() : "",
            question: asked,
          }
        : null,
    };
  } catch {
    return null;
  }
}
