import { getBriefing } from "@/lib/briefing";

/** GET /api/briefing?name=David — today's morning show as JSON (see Briefing in data/checkInScript). */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("name") ?? "";
  const name = raw.replace(/[^\p{L}\p{M}' -]/gu, "").trim().slice(0, 40) || "friend";

  const briefing = await getBriefing(name);
  return Response.json(briefing, { headers: { "Cache-Control": "no-store" } });
}
