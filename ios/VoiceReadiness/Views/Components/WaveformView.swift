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

/// A bar that fills while the "ahhh" is held: empty when it starts, full when it is long enough, at
/// which point the radio carries on by itself. It follows the time actually spent making the sound, so
/// a pause for breath holds it still instead of running on. Colour follows the parent's foreground
/// style. Mirrors HoldBar.tsx.
struct HoldBarView: View {
    /// How long the voice has to be held for the bar to be full.
    let target: TimeInterval
    /// How long the voice has been held so far (pauses not counted): what the bar fills with.
    let held: @MainActor () -> TimeInterval

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown: Double = 0

    var body: some View {
        ZStack(alignment: .leading) {
            Capsule().strokeBorder(lineWidth: 2.5)

            GeometryReader { box in
                Capsule().frame(width: box.size.width * shown)
            }
            .padding(5.5)
        }
        .frame(maxWidth: 272)
        .frame(height: 22)
        .animation(reduceMotion ? nil : .linear(duration: 1 / 30), value: shown)
        .task { await follow() }
        .accessibilityHidden(true)
    }

    /// Reads the recorder thirty times a second. It counts in tenths of a second, so the bar eases
    /// between them to glide (not when motion is reduced).
    private func follow() async {
        while !Task.isCancelled {
            let goal = min(1, max(0, held() / target))
            shown = reduceMotion ? goal : shown + (goal - shown) * 0.2
            try? await Task.sleep(for: .milliseconds(33))
        }
    }
}
