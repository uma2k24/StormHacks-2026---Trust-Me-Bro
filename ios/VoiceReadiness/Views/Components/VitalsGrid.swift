import SwiftUI

struct VitalsGrid: View {
    let metrics: [Metric]

    private let columns = [
        GridItem(.flexible(), spacing: 14),
        GridItem(.flexible(), spacing: 14)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Today's Vitals")
                .font(.title.weight(.bold))
                .foregroundStyle(.white)

            LazyVGrid(columns: columns, spacing: 14) {
                ForEach(metrics) { metric in
                    VitalCard(metric: metric)
                }
            }
        }
    }
}

private struct VitalCard: View {
    let metric: Metric

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: metric.systemImage)
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(AppTheme.accent.opacity(0.95))
                .frame(width: 64, height: 64)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Color(red: 0.12, green: 0.16, blue: 0.21))
                )

            Text(metric.label)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)

            Text(metric.status)
                .font(.title2.weight(.bold))
                .foregroundStyle(metric.isWarning ? AppTheme.accent : StatusColor.green.color)

            HStack(spacing: 8) {
                Image(systemName: metric.deviation == 0 ? "arrow.right" : "arrow.down")
                Text(metric.deviationText)
            }
            .font(.body.weight(.medium))
            .foregroundStyle(AppTheme.textSecondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 210, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(metric.isWarning ? AppTheme.accent.opacity(0.1) : AppTheme.surface.opacity(0.85))
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(
                            metric.isWarning ? AppTheme.accent.opacity(0.5) : AppTheme.border.opacity(0.7),
                            lineWidth: 1
                        )
                )
        )
    }
}
