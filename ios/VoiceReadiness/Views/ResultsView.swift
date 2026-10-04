import SwiftUI

/// One thing at a time: the score first, then the details, each on its own page.
/// Mirrors ResultsDashboard.tsx on the web.
struct ResultsView: View {
    let results: ScreeningResults
    /// After the last page: on to the day's list. For an earlier morning looked at again (`results.past`)
    /// there is no list to go on to, so this goes back home, and the first page's back arrow does too.
    let onFinish: () -> Void

    private static func pageTitles(for past: PastDay?) -> [String] {
        let whose = past.map { "\($0.name)'s" } ?? "Today's"
        return ["\(whose) readiness", "Your voice summary", "\(whose) vitals", "Readiness over 14 days"]
    }

    private static let pageCount = 4
    private var pageTitles: [String] { Self.pageTitles(for: results.past) }

    @ScaledMetric(relativeTo: .title) private var headlineSize: CGFloat = 27
    @State private var page = ResultsView.initialPage()
    // A vital that has been tapped: its numbers replace the page until they go back.
    @State private var detail: MeasureKey? = ResultsView.initialDetail()

    private var isLast: Bool { page == pageTitles.count - 1 }

    /// DEBUG builds accept `-page 0...3` to open a specific page (for demos and screenshots).
    private static func initialPage() -> Int {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "-page"),
           args.indices.contains(index + 1),
           let value = Int(args[index + 1]) {
            return min(max(value, 0), pageCount - 1)
        }
        #endif
        return 0
    }

    /// DEBUG builds accept `-detail jitter|shimmer|hnr` to open a vital's numbers (for demos and screenshots).
    private static func initialDetail() -> MeasureKey? {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "-detail"), args.indices.contains(index + 1) {
            switch args[index + 1] {
            case "jitter": return .jitter
            case "shimmer": return .shimmer
            case "hnr": return .hnr
            default: break
            }
        }
        #endif
        return nil
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
                    .id(detail.map { "detail-\($0)" } ?? "page-\(page)")
                }
                .scrollBounceBehavior(.basedOnSize)
            }

            nav
        }
        .onChange(of: page) { _, newPage in
            AccessibilityNotification.Announcement(
                "Page \(newPage + 1) of \(pageTitles.count): \(pageTitles[newPage])"
            ).post()
        }
        .onChange(of: detail) { _, key in
            if let key {
                AccessibilityNotification.Announcement("The numbers for \(VoiceReading.measure(key).label)").post()
            }
        }
    }

    @ViewBuilder
    private var pageContent: some View {
        if let detail {
            VitalDetailView(results: results, focus: detail)
        } else {
            switch page {
            case 0:
                header
                ReadinessDial(
                    score: results.readinessScore,
                    statusColor: results.statusColor,
                    past: results.past
                )
                if results.source == .sample {
                    Text("These are sample numbers. Your voice couldn’t be measured today.")
                        .font(AppFont.body(17))
                        .foregroundStyle(AppTheme.inkSoft)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, -12)
                }
            case 1:
                AiSummaryCard(summary: results.aiSummary, autoRead: results.past == nil)
            case 2:
                VitalsGrid(metrics: results.metrics, onOpen: { detail = $0 }, past: results.past)
            default:
                TrendChartView(data: results.trendData, past: results.past)
            }
        }
    }

    private var header: some View {
        CenteredFlowLayout(spacing: headlineSize * 0.26) {
            if let past = results.past {
                // "Saturday, Oct 3"
                Text("\(past.name),")
                Text(past.short).markerHighlight(size: headlineSize)
            } else {
                Text("Thanks,")
                // the name and its exclamation mark travel together
                HStack(spacing: 0) {
                    Text(results.user).markerHighlight(size: headlineSize)
                    Text("!")
                }
            }
        }
        .font(AppFont.head(headlineSize, relativeTo: .title))
        .tracking(-0.6)
        .foregroundStyle(AppTheme.ink)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(results.past.map { "\($0.name), \($0.short)" } ?? "Thanks, \(results.user)!")
        .accessibilityAddTraits(.isHeader)
        .popIn(0)
    }

    private var nav: some View {
        VStack(spacing: 16) {
            if detail != nil {
                Button {
                    withAnimation(.easeOut(duration: 0.2)) { detail = nil }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "arrow.left").font(.system(size: 20, weight: .bold))
                        Text("Back to my vitals")
                    }
                }
                .buttonStyle(PillButtonStyle(fill: AppTheme.accent))
            } else {
                pagerNav
            }
        }
        .padding(.horizontal, 20)
        .padding(.trailing, AppTheme.pop)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }

    private var pagerNav: some View {
        VStack(spacing: 16) {
            HStack(spacing: 11) {
                ForEach(0..<pageTitles.count, id: \.self) { index in
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
            .accessibilityValue("Page \(page + 1) of \(pageTitles.count)")

            HStack(spacing: 14) {
                if page > 0 || results.past != nil {
                    Button {
                        if page > 0 {
                            withAnimation(.easeOut(duration: 0.2)) { page -= 1 }
                        } else {
                            onFinish()
                        }
                    } label: {
                        Image(systemName: "arrow.left").font(.system(size: 24, weight: .bold))
                    }
                    .buttonStyle(PillButtonStyle())
                    .frame(width: 72)
                    .accessibilityLabel(page > 0 ? "Back" : "Back home")
                }

                if isLast {
                    Button(action: onFinish) {
                        HStack(spacing: 10) {
                            Image(systemName: results.past == nil ? "checklist" : "house.fill").font(.system(size: 20, weight: .bold))
                            Text(results.past == nil ? "Your day" : "Back home")
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
    }
}
