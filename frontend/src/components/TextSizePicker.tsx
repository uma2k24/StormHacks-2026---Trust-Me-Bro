"use client";

import { Check } from "lucide-react";
import { TEXT_SIZES, type TextSize } from "@/data/profile";

type TextSizePickerProps = {
  value: TextSize;
  onChange: (next: TextSize) => void;
  labelledBy: string;
};

/** Each choice is written at its own size, so you can see what you are picking. */
export function TextSizePicker({ value, onChange, labelledBy }: TextSizePickerProps) {
  return (
    <div className="sizes" role="group" aria-labelledby={labelledBy}>
      {TEXT_SIZES.map(({ id, label, samplePx }) => {
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
            <span style={{ fontSize: samplePx }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
