/**
 * Who is listening: the name, place and interests that shape the morning show, plus the text
 * size. Set up once in the sign-up flow and editable any time from Settings.
 * Mirrored in ios/VoiceReadiness/Models/Profile.swift.
 */

export type InterestId =
  | "sports"
  | "local"
  | "garden"
  | "music"
  | "food"
  | "nature"
  | "history"
  | "arts";

export type Interest = {
  id: InterestId;
  /** What the choice says on the sign-up and settings screens. */
  label: string;
};

/** In the order they are offered. Each one is also a briefing segment kind. */
export const INTERESTS: Interest[] = [
  { id: "sports", label: "Sports" },
  { id: "local", label: "Local news" },
  { id: "garden", label: "Gardening" },
  { id: "music", label: "Music" },
  { id: "food", label: "Cooking" },
  { id: "nature", label: "Nature" },
  { id: "history", label: "History" },
  { id: "arts", label: "Books & films" },
];

export function isInterestId(value: unknown): value is InterestId {
  return INTERESTS.some((interest) => interest.id === value);
}

export type Profile = {
  name: string;
  /** Where the weather and local news come from, e.g. "Coquitlam, BC". May be empty. */
  city: string;
  interests: InterestId[];
  /** Anything else they would like to hear about, in their own words (a team, a hobby). */
  extras: string;
};

export const emptyProfile: Profile = { name: "", city: "", interests: [], extras: "" };

/** Stands in for a real profile when a demo link jumps straight to a later screen. */
export const demoProfile: Profile = {
  name: "David",
  city: "Coquitlam",
  interests: ["sports", "local", "garden"],
  extras: "",
};

export type TextSize = "big" | "bigger" | "biggest";

export const DEFAULT_TEXT_SIZE: TextSize = "bigger";

export const TEXT_SIZES: { id: TextSize; label: string; samplePx: number }[] = [
  { id: "big", label: "Big", samplePx: 22 },
  { id: "bigger", label: "Bigger", samplePx: 28 },
  { id: "biggest", label: "Biggest", samplePx: 34 },
];

export function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.some((size) => size.id === value);
}

/** The listener's details with stray whitespace removed. */
export function tidyProfile(profile: Profile): Profile {
  return {
    name: profile.name.trim(),
    city: profile.city.trim(),
    interests: profile.interests,
    extras: profile.extras.trim(),
  };
}

/** Changes whenever the show would change; used to know when to ask for a fresh one. */
export function profileKey(profile: Profile): string {
  return JSON.stringify([profile.name, profile.city, profile.interests, profile.extras]);
}
