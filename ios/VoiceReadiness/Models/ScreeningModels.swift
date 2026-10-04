import SwiftUI

enum AppScreen {
    case signUp
    case settings
    case idle
    case recording
    case processing
    case results
    case today
}

enum StatusColor {
    case green
    case yellow
    case red

    /// Mirrors statusColorForScore() in frontend/src/data/mockResults.ts.
    init(score: Int) {
        if score >= 80 {
            self = .green
        } else if score >= 60 {
            self = .yellow
        } else {
            self = .red
        }
    }

    /// Chip fill: teal tint for ready, then warmer coral the further from ready.
    var fill: Color {
        switch self {
        case .green: return AppTheme.tealSoft
        case .yellow: return AppTheme.accentSoft
        case .red: return AppTheme.accent
        }
    }

    var chipSymbol: String {
        switch self {
        case .green: return "checkmark.circle"
        case .yellow: return "exclamationmark.triangle"
        case .red: return "moon"
        }
    }

    var label: String {
        switch self {
        case .green: return "Ready"
        case .yellow: return "Pay Attention"
        case .red: return "Rest Recommended"
        }
    }
}

/// Where a measurement falls: in the healthy range, between the two, or in the Parkinson's range.
/// Mirrors Zone in frontend/src/types/screening.ts.
enum Zone {
    case healthy
    case borderline
    case elevated

    /// The zone's name in the details.
    var label: String {
        switch self {
        case .healthy: return "Healthy"
        case .borderline: return "Borderline"
        case .elevated: return "Parkinson’s range"
        }
    }

    /// The chip that goes with it: teal for healthy, then warmer coral.
    var statusColor: StatusColor {
        switch self {
        case .healthy: return .green
        case .borderline: return .yellow
        case .elevated: return .red
        }
    }
}

enum MeasureKey: CaseIterable {
    case jitter
    case shimmer
    case hnr
}

/// One measurement from the sustained "ahhh".
struct Reading {
    let value: Double
    let zone: Zone
}

struct Metric: Identifiable {
    let id = UUID()
    let key: MeasureKey
    let label: String
    let description: String
    let status: String
    /// Percent away from the middle of the healthy range (positive is higher).
    let deviation: Int
    let isWarning: Bool
    let systemImage: String
    /// The measurement behind it, shown when someone opens the vital for details. Nil when it couldn't be measured.
    var reading: Reading?
}

/// What the classifier made of the whole check-in, shown only when someone opens a vital for details.
struct ResultDetail {
    struct Task {
        let label: String
        let probability: Double
        /// 0...1
        let weight: Double
    }

    /// 0...1
    let probability: Double
    /// At or above this the voice is flagged.
    let threshold: Double
    let tasks: [Task]

    var flagged: Bool { probability >= threshold }
}

struct TrendPoint: Identifiable {
    let id = UUID()
    let day: String
    let score: Int
}

struct ScreeningResults {
    enum Source {
        /// Worked out from the listener's voice today.
        case measured
        /// Placeholder numbers: nothing could be measured.
        case sample
    }

    let source: Source
    let user: String
    let readinessScore: Int
    let statusColor: StatusColor
    let aiSummary: String
    let metrics: [Metric]
    /// The classifier's side of the story; nil for a sample.
    let detail: ResultDetail?
    let trendData: [TrendPoint]
    let yesterdayScore: Int
    let yesterdayLabel: String

    /// The same results, addressed to whoever signed up.
    func addressed(to name: String) -> ScreeningResults {
        ScreeningResults(
            source: source,
            user: name,
            readinessScore: readinessScore,
            statusColor: statusColor,
            aiSummary: aiSummary,
            metrics: metrics,
            detail: detail,
            trendData: trendData,
            yesterdayScore: yesterdayScore,
            yesterdayLabel: yesterdayLabel
        )
    }

    /// Placeholder numbers: shown for demo launches, and when nothing could be measured.
    static let mock = ScreeningResults(
        source: .sample,
        user: "David",
        readinessScore: 68,
        statusColor: .yellow,
        aiSummary: "Your pitch wobbles a little more than usual today, and your voice sounds a bit breathier. Rest and hydrate may help.",
        metrics: [
            Metric(
                key: .jitter,
                label: "Jitter",
                description: "How much the pitch wobbles",
                status: "A bit higher",
                deviation: 12,
                isWarning: true,
                systemImage: "waveform.path.ecg",
                reading: Reading(value: 0.84, zone: .borderline)
            ),
            Metric(
                key: .shimmer,
                label: "Shimmer",
                description: "How much the volume shakes",
                status: "Steady",
                deviation: 0,
                isWarning: false,
                systemImage: "waveform",
                reading: Reading(value: 5.6, zone: .healthy)
            ),
            Metric(
                key: .hnr,
                label: "HNR",
                description: "How clear vs. breathy the voice is",
                status: "Slightly lower",
                deviation: -10,
                isWarning: true,
                systemImage: "wind",
                reading: Reading(value: 14.1, zone: .borderline)
            )
        ],
        detail: ResultDetail(
            probability: 0.52,
            threshold: 0.646,
            tasks: [
                ResultDetail.Task(label: "Sustained vowel", probability: 0.55, weight: 0.41),
                ResultDetail.Task(label: "Conversation", probability: 0.5, weight: 0.59)
            ]
        ),
        trendData: [
            TrendPoint(day: "2 weeks ago", score: 90),
            TrendPoint(day: "2", score: 87),
            TrendPoint(day: "3", score: 91),
            TrendPoint(day: "4", score: 86),
            TrendPoint(day: "5", score: 84),
            TrendPoint(day: "6", score: 88),
            TrendPoint(day: "7", score: 83),
            TrendPoint(day: "Mon", score: 85),
            TrendPoint(day: "Tue", score: 88),
            TrendPoint(day: "Wed", score: 82),
            TrendPoint(day: "Thu", score: 79),
            TrendPoint(day: "Fri", score: 81),
            TrendPoint(day: "Sat", score: 75),
            TrendPoint(day: "Today", score: 68)
        ],
        yesterdayScore: 82,
        yesterdayLabel: "Optimal"
    )
}
