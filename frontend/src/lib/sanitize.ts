import { type InterestId, isInterestId } from "@/data/profile";

/**
 * Server-only: cleaning what comes in over the wire before it reaches a prompt.
 */

/** Letters, numbers and the punctuation in names and places; everything else is dropped. */
export function clean(value: string | null | undefined, max: number): string {
  return (value ?? "").replace(/[^\p{L}\p{M}\p{N}' ,.&-]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** A person's name: letters, apostrophes, hyphens and spaces. */
export function cleanName(value: string | null | undefined): string {
  return clean(value, 40).replace(/[^\p{L}\p{M}' -]/gu, "") || "friend";
}

/** Free text (what someone said, a line of the show): any characters, but no control characters or line breaks. */
export function cleanSpeech(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** "sports,garden,sports" -> ["sports", "garden"]: known interests only, no repeats. */
export function interestList(value: string | string[] | null | undefined, max: number): InterestId[] {
  const ids = Array.isArray(value) ? value : (value ?? "").split(",");
  return ids
    .filter((id, index, all): id is InterestId => isInterestId(id) && all.indexOf(id) === index)
    .slice(0, max);
}
