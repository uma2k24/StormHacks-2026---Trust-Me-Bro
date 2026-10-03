# Voice Readiness (iOS)

Native SwiftUI mockup of the daily voice readiness check-in. Big type, high contrast and a distinctive 90s-inspired look, matched to the web frontend.

## Open in Xcode

```bash
open ios/VoiceReadiness.xcodeproj
```

Then choose an iPhone simulator and press **Run** (`⌘R`).

## Requirements

- Xcode 15+
- iOS 17+ simulator or device

## Design: "Teal Desktop"

Same look and flow as the web client (see `frontend/README.md`): one colour theme of teal and coral on cream graph paper, pinstriped windows, hard shadows, Bricolage Grotesque + Atkinson Hyperlegible, a handheld radio for the conversation, and results one page at a time.

- `Views/Components/Theme.swift` — palette, fonts, font registration, text-size steps
- `Views/Components/Chrome.swift` — paper background, `RetroWindow`, button styles, `OrbFace`, `StatusChip`, `AppBar`, sonar rings, flow layout
- `Views/RecordingView.swift` — the radio (hold to talk, or tap to start and tap to send)
- `Models/BriefingService.swift` — fetches today's show and its ElevenLabs audio from the web backend
- `Fonts/` — the bundled fonts and their SIL OFL licences (registered at launch in `VoiceReadinessApp`)

**Accessibility:** every size scales with Dynamic Type, and the A / A / A control in the app bar layers on top of the system setting (it never goes smaller than what is set in iOS Settings). Status is never colour alone, motion respects Reduce Motion, and VoiceOver labels mirror the web ARIA labels. VoiceOver and Switch Control activate the Talk button with a single action that toggles listening.

**Intentional differences from web:** buttons give haptic feedback; the text-size control builds on Dynamic Type instead of replacing it; DEBUG builds accept `-screen idle|recording|processing|results`, `-autoplay` (answers the first question on its own once it's asked), `-briefingURL` and `-page 0...3` (opens a results page) as launch arguments for demos and screenshots.

## Morning briefing

The app gets the live show from the web backend (`frontend/src/app/api/briefing`), so the Gemini and ElevenLabs keys never ship in the app. Run `npm run dev` in `frontend/` with a `.env.local` (see `frontend/.env.example`) and the simulator reaches it at `http://127.0.0.1:3000`. With no backend, the mock show in `Models/CheckInScript.swift` plays with on-screen reading time instead of a voice. DEBUG builds accept `-briefingURL http://host:port` to use another server (a real device needs your Mac's LAN address).

## Flow

1. **Idle** — "Your morning radio is ready", a giant Play button, and what's on today's show  
2. **Morning briefing** — a little radio reads three short segments (weather, a score, local news) and asks your opinion after each  
3. **Processing** — calming loader with chatty status text  
4. **Results** — four pages, one at a time: readiness gauge, voice summary, vitals, 14-day trend  

Copy stays non-diagnostic: readiness, jitter, shimmer, HNR, MPP, and “your usual.”
