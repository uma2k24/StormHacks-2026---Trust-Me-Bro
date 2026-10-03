import SwiftUI

struct AiSummaryCard: View {
    let summary: String
    @State private var isPlaying = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Your Voice Summary")
                .font(.title.weight(.bold))
                .foregroundStyle(AppTheme.accent.opacity(0.95))

            HStack(alignment: .top, spacing: 16) {
                Button {
                    isPlaying.toggle()
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.title.weight(.bold))
                        Text(isPlaying ? "Pause" : "Play")
                            .font(.headline.weight(.bold))
                    }
                    .foregroundStyle(Color(red: 0.05, green: 0.07, blue: 0.09))
                    .frame(width: 96, height: 96)
                    .background(AppTheme.accent, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isPlaying ? "Pause voice summary" : "Play voice summary")

                Text(summary)
                    .font(.title3)
                    .foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if isPlaying {
                Text("Playing summary…")
                    .font(.headline.weight(.medium))
                    .foregroundStyle(AppTheme.accent)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(AppTheme.surface.opacity(0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(AppTheme.border.opacity(0.7), lineWidth: 1)
                )
        )
    }
}
