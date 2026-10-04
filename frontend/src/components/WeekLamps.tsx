"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { streakLine, type WeekDay } from "@/data/daily";

type WeekLampsProps = {
  week: WeekDay[];
  streak: number;
  /** Today's show has only just been heard: today's lamp starts dark and warms up, once. */
  lightToday?: boolean;
  /** Told when today's lamp has started lighting, so it doesn't light up again next time. */
  onLit?: () => void;
};

/**
 * The last seven mornings as a row of radio lamps: lit with a tick for a morning they tuned in,
 * dark for one they didn't. Kind on purpose: it celebrates the mornings that happened and never
 * scolds about the ones that didn't. Mirrors WeekLamps in IdleView.swift.
 */
export function WeekLamps({ week, streak, lightToday = false, onLit }: WeekLampsProps) {
  const listened = week.filter((day) => day.listened).length;
  // kept from the first render: the lamp goes on lighting after the page has been told
  const [lighting] = useState(lightToday);

  useEffect(() => {
    if (lighting) onLit?.();
  }, [lighting, onLit]);

  return (
    <div
      className="stat week pop-in"
      role="group"
      aria-label={`This week: you tuned in ${listened} of the last 7 mornings. ${streakLine(streak)}`}
    >
      <p className="display week-streak" aria-hidden="true">
        {streakLine(streak)}
      </p>
      <ol className="week-days" aria-hidden="true">
        {week.map((day, index) => (
          <li
            key={day.day}
            data-listened={day.listened}
            data-today={day.today}
            data-lighting={lighting && day.today && day.listened}
            style={{ "--n": index } as CSSProperties}
          >
            <span className="week-lamp">
              {day.listened ? <Check className="h-[60%] w-[60%]" strokeWidth={4} /> : null}
            </span>
            <span className="week-label">{day.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
