import SwiftUI

struct WaveformView: View {
    let barCount: Int
    let compact: Bool
    @State private var phase = false

    init(barCount: Int = 36, compact: Bool = false) {
        self.barCount = barCount
        self.compact = compact
    }

    var body: some View {
        HStack(spacing: compact ? 3 : 6) {
            ForEach(0..<barCount, id: \.self) { index in
                RoundedRectangle(cornerRadius: compact ? 2 : 4, style: .continuous)
                    .fill(AppTheme.accent)
                    .frame(width: compact ? 3.5 : 7, height: barHeight(for: index))
                    .shadow(color: AppTheme.accent.opacity(compact ? 0 : 0.45), radius: 6)
            }
        }
        .frame(maxWidth: compact ? 220 : .infinity)
        .frame(height: compact ? 40 : 180)
        .onAppear {
            withAnimation(.easeInOut(duration: compact ? 0.7 : 0.85).repeatForever(autoreverses: true)) {
                phase.toggle()
            }
        }
        .accessibilityHidden(true)
    }

    private func barHeight(for index: Int) -> CGFloat {
        if compact {
            let minHeight: CGFloat = 8 + CGFloat((index * 5) % 10)
            let maxHeight: CGFloat = 22 + CGFloat((index * 9) % 14)
            return phase ? maxHeight : minHeight
        }

        let minHeight: CGFloat = 18 + CGFloat((index * 7) % 20)
        let maxHeight: CGFloat = 70 + CGFloat((index * 13) % 90)
        return phase ? maxHeight : minHeight
    }
}
