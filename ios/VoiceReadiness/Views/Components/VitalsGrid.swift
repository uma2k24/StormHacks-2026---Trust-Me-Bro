import SwiftUI

struct VitalsGrid: View {
    let metrics: [Metric]

    var body: some View {
        RetroWindow(title: "Today's Vitals", padded: false) {
            VStack(spacing: 0) {
                ForEach(Array(metrics.enumerated()), id: \.element.id) { index, metric in
                    if index > 0 {
                        DashedDivider()
                    }
                    VitalRow(metric: metric)
                }
            }
        }
    }
}

private struct DashedDivider: View {
    var body: some View {
        Rectangle()
            .stroke(AppTheme.ink.opacity(0.3), style: StrokeStyle(lineWidth: 3, dash: [7, 5]))
            .frame(height: 3)
            .accessibilityHidden(true)
    }
}

private struct VitalRow: View {
    let metric: Metric

    @ScaledMetric(relativeTo: .body) private var tileSize: CGFloat = 48

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: metric.systemImage)
                .font(.system(size: tileSize * 0.44, weight: .semibold))
                .foregroundStyle(AppTheme.ink)
                .frame(width: tileSize, height: tileSize)
                .background(Circle().fill(AppTheme.tealSoft))
                .overlay { Circle().stroke(AppTheme.ink, lineWidth: 2.5) }
                .hardShadow(Circle(), offset: 3)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(metric.label)
                    .font(AppFont.head(23, relativeTo: .title3))
                    .foregroundStyle(AppTheme.ink)

                Text(metric.description)
                    .font(AppFont.body(17))
                    .foregroundStyle(AppTheme.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)

                StatusChip(status: metric.isWarning ? .yellow : .green, label: metric.status)
                    .padding(.top, 5)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
