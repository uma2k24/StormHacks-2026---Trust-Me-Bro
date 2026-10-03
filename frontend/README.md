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

Open [http://localhost:3000](http://localhost:3000). Demo links: `/?screen=signup&step=0-6`, `/?screen=settings`, `/?screen=idle|recording|processing|results` (these skip sign-up).

## Morning briefing (Gemini + ElevenLabs)

The check-in is tied to a habit: it plays as a personal morning radio show. Each segment reads a short, useful brief and then asks for the listener's opinion ("It's going to rain all afternoon in Coquitlam. Do you think you'll still get your walk in?"). Answering naturally gives the ~30 seconds of conversational audio the screening needs.

- `GET /api/briefing?name=David&city=Coquitlam,%20BC&interests=sports,garden&extras=tulips` — today's show as JSON, built for that listener. Open-Meteo finds their town and its weather (no key); Gemini writes the weather segment plus one for each of two of their interests, using Google Search grounding for anything recent. Cached for 30 minutes per profile. `BRIEFING_CITY` / `_LAT` / `_LON` / `_TIMEZONE` are only the fallback for a listener who gave no town.
- `POST /api/briefing/speech` `{ "text": "..." }` — one line read aloud by ElevenLabs (`audio/mpeg`).

Copy `.env.example` to `.env.local` and add `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`. Without them everything still works: the built-in mock show plays and each line stays on screen for its reading time. The microphone is still simulated.

## Design: "Teal Desktop"

A 90s-desktop look rebuilt for large, legible, high-contrast use, in **one colour theme: teal and coral**. Teal is the calm, good colour (the app itself, "Ready"); coral is the single warm accent (main actions, live states, "Pay Attention"). Everything else is cream graph paper and a very dark teal ink. Mac-"Platinum" pinstriped windows, thick ink outlines, hard offset shadows, and buttons that physically press down into their shadow.

- **One thing at a time.** The conversation is a little handheld radio with one line of text on its screen (the question, then "Listening…", then your own words) and one big Talk button. Talk works both ways: hold and let go to send (walkie-talkie), or tap to start and tap again when done (voice mode). The results are four pages (readiness, summary, vitals, trend) with a big Next button instead of one long scroll.
- **Type:** Bricolage Grotesque (headlines, numerals) + Atkinson Hyperlegible (body; designed by the Braille Institute for low-vision readers). Body text starts at 20px, nothing meaningful is smaller than 17px.
- **Contrast:** ink on paper is 13.2:1; ink on teal 7.2:1; ink on coral 6.6:1; ink on the soft tints 11:1 or better. Status is never colour alone: every chip pairs a fill, an icon and words.
- **Text size:** text is big by default (125%). "Big", "Bigger" and "Biggest" in the sign-up flow and in Settings scale every size on the page (all sizes are `rem`). The choice is remembered.
- **Targets and focus:** primary buttons are 64px or taller; one thick ink focus ring everywhere.
- **Motion:** the readiness needle swings in, the score counts up, the Talk button breathes sonar rings, the headline name gets a highlighter swipe. All of it stops under `prefers-reduced-motion`.
- **Tokens:** colours, type and motion live in `src/app/globals.css`; reusable pieces are `Window`, `StatusChip`, `AppBar` and `Confetti` in `src/components/`. The profile, interests and text sizes are in `src/data/profile.ts`; the mock show (which follows the listener's interests) and timings for the radio are in `src/data/checkInScript.ts`; the server side is `src/lib/briefing.ts` and the radio's voice is `src/lib/radioVoice.ts`.

## UI flow

0. **Sign up** (first visit only) — seven one-question steps: welcome, name, town, interests, anything else, text size, all set. Nothing is saved until the last step. The profile lives in `localStorage` (`src/lib/storage.ts`); there is no account or password.
1. **Idle** — "Your morning radio is ready", a giant Play button, what's on today's show, and a big **Settings** button pinned to the bottom. Settings holds everything from sign-up (name, town, interests, text size); text size applies instantly, the rest on **Done**.
2. **Morning briefing** — a little radio reads three short segments (the weather, then two things from your interests) and asks your opinion after each; your answers are the conversational audio for the check-in
3. **Processing** — calming loader with chatty status text
4. **Results** — four pages, one at a time: readiness gauge, voice summary, vitals, 14-day trend

Copy stays non-diagnostic: readiness, jitter, shimmer, HNR, MPP, and “your usual.”
