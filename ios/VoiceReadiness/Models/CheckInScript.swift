import Foundation

/// The morning briefing. The check-in is disguised as a little morning radio show: each segment
/// reads a short, useful brief (weather, a score, local news) and then asks for the listener's
/// opinion. Their answers are the conversational audio the screening needs.
///
/// Live segments come from the web backend's /api/briefing (Gemini + Google Search) and are read
/// aloud by ElevenLabs via /api/briefing/speech (see BriefingService). Without a backend the mock
/// show below plays. Mirrors frontend/src/data/checkInScript.ts.

enum SegmentKind: String, Codable {
    case weather
    case sports
    case news
    case local

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = SegmentKind(rawValue: raw) ?? .news
    }

    /// Mirrors SegmentIcon.tsx on the web.
    var systemImage: String {
        switch self {
        case .weather: return "cloud.sun.fill"
        case .sports: return "trophy.fill"
        case .news: return "newspaper.fill"
        case .local: return "mappin.and.ellipse"
        }
    }
}

struct BriefingSegment: Identifiable, Codable {
    let id: String
    let kind: SegmentKind
    /// Short label for the radio's screen, e.g. "Weather".
    let topic: String
    /// What the radio reads first: one or two spoken sentences.
    let brief: String
    /// The open question that invites a real answer.
    let question: String
    /// What the mock microphone "hears" (the mic is still simulated).
    let mockReply: String
}

struct Briefing: Codable {
    enum Source: String, Codable {
        case live
        case mock
    }

    let source: Source
    let segments: [BriefingSegment]
}

enum CheckInScript {
    static let listenDuration: Duration = .milliseconds(2500)
    static let acknowledgePause: Duration = .milliseconds(1600)
    static let receivePause: Duration = .milliseconds(900)
    static let minHoldDuration: Duration = .milliseconds(280)
    /// Without a voice, a brief stays up about as long as reading it aloud.
    static let readPerWord: Duration = .milliseconds(330)
    static let minRead: Duration = .milliseconds(2200)

    /// How long to leave text on screen when there is no audio to wait for.
    static func readingTime(_ text: String) -> Duration {
        let words = text.split(whereSeparator: \.isWhitespace).count
        return max(minRead, readPerWord * words)
    }

    static let mockBriefing = Briefing(
        source: .mock,
        segments: [
            BriefingSegment(
                id: "weather",
                kind: .weather,
                topic: "Weather",
                brief: "Good morning, David. It's going to rain all afternoon in Coquitlam, clearing up around six.",
                question: "Do you think you'll still get your walk in?",
                mockReply: "Probably this morning, before it starts. I'll take the long way round the lake."
            ),
            BriefingSegment(
                id: "sports",
                kind: .sports,
                topic: "Sports",
                brief: "The Canucks won four to two last night, with a late goal to seal it.",
                question: "Did you catch any of the game?",
                mockReply: "Just the third period. That last goal had me right out of my chair."
            ),
            BriefingSegment(
                id: "local",
                kind: .local,
                topic: "Local",
                brief: "The farmers market is open until noon, and the first apples of the season are in.",
                question: "What would you pick up if you went?",
                mockReply: "Some apples for a pie, and maybe a loaf of that sourdough."
            )
        ]
    )
}

extension Duration {
    /// This duration in seconds, for comparing against `Date` intervals.
    var timeInterval: TimeInterval {
        Double(components.seconds) + Double(components.attoseconds) / 1e18
    }
}
