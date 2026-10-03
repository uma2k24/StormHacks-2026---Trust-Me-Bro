# CLAUDE.md

## Dual-platform parity (web + iOS)

This project has two mockup clients that must stay aligned:

- Web: `frontend/` (Next.js / React / TypeScript)
- iOS: `ios/VoiceReadiness/` (SwiftUI)

When the user asks for UX, UI, copy, flow, screen, or mock-data changes:

1. Update **both** platforms in the same turn unless they explicitly say otherwise.
2. Mirror the same screens, copy, and interaction flow (idle → conversation → processing → results).
3. Keep mock scripts/data equivalent across:
   - `frontend/src/data/`
   - `ios/VoiceReadiness/Models/`
4. If a change only makes sense on one platform, still check the other and note any intentional divergence.

Do not assume updating only `frontend/` is enough — the Xcode simulator runs the iOS app.

### Rough mapping

| Web | iOS |
|---|---|
| `frontend/src/app/page.tsx` | `ios/VoiceReadiness/ContentView.swift` |
| `frontend/src/components/IdleScreen.tsx` | `ios/VoiceReadiness/Views/IdleView.swift` |
| `frontend/src/components/ActiveScreen.tsx` | `ios/VoiceReadiness/Views/RecordingView.swift` |
| `frontend/src/components/ProcessingScreen.tsx` | `ios/VoiceReadiness/Views/ProcessingView.swift` |
| `frontend/src/components/ResultsDashboard.tsx` | `ios/VoiceReadiness/Views/ResultsView.swift` |
| `frontend/src/data/checkInScript.ts` | `ios/VoiceReadiness/Models/CheckInScript.swift` |
| `frontend/src/data/mockResults.ts` | `ios/VoiceReadiness/Models/ScreeningModels.swift` |
