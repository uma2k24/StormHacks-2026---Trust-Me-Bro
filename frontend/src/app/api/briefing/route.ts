import { getBriefing } from "@/lib/briefing";
import { INTERESTS, type InterestId, isInterestId } from "@/data/profile";

/** Letters, numbers and the punctuation in names and places; everything else is dropped. */
function clean(value: string | null, max: number): string {
  return (value ?? "").replace(/[^\p{L}\p{M}\p{N}' ,.&-]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** "sports,garden,sports" -> ["sports", "garden"]: known interests only, no repeats. */
function interestList(value: string | null, max: number): InterestId[] {
  return (value ?? "")
    .split(",")
    .filter((id, index, all): id is InterestId => isInterestId(id) && all.indexOf(id) === index)
    .slice(0, max);
}

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
      name: clean(params.get("name"), 40).replace(/[^\p{L}\p{M}' -]/gu, "") || "friend",
      city: clean(params.get("city"), 60),
      interests: interestList(params.get("interests"), INTERESTS.length),
      extras: clean(params.get("extras"), 120),
    },
    interestList(params.get("picks"), 2),
  );
  return Response.json(briefing, { headers: { "Cache-Control": "no-store" } });
}
