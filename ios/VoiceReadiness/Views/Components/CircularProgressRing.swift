import SwiftUI

struct CircularProgressRing: View {
    let progress: Double
    let secondsLeft: Int
    var size: CGFloat = 148
    var lineWidth: CGFloat = 12

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(red: 0.14, green: 0.19, blue: 0.25), lineWidth: lineWidth)

            Circle()
                .trim(from: 0, to: min(max(progress, 0), 1))
                .stroke(
                    AppTheme.accent,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.2), value: progress)

            VStack(spacing: 2) {
                Text("\(secondsLeft)")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                Text("sec")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(secondsLeft) seconds remaining")
    }
}
