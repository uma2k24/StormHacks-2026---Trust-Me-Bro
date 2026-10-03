import SwiftUI

struct ContentView: View {
    @AppStorage("profile") private var profileJSON = ""
    @AppStorage("textSize") private var textSizeRaw = TextSizeStep.standard.rawValue
    @Environment(\.dynamicTypeSize) private var systemTypeSize

    private let launch = Launch.fromArguments()
    @State private var navigated: AppScreen?
    @State private var onAir: Briefing?
    // Today's live show, and which profile it was written for.
    @State private var live: (key: String, briefing: Briefing)?

    private var textSize: Binding<TextSizeStep> {
        Binding(
            get: { TextSizeStep(rawValue: textSizeRaw) ?? .standard },
            set: { textSizeRaw = $0.rawValue }
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

    /// The mock plays until the live briefing arrives. It's frozen once the show starts.
    private var briefing: Briefing {
        if let profile, let live, live.key == profile.showKey { return live.briefing }
        return CheckInScript.mockBriefing(for: profile ?? .demo)
    }

    var body: some View {
        ZStack {
            PaperBackground()

            VStack(spacing: 0) {
                AppBar()

                Group {
                    switch screen {
                    case .signUp:
                        SignUpView(textSize: textSize, initialStep: launch.step, onComplete: save)
                    case .settings:
                        SettingsView(profile: profile ?? .demo, textSize: textSize, onDone: save)
                    case .idle:
                        IdleView(
                            userName: profile?.name ?? "",
                            segments: briefing.segments,
                            onStart: {
                                onAir = briefing
                                navigated = .recording
                            },
                            onOpenSettings: { navigated = .settings }
                        )
                    case .recording:
                        RecordingView(
                            segments: (onAir ?? briefing).segments,
                            onComplete: { navigated = .processing }
                        )
                    case .processing:
                        ProcessingView(onComplete: { navigated = .results })
                    case .results:
                        ResultsView(
                            results: ScreeningResults.mock.addressed(to: profile?.name ?? ""),
                            onRestart: { navigated = .idle }
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
            guard let profile, let fetched = await BriefingService.fetchBriefing(for: profile),
                  !Task.isCancelled else { return }
            live = (profile.showKey, fetched)
            // have the opening line ready so Play starts talking straight away
            RadioVoice.shared.prefetch(fetched.segments[0].brief)
        }
    }

    private func save(_ next: Profile) {
        profileJSON = next.json
        navigated = .idle
    }
}

/// DEBUG-friendly launch arguments: `-screen signup|settings|idle|recording|processing|results`
/// and `-step 0...6` (which sign-up step to open). Jumping straight to a screen skips sign-up.
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
        default: launch.screen = .idle
        }
        return launch
    }
}

#Preview {
    ContentView()
}
