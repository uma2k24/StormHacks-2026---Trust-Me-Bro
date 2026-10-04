import SwiftUI

// MARK: - Helpers

extension View {
    /// A solid, offset "sticker" shadow in ink.
    func hardShadow<S: Shape>(_ shape: S, offset: CGFloat = AppTheme.pop) -> some View {
        background { shape.fill(AppTheme.ink).offset(x: offset, y: offset) }
    }

    /// Springs in (slightly rotated) once, in sequence with its siblings.
    func popIn(_ index: Int = 0) -> some View {
        modifier(PopIn(index: index))
    }

    /// Highlighter-pen swipe behind a word. `size` is the word's font size.
    func markerHighlight(size: CGFloat) -> some View {
        modifier(MarkerHighlight(size: size))
    }
}

private struct MarkerHighlight: ViewModifier {
    let size: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var swiped = false

    func body(content: Content) -> some View {
        content
            .background(alignment: .bottom) {
                Rectangle()
                    .fill(AppTheme.marker)
                    .frame(height: size * 0.36)
                    .offset(y: -size * 0.06)
                    .scaleEffect(x: swiped ? 1 : 0, anchor: .leading)
            }
            .onAppear {
                if reduceMotion {
                    swiped = true
                } else {
                    withAnimation(.timingCurve(0.65, 0, 0.35, 1, duration: 0.9).delay(0.35)) {
                        swiped = true
                    }
                }
            }
    }
}

private struct PopIn: ViewModifier {
    let index: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 22)
            .scaleEffect(shown ? 1 : 0.96)
            .rotationEffect(.degrees(shown ? 0 : -0.8))
            .onAppear {
                if reduceMotion {
                    shown = true
                    return
                }
                withAnimation(
                    .spring(response: 0.55, dampingFraction: 0.68)
                        .delay(0.06 + Double(index) * 0.09)
                ) {
                    shown = true
                }
            }
    }
}

// MARK: - Flow layout

