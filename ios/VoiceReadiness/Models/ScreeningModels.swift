import SwiftUI

enum AppScreen {
    case idle
    case recording
    case processing
    case results
}

enum StatusColor {
    case green
    case yellow
    case red

    var color: Color {
        switch self {
        case .green: return Color(red: 0.24, green: 0.86, blue: 0.52)
        case .yellow: return Color(red: 0.96, green: 0.77, blue: 0.09)
        case .red: return Color(red: 1.0, green: 0.42, blue: 0.42)
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

struct Metric: Identifiable {
    let id = UUID()
    let label: String
    let status: String
    let deviation: Int
    let isWarning: Bool
    let systemImage: String

    var deviationText: String {
        if deviation == 0 { return "Matches normal" }
        let sign = deviation > 0 ? "+" : ""
        return "\(sign)\(deviation)% from normal"
    }
}

struct TrendPoint: Identifiable {
    let id = UUID()
    let day: String
    let score: Int
}

struct ScreeningResults {
    let user: String
    let readinessScore: Int
    let statusColor: StatusColor
    let aiSummary: String
    let metrics: [Metric]
    let trendData: [TrendPoint]
    let yesterdayScore: Int
    let yesterdayLabel: String

    static let mock = ScreeningResults(
        user: "David",
        readinessScore: 68,
        statusColor: .yellow,
        aiSummary: "Your speech pacing is a bit slower than your usual baseline today. It might be a good idea to rest and hydrate.",
        metrics: [
            Metric(
                label: "Vocal Energy",
                status: "Slightly Low",
                deviation: -10,
                isWarning: false,
                systemImage: "waveform"
            ),
            Metric(
                label: "Vocal Control",
                status: "Steady",
                deviation: 0,
                isWarning: false,
                systemImage: "mic.fill"
            ),
            Metric(
                label: "Cognitive Pacing",
                status: "15% Slower",
                deviation: -15,
                isWarning: true,
                systemImage: "brain.head.profile"
            ),
            Metric(
                label: "Expression Level",
                status: "Normal",
                deviation: -2,
                isWarning: false,
                systemImage: "face.smiling"
            )
        ],
        trendData: [
            TrendPoint(day: "1", score: 90),
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

enum AppTheme {
    static let background = Color(red: 0.04, green: 0.06, blue: 0.08)
    static let surface = Color(red: 0.08, green: 0.11, blue: 0.14)
    static let border = Color(red: 0.30, green: 0.38, blue: 0.48)
    static let accent = Color(red: 0.96, green: 0.77, blue: 0.09)
    static let textPrimary = Color.white
    static let textSecondary = Color(red: 0.78, green: 0.82, blue: 0.88)
}
