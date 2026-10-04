"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Field } from "@/components/Field";
import { InterestPicker } from "@/components/InterestPicker";
import { ShowTimePicker } from "@/components/ShowTimePicker";
import { TalkSpeedPicker } from "@/components/TalkSpeedPicker";
import { TextSizePicker } from "@/components/TextSizePicker";
import { Window } from "@/components/Window";
import { type Profile, tidyProfile } from "@/data/profile";
import { saveTalkSpeed, saveTextSize, useTalkSpeed, useTextSize } from "@/lib/storage";

type SettingsScreenProps = {
  profile: Profile;
  /** Called with the tidied profile when the person taps Done. */
  onDone: (profile: Profile) => void;
};

/**
 * Everything chosen at sign-up, in one place. Text size and talking speed change the moment they
 * are tapped; the rest is saved when the person taps Done, so today's show is only rewritten once.
 */
export function SettingsScreen({ profile, onDone }: SettingsScreenProps) {
  const [draft, setDraft] = useState<Profile>(profile);
  const [nameError, setNameError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const textSize = useTextSize();
  const talkSpeed = useTalkSpeed();

  const update = (changes: Partial<Profile>) => setDraft((current) => ({ ...current, ...changes }));

  const done = () => {
    if (!draft.name.trim()) {
      setNameError("Please type your name so we know what to call you.");
      nameRef.current?.focus();
      return;
    }
    onDone(tidyProfile(draft));
  };

  return (
    <section className="flex flex-1 flex-col">
      <header className="mb-6 text-center">
        <h1 className="display h2">Settings</h1>
      </header>

      <div className="flex flex-col gap-7">
        <Window title="About you" index={0}>
          <div className="flex flex-col gap-4">
            <Field
              label="Your first name"
              value={draft.name}
              onChange={(name) => {
                update({ name });
                setNameError("");
              }}
              placeholder="David"
              error={nameError}
              maxLength={40}
              autoComplete="given-name"
              inputRef={nameRef}
            />
            <Field
              label="Your town or city"
              hint="For your weather and local news"
              value={draft.city}
              onChange={(city) => update({ city })}
              placeholder="Coquitlam, BC"
              autoComplete="address-level2"
            />
          </div>
        </Window>

        <Window title="What you like" index={1}>
          <div className="flex flex-col gap-5">
            <p id="settings-interests" className="field-label">
              Your show covers
            </p>
            <InterestPicker
              selected={draft.interests}
              onChange={(interests) => update({ interests })}
              labelledBy="settings-interests"
            />
            <Field
              label="Anything else?"
              hint="Optional: a team, a hobby, a place"
              value={draft.extras}
              onChange={(extras) => update({ extras })}
              placeholder="The Canucks, tulips…"
              maxLength={120}
            />
          </div>
        </Window>

        <Window title="Your family" index={2}>
          <div className="flex flex-col gap-4">
            <p className="field-hint m-0">
              Someone who&apos;d like to hear how you&apos;re doing. One tap calls them or sends them your news.
            </p>
            <Field
              label="Their name"
              value={draft.familyName}
              onChange={(familyName) => update({ familyName })}
              placeholder="Sarah"
              maxLength={40}
            />
            <Field
              label="Their phone number"
              type="tel"
              value={draft.familyPhone}
              onChange={(familyPhone) => update({ familyPhone })}
              placeholder="604 555 0134"
              maxLength={24}
              autoComplete="tel"
            />
          </div>
        </Window>

        <Window title="Your mornings" index={3}>
          <div className="flex flex-col gap-6">
            <Field
              label="Each morning, remind me to…"
              hint="Optional: the radio says it at the end of the show"
              value={draft.reminder}
              onChange={(reminder) => update({ reminder })}
              placeholder="Take my blood pressure pill"
              maxLength={80}
            />
            <div className="flex flex-col gap-3">
              <p id="settings-time" className="field-label">
                When should your radio be ready?
              </p>
              <ShowTimePicker
                value={draft.showTime}
                onChange={(showTime) => update({ showTime })}
                labelledBy="settings-time"
                name={draft.name}
              />
            </div>
          </div>
        </Window>

        <Window title="Text size" index={4}>
          <p id="settings-size" className="field-label mb-3">
            How big should the writing be?
          </p>
          <TextSizePicker value={textSize} onChange={saveTextSize} labelledBy="settings-size" />
        </Window>

        <Window title="Talking speed" index={5}>
          <p id="settings-speed" className="field-label mb-3">
            How fast should the radio talk?
          </p>
          <TalkSpeedPicker value={talkSpeed} onChange={saveTalkSpeed} labelledBy="settings-speed" />
        </Window>
      </div>

      <nav className="pager-nav mt-4" aria-label="Settings">
        <div className="pager-buttons">
          <button type="button" onClick={done} className="btn btn-accent btn-big flex-1">
            <Check className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
            Done
          </button>
        </div>
      </nav>
    </section>
  );
}