/// Wraps its children like words in a paragraph, centring each line (or starting each at the
/// leading edge when `centered` is off). Used for headlines where one word carries the
/// highlighter, and for rows of chips, so lines can break between items at any text size.
struct CenteredFlowLayout: Layout {
    var spacing: CGFloat = 10
    var lineSpacing: CGFloat = 0
    var centered = true

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func rows(maxWidth: CGFloat, subviews: Subviews) -> [Row] {
        var result: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = (result[result.count - 1].indices.isEmpty ? 0 : spacing) + size.width
            if result[result.count - 1].width + needed > maxWidth, !result[result.count - 1].indices.isEmpty {
                result.append(Row())
            }
            var row = result[result.count - 1]
            row.width += (row.indices.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
            result[result.count - 1] = row
        }
        return result
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        let laid = rows(maxWidth: maxWidth, subviews: subviews)
        let height = laid.reduce(0) { $0 + $1.height } + lineSpacing * CGFloat(max(laid.count - 1, 0))
        let width = laid.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(maxWidth: bounds.width, subviews: subviews) {
            var x = bounds.minX + (centered ? (bounds.width - row.width) / 2 : 0)
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(
                    at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                    proposal: ProposedViewSize(size)
                )
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }
}

// MARK: - Background

/// Cream graph paper with quiet confetti drifting behind everything.
struct PaperBackground: View {
    var body: some View {
        ZStack {
            AppTheme.paper

            Canvas { context, size in
                let spacing: CGFloat = 26
                var y: CGFloat = 13
                while y < size.height {
                    var x: CGFloat = 13
                    while x < size.width {
                        context.fill(
                            Path(ellipseIn: CGRect(x: x - 1.4, y: y - 1.4, width: 2.8, height: 2.8)),
                            with: .color(AppTheme.ink.opacity(0.13))
                        )
                        x += spacing
                    }
                    y += spacing
                }
            }

            ConfettiLayer()
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

/// Four quiet shapes in just the two theme colours.
private struct ConfettiLayer: View {
    var body: some View {
        GeometryReader { proxy in
            let w = proxy.size.width
            let h = proxy.size.height

            ZStack {
                Floating(duration: 13, tilt: 7) { Squiggle().frame(width: 92, height: 40) }
                    .position(x: w - 10, y: h * 0.52 + 20)
                Floating(duration: 16, tilt: 0) {
                    Circle().stroke(AppTheme.teal, lineWidth: 12).frame(width: 76, height: 76)
                }
                .position(x: -8, y: h * 0.46 + 48)
                Floating(duration: 14, tilt: 7) { ConfettiPlus().frame(width: 46, height: 46) }
                    .position(x: w * 0.02 + 23, y: h * 0.74 + 23)
                Floating(duration: 17, tilt: 0) { ConfettiDots().frame(width: 64, height: 64) }
                    .position(x: w * 0.12 + 32, y: h * 0.95 - 32)
            }
        }
    }
}

private struct Floating<Content: View>: View {
    let duration: Double
    let tilt: Double
    @ViewBuilder var content: Content
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var up = false

    var body: some View {
        content
            .rotationEffect(.degrees(up ? tilt : 0))
            .offset(y: up ? -14 : 0)
            .animation(
                reduceMotion ? nil : .easeInOut(duration: duration / 2).repeatForever(autoreverses: true),
                value: up
            )
            .onAppear { up = true }
    }
}

private struct Squiggle: View {
    var body: some View {
        Path { p in
            p.move(to: CGPoint(x: 4, y: 24))
            p.addCurve(to: CGPoint(x: 24, y: 24), control1: CGPoint(x: 10, y: 6), control2: CGPoint(x: 18, y: 6))
            p.addCurve(to: CGPoint(x: 44, y: 24), control1: CGPoint(x: 30, y: 42), control2: CGPoint(x: 38, y: 42))
            p.addCurve(to: CGPoint(x: 64, y: 24), control1: CGPoint(x: 50, y: 6), control2: CGPoint(x: 58, y: 6))
            p.addCurve(to: CGPoint(x: 78, y: 30), control1: CGPoint(x: 70, y: 42), control2: CGPoint(x: 74, y: 36))
        }
        .stroke(AppTheme.accent, style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
    }
}

private struct ConfettiPlus: View {
    var body: some View {
        Path { p in
            p.move(to: CGPoint(x: 23, y: 5))
            p.addLine(to: CGPoint(x: 23, y: 41))
            p.move(to: CGPoint(x: 5, y: 23))
            p.addLine(to: CGPoint(x: 41, y: 23))
        }
        .stroke(AppTheme.accent, style: StrokeStyle(lineWidth: 9, lineCap: .round))
    }
}

private struct ConfettiDots: View {
    var body: some View {
        Canvas { context, _ in
            for x in [10.0, 32.0, 54.0] {
                for y in [10.0, 32.0, 54.0] {
                    context.fill(
                        Path(ellipseIn: CGRect(x: x - 4.5, y: y - 4.5, width: 9, height: 9)),
                        with: .color(AppTheme.ink.opacity(0.3))
                    )
                }
            }
        }
    }
}

// MARK: - Windows

/// A 90s-desktop window: pinstriped teal title bar, close box, hard shadow.
struct RetroWindow<Content: View>: View {
    let title: String
    var index: Int = 0
    var padded: Bool = true
    @ViewBuilder var content: Content

    private var outline: RoundedRectangle {
        RoundedRectangle(cornerRadius: AppTheme.radius, style: .continuous)
    }

    var body: some View {
        VStack(spacing: 0) {
            titleBar
            content
                .padding(padded ? 22 : 0)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.white)
        .clipShape(outline)
        .overlay { outline.strokeBorder(AppTheme.ink, lineWidth: AppTheme.line) }
        .hardShadow(outline)
        .popIn(index)
        .accessibilityElement(children: .contain)
    }

    private var titleBar: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(Color.white)
                .frame(width: 18, height: 18)
                .overlay { RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(AppTheme.ink, lineWidth: 2.5) }
                .accessibilityHidden(true)

            Text(title)
                .font(AppFont.head(19, relativeTo: .headline))
                .foregroundStyle(AppTheme.ink)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 13)
                .padding(.vertical, 3)
                .background(Capsule().fill(Color.white))
                .overlay { Capsule().stroke(AppTheme.ink, lineWidth: 2.5) }
                .accessibilityAddTraits(.isHeader)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(Pinstripes(tone: AppTheme.tealSoft))
        .overlay(alignment: .bottom) { Rectangle().fill(AppTheme.ink).frame(height: AppTheme.line) }
    }
}

/// Mac "Platinum" pinstripes.
struct Pinstripes: View {
    let tone: Color

    var body: some View {
        tone.overlay {
            Canvas { context, size in
                var y: CGFloat = 3
                while y < size.height {
                    context.fill(
                        Path(CGRect(x: 0, y: y, width: size.width, height: 1)),
                        with: .color(AppTheme.ink.opacity(0.5))
                    )
                    y += 4
                }
            }
        }
    }
}

// MARK: - Buttons

/// Pill button that physically presses down into its shadow.
struct PillButtonStyle: ButtonStyle {
    var fill: Color = .white
    /// The extra-big version, for the buttons that matter most (Settings, Done).
    var large = false

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        configuration.label
            .font(AppFont.body(large ? 24 : 21, bold: true))
            .foregroundStyle(AppTheme.ink)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, minHeight: large ? 76 : 64)
            .background(Capsule().fill(fill))
            .overlay { Capsule().stroke(AppTheme.ink, lineWidth: 3) }
            .hardShadow(Capsule(), offset: pressed ? 0 : 5)
            .offset(x: pressed ? 5 : 0, y: pressed ? 5 : 0)
            .animation(.easeOut(duration: 0.09), value: pressed)
            .sensoryFeedback(.impact(weight: .medium), trigger: pressed) { _, isDown in isDown }
    }
}

/// Home's bottom row: a big rounded tile, icon over label, so a long name still fits.
struct TileButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)
        configuration.label
            .font(AppFont.body(20, bold: true))
            .foregroundStyle(AppTheme.ink)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 92)
            .background(shape.fill(Color.white))
            .overlay { shape.stroke(AppTheme.ink, lineWidth: 3) }
            .hardShadow(shape, offset: pressed ? 0 : 5)
            .offset(x: pressed ? 5 : 0, y: pressed ? 5 : 0)
            .animation(.easeOut(duration: 0.09), value: pressed)
            .sensoryFeedback(.impact(weight: .medium), trigger: pressed) { _, isDown in isDown }
    }
}

