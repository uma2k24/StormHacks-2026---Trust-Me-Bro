# Voice Readiness Check-in (Frontend Mockup)

Accessible Next.js mockup of a daily voice readiness check-in for older adults. Conversational mic flow first, then a plain-language results dashboard.

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

1. **Idle** — giant tap-to-talk microphone
2. **Recording** — waveform, reading prompt, 30s progress ring
3. **Processing** — calming loader with reassuring status text
4. **Results** — readiness dial, voice summary, vitals, 14-day trend

Copy stays non-diagnostic: readiness, energy, vocal control, and “your normal.”
