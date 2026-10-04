import { transcribe } from "@/lib/conversation";

/**
 * POST /api/conversation/transcribe   (body: the recorded audio, Content-Type: audio/webm | audio/mp4 | ...)
 *   ->  { "text": "..." }   ("" when there was nothing to hear)
 * Turns the listener's answer into words with ElevenLabs Scribe. Answers 503 when no key is
 * configured and 502 when ElevenLabs fails; the clients then play the sample answer instead.
 */

const MAX_BYTES = 8 * 1024 * 1024; // 45 seconds of speech is well under 1 MB
const MIN_BYTES = 1000; // anything smaller is a tap, not an answer: don't spend a request on it

export async function POST(request: Request) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return Response.json({ error: "transcription-unavailable" }, { status: 503 });
  }

  const mimeType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("audio/")) {
    return Response.json({ error: "send the recording as audio/*" }, { status: 415 });
  }

  const audio = await request.arrayBuffer().catch(() => null);
  if (!audio) return Response.json({ error: "unreadable body" }, { status: 400 });
  if (audio.byteLength > MAX_BYTES) return Response.json({ error: "recording too long" }, { status: 413 });
  if (audio.byteLength < MIN_BYTES) return Response.json({ text: "" }, { headers: { "Cache-Control": "no-store" } });

  try {
    const text = await transcribe(audio, mimeType);
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[transcribe] failed:", error);
    return Response.json({ error: "transcription-failed" }, { status: 502 });
  }
}
