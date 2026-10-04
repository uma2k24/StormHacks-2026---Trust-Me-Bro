import SwiftUI

struct ProcessingView: View {
    /// The voice analysis. The loader fills most of the way by itself, then waits here until it is done.
    let work: Task<Void, Never>?
    let onComplete: () -> Void

    private let messages = [
        "Hearing you back…",
        "Comparing to your usual…",
        "Almost there…"
    ]

    // 16 blocks x 300 ms = the same 4.8 s (+ a short rest) as the web client.
    private static let blockCount = 16
    private static let tick: Duration = .milliseconds(300)

    @ScaledMetric(relativeTo: .title) private var messageSize: CGFloat = 34
    @State private var filled = 0
    @State private var loopTask: Task<Void, Never>?
    @State private var watchTask: Task<Void, Never>?
    @State private var finished = false

    private var messageIndex: Int {
        min(Int(Double(filled) / Double(Self.blockCount) * Double(messages.count)), messages.count - 1)
    }

    private var percent: Int {
        Int((Double(filled) / Double(Self.blockCount) * 100).rounded())
    }

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                window
                    .padding(.horizontal, 20)
                    .padding(.trailing, AppTheme.pop)
                    .padding(.vertical, 24)
                    .frame(minHeight: proxy.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .onAppear(perform: start)
        .onDisappear(perform: cleanup)
    }

    private var window: some View {
        RetroWindow(title: "Working…") {
            VStack(spacing: 34) {
                ZStack {
                    Circle().fill(AppTheme.teal)
                    WaveformView(barCount: 7, height: 44).foregroundStyle(AppTheme.ink)
                }
                .frame(width: 96, height: 96)
                .overlay { Circle().stroke(AppTheme.ink, lineWidth: 3) }
                .hardShadow(Circle(), offset: 4)
                .padding(.top, 6)

                VStack(spacing: 12) {
                    Text(messages[messageIndex])
                        .font(AppFont.head(messageSize, relativeTo: .title))
                        .foregroundStyle(AppTheme.ink)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .id(messageIndex)
                        .transition(.asymmetric(insertion: .scale(scale: 0.96).combined(with: .opacity), removal: .identity))
                        .accessibilityAddTraits(.updatesFrequently)

                    Text("Please wait a moment.")
                        .font(AppFont.body(22))
                        .foregroundStyle(AppTheme.inkSoft)
                }

                progressBlocks
                    .padding(.bottom, 6)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var progressBlocks: some View {
        HStack(spacing: 3) {
            ForEach(0..<Self.blockCount, id: \.self) { index in
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(index < filled ? AppTheme.teal : AppTheme.paperDeep)
                    .frame(height: 32)
            }
        }
        .padding(5)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(AppTheme.ink, lineWidth: 3) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Checking your voice")
        .accessibilityValue("\(percent) percent")
    }

    private func start() {
        finished = work == nil
        watchTask = Task { @MainActor in
            await work?.value
            finished = true
        }
        loopTask = Task { @MainActor in
            while filled < Self.blockCount {
                try? await Task.sleep(for: finished ? Self.tick / 3 : Self.tick)
                guard !Task.isCancelled else { return }
                // two blocks short of the end until the analysis is in, then the rest fill quickly
                if filled < (finished ? Self.blockCount : Self.blockCount - 2) {
                    withAnimation(.easeOut(duration: 0.2)) { filled += 1 }
                }
            }
            try? await Task.sleep(for: Self.tick)
            guard !Task.isCancelled else { return }
            onComplete()
        }
    }

    private func cleanup() {
        loopTask?.cancel()
        loopTask = nil
        watchTask?.cancel()
        watchTask = nil
    }
}
