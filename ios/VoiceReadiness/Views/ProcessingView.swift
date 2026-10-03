import SwiftUI

struct ProcessingView: View {
    let onComplete: () -> Void

    private let messages = [
        "Analyzing your voice...",
        "Comparing to your normal baseline...",
        "Getting your results..."
    ]

    @State private var messageIndex = 0
    @State private var pulse = false
    @State private var loopTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 36) {
            Spacer()

            ZStack {
                Circle()
                    .fill(AppTheme.accent.opacity(0.2))
                    .frame(width: 180, height: 180)
                    .scaleEffect(pulse ? 1.18 : 1.0)
                    .opacity(pulse ? 0.25 : 0.55)

                Circle()
                    .fill(Color(red: 0.18, green: 0.23, blue: 0.30).opacity(0.9))
                    .frame(width: 120, height: 120)

                Circle()
                    .fill(Color(red: 0.27, green: 0.33, blue: 0.40))
                    .frame(width: 64, height: 64)
            }
            .accessibilityHidden(true)

            Text(messages[messageIndex])
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .animation(.easeInOut(duration: 0.35), value: messageIndex)
                .accessibilityAddTraits(.updatesFrequently)

            VStack(spacing: 12) {
                capsule(widthFraction: 1.0, opacity: 0.8)
                capsule(widthFraction: 0.82, opacity: 0.6)
                capsule(widthFraction: 0.64, opacity: 0.45)
            }
            .padding(.horizontal, 28)
            .accessibilityHidden(true)

            Spacer()
        }
        .onAppear(perform: start)
        .onDisappear(perform: cleanup)
    }

    private func capsule(widthFraction: CGFloat, opacity: Double) -> some View {
        GeometryReader { geo in
            RoundedRectangle(cornerRadius: 999, style: .continuous)
                .fill(Color(red: 0.22, green: 0.28, blue: 0.35).opacity(opacity))
                .frame(width: geo.size.width * widthFraction)
                .frame(maxWidth: .infinity)
                .opacity(pulse ? 0.55 : 1.0)
        }
        .frame(height: 18)
    }

    private func start() {
        withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) {
            pulse = true
        }

        loopTask = Task { @MainActor in
            for _ in 0..<3 {
                try? await Task.sleep(nanoseconds: 1_600_000_000)
                guard !Task.isCancelled else { return }
                messageIndex = (messageIndex + 1) % messages.count
            }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            onComplete()
        }
    }

    private func cleanup() {
        loopTask?.cancel()
        loopTask = nil
    }
}
