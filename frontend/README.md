# Voice Readiness Check-in (Frontend Mockup)

Accessible Next.js mockup of a daily voice readiness check-in for older adults. Short chat-style voice dialogue first, then a plain-language results dashboard. Big type, high contrast and a distinctive 90s-inspired look.

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Framer Motion
- Recharts
- Lucide React

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Demo links: `/?screen=signup&step=0-9`, `/?screen=settings`, `/?screen=idle|recording|processing|results|today` (these skip sign-up, and borrow a lived-in week so the home screen's lamps aren't all dark).

## Morning briefing (Gemini + ElevenLabs)

The check-in is tied to a habit: it plays as a personal morning radio show. Each segment reads a short, useful brief and then asks for the listener's opinion ("It's going to rain all afternoon in Coquitlam. Do you think you'll still get your walk in?"). Answering naturally gives the ~30 seconds of conversational audio the screening needs.

- `GET /api/briefing?name=David&city=Coquitlam,%20BC&interests=sports,garden&extras=tulips&picks=garden,music` — today's show as JSON, built for that listener. Open-Meteo finds their town and its weather (no key); Gemini writes the weather segment plus one for each of the two `picks` (without `picks`, the listener's first two interests). One request is one Gemini call, and Google Search grounding is only switched on when a pick is `sports` or `local`. Cached for 30 minutes per name, town, picks and extras. `BRIEFING_CITY` / `_LAT` / `_LON` / `_TIMEZONE` are only the fallback for a listener who gave no town.
- `POST /api/briefing/speech` `{ "text": "..." }` — one line read aloud by ElevenLabs (`audio/mpeg`).

Copy `.env.example` to `.env.local` and add `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`. Without them everything still works: the built-in mock show plays and each line stays on screen for its reading time.

### Talking back (ElevenLabs + Gemini)

The conversation is real and hands-free: after the first tap on Play nobody has to touch the screen.

1. The radio reads a segment and asks its question. Its words appear **as they are said** (each word fades in as the voice reaches it, see `wordsSpoken` in `src/data/checkInScript.ts`) and the text scrolls up by itself when it is longer than the screen.
2. A beat later the microphone opens by itself (`src/lib/recorder.ts`: "Listening…"). The answer is sent when the listener pauses for about two seconds after speaking, after 15 seconds of silence, or after 45 seconds. Tapping **Done** sends it early, and holding the button and letting go still works.
3. `POST /api/conversation/transcribe` (the recording as the body, `Content-Type: audio/webm | audio/mp4 | ...`) turns it into words with ElevenLabs Scribe (`{ "text": "..." }`). Their words show on the radio's screen while the host thinks.
4. `POST /api/conversation/reply` (the profile, the segment, what they said, what they said earlier in the show) asks Gemini for the host's reply, which is read aloud by `/api/briefing/speech`. The reply reacts to what they actually said and adds one fresh detail about their interests: Open-Meteo's forecast for their town (cached for 30 minutes) and, for everything but the weather segment, **Google Search** for something current (a score, a local story, a new release). If search is slow or unavailable it retries without it, and if Gemini is unavailable the reply is a fixed warm line, so the radio is never lost for words. See `src/lib/conversation.ts`.

Microphone permission is asked for when Play is tapped, so no browser dialog interrupts the conversation. If nothing is heard the radio says so and listens again once, then moves on. With no microphone, no permission, no ElevenLabs key or no backend, the radio says so (where it matters) and plays the sample answer, so the show always plays through.

Cost: this is one extra Gemini call per answered segment (three per show) on top of the one call for the show itself, and Google Search is the expensive part of each. `CONVERSATION_SEARCH=fresh` limits search to sports and local news, and `CONVERSATION_SEARCH=off` turns it off (replies then use the forecast and general knowledge only). Other settings: `ELEVENLABS_STT_MODEL_ID` (default `scribe_v2`) and `ELEVENLABS_STT_LANGUAGE` (default `en`).

### The radio learns what you like

The more someone listens, the better the show fits them, and none of it costs Gemini tokens. `src/data/learning.ts` runs on the device:

- **What it watches:** how soon the listener starts speaking after a question and how long they actually talk on each answer (measured from the recording's loudness, not counting the pauses around it), against how *they* usually answer (so a quiet person isn't read as bored). It is timing, never words: transcripts are not used for learning. Sample answers (no microphone) teach nothing.
- **What it changes:** which two interests today's show covers. Ticking an interest in Settings is the foundation; behaviour tilts the odds. One they light up about comes up more, one they never respond to comes up less, and one they never ticked but clearly enjoy (two answers well above their usual) joins the regulars. Unticked interests are shown rarely (`EXPLORE`), so an unticked favourite is discovered slowly on purpose. Evidence halves every 45 days, so tastes can change.
- **Gemini budget:** learning itself makes no calls (the conversation replies above are the only other Gemini use). The app picks the two interests, so Gemini only writes the words and the prompt is smaller. Today's show is saved on the device (`voice-readiness:today`) with the choice behind it, so the app asks for at most one show per listener per day, however often it is opened or however much is learned in between (a new choice would mean a new call). Editing the profile asks again.
- **Stored on the device only:** `voice-readiness:learned` and `voice-readiness:today` in localStorage. Demo links (`?screen=…` with no sign-up) learn nothing.

## Part of their day

The check-in only works if it happens every morning, so the app is built to fit into the listener's day. None of this calls Gemini: it is all worked out on the device (`src/data/daily.ts`), and family details and reminders never leave it (the server only ever sees `ShowProfile`: name, town, interests, extras).

