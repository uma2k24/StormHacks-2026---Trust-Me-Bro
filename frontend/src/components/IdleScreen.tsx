"use client";

import type { CSSProperties } from "react";
import { ListChecks, Phone, Radio, RotateCcw, Settings, Upload } from "lucide-react";
import { SegmentIcon } from "@/components/SegmentIcon";
import { WeekLamps } from "@/components/WeekLamps";
import type { BriefingSegment } from "@/data/checkInScript";
import { dialable, greetingFor, hasFamily, type WeekDay } from "@/data/daily";
import type { Profile } from "@/data/profile";

type IdleScreenProps = {
  profile: Profile;
  segments: BriefingSegment[];
  /** Today's show is done: the big button opens the day's list instead, and the week is shown. */
  doneToday: boolean;
  week: WeekDay[];
  streak: number;
  /** How many of today's little things are ticked off, out of how many. */
  listDone: number;
  listTotal: number;
  onStart: () => void;
  /** Check a recording they have instead of talking to the radio. */
  onUpload: () => void;
  onOpenToday: () => void;
  onOpenSettings: () => void;
};

/**
 * Home. Before the show: Play, and what's on. Once they've listened: their day's list, and the week
 * of mornings they've tuned in. Either way the bottom row is one tap from Settings and, when they've
 * added someone, from calling their family, and a little Upload button sits beside the big one for
 * checking a recording instead of talking to the radio (web only).
 */
export function IdleScreen({
  profile,
  segments,
  doneToday,
  week,
  streak,
  listDone,
  listTotal,
  onStart,
  onUpload,
  onOpenToday,
  onOpenSettings,
}: IdleScreenProps) {
  const allDone = listDone >= listTotal;

  return (
    <section className="flex flex-1 flex-col items-center justify-between gap-4 text-center">
      <header className="w-full">
        <h1 className="display h1">
          {greetingFor()}, <span className="marker">{profile.name}</span>.
        </h1>
        <p className="lede mx-auto mt-4 max-w-[22rem]">
          {doneToday ? "You've tuned in today. Lovely!" : "Your morning radio is ready. Tap to tune in."}
        </p>
      </header>

      {doneToday ? (
        // like a radio's big dial and the little button beside it
        <div className="knobs">
          <div className={`sonar rounded-full ${allDone ? "sonar-off" : ""}`}>
            <button
              type="button"
              onClick={onOpenToday}
              className="orb orb-xl orb-teal orb-day"
              aria-label={`Your day: ${listDone} of ${listTotal} things done`}
            >
              <ListChecks className="h-[2.6rem] w-[2.6rem]" strokeWidth={2.5} aria-hidden="true" />
              <span className="display orb-day-title">Your day</span>
              <span className="orb-note">{allDone ? "All done!" : `${listDone} of ${listTotal} done`}</span>
            </button>
          </div>
          <div className="knobs-side">
            <button type="button" onClick={onStart} className="orb orb-sm orb-white">
              <RotateCcw className="h-8 w-8" strokeWidth={2.75} aria-hidden="true" />
              <span className="orb-sm-label">Play again</span>
            </button>
            <button type="button" onClick={onUpload} className="orb orb-sm orb-white" aria-label="Upload a recording instead">
              <Upload className="h-8 w-8" strokeWidth={2.75} aria-hidden="true" />
              <span className="orb-sm-label">Upload</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="knobs">
          <div className="sonar rounded-full">
            <button
              type="button"
              onClick={onStart}
              className="orb orb-xl"
              aria-label="Tap to play your morning radio"
            >
              <Radio className="h-[4.25rem] w-[4.25rem]" strokeWidth={2.5} aria-hidden="true" />
              <span className="display text-[2.1rem]">Play</span>
            </button>
          </div>
          <button type="button" onClick={onUpload} className="orb orb-sm orb-white" aria-label="Upload a recording instead">
            <Upload className="h-8 w-8" strokeWidth={2.75} aria-hidden="true" />
            <span className="orb-sm-label">Upload</span>
          </button>
        </div>
      )}

      {doneToday ? (
        <WeekLamps week={week} streak={streak} />
      ) : (
        <div
          className="stat pop-in w-full text-left"
          style={{ "--i": 1 } as CSSProperties}
          role="group"
          aria-label={`On today's show: ${segments.map((segment) => segment.topic).join(", ")}`}
        >
          <span className="text-[1.25rem] font-bold text-[var(--ink-soft)]">
            On today&apos;s show
          </span>
          <span className="flex flex-wrap gap-2" aria-hidden="true">
            {segments.map((segment) => (
              <span key={segment.id} className="chip">
                <SegmentIcon kind={segment.kind} className="h-5 w-5" strokeWidth={2.5} />
                {segment.topic}
              </span>
            ))}
          </span>
        </div>
      )}

      {/* pinned to the bottom, so these are always in reach however large the text is */}
      <nav className="pager-nav idle-settings w-full" aria-label="More">
        <div className="tiles">
          {hasFamily(profile) ? (
            <a href={`tel:${dialable(profile.familyPhone)}`} className="btn tile">
              <Phone className="h-7 w-7" strokeWidth={2.5} aria-hidden="true" />
              Call {profile.familyName}
            </a>
          ) : null}
          <button type="button" onClick={onOpenSettings} className="btn tile">
            <Settings className="h-7 w-7" strokeWidth={2.5} aria-hidden="true" />
            Settings
          </button>
        </div>
      </nav>
    </section>
  );
}
