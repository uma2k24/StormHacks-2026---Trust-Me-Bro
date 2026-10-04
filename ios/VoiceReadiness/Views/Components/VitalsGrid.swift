import SwiftUI

struct VitalsGrid: View {
    let metrics: [Metric]
    /// Opens the numbers behind a vital. Without it the rows are plain.
    var onOpen: ((MeasureKey) -> Void)?
    /// An earlier morning being looked at again: the title names that day.
    var past: PastDay?

    var body: some View {
        RetroWindow(title: "\(past?.name ?? "Today")'s Vitals", padded: false) {
            VStack(spacing: 0) {
                ForEach(Array(metrics.enumerated()), id: \.element.id) { index, metric in
                    if index > 0 {
                        DashedDivider()
                    }
                    // Only a vital with a measurement behind it can be opened.
                    if metric.reading != nil, let onOpen {
                        Button { onOpen(metric.key) } label: { VitalRow(metric: metric, opens: true) }
                            .buttonStyle(.plain)
                            .accessibilityHint("Shows the numbers")
                    } else {
                        VitalRow(metric: metric, opens: false)
                    }
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
    /// Tapping it shows the numbers: a chevron says so.
    let opens: Bool

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
                HStack {
                    Text(metric.label)
                        .font(AppFont.head(23, relativeTo: .title3))
                        .foregroundStyle(AppTheme.ink)
                    Spacer(minLength: 8)
                    if opens {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(AppTheme.ink)
                            .accessibilityHidden(true)
                    }
                }

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
