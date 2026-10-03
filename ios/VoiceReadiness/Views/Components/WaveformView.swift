import SwiftUI

/// Equalizer bars. Colour follows the parent's foreground style.
/// Dances when `active`, rests as a calm line of dots when not.
struct WaveformView: View {
    let barCount: Int
    var height: CGFloat = 35
    var active = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase = false

    init(barCount: Int = 14, height: CGFloat = 35, active: Bool = true) {
        self.barCount = barCount
        self.height = height
        self.active = active
    }

    private var restingScale: CGFloat { 0.12 }

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<barCount, id: \.self) { index in
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .frame(width: 5, height: height)
                    .scaleEffect(y: scale)
                    .opacity(active ? 1 : 0.55)
                    .animation(
                        reduceMotion || !active
                            ? nil
                            : .easeInOut(duration: 0.65 + Double((index * 7) % 5) * 0.14)
                                .repeatForever(autoreverses: true)
                                .delay(Double((index * 3) % 7) * 0.09),
                        value: phase
                    )
            }
        }
        .frame(height: height)
        .onAppear { phase = true }
        .accessibilityHidden(true)
    }

    private var scale: CGFloat {
        if !active { return restingScale }
        return reduceMotion ? 0.7 : (phase ? 1 : 0.3)
    }
}
