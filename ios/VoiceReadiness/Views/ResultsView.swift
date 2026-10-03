import SwiftUI

/// One thing at a time: the score first, then the details, each on its own page.
/// Mirrors ResultsDashboard.tsx on the web.
struct ResultsView: View {
    let results: ScreeningResults
    let onRestart: () -> Void

    private static let pageTitles = [
        "Today's readiness",
        "Your voice summary",
        "Today's vitals",
        "Readiness over 14 days"
    ]

    @ScaledMetric(relativeTo: .title) private var headlineSize: CGFloat = 30
    @State private var page = ResultsView.initialPage()

    private var isLast: Bool { page == Self.pageTitles.count - 1 }

    /// DEBUG builds accept `-page 0...3` to open a specific page (for demos and screenshots).
    private static func initialPage() -> Int {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "-page"),
           args.indices.contains(index + 1),
           let value = Int(args[index + 1]) {
            return min(max(value, 0), pageTitles.count - 1)
        }
        #endif
        return 0
    }

    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 26) {
                        pageContent
                    }
                    .padding(.horizontal, 20)
                    .padding(.trailing, AppTheme.pop)
                    .padding(.vertical, 20)
                    // short pages sit in the middle of the screen
                    .frame(minHeight: proxy.size.height)
                    .id(page)
                }
                .scrollBounceBehavior(.basedOnSize)
            }

            nav
        }
        .onChange(of: page) { _, newPage in
            AccessibilityNotification.Announcement(
                "Page \(newPage + 1) of \(Self.pageTitles.count): \(Self.pageTitles[newPage])"
            ).post()
        }
    }

    @ViewBuilder
    private var pageContent: some View {
        switch page {
        case 0:
            header
            ReadinessDial(
                score: results.readinessScore,
                statusColor: results.statusColor
            )
        case 1:
            AiSummaryCard(summary: results.aiSummary)
        case 2:
            VitalsGrid(metrics: results.metrics)
        default:
            TrendChartView(data: results.trendData)
        }
    }

    private var header: some View {
        CenteredFlowLayout(spacing: headlineSize * 0.26) {
            Text("Thanks,")
            Text(results.user).markerHighlight(size: headlineSize)
            Text("—")
            ForEach(["here's", "how", "you're", "looking", "today."], id: \.self) { word in
                Text(word)
            }
        }
        .font(AppFont.head(headlineSize, relativeTo: .title))
        .tracking(-0.6)
        .foregroundStyle(AppTheme.ink)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Thanks, \(results.user) — here's how you're looking today.")
        .accessibilityAddTraits(.isHeader)
        .popIn(0)
    }

    private var nav: some View {
        VStack(spacing: 16) {
            HStack(spacing: 11) {
                ForEach(0..<Self.pageTitles.count, id: \.self) { index in
                    Circle()
                        .fill(index < page ? AppTheme.ink : (index == page ? AppTheme.accent : Color.white))
                        .frame(width: 15, height: 15)
                        .overlay { Circle().stroke(AppTheme.ink, lineWidth: 2.5) }
                        .scaleEffect(index == page ? 1.25 : 1)
                        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: page)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Results progress")
            .accessibilityValue("Page \(page + 1) of \(Self.pageTitles.count)")

            HStack(spacing: 14) {
                if page > 0 {
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { page -= 1 }
                    } label: {
                        Image(systemName: "arrow.left").font(.system(size: 24, weight: .bold))
                    }
                    .buttonStyle(PillButtonStyle())
                    .frame(width: 72)
                    .accessibilityLabel("Back")
                }

                if isLast {
                    Button(action: onRestart) {
                        HStack(spacing: 10) {
                            Image(systemName: "arrow.counterclockwise").font(.system(size: 20, weight: .bold))
                            Text("Start New Check-in")
                        }
                    }
                    .buttonStyle(PillButtonStyle(fill: AppTheme.accent))
                } else {
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { page += 1 }
                    } label: {
                        HStack(spacing: 10) {
                            Text("Next")
                            Image(systemName: "arrow.right").font(.system(size: 20, weight: .bold))
                        }
                    }
                    .buttonStyle(PillButtonStyle(fill: AppTheme.accent))
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.trailing, AppTheme.pop)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }
}
