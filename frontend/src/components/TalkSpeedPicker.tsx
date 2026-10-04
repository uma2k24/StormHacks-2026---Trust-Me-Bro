"use client";

import { Check } from "lucide-react";
import { TALK_SPEEDS, type TalkSpeed } from "@/data/profile";

type TalkSpeedPickerProps = {
  value: TalkSpeed;
  onChange: (next: TalkSpeed) => void;
  labelledBy: string;
};

/** Slow, Steady or Fast — same tick-box pattern as text size. */
export function TalkSpeedPicker({ value, onChange, labelledBy }: TalkSpeedPickerProps) {
  return (
    <div className="sizes" role="group" aria-labelledby={labelledBy}>
      {TALK_SPEEDS.map(({ id, label }) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            className="size-choice"
            aria-pressed={on}
            onClick={() => onChange(id)}
          >
            <span className="choice-box" aria-hidden="true">
              {on ? <Check className="h-5 w-5" strokeWidth={4} /> : null}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
