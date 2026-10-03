import SwiftUI

struct WaveformView: View {
    let barCount: Int
    @State private var phase = false

    init(barCount: Int = 36) {
        self.barCount = barCount
    }

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<barCount, id: \.self) { index in
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(AppTheme.accent)
                    .frame(width: 7, height: barHeight(for: index))
                    .shadow(color: AppTheme.accent.opacity(0.45), radius: 6)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 180)
        .onAppear {
            withAnimation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true)) {
                phase.toggle()
            }
        }
        .accessibilityHidden(true)
    }

    private func barHeight(for index: Int) -> CGFloat {
        let minHeight: CGFloat = 18 + CGFloat((index * 7) % 20)
        let maxHeight: CGFloat = 70 + CGFloat((index * 13) % 90)
        return phase ? maxHeight : minHeight
    }
}
