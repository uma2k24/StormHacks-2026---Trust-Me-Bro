import SwiftUI

struct ContentView: View {
    @AppStorage("profile") private var profileJSON = ""
    @AppStorage("textSize") private var textSizeRaw = TextSizeStep.standard.rawValue
    @AppStorage("talkSpeed") private var talkSpeedRaw = TalkSpeedStep.standard.rawValue
    // What the radio has learned about this listener, and today's show (see Learning.swift).
    @AppStorage("learned") private var learnedJSON = ""
    @AppStorage("today") private var todayJSON = ""
    // Which mornings they've tuned in, and what they ticked off each day (see Daily.swift).
    @AppStorage("history") private var historyJSON = ""
    @Environment(\.dynamicTypeSize) private var systemTypeSize

    private let launch = Launch.fromArguments()
    @State private var navigated: AppScreen?
    @State private var onAir: Briefing?
    // This morning's voice analysis: in flight while the Processing screen shows, then its answer.
    @State private var work: Task<Void, Never>?
    @State private var analysis: VoiceAnalysis?
    // The day this screen opened on: an app left running overnight keeps the show it has.
    @State private var today = Learning.dayKey()
    // Today's first check-in has just happened: today's lamp lights up the next time home is shown.
    @State private var lightLamp = false

    private var textSize: Binding<TextSizeStep> {
        Binding(
            get: { TextSizeStep(rawValue: textSizeRaw) ?? .standard },
            set: { textSizeRaw = $0.rawValue }
        )
    }

    private var talkSpeed: Binding<TalkSpeedStep> {
        Binding(
            get: { TalkSpeedStep(rawValue: talkSpeedRaw) ?? .standard },
            set: { talkSpeedRaw = $0.rawValue }
        )
    }

    /// Who signed up (or the demo listener when a launch argument jumps straight to a screen).
    private var profile: Profile? {
        Profile(json: profileJSON) ?? (launch.demo ? .demo : nil)
    }

    /// Nobody has signed up yet: the only way in is the sign-up flow.
    private var screen: AppScreen {
        profile == nil ? .signUp : (navigated ?? launch.screen)
    }

    /// Today's show for this profile, kept on the device so it is only ever asked for once a day.
    private var todays: TodaysShow? {
        guard let profile, let saved = TodaysShow(json: todayJSON),
              saved.key == profile.showKey, saved.day == today else { return nil }
        return saved
    }

    /// The mock plays until the live briefing arrives. It's frozen once the show starts.
    private var briefing: Briefing {
        todays?.briefing ?? CheckInScript.mockBriefing(for: profile ?? .demo, picks: todays?.picks)
    }

    /// The mornings they've tuned in. A demo launch has no listener, so it borrows a lived-in week.
    private var history: History {
        let saved = History(json: historyJSON)
        guard Profile(json: profileJSON) == nil else { return saved }
        var demo = Daily.demoHistory(today: today)
        demo.days.merge(saved.days) { _, saved in saved }
        return demo
    }

    /// The dashboard is worked out from this morning's voice. Demo launches, and a morning that couldn't
    /// be measured, show placeholder numbers (marked as a sample on the screen).
    private var results: ScreeningResults {
        guard let analysis else { return ScreeningResults.mock.addressed(to: profile?.name ?? "") }
        return VoiceReading.results(
            user: profile?.name ?? "",
            analysis: analysis,
            earlier: Daily.trendBefore(history, today: today),
            yesterday: Daily.yesterdayScore(history, today: today)
        )
    }

    /// Today's little things, from the results, this morning's weather segment and their own reminder.
    private var todaysList: [Daily.TodayItem] {
        Daily.plan(
            for: profile ?? .demo,
            results: results,
            weather: (onAir ?? briefing).segments.first { $0.kind == .weather }?.brief
        )
    }

