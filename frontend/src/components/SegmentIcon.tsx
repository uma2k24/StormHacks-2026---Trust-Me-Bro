import {
  BookOpen,
  ChefHat,
  CloudSun,
  Landmark,
  MapPin,
  Music,
  Newspaper,
  PawPrint,
  Sprout,
  Trophy,
  type LucideProps,
} from "lucide-react";
import type { SegmentKind } from "@/data/checkInScript";

const ICONS = {
  weather: CloudSun,
  sports: Trophy,
  news: Newspaper,
  local: MapPin,
  garden: Sprout,
  music: Music,
  food: ChefHat,
  nature: PawPrint,
  history: Landmark,
  arts: BookOpen,
} satisfies Record<SegmentKind, unknown>;

/** The little picture for a briefing segment. Mirrors SegmentKind.systemImage on iOS. */
export function SegmentIcon({ kind, ...props }: { kind: SegmentKind } & LucideProps) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden="true" {...props} />;
}
