# Morning Radio — StormHacks 2026

A daily voice readiness check-in for older adults. It plays as a short morning radio show: the host reads a personal briefing, asks for your opinion, listens, and replies. Your answers also feed a voice screening that produces a plain-language results dashboard.

The project ships **two clients that stay in sync**:


| Client | Path                  | Stack                                |
| ------ | --------------------- | ------------------------------------ |
| Web    | `frontend/`           | Next.js, React, TypeScript, Tailwind |
| iOS    | `ios/VoiceReadiness/` | SwiftUI (iOS 17+)                    |


The Next.js app also hosts the API the iOS simulator talks to (briefing, speech, transcription, conversation replies, and voice analysis). There is no separate backend service yet (`backend/` is a placeholder).

---



## What you need



### Web (required for the full experience)

- **Node.js 20+** (LTS recommended) and npm
- A modern browser with microphone access (Chrome or Safari work well)
- Optional API keys for the live radio voice and replies:
  - [Google AI / Gemini](https://aistudio.google.com/apikey) → `GEMINI_API_KEY`
  - [ElevenLabs](https://elevenlabs.io/) → `ELEVENLABS_API_KEY`

Without those keys everything still runs: a built-in mock show plays with on-screen timing, sample answers, and a labelled sample dashboard when analysis cannot run.

### iOS (optional)

- **macOS** with **Xcode 15+**
- An iPhone simulator (or a physical device on iOS 17+)
- The web app running locally so the simulator can reach `http://127.0.0.1:3000`

---



## Quick start (web)

```bash
# 1. Clone the repo
git clone https://github.com/uma2k24/StormHacks-2026---Trust-Me-Bro.git
cd StormHacks-2026---Trust-Me-Bro

# 2. Install frontend dependencies
cd frontend
npm install

# 3. (Optional) Add API keys for live briefing + voice
cp .env.example .env.local
# Edit .env.local and paste GEMINI_API_KEY and ELEVENLABS_API_KEY

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

You should see sign-up on first visit. Walk through the steps (name, town, interests, etc.), then tap **Play** on the home screen to start the morning show.

---



## Step-by-step setup



### 1. Clone the repository

```bash
git clone https://github.com/uma2k24/StormHacks-2026---Trust-Me-Bro.git
cd StormHacks-2026---Trust-Me-Bro
```



### 2. Set up the web app

```bash
cd frontend
npm install
```



### 3. Configure environment variables (optional but recommended)

```bash
cp .env.example .env.local
```

Open `frontend/.env.local` and fill in at least:


| Variable                                        | Required?               | What it does                                                          |
| ----------------------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `GEMINI_API_KEY`                                | For live show + replies | Writes briefing segments and host replies                             |
| `ELEVENLABS_API_KEY`                            | For spoken audio + STT  | Reads lines aloud and transcribes answers                             |
| `ELEVENLABS_VOICE_ID`                           | Optional                | Voice used for TTS (a default is set in `.env.example`)               |
| `GEMINI_MODEL`                                  | Optional                | Defaults to `gemini-3.5-flash-lite`                                   |
| `CONVERSATION_SEARCH`                           | Optional                | `on` (default), `fresh`, or `off` — controls Google Search in replies |
| `BRIEFING_CITY` / `_LAT` / `_LON` / `_TIMEZONE` | Optional                | Fallback location if the listener gave no town                        |


Weather uses [Open-Meteo](https://open-meteo.com/) and needs no key.

**Never commit** `.env.local`**.** It is gitignored. Share keys out of band with teammates.

### 4. Run the web app

```bash
npm run dev
```

- App: [http://localhost:3000](http://localhost:3000)
- Stop with `Ctrl+C`

Other useful scripts (from `frontend/`):

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint
```



### 5. (Optional) Run the iOS app

Keep `npm run dev` running in `frontend/`, then in another terminal from the repo root:

```bash
open ios/VoiceReadiness.xcodeproj
```

In Xcode:

1. Select an iPhone simulator (or a connected device).
2. Press **Run** (`⌘R`).
3. On first launch, allow microphone (and notifications if you set a morning reminder).

The simulator talks to the local Next.js server at `http://127.0.0.1:3000`.  
On a **physical device**, the phone cannot use `127.0.0.1` for your Mac — use a DEBUG launch argument (see [Demo shortcuts](#demo-shortcuts)) with your Mac’s LAN IP, e.g. `-briefingURL http://192.168.1.20:3000`, and ensure both devices are on the same network.

---



## How to use the app



### First-time sign-up

Ten one-question steps: welcome → name → town → interests → extras → family → daily reminder → radio time → text size → done. Nothing is saved until the last step. There is no account or password; the profile stays on the device (`localStorage` on web, `@AppStorage` on iOS).

### Daily flow

1. **Home (Idle)** — “Your morning radio is ready”, giant **Play**, what’s on today’s show, **Call [family]** and **Settings**.
2. **Morning briefing** — After Play, the radio is hands-free: it speaks, listens when you pause, replies, and continues. Extra plain questions may run until there is enough speech; the last ask is always a sustained **“ahhh”**.
3. **Processing** — Voice analysis runs on the server (`POST /api/voice/analyze`).
4. **Results** — Four pages: readiness, voice summary, vitals, trend. Tap a vital for numbers and ranges.
5. **Your day** — Three small tasks to tick off, plus a one-tap family message.

After today’s show is done, home shows **Your day**, **Play again**, and a week of radio lamps for the last seven mornings.

### Web-only: upload audio instead of talking

On the home screen, the small **Upload** button (beside Play / Play again) lets you drop talking recordings and an optional “ahhh” file. Same analysis pipeline as a live show. The iOS app has no upload on purpose.

---



## Demo shortcuts

Useful for screenshots and judging without walking through sign-up.

### Web (URL query)

Open these while the dev server is running (they skip sign-up and use a demo listener with a lived-in week):


| URL                                 | Screen                  |
| ----------------------------------- | ----------------------- |
| `/?screen=signup&step=0` … `step=9` | Sign-up step            |
| `/?screen=settings`                 | Settings                |
| `/?screen=idle`                     | Home                    |
| `/?screen=recording`                | Live radio conversation |
| `/?screen=processing`               | Processing              |
| `/?screen=results`                  | Results                 |
| `/?screen=today`                    | Your day                |
| `/?screen=upload`                   | Upload audio            |




### iOS (DEBUG launch arguments)

In Xcode: **Product → Scheme → Edit Scheme… → Run → Arguments Passed On Launch**, e.g.:

- `-screen idle` (also `signup`, `settings`, `recording`, `processing`, `results`, `today`)
- `-step 0` … `9` for sign-up steps
- `-page 0` … `3` for a results page
- `-detail jitter` (also `shimmer`, `hnr`)
- `-briefingURL http://host:port` for a non-default API host

Anything but a bare launch skips sign-up with a demo listener.

---



## Repository layout

```
.
├── README.md                 ← you are here
├── CLAUDE.md                 ← dual-platform parity notes for contributors / agents
├── frontend/                 ← Next.js web app + API routes
│   ├── .env.example          ← copy to .env.local
│   ├── models/               ← ONNX voice classifier (bundled with the API)
│   ├── README.md             ← deep dive: briefing, conversation, voice analysis, design
│   └── src/
│       ├── app/              ← pages + API routes
│       ├── components/       ← UI screens and chrome
│       ├── data/             ← scripts, profile, learning, daily rhythm, readings
│       └── lib/              ← briefing, conversation, recorder, voice analysis
├── ios/                      ← SwiftUI client
│   ├── README.md             ← Xcode open / run / file map
│   ├── VoiceReadiness.xcodeproj
│   └── VoiceReadiness/
├── backend/                  ← placeholder (API lives in frontend for now)
└── data/                     ← placeholder
```

More detail:

- Web internals and design tokens → `[frontend/README.md](frontend/README.md)`
- iOS file map and intentional web differences → `[ios/README.md](ios/README.md)`

---

## API overview (local Next.js)

All routes run under the frontend dev server (`http://localhost:3000`).


| Method | Path                           | Purpose                                  |
| ------ | ------------------------------ | ---------------------------------------- |
| `GET`  | `/api/briefing`                | Today’s personalized show (JSON)         |
| `POST` | `/api/briefing/speech`         | ElevenLabs TTS for one line              |
| `POST` | `/api/conversation/transcribe` | Speech → text (ElevenLabs Scribe)        |
| `POST` | `/api/conversation/reply`      | Host reply (Gemini + weather / search)   |
| `POST` | `/api/voice/analyze`           | ONNX classifier + jitter / shimmer / HNR |


Voice analysis needs the model at `frontend/models/parkinson_voice_classifier.onnx` (already in the repo) and `onnxruntime-node` (installed via `npm install`).

---



## Troubleshooting


| Problem                                 | What to try                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Port 3000 in use                        | `npx next dev -p 3001` and point iOS `-briefingURL` at that port                                                                            |
| No microphone / permission denied       | Allow mic in the browser or iOS Settings; without it the show uses sample answers                                                           |
| Mock show only (no voice)               | Check `frontend/.env.local` has valid `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`, then restart `npm run dev`                                 |
| iOS cannot reach the API                | Confirm the web server is running; on a device use your Mac’s LAN IP via `-briefingURL`                                                     |
| Voice analysis fails / sample dashboard | Ensure `frontend/models/*.onnx` exists and `npm install` completed (`onnxruntime-node`); check the terminal for `/api/voice/analyze` errors |
| `npm install` fails on native modules   | Use Node 20+ on a supported platform; `onnxruntime-node` needs a writable install for the API                                               |


---



## Privacy notes (demo)

- Profile, learning, history, and “Your day” data stay on the device.
- The server only receives what it needs for the show and analysis (e.g. name, town, interests, audio for STT / voice metrics).
- Copy is non-diagnostic: readiness language on the main screens; Parkinson’s ranges appear only in opened vital details.

---



## License / fonts

UI fonts (Bricolage Grotesque, Atkinson Hyperlegible) are bundled under their SIL Open Font License terms (see `ios/VoiceReadiness/Fonts/` for the iOS copies and licences).