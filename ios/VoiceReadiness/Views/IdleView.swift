import SwiftUI

struct IdleView: View {
    let userName: String
    let yesterdayScore: Int
    let yesterdayLabel: String
    let onStart: () -> Void

    @State private var pulse = false

    var body: some View {
        VStack(spacing: 36) {
            VStack(spacing: 12) {
                Text("Daily Voice Check-in")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(AppTheme.accent.opacity(0.9))

                Text("Good Morning, \(userName).")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(AppTheme.textPrimary)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.8)
            }
            .padding(.top, 24)

            Spacer()

            Button(action: onStart) {
                ZStack {
                    Circle()
                        .fill(AppTheme.accent.opacity(0.18))
                        .frame(width: 260, height: 260)
                        .scaleEffect(pulse ? 1.12 : 1.0)
                        .opacity(pulse ? 0.35 : 0.7)

                    Circle()
                        .fill(AppTheme.accent.opacity(0.25))
                        .frame(width: 210, height: 210)
                        .scaleEffect(pulse ? 1.08 : 1.0)

                    Circle()
                        .fill(AppTheme.accent)
                        .frame(width: 176, height: 176)
                        .shadow(color: AppTheme.accent.opacity(0.45), radius: 28, y: 8)

                    Image(systemName: "mic.fill")
                        .font(.system(size: 72, weight: .semibold))
                        .foregroundStyle(Color(red: 0.05, green: 0.07, blue: 0.09))
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Tap to start a conversational check-in")
            .frame(minWidth: 176, minHeight: 176)

            Text("Want to check in? Just tap and we'll talk.")
                .font(.title2.weight(.medium))
                .foregroundStyle(AppTheme.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)

            Spacer()

            Text("Yesterday: \(yesterdayScore) — \(yesterdayLabel)")
                .font(.title3.weight(.semibold))
                .foregroundStyle(StatusColor.green.color)
                .padding(.horizontal, 22)
                .padding(.vertical, 14)
                .background(
                    Capsule()
                        .fill(StatusColor.green.color.opacity(0.14))
                        .overlay(
                            Capsule()
                                .stroke(StatusColor.green.color.opacity(0.4), lineWidth: 1.5)
                        )
                )
                .padding(.bottom, 16)
        }
        .padding(.horizontal, 24)
        .onAppear {
            withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }
}