- **What day it is.** The menu bar always shows the date written out ("Saturday / October 3"), and the greeting follows the clock (Good Morning / Afternoon / Evening).
- **Done for today.** Once the show has been heard, home changes: the big button turns teal and opens **Your day**, a little **Play again** button sits beside it, and a row of radio lamps shows the last seven mornings ("4 mornings in a row!"). It celebrates the mornings that happened and never scolds about the ones that didn't. Kept in `voice-readiness:history` (the last 60 days).
- **Your day.** After the results, three little things for today, ticked off with one tap and remembered until tomorrow: their own reminder first, then one for their voice (a warm drink when it sounds breathy, rest on a tired day), then one from the weather segment (a walk before the rain, mind the ice), topped up with a chat. Gentle, never diagnostic.
- **Family.** Someone who'd like to hear how they're doing (sign-up and Settings). Home has a one-tap **Call Sarah**; Your day has **Tell Sarah how I am**, which opens Messages with a note written from today's result. On a tired day it becomes **Ask Sarah to call me** and moves to the top.
- **The radio reminds them.** "Each morning, remind me to…" (e.g. take a pill) is read by the radio as the show's last line ("Before you go, Margaret, a little reminder: take your blood pressure pill"), and it's the first thing on Your day. Spoken by ElevenLabs like every other line; no Gemini.
- **A nudge every morning.** They choose when the radio should be ready (7 to 10 am, or no reminder). A web page can't wake anyone up, so choosing a time offers **Add to my calendar**: a repeating daily event with an alert (`src/lib/calendar.ts`). The iOS app sends a real notification instead.
- **Read it to me.** The voice summary is read aloud, each word lighting up as it is said, in the radio's voice or, without one, the browser's own.

## Design: "Teal Desktop"

A 90s-desktop look rebuilt for large, legible, high-contrast use, in **one colour theme: teal and coral**. Teal is the calm, good colour (the app itself, "Ready"); coral is the single warm accent (main actions, live states, "Pay Attention"). Everything else is cream graph paper and a very dark teal ink. Mac-"Platinum" pinstriped windows, thick ink outlines, hard offset shadows, and buttons that physically press down into their shadow.

- **One thing at a time.** The conversation is a little handheld radio with one line of text on its screen (the radio's words as they are said, then "Listening…", then your own words, then the reply) and one big Talk button that you never need to press: the radio listens by itself. If you do, it works both ways: hold and let go to send (walkie-talkie), or tap Done when finished. The results are four pages (readiness, summary, vitals, trend) with a big Next button instead of one long scroll.
- **Type:** Bricolage Grotesque (headlines, numerals) + Atkinson Hyperlegible (body; designed by the Braille Institute for low-vision readers). Body text starts at 20px, nothing meaningful is smaller than 17px.
- **Contrast:** ink on paper is 13.2:1; ink on teal 7.2:1; ink on coral 6.6:1; ink on the soft tints 11:1 or better. Status is never colour alone: every chip pairs a fill, an icon and words.
- **Text size:** text is big by default (125%). "Big", "Bigger" and "Biggest" in the sign-up flow and in Settings scale every size on the page (all sizes are `rem`). The choice is remembered.
- **Targets and focus:** primary buttons are 64px or taller; one thick ink focus ring everywhere.
- **Motion:** the readiness needle swings in, the score counts up, the Talk button breathes sonar rings, the headline name gets a highlighter swipe. All of it stops under `prefers-reduced-motion`.
- **Tokens:** colours, type and motion live in `src/app/globals.css`; reusable pieces are `Window`, `StatusChip`, `AppBar`, `WeekLamps` and `Confetti` in `src/components/`. The day's rhythm (greeting, date, streak, Your day, family message, the radio's reminder) is `src/data/daily.ts`. The profile, interests and text sizes are in `src/data/profile.ts`; the mock show (which follows the picks), the radio's fixed lines and timings are in `src/data/checkInScript.ts`; what the radio has learned about the listener and how it chooses the show is in `src/data/learning.ts`; the server side is `src/lib/briefing.ts` (the show) and `src/lib/conversation.ts` (transcription and replies); the browser side of talking back is `src/lib/recorder.ts` and `src/lib/conversationClient.ts`, and the radio's voice is `src/lib/radioVoice.ts`.

## UI flow

0. **Sign up** (first visit only) — ten one-question steps: welcome, name, town, interests, anything else, family, a daily reminder, radio time, text size, all set. Nothing is saved until the last step. The profile lives in `localStorage` (`src/lib/storage.ts`); there is no account or password.
1. **Idle** — "Your morning radio is ready", a giant Play button, what's on today's show, and a bottom row with **Call Sarah** (when family is set) and **Settings**. Once today's show is done: **Your day**, **Play again** and the week of lamps instead. Settings holds everything from sign-up; text size applies instantly, the rest on **Done**.
2. **Morning briefing** — a little radio reads three short segments (the weather, then two things from your interests) and asks your opinion after each. It listens by itself, answers what you said, and moves on, with no touching; your answers are the conversational audio for the check-in. Its last line is their daily reminder, if they set one
3. **Processing** — calming loader with chatty status text
4. **Results** — four pages, one at a time: readiness gauge, voice summary (read aloud on request), vitals, 14-day trend
5. **Your day** — three little things to tick off, and one tap to tell the family how it went

Copy stays non-diagnostic: readiness, jitter, shimmer, HNR, MPP, and “your usual.”
