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

Open [http://localhost:3000](http://localhost:3000).

## Design: "Teal Desktop"

A 90s-desktop look rebuilt for large, legible, high-contrast use, in **one colour theme: teal and coral**. Teal is the calm, good colour (the app itself, "Ready"); coral is the single warm accent (main actions, live states, "Pay Attention"). Everything else is cream graph paper and a very dark teal ink. Mac-"Platinum" pinstriped windows, thick ink outlines, hard offset shadows, and buttons that physically press down into their shadow.

- **One thing at a time.** The conversation is a little handheld radio with one line of text on its screen (the question, then "Listening…", then your own words) and one big Talk button. Talk works both ways: hold and let go to send (walkie-talkie), or tap to start and tap again when done (voice mode). The results are four pages (readiness, summary, vitals, trend) with a big Next button instead of one long scroll.
- **Type:** Bricolage Grotesque (headlines, numerals) + Atkinson Hyperlegible (body; designed by the Braille Institute for low-vision readers). Body text starts at 20px, nothing meaningful is smaller than 17px.
- **Contrast:** ink on paper is 13.2:1; ink on teal 7.2:1; ink on coral 6.6:1; ink on the soft tints 11:1 or better. Status is never colour alone: every chip pairs a fill, an icon and words.
- **Text size control:** the A / A / A buttons in the menu bar scale every size on the page (all sizes are `rem`). The choice is remembered.
- **Targets and focus:** primary buttons are 64px or taller; one thick ink focus ring everywhere.
- **Motion:** the readiness needle swings in, the score counts up, the Talk button breathes sonar rings, the headline name gets a highlighter swipe. All of it stops under `prefers-reduced-motion`.
- **Tokens:** colours, type and motion live in `src/app/globals.css`; reusable pieces are `Window`, `StatusChip`, `AppBar` and `Confetti` in `src/components/`. Timings for the radio are in `src/data/checkInScript.ts`.

## UI flow

1. **Idle** — conversational invite and giant tap-to-talk microphone
2. **Conversation** — 3-question check-in on a little radio: one line of text on its screen, one Talk button
3. **Processing** — calming loader with chatty status text
4. **Results** — four pages, one at a time: readiness gauge, voice summary, vitals, 14-day trend

Copy stays non-diagnostic: readiness, jitter, shimmer, HNR, MPP, and “your usual.”
