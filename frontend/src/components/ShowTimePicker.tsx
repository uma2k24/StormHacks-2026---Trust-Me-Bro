"use client";

import { CalendarPlus, Check } from "lucide-react";
import { SHOW_TIMES, type ShowTime } from "@/data/profile";
import { downloadShowReminder } from "@/lib/calendar";

type ShowTimePickerProps = {
  value: ShowTime;
  onChange: (next: ShowTime) => void;
  labelledBy: string;
  /** Who the reminder greets. */
  name: string;
};

/**
 * When the radio should remind them it's ready. Picking a time offers a calendar reminder: a web
 * page can't wake anyone up, so the calendar does it. (The iOS app sends a notification instead.)
 */
export function ShowTimePicker({ value, onChange, labelledBy, name }: ShowTimePickerProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="choices times" role="group" aria-labelledby={labelledBy}>
        {SHOW_TIMES.map(({ id, label }) => {
          const on = value === id;
          return (
            <button
              key={id}
              type="button"
              className={`choice ${id === "off" ? "choice-wide" : ""}`}
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

      {value !== "off" ? (
        <button
          type="button"
          className="btn btn-teal btn-block pop-in"
          onClick={() => downloadShowReminder(value, name)}
        >
          <CalendarPlus className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
          Add to my calendar
        </button>
      ) : null}
    </div>
  );
}
