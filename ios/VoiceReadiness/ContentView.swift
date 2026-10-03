import SwiftUI

struct ContentView: View {
    @State private var screen: AppScreen = .idle
    private let results = ScreeningResults.mock

    var body: some View {
        ZStack {
            background
                .ignoresSafeArea()

            Group {
                switch screen {
                case .idle:
                    IdleView(
                        userName: results.user,
                        yesterdayScore: results.yesterdayScore,
                        yesterdayLabel: results.yesterdayLabel,
                        onStart: { screen = .recording }
                    )
                case .recording:
                    RecordingView(onComplete: { screen = .processing })
                case .processing:
                    ProcessingView(onComplete: { screen = .results })
                case .results:
                    ResultsView(results: results, onRestart: { screen = .idle })
                }
            }
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .preferredColorScheme(.dark)
    }

    private var background: some View {
        ZStack {
            AppTheme.background
            RadialGradient(
                colors: [AppTheme.accent.opacity(0.08), .clear],
                center: .top,
                startRadius: 40,
                endRadius: 420
            )
        }
    }
}

#Preview {
    ContentView()
}