/// The face of the big round glossy buttons. A plain view, so the radio's talk button
/// (which needs press *and* release) can use the same look as a normal Button.
struct OrbFace<Label: View>: View {
    let size: CGFloat
    var fill: Color = AppTheme.accent
    var pressed = false
    var shadow: CGFloat = 8
    @ViewBuilder var label: Label

    var body: some View {
        label
            .foregroundStyle(AppTheme.ink)
            .frame(width: size, height: size)
            .background {
                // gloss lives behind the icon so it never washes it out
                ZStack {
                    Circle().fill(fill)
                    Circle().fill(
                        RadialGradient(
                            colors: [Color.white.opacity(0.7), .clear],
                            center: UnitPoint(x: 0.3, y: 0.24),
                            startRadius: 0,
                            endRadius: size * 0.34
                        )
                    )
                }
            }
            .overlay { Circle().stroke(AppTheme.ink, lineWidth: 4) }
            .hardShadow(Circle(), offset: pressed ? 0 : shadow)
            .offset(x: pressed ? shadow : 0, y: pressed ? shadow : 0)
            .animation(.easeOut(duration: 0.09), value: pressed)
    }
}

struct OrbButtonStyle: ButtonStyle {
    var size: CGFloat
    var fill: Color = AppTheme.accent
    var shadow: CGFloat = 8

    func makeBody(configuration: Configuration) -> some View {
        OrbFace(size: size, fill: fill, pressed: configuration.isPressed, shadow: shadow) {
            configuration.label
        }
        .sensoryFeedback(.impact(weight: .heavy), trigger: configuration.isPressed) { _, isDown in isDown }
    }
}

// MARK: - Chip

/// Status is never colour alone: every chip pairs a fill with an icon and words.
struct StatusChip: View {
    let status: StatusColor
    let label: String
    var large: Bool = false

    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 19

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: status.chipSymbol)
                .font(.system(size: large ? iconSize + 5 : iconSize, weight: .bold))
            Text(label)
                .font(AppFont.body(large ? 24 : 18, bold: true))
        }
        .foregroundStyle(AppTheme.ink)
        .padding(.leading, 10)
        .padding(.trailing, 14)
        .padding(.vertical, large ? 8 : 5)
        .background(Capsule().fill(status.fill))
        .overlay { Capsule().stroke(AppTheme.ink, lineWidth: 2.5) }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Decorative motion

/// Rings that breathe out from a button.
struct SonarRings: View {
    let diameter: CGFloat
    var fast = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var go = false

    var body: some View {
        ZStack {
            ring(delay: 0)
            ring(delay: fast ? 0.8 : 1.8)
        }
        .frame(width: diameter, height: diameter)
        .onAppear { go = !reduceMotion }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func ring(delay: Double) -> some View {
        Circle()
            .stroke(AppTheme.ink, lineWidth: 3)
            .scaleEffect(go ? 1.45 : 1)
            .opacity(go ? 0 : (reduceMotion ? 0 : 0.32))
            .animation(
                .easeOut(duration: fast ? 1.6 : 3.6).repeatForever(autoreverses: false).delay(delay),
                value: go
            )
    }
}

// MARK: - App bar

struct BrandMark: View {
    var body: some View {
        ZStack {
            Circle().fill(AppTheme.teal)
            Circle().stroke(AppTheme.ink, lineWidth: 3)
            HStack(spacing: 2.6) {
                ForEach([8.0, 19.0, 12.0, 5.0], id: \.self) { height in
                    Capsule().fill(AppTheme.ink).frame(width: 3.6, height: height)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Mac-style menu bar: the brand on the left, and today's date written out on the right so nobody
/// has to wonder what day it is. Fixed size: it's chrome. Mirrors AppBar.tsx.
struct AppBar: View {
    var body: some View {
        HStack(spacing: 10) {
            BrandMark().frame(width: 40, height: 40)

            Text("Morning Radio")
                .font(AppFont.fixedHead(21))
                .foregroundStyle(AppTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .accessibilityAddTraits(.isHeader)

            Spacer(minLength: 4)

            // re-read every minute, so an app left open overnight turns over to the new day
            TimelineView(.everyMinute) { context in
                let today = Daily.dateParts(context.date)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(today.weekday).font(AppFont.fixedHead(19))
                    Text(today.date).font(.custom("AtkinsonHyperlegible-Bold", fixedSize: 17))
                }
                .foregroundStyle(AppTheme.ink)
                .lineLimit(1)
                .fixedSize()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Today is \(today.weekday), \(today.date)")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: 64)
        .frame(maxWidth: .infinity)
        .background(Color.white.ignoresSafeArea(edges: .top))
        .overlay(alignment: .bottom) { Rectangle().fill(AppTheme.ink).frame(height: AppTheme.line) }
    }
}
