import { analyseVoice } from "@/lib/voice/analysis";

/**
 * POST /api/voice/analyze   (multipart form: "speech" and "vowel", each raw 16-bit little-endian
 *                            PCM, 16 kHz, mono, no header)
 *   ->  VoiceAnalysis (see types/voice.ts): the classifier's number, and jitter / shimmer / HNR
 * "speech" is everything the listener said during the show, "vowel" is their sustained "ahhh".
 * The recording is cut into four-second windows for the classifier (lib/voice/analysis.ts).
 * Answers 422 when there was too little voice to listen to (the client then asks for more or shows
 * a sample result), 503 when the model can't be loaded.
 */

const SAMPLE_RATE = 16000;
const MAX_SPEECH_SECONDS = 180;
const MAX_VOWEL_SECONDS = 30;

function toFloat(buffer: ArrayBuffer): Float32Array {
  const pcm = new Int16Array(buffer, 0, Math.floor(buffer.byteLength / 2));
  const samples = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768;
  return samples;
}

async function field(form: FormData, name: string, maxSeconds: number): Promise<Float32Array | "too-long" | null> {
  const value = form.get(name);
  if (value === null) return new Float32Array(0); // an absent part is simply nothing heard
  if (typeof value === "string") return null;
  if (value.size > maxSeconds * SAMPLE_RATE * 2) return "too-long";
  return toFloat(await value.arrayBuffer());
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "expected a multipart form" }, { status: 400 });

  const speech = await field(form, "speech", MAX_SPEECH_SECONDS);
  const vowel = await field(form, "vowel", MAX_VOWEL_SECONDS);
  if (speech === null || vowel === null) return Response.json({ error: "send each part as a file" }, { status: 400 });
  if (speech === "too-long" || vowel === "too-long") return Response.json({ error: "recording too long" }, { status: 413 });

  try {
    const analysis = await analyseVoice({ speech, vowel });
    if (!analysis) return Response.json({ error: "not-enough-voice" }, { status: 422 });
    return Response.json(analysis, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[voice] analysis failed:", error);
    return Response.json({ error: "analysis-unavailable" }, { status: 503 });
  }
}
