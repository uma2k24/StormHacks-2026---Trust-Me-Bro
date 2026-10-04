import Charts
import SwiftUI

struct TrendChartView: View {
    let data: [TrendPoint]
    /// An earlier morning being looked at again: the chart ends on that day rather than today.
    var past: PastDay?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var reveal: CGFloat = 0

    /// Only the two ends are labelled (the title says 14 days). Mirrors TrendChart.tsx.
    /// The first point says how far back the chart goes: "Oct 1", or "2 weeks ago" for a full fortnight.
    private var startLabel: String { data.first?.day ?? "" }

    private var xTicks: [String] {
        [data.first?.day, data.last?.day].compactMap { $0 }
    }

    var body: some View {
        RetroWindow(title: "Readiness Over 14 Days") {
            VStack(alignment: .leading, spacing: 20) {
                Text(data.count == 1
                    ? (past != nil ? "That was your first reading." : "This is your first reading. Every morning adds another dot.")
                    : "A simple look at how your score has been trending.")
                    .font(AppFont.body(18))
                    .foregroundStyle(AppTheme.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)

                chart
                    .frame(height: 240)
                    .padding(.vertical, 14)
                    .mask(alignment: .leading) {
                        GeometryReader { proxy in
                            Rectangle().frame(width: proxy.size.width * reveal)
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(
                        data.count == 1
                            ? "Line chart of your readiness. \(past?.name ?? "Today") is \(data.last?.score ?? 0), your first reading."
                            : "Line chart of your readiness since \(startLabel). It started at \(data.first?.score ?? 0) and \(past?.name ?? "today") is \(data.last?.score ?? 0)."
                    )
            }
        }
        .onAppear {
            if reduceMotion {
                reveal = 1
            } else {
                withAnimation(.easeOut(duration: 1.4).delay(0.5)) { reveal = 1 }
            }
        }
    }

    private var chart: some View {
        Chart {
            // the same three zones as the gauge, kept very light
            RectangleMark(yStart: .value("Floor", 50), yEnd: .value("Rest", 60))
                .foregroundStyle(AppTheme.zoneRest.opacity(0.4))
            RectangleMark(yStart: .value("Rest", 60), yEnd: .value("Attention", 80))
                .foregroundStyle(AppTheme.zoneAttention.opacity(0.55))
            RectangleMark(yStart: .value("Attention", 80), yEnd: .value("Ceiling", 100))
                .foregroundStyle(AppTheme.zoneReady.opacity(0.3))

            ForEach(Array(data.enumerated()), id: \.offset) { index, point in
                LineMark(
                    x: .value("Day", point.day),
                    y: .value("Score", point.score)
                )
                .foregroundStyle(AppTheme.ink)
                .lineStyle(StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                .interpolationMethod(.monotone)

                PointMark(
                    x: .value("Day", point.day),
                    y: .value("Score", point.score)
                )
                .symbol {
                    let isToday = index == data.count - 1
                    Circle()
                        .fill(isToday ? AppTheme.accent : AppTheme.teal)
                        .overlay { Circle().stroke(AppTheme.ink, lineWidth: isToday ? 3.5 : 2.5) }
                        .frame(width: isToday ? 20 : 11, height: isToday ? 20 : 11)
                }
            }
        }
        .chartYScale(domain: 50...100)
        // a little room on the left for the first dot, and on the right so the "68" callout
        // fits under the last dot
        .chartXScale(range: .plotDimension(startPadding: 14, endPadding: 34))
        // Callout pill under today's dot. It is placed from the dot's position because
        // Charts' own annotation placement pushed it sideways onto the line.
        .chartOverlay { proxy in
            GeometryReader { geometry in
                if let today = data.last,
                   let plot = proxy.plotFrame,
                   let x = proxy.position(forX: today.day),
                   let y = proxy.position(forY: today.score) {
                    let origin = geometry[plot].origin
                    Text("\(today.score)")
                        .font(AppFont.fixedHead(21))
                        .foregroundStyle(AppTheme.ink)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.white))
                        .overlay { Capsule().stroke(AppTheme.ink, lineWidth: 2.5) }
                        .position(x: origin.x + x, y: origin.y + y + 34)
                }
            }
        }
        .chartPlotStyle { plot in
            // ink axes along the left and bottom edges
            plot
                .overlay(alignment: .leading) { Rectangle().fill(AppTheme.ink).frame(width: 2.5) }
                .overlay(alignment: .bottom) { Rectangle().fill(AppTheme.ink).frame(height: 2.5) }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: [60, 80, 100]) { _ in
                AxisValueLabel()
                    .font(AppFont.fixedHead(17))
                    .foregroundStyle(AppTheme.ink)
            }
        }
        .chartXAxis {
            AxisMarks { value in
                if let day = value.as(String.self), xTicks.contains(day) {
                    // each label is tucked inside the plot so it can't run off an edge
                    let isStart = day == data.first?.day && data.count > 1
                    AxisValueLabel(anchor: isStart ? .topLeading : .topTrailing) {
                        Text(isStart ? startLabel : day)
                            .font(AppFont.fixedHead(17))
                            .foregroundStyle(AppTheme.ink)
                    }
                }
            }
        }
    }
}
