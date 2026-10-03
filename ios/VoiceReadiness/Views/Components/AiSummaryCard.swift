import SwiftUI

struct AiSummaryCard: View {
    let summary: String
    @State private var isPlaying = false

    var body: some View {
        RetroWindow(title: "Your Voice Summary") {
            VStack(alignment: .leading, spacing: 28) {
                Text(summary)
                    .font(AppFont.body(24))
                    .lineSpacing(7)
                    .foregroundStyle(AppTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    withAnimation(.easeOut(duration: 0.2)) { isPlaying.toggle() }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 22, weight: .bold))
                        Text(isPlaying ? "Pause summary" : "Play summary")
                    }
                }
                .buttonStyle(PillButtonStyle(fill: isPlaying ? AppTheme.teal : .white))
                .accessibilityLabel(isPlaying ? "Pause voice summary" : "Play voice summary")

                if isPlaying {
                    HStack(spacing: 12) {
                        WaveformView(barCount: 9, height: 35)
                            .foregroundStyle(AppTheme.tealDeep)
                        Text("Playing summary…")
                            .font(AppFont.body(18, bold: true))
                            .foregroundStyle(AppTheme.ink)
                    }
                    .transition(.opacity)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}
