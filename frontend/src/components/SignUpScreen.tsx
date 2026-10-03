"use client";

import { type CSSProperties, useState } from "react";
import { ArrowLeft, ArrowRight, Radio } from "lucide-react";
import { Field } from "@/components/Field";
import { InterestPicker } from "@/components/InterestPicker";
import { PagerDots } from "@/components/PagerDots";
import { TextSizePicker } from "@/components/TextSizePicker";
import { emptyProfile, type Profile, tidyProfile } from "@/data/profile";
import { saveTextSize, useTextSize } from "@/lib/storage";

/**
 * First visit: set up the show one question at a time. Nothing is saved until the last step, so
 * leaving half way never leaves half a profile behind. (The text size is the exception: it
 * changes the page as soon as it is chosen, so the person can see what they picked.)
 */
const STEP_TITLES = [
  "Welcome",
  "Your name",
  "Where you live",
  "What you like",
  "Anything else",
  "Text size",
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

        {step === 6 ? (
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
