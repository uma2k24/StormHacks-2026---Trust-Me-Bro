# Voice Readiness (iOS)

Native SwiftUI mockup of the daily voice readiness check-in.

## Open in Xcode

```bash
open ios/VoiceReadiness.xcodeproj
```

Then choose an iPhone simulator and press **Run** (`⌘R`).

## Requirements

- Xcode 15+
- iOS 17+ simulator or device

## Flow

1. **Idle** — giant tap-to-talk microphone  
2. **Recording** — waveform, reading prompt, 30s progress ring  
3. **Processing** — calming loader with reassuring status text  
4. **Results** — readiness dial, voice summary, vitals, 14-day trend  

Copy stays non-diagnostic: readiness, energy, vocal control, and “your normal.”
