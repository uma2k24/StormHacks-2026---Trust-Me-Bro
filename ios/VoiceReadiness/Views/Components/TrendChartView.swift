import Charts
import SwiftUI

struct TrendChartView: View {
    let data: [TrendPoint]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Readiness Over 14 Days")
                .font(.title.weight(.bold))
                .foregroundStyle(.white)

            Text("A simple look at how your score has been trending.")
                .font(.title3)
                .foregroundStyle(AppTheme.textSecondary)

            Chart(data) { point in
                AreaMark(
                    x: .value("Day", point.day),
                    y: .value("Score", point.score)
                )
                .foregroundStyle(
                    LinearGradient(
                        colors: [AppTheme.accent.opacity(0.45), AppTheme.accent.opacity(0.02)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .interpolationMethod(.catmullRom)

                LineMark(
                    x: .value("Day", point.day),
                    y: .value("Score", point.score)
                )
                .foregroundStyle(AppTheme.accent)
                .lineStyle(StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                .interpolationMethod(.catmullRom)
            }
            .chartYScale(domain: 50...100)
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 4)) { value in
                    AxisValueLabel {
                        if let day = value.as(String.self) {
                            Text(day)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: [50, 75, 100]) { value in
                    AxisValueLabel {
                        if let score = value.as(Int.self) {
                            Text("\(score)")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(AppTheme.textSecondary)
                        }
                    }
                }
            }
            .frame(height: 240)
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(AppTheme.surface.opacity(0.85))
                    .overlay(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .stroke(AppTheme.border.opacity(0.7), lineWidth: 1)
                    )
            )
            .accessibilityLabel("Readiness trend chart for the last 14 days")
        }
    }
}
