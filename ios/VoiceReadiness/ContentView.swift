import SwiftUI

struct ContentView: View {
    @State private var screen: AppScreen = ContentView.initialScreen()
    @AppStorage("textSizeStep") private var textSizeRaw = TextSizeStep.standard.rawValue
    @Environment(\.dynamicTypeSize) private var systemTypeSize
    private let results = ScreeningResults.mock
    // Today's show: the mock plays until the live briefing arrives. It's frozen once the show starts.
    @State private var briefing = CheckInScript.mockBriefing
    @State private var onAir: Briefing?

    private var textSize: Binding<TextSizeStep> {
        Binding(
            get: { TextSizeStep(rawValue: textSizeRaw) ?? .standard },
            set: { textSizeRaw = $0.rawValue }
        )
    }

    var body: some View {
        ZStack {
            PaperBackground()

            VStack(spacing: 0) {
                AppBar(textSize: textSize)

                Group {
                    switch screen {
                    case .idle:
                        IdleView(
                            userName: results.user,
                            segments: briefing.segments,
                            onStart: {
                                onAir = briefing
                                screen = .recording
                            }
                        )
                    case .recording:
                        RecordingView(
                            segments: (onAir ?? briefing).segments,
                            onComplete: { screen = .processing }
                        )
                    case .processing:
                        ProcessingView(onComplete: { screen = .results })
                    case .results:
                        ResultsView(results: results, onRestart: { screen = .idle })
                    }
                }
                // The in-app text size sits on top of the system Dynamic Type setting.
                .dynamicTypeSize(textSize.wrappedValue.dynamicTypeSize(system: systemTypeSize))
                .frame(maxWidth: 560)
                .frame(maxHeight: .infinity)
            }
        }
        .preferredColorScheme(.light)
        .task {
            guard let live = await BriefingService.fetchBriefing(name: results.user) else { return }
            briefing = live
            // have the opening line ready so Play starts talking straight away
            RadioVoice.shared.prefetch(live.segments[0].brief)
        }
    }

    private static func initialScreen() -> AppScreen {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-screen"),
              args.indices.contains(index + 1) else {
            return .idle
        }
        switch args[index + 1] {
        case "recording", "chat": return .recording
        case "processing": return .processing
        case "results": return .results
        default: return .idle
        }
    }
}

#Preview {
    ContentView()
}
