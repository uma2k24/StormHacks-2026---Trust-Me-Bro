import { CircleCheck, Moon, TriangleAlert } from "lucide-react";
import type { StatusColor } from "@/types/screening";

const TONE: Record<StatusColor, { className: string; Icon: typeof Moon }> = {
  green: { className: "chip-ok", Icon: CircleCheck },
  yellow: { className: "chip-warn", Icon: TriangleAlert },
  red: { className: "chip-rest", Icon: Moon },
};

type StatusChipProps = {
  status: StatusColor;
  label: string;
  className?: string;
};

/** Status is never colour alone: every chip pairs a fill with an icon and words. */
export function StatusChip({ status, label, className = "" }: StatusChipProps) {
  const { className: tone, Icon } = TONE[status];

  return (
    <span className={`chip ${tone} ${className}`}>
      <Icon className="h-[1.3em] w-[1.3em]" strokeWidth={2.5} aria-hidden="true" />
      {label}
    </span>
  );
}
