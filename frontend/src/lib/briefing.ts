import {
  mockBriefing,
  type Briefing,
  type BriefingSegment,
  type SegmentKind,
} from "@/data/checkInScript";

/**
 * Server-only: builds today's morning briefing.
 * Weather facts come from Open-Meteo (no key needed); Gemini writes the show, using Google Search
 * grounding for the sports and news segments. Any failure falls back to the mock show.
 */

const config = {
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
  city: process.env.BRIEFING_CITY ?? "Coquitlam",
  latitude: Number(process.env.BRIEFING_LAT ?? 49.2838),
  longitude: Number(process.env.BRIEFING_LON ?? -122.7932),
  timeZone: process.env.BRIEFING_TIMEZONE ?? "America/Vancouver",
  interests:
    process.env.BRIEFING_INTERESTS ??
    "the Vancouver Canucks, local Coquitlam and Tri-Cities news, gardening",
};

const CACHE_MS = 30 * 60 * 1000;
const KINDS: SegmentKind[] = ["weather", "sports", "news", "local"];

// One show per listener per half hour. Storing the promise also dedupes concurrent requests.
const cache = new Map<string, { at: number; briefing: Promise<Briefing> }>();

export function getBriefing(name: string): Promise<Briefing> {
  if (!config.geminiKey) return Promise.resolve(withName(mockBriefing, name));

  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.briefing;

  const briefing = buildBriefing(name).catch((error) => {
    console.error("[briefing] falling back to the mock show:", error);
    cache.delete(key);
    return withName(mockBriefing, name);
  });
  cache.set(key, { at: Date.now(), briefing });
  return briefing;
}

function withName(briefing: Briefing, name: string): Briefing {
  return {
    ...briefing,
    segments: briefing.segments.map((segment) => ({
      ...segment,
      brief: segment.brief.replace("David", name),
      question: segment.question.replace("David", name),
    })),
  };
}

async function buildBriefing(name: string): Promise<Briefing> {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const weather = await fetchWeather().catch((error) => {
    console.warn("[briefing] weather unavailable:", error);
    return null;
  });

  const prompt = buildPrompt({ name, today, weather });

  let text: string;
  try {
    text = await askGemini(prompt, { search: true });
  } catch (error) {
    // Search grounding can be unavailable on some keys or models: ask again without it.
    console.warn("[briefing] grounded request failed, retrying without search:", error);
    text = await askGemini(
      `${prompt}\n\nYou have no web access right now. Do not invent recent scores or headlines: for the second and third segments use evergreen topics instead (something seasonal, a gentle "on this day" fact, or a local landmark).`,
      { search: false },
    );
  }

  return { source: "live", segments: parseSegments(text) };
}

// ---------- weather ---------------------------------------------------------

type HourlyWeather = {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
  weather_code: number[];
};

async function fetchWeather(): Promise<string> {
  const params = new URLSearchParams({
    latitude: String(config.latitude),
    longitude: String(config.longitude),
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
    timezone: config.timeZone,
    forecast_days: "1",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);

  const data = (await response.json()) as {
    hourly: HourlyWeather;
    daily: {
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
    };
  };

  const { hourly, daily } = data;
  const hours = hourly.time
    .map((time, index) => ({ time, index, hour: Number(time.slice(11, 13)) }))
    .filter(({ hour }) => hour >= 7 && hour <= 21 && hour % 2 === 1)
    .map(
      ({ time, index }) =>
        `${time.slice(11, 16)}: ${Math.round(hourly.temperature_2m[index])}°C, ${describeCode(
          hourly.weather_code[index],
        )}, ${hourly.precipitation_probability[index]}% chance of precipitation`,
    );

  return [
    `High ${Math.round(daily.temperature_2m_max[0])}°C, low ${Math.round(
      daily.temperature_2m_min[0],
    )}°C, ${daily.precipitation_sum[0]} mm of precipitation expected.`,
    ...hours,
  ].join("\n");
}

/** WMO weather interpretation codes, in plain words. */
function describeCode(code: number): string {
  if (code === 0) return "clear";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain showers";
  if (code <= 86) return "snow showers";
  return "thunderstorms";
}

// ---------- Gemini ----------------------------------------------------------

const SYSTEM_PROMPT = `You write a warm, two-minute morning radio show for one listener, often an older adult, read aloud by a voice actor.

Write exactly three segments, in this order:
1. "weather": today's weather for their city, using only the forecast you are given.
2. "sports": one recent result or upcoming game tied to their interests.
3. "news" or "local": one light, positive or useful story, ideally local.

Each segment has:
- "topic": a one- or two-word label for a small screen, e.g. "Weather", "Hockey", "Local".
- "brief": one or two short spoken sentences, at most 35 words. Plain speech: no markdown, links, emoji or abbreviations; say numbers the way a host would ("four to two", "around six").
- "question": one friendly, open question asking for their opinion, plans or a memory, tied to the brief. It must invite at least a few sentences, so never a yes/no question that can be answered in one word. Example: "It's going to rain all afternoon. Do you think you'll still get your walk in, or will you find something cosy to do inside?"
- "sampleReply": a natural one- or two-sentence answer the listener might give (used only for a demo).

The first brief starts with "Good morning, <name>." Keep it light: skip tragedies, crime, politics and anything distressing. Never mention health, voices, recording, screening or check-ins.

Reply with only a JSON object, no code fences:
{"segments":[{"kind":"weather","topic":"...","brief":"...","question":"...","sampleReply":"..."}, ...]}`;

function buildPrompt({
  name,
  today,
  weather,
}: {
  name: string;
  today: string;
  weather: string | null;
}): string {
  return [
    `Listener: ${name}`,
    `City: ${config.city}`,
    `Today: ${today}`,
    `Interests: ${config.interests}`,
    weather
      ? `Today's forecast for ${config.city}:\n${weather}`
      : `The forecast is unavailable: make the weather segment a gentle seasonal note without specific numbers.`,
  ].join("\n");
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

async function askGemini(prompt: string, { search }: { search: boolean }): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiKey ?? "",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        ...(search ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: { temperature: 0.9 },
      }),
      signal: AbortSignal.timeout(25000),
    },
  );
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

function parseSegments(text: string): BriefingSegment[] {
  // Grounded replies can't use JSON mode, so pull the object out of whatever came back.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in Gemini reply");

  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    segments?: Record<string, unknown>[];
  };
  const clean = (value: unknown, max: number) =>
    typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

  const segments = (parsed.segments ?? [])
    .map((raw, index): BriefingSegment => {
      const kind = KINDS.includes(raw.kind as SegmentKind) ? (raw.kind as SegmentKind) : "news";
      return {
        id: `${kind}-${index}`,
        kind,
        topic: clean(raw.topic, 24) || kind[0].toUpperCase() + kind.slice(1),
        brief: clean(raw.brief, 400),
        question: clean(raw.question, 220),
        mockReply: clean(raw.sampleReply, 220) || "I'd have to think about that one.",
      };
    })
    .filter((segment) => segment.brief && segment.question)
    .slice(0, 4);

  if (segments.length < 2) throw new Error("Gemini reply had too few usable segments");
  return segments;
}