    var body: some View {
        ZStack {
            PaperBackground()

            VStack(spacing: 0) {
                AppBar()

                Group {
                    switch screen {
                    case .signUp:
                        SignUpView(
                            textSize: textSize,
                            talkSpeed: talkSpeed,
                            initialStep: launch.step,
                            onComplete: save
                        )
                    case .settings:
                        SettingsView(
                            profile: profile ?? .demo,
                            textSize: textSize,
                            talkSpeed: talkSpeed,
                            onDone: save
                        )
                    case .idle:
                        let ticked = history.days[today]?.done ?? []
                        IdleView(
                            profile: profile ?? .demo,
                            segments: briefing.segments,
                            doneToday: history.days[today] != nil,
                            week: Daily.lastSevenDays(history, today: today),
                            streak: Daily.streak(history, today: today),
                            lightToday: lightLamp,
                            onLampLit: { lightLamp = false },
                            listDone: todaysList.filter { ticked.contains($0.id) }.count,
                            listTotal: todaysList.count,
                            onStart: {
                                onAir = briefing
                                // Ask for the microphone now, so the system's question comes before the show
                                // and never in the middle of it.
                                Task {
                                    _ = await AnswerRecorder.requestPermission()
                                    navigated = .recording
                                }
                            },
                            onOpenToday: { navigated = .today },
                            onOpenSettings: { navigated = .settings }
                        )
                    case .recording:
                        RecordingView(
                            segments: (onAir ?? briefing).segments,
                            profile: profile ?? .demo,
                            onAnswer: recordAnswer,
                            onComplete: finishRecording
                        )
                    case .processing:
                        ProcessingView(work: work, onComplete: { navigated = .results })
                    case .results:
                        ResultsView(results: results, onFinish: { navigated = .today })
                    case .today:
                        TodayView(
                            profile: profile ?? .demo,
                            status: results.statusColor,
                            items: todaysList,
                            done: history.days[today]?.done ?? [],
                            onToggle: tick,
                            onDone: { navigated = .idle }
                        )
                    }
                }
                // Big text by default, on top of the system Dynamic Type setting.
                .dynamicTypeSize(textSize.wrappedValue.dynamicTypeSize(system: systemTypeSize))
                .frame(maxWidth: 560)
                .frame(maxHeight: .infinity)
            }
        }
        .preferredColorScheme(.light)
        .task(id: profile?.showKey) {
            guard let profile else { return }

            // The two interests are chosen here from what the listener has responded to, so Gemini is
            // only asked to write the show, never to decide it. The choice is saved with the day's
            // show, so learning more later today can't change it (a new choice would mean a new
            // Gemini call).
            let plan = todays ?? TodaysShow(
                day: today,
                key: profile.showKey,
                picks: Learning.chooseInterests(for: profile, learned: Learned(json: learnedJSON), day: today)
            )
            if todays == nil { todayJSON = plan.json }

            if let saved = plan.briefing {
                RadioVoice.shared.prefetch(saved.segments[0].brief) // so Play starts talking straight away
                return
            }

            // A mock show (no Gemini key) isn't kept: it costs nothing to make again.
            guard let fetched = await BriefingService.fetchBriefing(for: profile, picks: plan.picks),
                  fetched.source == .live, !Task.isCancelled else { return }
            var show = plan
            show.briefing = fetched
            todayJSON = show.json
            RadioVoice.shared.prefetch(fetched.segments[0].brief)
        }
    }

    private func save(_ next: Profile) {
        profileJSON = next.json
        navigated = .idle
        Task { await MorningReminder.schedule(for: next) }
    }

    /// The show is over. Today counts as done whatever happens next; the voice is analysed while the
    /// Processing screen shows, and a real score replaces the placeholder (or the day stays out of the trend).
    private func finishRecording(_ captured: CapturedVoice) {
        if history.days[today] == nil { lightLamp = true }
        historyJSON = History(json: historyJSON)
            .recordingCheckIn(on: today, score: ScreeningResults.mock.readinessScore).json
        analysis = nil
        let day = today
        work = Task { @MainActor in
            guard case .done(let result) = await VoiceService.analyse(captured) else { return }
            analysis = result
            let score = VoiceReading.readiness(probability: result.probability, threshold: result.threshold)
            historyJSON = History(json: historyJSON).recordingCheckIn(on: day, score: score, measured: true).json
        }
        navigated = .processing
    }

    /// Ticks one of today's little things off, or back on.
    private func tick(_ id: String) {
        var saved = History(json: historyJSON)
        // a demo launch can open the list before any show has been heard
        if saved.days[today] == nil {
            saved = saved.recordingCheckIn(on: today, score: ScreeningResults.mock.readinessScore)
        }
        historyJSON = saved.toggling(id, on: today).json
    }

    /// Each answer teaches the radio a little about what this listener enjoys.
    private func recordAnswer(_ segment: BriefingSegment, _ timing: AnswerTiming) {
        guard Profile(json: profileJSON) != nil else { return } // a demo launch isn't a real listener
        learnedJSON = Learning.learn(
            Learned(json: learnedJSON),
            kind: segment.kind,
            engagement: Learning.engagement(of: timing),
            day: Learning.dayKey()
        ).json
    }
}

/// DEBUG-friendly launch arguments: `-screen signup|settings|idle|recording|processing|results|today`
/// and `-step 0...10` (which sign-up step to open). Jumping straight to a screen skips sign-up.
private struct Launch {
    var screen: AppScreen = .idle
    var step = 0
    var demo = false

    static func fromArguments() -> Launch {
        let args = ProcessInfo.processInfo.arguments
        var launch = Launch()

        if let index = args.firstIndex(of: "-step"), args.indices.contains(index + 1) {
            launch.step = Int(args[index + 1]) ?? 0
        }
        guard let index = args.firstIndex(of: "-screen"), args.indices.contains(index + 1) else {
            return launch
        }

        launch.demo = true
        switch args[index + 1] {
        case "signup": launch.screen = .signUp
        case "settings": launch.screen = .settings
        case "recording", "chat": launch.screen = .recording
        case "processing": launch.screen = .processing
        case "results": launch.screen = .results
        case "today": launch.screen = .today
        default: launch.screen = .idle
        }
        return launch
    }
}

#Preview {
    ContentView()
}
