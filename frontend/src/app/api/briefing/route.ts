import { getBriefing } from "@/lib/briefing";
import { clean, cleanName, interestList } from "@/lib/sanitize";
import { INTERESTS } from "@/data/profile";

/**
 * GET /api/briefing?name=David&city=Coquitlam,%20BC&interests=sports,garden&extras=tulips&picks=garden,music
 * Today's morning show for that listener as JSON (see Briefing in data/checkInScript).
 * `picks` are the two interests the show should cover, chosen by the app from what the listener
 * has responded to; without them the listener's first two interests are used.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const briefing = await getBriefing(
    {
      name: cleanName(params.get("name")),
      city: clean(params.get("city"), 60),
      interests: interestList(params.get("interests"), INTERESTS.length),
      extras: clean(params.get("extras"), 120),
    },
    interestList(params.get("picks"), 2),
  );
  return Response.json(briefing, { headers: { "Cache-Control": "no-store" } });
}
