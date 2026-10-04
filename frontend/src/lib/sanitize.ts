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

/**
 * The show never writes dashes in what it says: Gemini likes an em dash, so one (or an en dash, a double
 * hyphen, or a hyphen with spaces round it) becomes a comma, and a range of numbers reads "to".
 */
export function noDashes(text: string): string {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1 to $2")
    .replace(/\s*(?:[\u2013\u2014]|--)\s*|\s+-\s+/g, ", ")
    .replace(/,\s*([,.!?])/g, "$1")
    .replace(/^\s*,\s*|\s*,\s*$/g, "");
}

/** "sports,garden,sports" -> ["sports", "garden"]: known interests only, no repeats. */
export function interestList(value: string | string[] | null | undefined, max: number): InterestId[] {
  const ids = Array.isArray(value) ? value : (value ?? "").split(",");
  return ids
    .filter((id, index, all): id is InterestId => isInterestId(id) && all.indexOf(id) === index)
    .slice(0, max);
}
