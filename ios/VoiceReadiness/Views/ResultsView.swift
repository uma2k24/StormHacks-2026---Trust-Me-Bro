import SwiftUI

struct ResultsView: View {
    let results: ScreeningResults
    let onRestart: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                VStack(spacing: 10) {
                    Text("Check-in Complete")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(AppTheme.accent.opacity(0.9))

                    Text("Here's your readiness today, \(results.user).")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 12)

                ReadinessDial(
                    score: results.readinessScore,
                    statusColor: results.statusColor
                )

                AiSummaryCard(summary: results.aiSummary)

                VitalsGrid(metrics: results.metrics)

                TrendChartView(data: results.trendData)

                Button(action: onRestart) {
                    HStack(spacing: 12) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.title2.weight(.bold))
                        Text("Start New Check-in")
                            .font(.title2.weight(.bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 80)
                    .background(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(Color(red: 0.12, green: 0.16, blue: 0.21))
                            .overlay(
                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .stroke(AppTheme.border, lineWidth: 2)
                            )
                    )
                }
                .buttonStyle(.plain)
                .padding(.bottom, 24)
            }
            .padding(.horizontal, 22)
        }
    }
}
