"use client";

import { Check } from "lucide-react";
import { INTERESTS, type InterestId } from "@/data/profile";

type InterestPickerProps = {
  selected: InterestId[];
  onChange: (next: InterestId[]) => void;
  labelledBy: string;
};

/** Tick-boxes for what the show should cover. Selected = a tick plus a teal fill, never colour alone. */
export function InterestPicker({ selected, onChange, labelledBy }: InterestPickerProps) {
  const toggle = (id: InterestId) =>
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  return (
    <div className="choices" role="group" aria-labelledby={labelledBy}>
      {INTERESTS.map(({ id, label }) => {
        const on = selected.includes(id);
        return (
          <button
            key={id}
            type="button"
            className="choice"
            aria-pressed={on}
            onClick={() => toggle(id)}
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
