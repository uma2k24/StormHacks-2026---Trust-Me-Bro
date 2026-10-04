"use client";

import type { CSSProperties } from "react";
import {
  Armchair,
  Check,
  Coffee,
  Footprints,
  GlassWater,
  type LucideIcon,
  MessageCircleHeart,
  Pill,
  Snowflake,
  Sun,
  Umbrella,
} from "lucide-react";
import {
  dialable,
  familyAction,
  familyMessage,
  hasFamily,
  type TodayIcon,
  type TodayItem,
} from "@/data/daily";
import type { Profile } from "@/data/profile";
import type { StatusColor } from "@/types/screening";

const ICONS: Record<TodayIcon, LucideIcon> = {
  reminder: Pill,
  drink: Coffee,
  rest: Armchair,
  walk: Footprints,
  umbrella: Umbrella,
  careful: Snowflake,
  sun: Sun,
  chat: MessageCircleHeart,
  water: GlassWater,
};

type TodayScreenProps = {
  profile: Profile;
  status: StatusColor;
  items: TodayItem[];
  /** The ids of the items already ticked off today. */
  done: string[];
  onToggle: (id: string) => void;
  onDone: () => void;
};

/**
 * After the results: a few little things for today, ticked off with one tap and remembered until
 * tomorrow, and one tap to tell their family how they're doing. Mirrors TodayView.swift.
 */
export function TodayScreen({ profile, status, items, done, onToggle, onDone }: TodayScreenProps) {
  const ticked = items.filter((item) => done.includes(item.id)).length;
  const allDone = ticked === items.length;
  const family = hasFamily(profile);
  const message = familyMessage(profile, status);
  // a tired day puts telling the family first
  const familyFirst = status === "red";

  return (
    <section className="flex flex-1 flex-col">
      <div className="pager-stage">
        <header className="pop-in text-center">
          <h1 className="display h2">
            Your day, <span className="marker">{profile.name}</span>
          </h1>
          <p className="lede mx-auto mt-3 max-w-[22rem]" aria-live="polite">
            {allDone ? "All done. Well done, you!" : "Tap each one when done."}
          </p>
        </header>

        <ul className="todo-list" aria-label="Today's list">
          {items.map((item, index) => {
            const on = done.includes(item.id);
            const Icon = ICONS[item.icon];
            return (
              <li key={item.id} className="pop-in" style={{ "--i": index + 1 } as CSSProperties}>
                <button type="button" className="todo" aria-pressed={on} onClick={() => onToggle(item.id)}>
                  <span className="choice-box" aria-hidden="true">
                    {on ? <Check className="h-5 w-5" strokeWidth={4} /> : null}
                  </span>
                  <span className="todo-text">{item.text}</span>
                  <Icon className="todo-icon" strokeWidth={2.4} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <nav className="pager-nav" aria-label="Your day">
        {family ? (
          <a
            href={`sms:${dialable(profile.familyPhone)}?&body=${encodeURIComponent(message)}`}
            className={`btn btn-block ${familyFirst ? "btn-accent" : "btn-teal"}`}
          >
            <MessageCircleHeart className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
            {familyAction(profile, status)}
          </a>
        ) : null}
        <button type="button" onClick={onDone} className={`btn btn-block ${familyFirst ? "" : "btn-accent"}`}>
          <Check className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
          Done
        </button>
      </nav>
    </section>
  );
}
