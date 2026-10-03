import SwiftUI

struct ReadinessDial: View {
    let score: Int
    let statusColor: StatusColor

    private let size: CGFloat = 280
    private let lineWidth: CGFloat = 22

    var body: some View {
        VStack(spacing: 22) {
            ZStack {
                Circle()
                    .stroke(Color(red: 0.14, green: 0.19, blue: 0.25), lineWidth: lineWidth)

                Circle()
                    .trim(from: 0, to: CGFloat(min(max(score, 0), 100)) / 100)
                    .stroke(
                        statusColor.color,
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                VStack(spacing: 6) {
                    Text("\(score)")
                        .font(.system(size: 84, weight: .bold))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                    Text("out of 100")
                        .font(.title3.weight(.medium))
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
            .frame(width: size, height: size)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Today's readiness score \(score) out of 100. \(statusColor.label).")

            (
                Text("Today's Readiness: ")
                    .foregroundStyle(.white)
                +
                Text(statusColor.label)
                    .foregroundStyle(statusColor.color)
            )
            .font(.system(size: 30, weight: .bold))
            .multilineTextAlignment(.center)
        }
    }
}
