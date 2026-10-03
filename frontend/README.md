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

## Design: "Memphis Desktop"

A 90s-desktop look rebuilt for large, legible, high-contrast use. Warm cream graph-paper background, Mac-"Platinum" pinstriped windows with thick ink outlines and hard offset shadows, quiet Memphis confetti, and buttons that physically press down into their shadow.

- **Type:** Bricolage Grotesque (headlines, numerals) + Atkinson Hyperlegible (body; designed by the Braille Institute for low-vision readers). Body text starts at 20px, nothing meaningful is smaller than 17px.
- **Contrast:** ink on paper is 15.9:1; status chips are ink on a fill at 7.4:1 or better (WCAG AAA). Status is never colour alone: every chip pairs a fill, an icon and words.
- **Text size control:** the A / A / A buttons in the menu bar scale every size on the page (all sizes are `rem`). The choice is remembered.
- **Targets and focus:** primary buttons are 64px or taller; one thick cobalt focus ring everywhere.
- **Motion:** the readiness gauge needle swings in, the score counts up, windows pop in, the Start button breathes sonar rings, "TAP TO TALK" slowly rotates, the headline name gets a highlighter swipe. All of it stops under `prefers-reduced-motion`.
- **Tokens:** colours, type and motion live in `src/app/globals.css`; reusable pieces are `Window`, `StatusChip`, `AppBar` and `Confetti` in `src/components/`.

## UI flow

1. **Idle** — conversational invite and giant tap-to-talk microphone
2. **Conversation** — 3-turn chat check-in (assistant bubbles + mic replies)
3. **Processing** — calming loader with chatty status text
4. **Results** — readiness gauge, voice summary, vitals, 14-day trend

Copy stays non-diagnostic: readiness, jitter, shimmer, HNR, MPP, and “your usual.”
