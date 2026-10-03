import SwiftUI

struct RecordingView: View {
    let onComplete: () -> Void

    private let totalSeconds = 30.0
    @State private var elapsed = 0.0
    @State private var tickTask: Task<Void, Never>?

    private var progress: Double { elapsed / totalSeconds }
    private var secondsLeft: Int { max(0, Int(ceil(totalSeconds - elapsed))) }

    var body: some View {
        VStack(spacing: 28) {
            VStack(spacing: 14) {
                Text("LISTENING")
                    .font(.headline.weight(.bold))
                    .tracking(3)
                    .foregroundStyle(AppTheme.accent)

                Text("Please say:")
                    .font(.title2.weight(.medium))
                    .foregroundStyle(AppTheme.textSecondary)

                Text("“The quick brown fox jumps over the lazy dog.”")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.7)
            }
            .padding(.top, 20)

            Spacer()

            ZStack {
                RadialGradient(
                    colors: [AppTheme.accent.opacity(0.22), .clear],
                    center: .center,
                    startRadius: 20,
                    endRadius: 220
                )
                .frame(height: 260)

                WaveformView()
            }

            CircularProgressRing(progress: progress, secondsLeft: secondsLeft)

            Spacer()

            Button(action: finish) {
                HStack(spacing: 12) {
                    Image(systemName: "stop.fill")
                        .font(.title2.weight(.bold))
                    Text("Done")
                        .font(.title.weight(.bold))
                }
                .foregroundStyle(Color(red: 0.05, green: 0.07, blue: 0.09))
                .frame(maxWidth: .infinity)
                .frame(height: 80)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.bottom, 12)
        }
        .padding(.horizontal, 24)
        .onAppear(perform: startTimer)
        .onDisappear(perform: stopTimer)
    }

    private func startTimer() {
        let startedAt = Date()
        tickTask = Task { @MainActor in
            while !Task.isCancelled {
                let next = min(totalSeconds, Date().timeIntervalSince(startedAt))
                elapsed = next
                if next >= totalSeconds {
                    finish()
                    return
                }
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
        }
    }

    private func stopTimer() {
        tickTask?.cancel()
        tickTask = nil
    }

    private func finish() {
        stopTimer()
        onComplete()
    }
}
