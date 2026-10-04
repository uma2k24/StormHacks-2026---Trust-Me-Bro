"use client";

import { type CSSProperties, useState } from "react";
import { ArrowLeft, ArrowRight, Radio } from "lucide-react";
import { Field } from "@/components/Field";
import { InterestPicker } from "@/components/InterestPicker";
import { PagerDots } from "@/components/PagerDots";
import { ShowTimePicker } from "@/components/ShowTimePicker";
import { TalkSpeedPicker } from "@/components/TalkSpeedPicker";
import { TextSizePicker } from "@/components/TextSizePicker";
import { emptyProfile, type Profile, tidyProfile } from "@/data/profile";
import { saveTalkSpeed, saveTextSize, useTalkSpeed, useTextSize } from "@/lib/storage";

/**
 * First visit: set up the show one question at a time. Nothing is saved until the last step, so
 * leaving half way never leaves half a profile behind. (Text size and talking speed are the
 * exceptions: they apply as soon as they are chosen, so the person can try them out.)
 */
const STEP_TITLES = [
  "Welcome",
  "Your name",
  "Where you live",
  "What you like",
  "Anything else",
  "Your family",
  "A daily reminder",
  "Your radio time",
  "Text size",
  "Talking speed",
  "All set",
] as const;

const LAST_STEP = STEP_TITLES.length - 1;

type SignUpScreenProps = {
  onComplete: (profile: Profile) => void;
  /** Open on a later step (used by demo links). */
  initialStep?: number;
};

