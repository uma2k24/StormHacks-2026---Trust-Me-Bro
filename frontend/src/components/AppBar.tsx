"use client";

import { useSyncExternalStore } from "react";
import { dateParts } from "@/data/daily";

// The date is read on the client (the server doesn't know the listener's time zone) and re-read
// every minute, so a page left open overnight turns over to the new day.
const everyMinute = (onChange: () => void) => {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
};
const todaysDate = () => {
  const { weekday, date } = dateParts();
  return `${weekday}|${date}`;
};

/** Mac-style menu bar: the brand, and today's date written out so nobody has to wonder what day it is. */
export function AppBar() {
  const today = useSyncExternalStore(everyMinute, todaysDate, () => null);
  const [weekday, date] = today?.split("|") ?? [];

  return (
    <header className="appbar">
      <div className="appbar-inner">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="17.5" fill="#41CBBC" stroke="#0F2E33" strokeWidth="3" />
            <g fill="#0F2E33">
              <rect x="9.5" y="16" width="3.6" height="8" rx="1.8" />
              <rect x="15.5" y="10.5" width="3.6" height="19" rx="1.8" />
              <rect x="21.5" y="14" width="3.6" height="12" rx="1.8" />
              <rect x="27.5" y="17.5" width="3.6" height="5" rx="1.8" />
            </g>
          </svg>
          <span className="brand-name display">Morning Radio</span>
        </div>
        {today ? (
          <p className="appbar-date" aria-label={`Today is ${weekday}, ${date}`}>
            <span className="appbar-weekday">{weekday}</span>
            <span>{date}</span>
          </p>
        ) : null}
      </div>
    </header>
  );
}
