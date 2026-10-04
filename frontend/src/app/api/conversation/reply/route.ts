import { INTERESTS, isInterestId, type ShowProfile } from "@/data/profile";
import type { SegmentKind } from "@/data/checkInScript";
import { type FollowUpRequest, replyTo } from "@/lib/conversation";
import { clean, cleanName, cleanSpeech, interestList } from "@/lib/sanitize";

/**
 * POST /api/conversation/reply
 *   {
 *     "name": "David", "city": "Coquitlam, BC", "interests": ["sports"], "extras": "",
 *     "segment": { "kind": "sports", "topic": "Sports", "brief": "...", "question": "..." },
 *     "transcript": "what they said",
 *     "earlier": [{ "topic": "Weather", "said": "..." }],
 *     "index": 1, "last": false,
 *     "followUp": { "focus": "music", "avoid": ["Hockey"], "asked": 0 }   (only when more talking is needed)
 *   }
 *   ->  { "text": "the host's reply", "source": "live" | "fallback",
 *         "next": { "topic": "...", "brief": "...", "question": "..." } }   (next: only with followUp, and only if written)
 * Gemini writes the host's reply to what the listener said (see lib/conversation.ts). It always
 * answers: when Gemini isn't available the reply is a fixed warm line and `source` says so.
 * With `followUp` the same request also writes the next question, about the `focus` interest.
 */

const SEGMENT_KINDS = new Set<string>(["weather", "news", ...INTERESTS.map(({ id }) => id)]);

type Body = Record<string, unknown>;
const isObject = (value: unknown): value is Body => typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isObject(body) || !isObject(body.segment)) {
    return Response.json({ error: "expected a JSON object with a segment" }, { status: 400 });
  }

  const transcript = cleanSpeech(body.transcript, 600);
  const kind = String(body.segment.kind);
  if (!transcript || !SEGMENT_KINDS.has(kind)) {
    return Response.json({ error: "a transcript and a known segment kind are required" }, { status: 400 });
  }

  const profile: ShowProfile = {
    name: cleanName(typeof body.name === "string" ? body.name : null),
    city: clean(typeof body.city === "string" ? body.city : null, 60),
    interests: interestList(Array.isArray(body.interests) ? (body.interests as string[]) : null, INTERESTS.length),
    extras: clean(typeof body.extras === "string" ? body.extras : null, 120),
  };

  const earlier = (Array.isArray(body.earlier) ? body.earlier : [])
    .filter(isObject)
    .slice(-3)
    .map((turn) => ({ topic: cleanSpeech(turn.topic, 24), said: cleanSpeech(turn.said, 200) }))
    .filter((turn) => turn.said);

  // asking for the next question needs a known interest to ask about; anything else is just a reply
  const followUp: FollowUpRequest | undefined =
    isObject(body.followUp) && isInterestId(body.followUp.focus)
      ? {
          focus: body.followUp.focus,
          avoid: (Array.isArray(body.followUp.avoid) ? body.followUp.avoid : [])
            .slice(-8)
            .map((topic) => cleanSpeech(topic, 24))
            .filter(Boolean),
          asked: Math.max(0, Math.min(10, Number(body.followUp.asked) || 0)),
        }
      : undefined;

  const reply = await replyTo({
    profile,
    segment: {
      kind: kind as SegmentKind,
      topic: cleanSpeech(body.segment.topic, 24),
      brief: cleanSpeech(body.segment.brief, 400),
      question: cleanSpeech(body.segment.question, 220),
    },
    transcript,
    earlier,
    index: Math.max(0, Math.min(10, Number(body.index) || 0)),
    last: body.last === true,
    followUp,
  });

  return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
}