export function SignUpScreen({ onComplete, initialStep = 0 }: SignUpScreenProps) {
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), LAST_STEP));
  const [draft, setDraft] = useState<Profile>(emptyProfile);
  const [nameError, setNameError] = useState("");
  const textSize = useTextSize();
  const talkSpeed = useTalkSpeed();

  const update = (changes: Partial<Profile>) => setDraft((current) => ({ ...current, ...changes }));
  const firstName = draft.name.trim();

  const next = () => {
    if (step === 1 && !firstName) {
      setNameError("Please type your name so we know what to call you.");
      return;
    }
    if (step === LAST_STEP) {
      onComplete(tidyProfile(draft));
      return;
    }
    setStep(step + 1);
  };

  return (
    <section className="flex flex-1 flex-col">
      <p className="sr-only" aria-live="polite">
        Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
      </p>

      <div className="pager-stage text-center" key={step}>
        {step === 0 ? (
          <>
            <div className="welcome-badge pop-in" aria-hidden="true">
              <Radio className="h-[4.5rem] w-[4.5rem]" strokeWidth={2.5} />
            </div>
            <header className="pop-in" style={{ "--i": 1 } as CSSProperties}>
              <h1 className="display h1">
                Welcome to <span className="marker">Morning Radio</span>
              </h1>
              <p className="lede mx-auto mt-5 max-w-[24rem]">
                Let&apos;s set up your own morning show. It only takes a minute.
              </p>
            </header>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <header className="pop-in">
              <h1 className="display h2">What should we call you?</h1>
            </header>
            <div className="text-left">
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
                autoFocus
                onEnter={next}
              />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <header className="pop-in">
              <h1 className="display h2">Where are you listening from?</h1>
              <p className="lede mx-auto mt-4 max-w-[24rem]">
                We&apos;ll use this for your weather and local news.
              </p>
            </header>
            <div className="text-left">
              <Field
                label="Your town or city"
                hint="Optional"
                value={draft.city}
                onChange={(city) => update({ city })}
                placeholder="Coquitlam, BC"
                autoComplete="address-level2"
                autoFocus
                onEnter={next}
              />
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <header className="pop-in">
              <h1 id="signup-interests" className="display h2">
                What do you like to hear about?
              </h1>
              <p className="lede mx-auto mt-3 max-w-[24rem]">Pick as many as you like.</p>
            </header>
            <InterestPicker
              selected={draft.interests}
              onChange={(interests) => update({ interests })}
              labelledBy="signup-interests"
            />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <header className="pop-in">
              <h1 className="display h2">Anything else you&apos;d like to hear about?</h1>
              <p className="lede mx-auto mt-3 max-w-[24rem]">
                A team, a hobby, a place. You can skip this.
              </p>
            </header>
            <div className="text-left">
              <Field
                label="In your own words"
                value={draft.extras}
                onChange={(extras) => update({ extras })}
                placeholder="The Canucks, tulips…"
                maxLength={120}
                autoFocus
                onEnter={next}
              />
            </div>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <header className="pop-in">
              <h1 className="display h2">Who would like to hear how you&apos;re doing?</h1>
              <p className="lede mx-auto mt-3 max-w-[24rem]">
                A son, a daughter, a friend. You can skip this.
              </p>
            </header>
            <div className="flex flex-col gap-4 text-left">
              <Field
                label="Their name"
                value={draft.familyName}
                onChange={(familyName) => update({ familyName })}
                placeholder="Sarah"
                maxLength={40}
                autoFocus
              />
              <Field
                label="Their phone number"
                type="tel"
                value={draft.familyPhone}
                onChange={(familyPhone) => update({ familyPhone })}
                placeholder="604 555 0134"
                maxLength={24}
                autoComplete="tel"
                onEnter={next}
              />
            </div>
          </>
        ) : null}

        {step === 6 ? (
          <>
            <header className="pop-in">
              <h1 className="display h2">Anything the radio should remind you about?</h1>
              <p className="lede mx-auto mt-3 max-w-[24rem]">
                Like a pill to take or plants to water. You can skip this.
              </p>
            </header>
            <div className="text-left">
              <Field
                label="Each morning, remind me to…"
                value={draft.reminder}
                onChange={(reminder) => update({ reminder })}
                placeholder="Take my blood pressure pill"
                maxLength={80}
                autoFocus
                onEnter={next}
              />
            </div>
          </>
        ) : null}

        {step === 7 ? (
          <>
            <header className="pop-in">
              <h1 id="signup-time" className="display h2">
                When should your radio be ready?
              </h1>
              <p className="lede mx-auto mt-3 max-w-[24rem]">
                We&apos;ll remind you each morning.
              </p>
            </header>
            <ShowTimePicker
              value={draft.showTime}
              onChange={(showTime) => update({ showTime })}
              labelledBy="signup-time"
              name={firstName}
            />
          </>
        ) : null}

        {step === 8 ? (
          <>
            <header className="pop-in">
              <h1 id="signup-size" className="display h2">
                How big should the writing be?
              </h1>
              <p className="lede mx-auto mt-3 max-w-[24rem]">
                Tap one. You can change it any time in Settings.
              </p>
            </header>
            <TextSizePicker value={textSize} onChange={saveTextSize} labelledBy="signup-size" />
          </>
        ) : null}

        {step === 9 ? (
          <>
            <header className="pop-in">
              <h1 id="signup-speed" className="display h2">
                How fast should the radio talk?
              </h1>
              <p className="lede mx-auto mt-3 max-w-[24rem]">
                Tap one. You can change it any time in Settings.
              </p>
            </header>
            <TalkSpeedPicker value={talkSpeed} onChange={saveTalkSpeed} labelledBy="signup-speed" />
          </>
        ) : null}

        {step === LAST_STEP ? (
          <header className="pop-in">
            <h1 className="display h1">
              You&apos;re all set, <span className="marker">{firstName}</span>!
            </h1>
            <p className="lede mx-auto mt-5 max-w-[24rem]">Your morning radio is ready.</p>
          </header>
        ) : null}
      </div>

      <nav className="pager-nav" aria-label="Sign up steps">
        <PagerDots count={STEP_TITLES.length} current={step} label="Sign up progress" />

        <div className="pager-buttons">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="btn btn-back"
              aria-label="Back"
            >
              <ArrowLeft className="h-7 w-7" strokeWidth={2.75} aria-hidden="true" />
            </button>
          ) : null}

          <button type="button" onClick={next} className="btn btn-accent flex-1">
            {step === 0 ? "Let’s go" : step === LAST_STEP ? "Tune in" : "Next"}
            {step === LAST_STEP ? (
              <Radio className="h-5 w-5" strokeWidth={2.75} aria-hidden="true" />
            ) : (
              <ArrowRight className="h-5 w-5" strokeWidth={2.75} aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>
    </section>
  );
}
