/**
 * POST /api/briefing/speech  { "text": "..." }  ->  audio/mpeg
 * Reads one line of the briefing aloud with ElevenLabs. Answers 503 when no key is configured,
 * and the clients fall back to showing the text for its reading time.
 */

const MAX_CHARS = 600;

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "voice-unavailable" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_CHARS) {
    return Response.json({ error: "text must be 1-600 characters" }, { status: 400 });
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
        // a calm, even morning-radio read
        voice_settings: { stability: 0.6, similarity_boost: 0.75, speed: 0.95 },
      }),
      signal: AbortSignal.timeout(20000),
    },
  ).catch((error: unknown) => {
    console.error("[speech] ElevenLabs request failed:", error);
    return null;
  });

  if (!upstream?.ok || !upstream.body) {
    const detail = upstream ? (await upstream.text()).slice(0, 300) : "network-error";
    console.error(
      upstream
        ? `[speech] ElevenLabs ${upstream.status}: ${detail}`
        : "[speech] ElevenLabs request failed: network-error",
    );
    // Include a short upstream hint so a bad key/quota shows up in the browser network tab.
    return Response.json(
      { error: "voice-failed", upstreamStatus: upstream?.status ?? 0, detail },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
  });
}
