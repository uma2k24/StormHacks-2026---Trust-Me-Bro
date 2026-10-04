import SwiftUI

/// The summary in plain words, and a button that reads it aloud while each word lights up as it is
/// said. Mirrors AiSummaryCard.tsx on the web.
struct AiSummaryCard: View {
    let summary: String
    @State private var isPlaying = false
    // how many words have been read so far while playing
    @State private var revealed = 0
    @State private var playback: Task<Void, Never>?
    // which press of Play is current, so a stopped reading finishing late can't undo a new one
    @State private var playCount = 0

    private var words: [Substring] { summary.split(whereSeparator: \.isWhitespace) }

    /// Read words in ink, the word being said under the highlighter, the rest a shade softer.
    private var readAlong: AttributedString {
        var result = AttributedString()
        for (index, word) in words.enumerated() {
            if index > 0 { result += AttributedString(" ") }
            var piece = AttributedString(String(word))
            if isPlaying {
                if index == revealed - 1 {
                    piece.backgroundColor = AppTheme.marker
                } else if index >= revealed {
                    piece.foregroundColor = AppTheme.inkSoft
                }
            }
            result += piece
        }
        return result
    }

    var body: some View {
        RetroWindow(title: "Your Voice Summary") {
            VStack(alignment: .leading, spacing: 28) {
                Text(readAlong)
                    .font(AppFont.body(24))
                    .lineSpacing(7)
                    .foregroundStyle(AppTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(summary)

                Button(action: toggle) {
                    HStack(spacing: 12) {
                        Image(systemName: isPlaying ? "stop.fill" : "play.fill")
                            .font(.system(size: 22, weight: .bold))
                        Text(isPlaying ? "Stop" : "Read it to me")
                        if isPlaying {
                            WaveformView(barCount: 5, height: 26)
                                .foregroundStyle(AppTheme.ink)
                        }
                    }
                }
                .buttonStyle(PillButtonStyle(fill: isPlaying ? AppTheme.teal : .white))
                .accessibilityLabel(isPlaying ? "Stop reading the summary" : "Read the summary aloud")
            }
        }
        .onDisappear { playback?.cancel() } // leaving the page stops the voice
    }

    private func toggle() {
        if isPlaying {
            playback?.cancel()
            return
        }
        isPlaying = true
        revealed = 0
        playCount += 1
        let press = playCount
        let text = summary
        playback = Task { @MainActor in
            await RadioVoice.shared.readAloud(text) { fraction in
                let count = CheckInScript.wordsSpoken(in: text, fraction: fraction)
                if revealed != count { revealed = count }
            }
            guard press == playCount else { return }
            isPlaying = false
            playback = nil
        }
    }
}
