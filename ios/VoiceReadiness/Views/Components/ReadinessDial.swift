import SwiftUI

/// Speedometer-style readiness gauge: Rest / Pay Attention / Ready zones,
/// a needle that swings in with a spring, and a score that counts up with it.
struct ReadinessDial: View {
    let score: Int
    let statusColor: StatusColor

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var numeralSize: CGFloat = 76
    @State private var needleScore: Double = 0
    @State private var shownScore: Double = 0
    @State private var hum = false

    private var clamped: Int { min(max(score, 0), 100) }

    var body: some View {
        RetroWindow(title: "Today's Readiness", index: 1) {
            VStack(spacing: 0) {
                GaugeView(needleScore: needleScore, hum: hum)
                    .frame(maxWidth: 300)

                // the score and "out of 100" share a line, so the whole dial fits on one screen
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) { numeral; outOf }
                    VStack(spacing: 6) { numeral; outOf }
                }
                .padding(.top, 4)

                StatusChip(status: statusColor, label: statusColor.label, large: true)
                    .padding(.top, 16)
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Today's readiness score \(clamped) out of 100. \(statusColor.label).")
        }
        .onAppear(perform: animateIn)
    }

    private var numeral: some View {
        CountingText(value: shownScore)
            .font(AppFont.head(numeralSize, relativeTo: .largeTitle))
            .foregroundStyle(AppTheme.ink)
            .monospacedDigit()
    }

    private var outOf: some View {
        Text("out of 100")
            .font(AppFont.head(24, relativeTo: .title3))
            .foregroundStyle(AppTheme.inkSoft)
    }

    private func animateIn() {
        let target = Double(clamped)
        if reduceMotion {
            needleScore = target
            shownScore = target
            return
        }

        withAnimation(.spring(response: 1.3, dampingFraction: 0.58).delay(0.35)) {
            needleScore = target
        }
        withAnimation(.easeOut(duration: 1.5).delay(0.35)) {
            shownScore = target
        }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            hum = true
        }
    }
}

/// A number that interpolates smoothly while animating.
private struct CountingText: View, Animatable {
    var value: Double

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    var body: some View {
        Text("\(Int(value.rounded()))")
    }
}

private struct GaugeView: View {
    let needleScore: Double
    let hum: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // The geometry is authored on a 300 x 196 board (same as the web SVG) and scaled to fit.
    private static let board = CGSize(width: 300, height: 196)
    private static let hub = CGPoint(x: 150, y: 150)
    private static let outer: CGFloat = 132
    private static let inner: CGFloat = 98
    private static let needleLength: CGFloat = 124

    private static let zones: [(from: Double, to: Double, color: Color)] = [
        (0, 60, AppTheme.zoneRest),
        (60, 80, AppTheme.zoneAttention),
        (80, 100, AppTheme.zoneReady)
    ]

    /// 0 is the far left, 100 the far right, sweeping over the top.
    private static func polar(_ radius: CGFloat, _ value: Double) -> CGPoint {
        let angle = value / 100 * .pi
        return CGPoint(x: hub.x - radius * CGFloat(cos(angle)), y: hub.y - radius * CGFloat(sin(angle)))
    }

    private static func sector(from: Double, to: Double) -> Path {
        var path = Path()
        let steps = max(Int((to - from) * 2), 2)
        for i in 0...steps {
            let value = from + (to - from) * Double(i) / Double(steps)
            let point = polar(outer, value)
            i == 0 ? path.move(to: point) : path.addLine(to: point)
        }
        for i in stride(from: steps, through: 0, by: -1) {
            let value = from + (to - from) * Double(i) / Double(steps)
            path.addLine(to: polar(inner, value))
        }
        path.closeSubpath()
        return path
    }

    var body: some View {
        GeometryReader { proxy in
            let s = proxy.size.width / Self.board.width
            let anchor = UnitPoint(x: Self.hub.x / Self.board.width, y: Self.hub.y / Self.board.height)

            ZStack {
                Canvas { context, _ in
                    let scale = CGAffineTransform(scaleX: s, y: s)

                    for zone in Self.zones {
                        let path = Self.sector(from: zone.from, to: zone.to).applying(scale)
                        context.fill(path, with: .color(zone.color))
                        context.stroke(
                            path,
                            with: .color(AppTheme.ink),
                            style: StrokeStyle(lineWidth: 3.5 * s, lineJoin: .round)
                        )
                    }

                    // tick marks every 10
                    for i in 0...10 {
                        var tick = Path()
                        tick.move(to: Self.polar(Self.outer + 8, Double(i) * 10))
                        tick.addLine(to: Self.polar(Self.outer + 17, Double(i) * 10))
                        context.stroke(
                            tick.applying(scale),
                            with: .color(AppTheme.ink),
                            style: StrokeStyle(lineWidth: (i % 5 == 0 ? 4 : 2.5) * s, lineCap: .round)
                        )
                    }

                    for (text, x) in [("0", 34.0), ("100", 266.0)] {
                        context.draw(
                            Text(text)
                                .font(AppFont.fixedHead(22 * s))
                                .foregroundColor(AppTheme.ink),
                            at: CGPoint(x: x * s, y: 181 * s)
                        )
                    }
                }

                // needle: drawn pointing at 0 (left) and rotated about the hub
                needle(scale: s)
                    .rotationEffect(.degrees(hum ? 0.8 : -0.8), anchor: anchor)
                    .animation(
                        reduceMotion ? nil : .easeInOut(duration: 3.4).repeatForever(autoreverses: true),
                        value: hum
                    )
                    .rotationEffect(.degrees(needleScore * 1.8), anchor: anchor)

                Circle()
                    .fill(AppTheme.ink)
                    .frame(width: 38 * s, height: 38 * s)
                    .position(x: Self.hub.x * s, y: Self.hub.y * s)
                Circle()
                    .fill(AppTheme.accent)
                    .frame(width: 14 * s, height: 14 * s)
                    .position(x: Self.hub.x * s, y: Self.hub.y * s)
            }
        }
        .aspectRatio(Self.board.width / Self.board.height, contentMode: .fit)
    }

    private func needle(scale s: CGFloat) -> some View {
        let path = Path { p in
            p.move(to: CGPoint(x: (Self.hub.x - Self.needleLength) * s, y: Self.hub.y * s))
            p.addLine(to: CGPoint(x: Self.hub.x * s, y: (Self.hub.y - 9) * s))
            p.addLine(to: CGPoint(x: Self.hub.x * s, y: (Self.hub.y + 9) * s))
            p.closeSubpath()
        }

        return ZStack {
            path.fill(AppTheme.ink)
            path.stroke(AppTheme.ink, style: StrokeStyle(lineWidth: 4 * s, lineJoin: .round))
        }
    }
}
