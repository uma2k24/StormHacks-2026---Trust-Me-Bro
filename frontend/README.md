# Voice Readiness Check-in (Frontend Mockup)

Accessible Next.js mockup of a daily voice readiness check-in for older adults. Short chat-style voice dialogue first, then a plain-language results dashboard.

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

## UI flow

1. **Idle** — conversational invite and giant tap-to-talk microphone
2. **Conversation** — 3-turn chat check-in (assistant bubbles + mic replies)
3. **Processing** — calming loader with chatty status text
4. **Results** — readiness dial, voice summary, vitals, 14-day trend

Copy stays non-diagnostic: readiness, energy, vocal control, and “your usual.”
