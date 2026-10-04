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

- `Views/Components/Theme.swift` — palette, fonts, font registration
- `Views/Components/Chrome.swift` — paper background, `RetroWindow`, button styles, `OrbFace`, `StatusChip`, `AppBar`, sonar rings, flow layout
- `Models/Profile.swift` — the listener's name, town and interests, and the text sizes (stored as JSON in `@AppStorage`; mirrors `frontend/src/data/profile.ts`)
- `Views/SignUpView.swift`, `Views/SettingsView.swift`, `Views/Components/Forms.swift` — the sign-up steps, the Settings screen and the shared fields, tick-box pickers and progress dots
- `Views/RecordingView.swift` — the radio: hands-free (it speaks with live captions, then listens by itself, answers, and moves on); Talk / Done and hold-to-talk still work
- `Models/BriefingService.swift` — fetches today's show and its ElevenLabs audio from the web backend, and plays it (`RadioVoice`, which reports how far through a line it is so words can appear as they are said)
- `Models/AnswerRecorder.swift` — records one spoken answer (uncompressed 16 kHz WAV, which is both what ElevenLabs hears and what the voice analysis measures), hears the end of it, and ends the sustained "ahhh" by itself once it has been held for 8 s; `Models/ConversationService.swift` — sends it to `/api/conversation/transcribe` (ElevenLabs Scribe) and asks `/api/conversation/reply` (Gemini, with the forecast and Google Search) for the host's reply, and, when the show needs more talking, for the next question in the same request. Mirrors `frontend/src/lib/recorder.ts`, `conversationClient.ts` and `conversation.ts`
- `Models/VoiceAnalysis.swift` — uploads what the show recorded to the web backend's `/api/voice/analyze` (the ONNX classifier and the jitter / shimmer / HNR measures run there, so both clients share one implementation) and decodes the answer. `Models/VoiceReading.swift` turns it into the dashboard on the device: zones, readiness score, plain-words summary, trend. `Views/Components/VitalDetailView.swift` is the drill-down opened by tapping a vital. Mirrors `frontend/src/lib/voiceClient.ts` and `frontend/src/data/voiceReading.ts`; `frontend/README.md` ("Voice analysis") explains the approach
- `Models/Daily.swift` — the day's rhythm, all on the device: greeting and date, the week of mornings tuned in (`@AppStorage("history")`), the three little things for Your day, the family message and the radio's closing reminder; mirrors `frontend/src/data/daily.ts`. `Models/MorningReminder.swift` schedules the daily "your radio is ready" notification. `Views/TodayView.swift` is the Your day screen; `WeekLamps` lives in `Views/IdleView.swift`
- `Models/Learning.swift` — what the radio has learned about the listener (stored as JSON in `@AppStorage("learned")`) and how it chooses today's two interests and what each extra question is about (it also keeps the last eight topics asked, so a question isn't a repeat); mirrors `frontend/src/data/learning.ts`, which explains the approach. Today's show is kept in `@AppStorage("today")`, so the backend (and Gemini) is asked for at most one show a day. Demo launch arguments learn nothing.
- `Fonts/` — the bundled fonts and their SIL OFL licences (registered at launch in `VoiceReadinessApp`)

**Accessibility:** every size scales with Dynamic Type, and the Big / Bigger / Biggest choice (sign-up and Settings) layers on top of the system setting (it never goes smaller than what is set in iOS Settings). Status is never colour alone, motion respects Reduce Motion, and VoiceOver labels mirror the web ARIA labels. VoiceOver and Switch Control activate the Talk button with a single action that toggles listening.

**Intentional differences from web:** the morning reminder is a real local notification (permission is asked the moment a time is picked), where the web offers a calendar event; buttons give haptic feedback; text sizes map to Dynamic Type (Big = xxLarge, Bigger = xxxLarge by default, Biggest = accessibility1; never smaller than the system setting); DEBUG builds accept `-screen signup|settings|idle|recording|processing|results|today` (anything but a bare launch skips sign-up with a demo listener and a lived-in week), `-step 0...9` (which sign-up step to open), `-briefingURL` and `-page 0...3` (opens a results page), `-detail jitter|shimmer|hnr` (opens a vital's numbers) as launch arguments for demos and screenshots.

## Morning briefing

The app gets the live show from the web backend (`frontend/src/app/api/briefing`), so the Gemini and ElevenLabs keys never ship in the app. Run `npm run dev` in `frontend/` with a `.env.local` (see `frontend/.env.example`) and the simulator reaches it at `http://127.0.0.1:3000`. With no backend, the mock show in `Models/CheckInScript.swift` plays with on-screen reading time instead of a voice. It says nothing that could be wrong for the listener (no scores, teams, towns, dates, seasons or weather), and each topic has several lines used in turn (`FixedLines.take` remembers which comes next), so a line is not heard again until the rest have been. DEBUG builds accept `-briefingURL http://host:port` to use another server (a real device needs your Mac's LAN address).

## Talking back

Same conversation as the web client (see `frontend/README.md`, "Talking back"): the answer is recorded with `AVAudioRecorder`, ElevenLabs Scribe turns it into words, and Gemini writes the host's reply, which is read aloud. Microphone permission is asked for when **Play** is tapped (`NSMicrophoneUsageDescription` is in the project), so no system dialog interrupts the conversation. With no microphone, no permission or no backend the radio plays a sample answer instead. The audio session is play-and-record through the speaker for the whole show.

The Simulator listens through the Mac's microphone.

## Flow

0. **Sign up** (first launch only) — ten one-question steps: welcome, name, town, interests, anything else, family, a daily reminder, radio time, text size, all set  
1. **Idle** — the date in the menu bar, a greeting that follows the clock, a giant Play button, what's on today's show, and a bottom row with **Call Sarah** (when family is set) and **Settings**. Once today's show is done: **Your day**, a little **Play again**, and the last seven mornings as radio lamps. Tap a ticked lamp to look at that morning's results again (worded as "Saturday" rather than "today"; the summary isn't read aloud until asked, and the last arrow goes back home). Each day keeps the numbers of its latest check-in; mornings saved before the numbers were kept stay plain lamps  
2. **Morning briefing** — a little radio reads three short segments (the weather, then two things from your interests) and asks your opinion after each. If that isn't enough talking for the voice analysis it asks a few more plain questions, and the last question is always the sustained "ahhh". The radio's words appear as they are said and scroll by themselves; the microphone then opens by itself and a pause sends the answer, the host replies, and the show moves on, with no touching after Play. Its last line is their daily reminder ("Before you go, a little reminder: take your blood pressure pill")  
3. **Processing** — calming loader with chatty status text; it waits for the voice analysis  
4. **Results** — four pages, one at a time: readiness gauge, voice summary (**Read it to me** reads it aloud, words lighting up as they're said), vitals (tap one to see the numbers: its scale and ranges, and the classifier's probability against its threshold), trend  
5. **Your day** — three little things to tick off (their reminder, one for their voice, one from the weather), and **Tell Sarah how I am**, which opens Messages with a note written from the result (on a tired day: **Ask Sarah to call me**)  

Copy stays non-diagnostic: readiness, jitter, shimmer, HNR and “your usual.” The ranges, and the word Parkinson's, appear only in the details someone opens.
