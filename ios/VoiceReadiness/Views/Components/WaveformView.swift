import SwiftUI

/// Equalizer bars. Colour follows the parent's foreground style.
/// Dances when `active`, rests as a calm line of dots when not.
/// Given a `level`, the bars follow the microphone instead: a calm line of dots while it's quiet,
/// rising as the person talks, so they can see the radio hears them. Mirrors Waveform.tsx.
struct WaveformView: View {
    let barCount: Int
    var height: CGFloat = 35
    var active = true
    /// How loud the microphone is right now (0...1).
    var level: (@MainActor () -> Double)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase = false
    // the microphone's level, smoothed, and a clock for the bars' little waver
    @State private var shown: Double = 0
    @State private var clock: Double = 0

    init(barCount: Int = 14, height: CGFloat = 35, active: Bool = true, level: (@MainActor () -> Double)? = nil) {
        self.barCount = barCount
        self.height = height
        self.active = active
        self.level = level
    }

    private var restingScale: CGFloat { 0.12 }
    private var live: Bool { level != nil }

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<barCount, id: \.self) { index in
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .frame(width: 5, height: height)
                    .scaleEffect(y: live ? liveScale(index) : scale)
                    .opacity(active || live ? 1 : 0.55)
                    .animation(
                        reduceMotion || !active || live
                            ? nil
                            : .easeInOut(duration: 0.65 + Double((index * 7) % 5) * 0.14)
                                .repeatForever(autoreverses: true)
                                .delay(Double((index * 3) % 7) * 0.09),
                        value: phase
                    )
            }
        }
        .frame(height: height)
        .animation(live ? .linear(duration: 1 / 30) : nil, value: shown)
        .onAppear { phase = !live }
        .task(id: live) { await follow() }
        .accessibilityHidden(true)
    }

    private var scale: CGFloat {
        if !active { return restingScale }
        return reduceMotion ? 0.7 : (phase ? 1 : 0.3)
    }

    /// The middle bars reach highest, and each wavers a little (not when motion is reduced).
    private func liveScale(_ index: Int) -> CGFloat {
        let middle = max(Double(barCount - 1) / 2, 1)
        let shape = 0.55 + 0.45 * cos((Double(index) - middle) / middle * .pi / 2)
        let waver = reduceMotion ? 1 : 0.82 + 0.18 * sin(clock * 5.9 + Double(index) * 1.9)
        return restingScale + (1 - restingScale) * CGFloat(shown * shape * waver)
    }

    /// Reads the microphone thirty times a second. It rises quickly and settles slowly, like a needle
    /// on a meter; gentler still when motion is reduced.
    private func follow() async {
        guard let level else { return }
        while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(33))
            let target = level()
            let rate = target > shown ? (reduceMotion ? 0.2 : 0.45) : (reduceMotion ? 0.08 : 0.18)
            shown += (target - shown) * rate
            clock += 1 / 30
        }
    }
}
