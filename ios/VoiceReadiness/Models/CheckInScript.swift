import Foundation

/// The morning briefing. The check-in is disguised as a little morning radio show: each segment
/// reads a short, useful brief (weather, a score, local news) and then asks for the listener's
/// opinion. Their answers are the conversational audio the screening needs.
///
/// Live segments come from the web backend's /api/briefing (Gemini + Google Search) and are read
/// aloud by ElevenLabs via /api/briefing/speech (see BriefingService). Without a backend the mock
/// show below plays, shaped by the listener's profile. Mirrors frontend/src/data/checkInScript.ts.

/// "weather" and "news" are always available; the rest match the listener's `Interest`s.
enum SegmentKind: String, Codable {
    case weather
    case news
    case sports
    case local
    case garden
    case music
    case food
    case nature
    case history
    case arts

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = SegmentKind(rawValue: raw) ?? .news
    }

    /// Mirrors SegmentIcon.tsx on the web.
    var systemImage: String {
        switch self {
        case .weather: return "cloud.sun.fill"
        case .news: return "newspaper.fill"
        case .sports: return "trophy.fill"
        case .local: return "mappin.and.ellipse"
        case .garden: return "leaf.fill"
        case .music: return "music.note"
        case .food: return "fork.knife"
        case .nature: return "pawprint.fill"
        case .history: return "building.columns.fill"
        case .arts: return "book.fill"
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

    private struct MockLine {
        let topic: String
        let brief: String
        let question: String
        let mockReply: String
    }

    private static let mockLines: [Interest: MockLine] = [
        .sports: MockLine(
            topic: "Sports",
            brief: "The Canucks won four to two last night, with a late goal to seal it.",
            question: "Did you catch any of the game?",
            mockReply: "Just the third period. That last goal had me right out of my chair."
        ),
        .local: MockLine(
            topic: "Local",
            brief: "The farmers market is open until noon, and the first apples of the season are in.",
            question: "What would you pick up if you went?",
            mockReply: "Some apples for a pie, and maybe a loaf of that sourdough."
        ),
        .garden: MockLine(
            topic: "Garden",
            brief: "It's a good week to plant spring bulbs, while the soil is still soft after the rain.",
            question: "What's growing in your garden right now?",
            mockReply: "The last of the tomatoes, and my dahlias are still putting on a show."
        ),
        .music: MockLine(
            topic: "Music",
            brief: "A grey morning is perfect for an old favourite record, the kind you can hum along to.",
            question: "What's a song that takes you right back?",
            mockReply: "Anything by Nat King Cole. My mother used to sing along in the kitchen."
        ),
        .food: MockLine(
            topic: "Cooking",
            brief: "Soup season has arrived, and squash and apples are at their very best right now.",
            question: "What do you like to cook when the weather turns cool?",
            mockReply: "A big pot of chicken soup, and an apple crumble if I'm feeling fancy."
        ),
        .nature: MockLine(
            topic: "Nature",
            brief: "The geese are starting to head south, so keep an ear out for them overhead this week.",
            question: "Have you spotted any birds or wildlife lately?",
            mockReply: "A heron down by the creek yesterday, standing perfectly still."
        ),
        .history: MockLine(
            topic: "History",
            brief: "Long ago, whole families gathered around the radio each evening for their favourite shows.",
            question: "What did you love listening to when you were young?",
            mockReply: "The Lone Ranger on Saturday mornings. We'd all sit on the floor and listen."
        ),
        .arts: MockLine(
            topic: "Books",
            brief: "Libraries are putting out their new books this month, so there's plenty to pick from.",
            question: "What's the best book or film you've enjoyed lately?",
            mockReply: "I just finished a mystery set in Venice. I couldn't put it down."
        )
    ]

    /// When someone picks fewer than two interests, the show fills up with these.
    private static let mockFillers: [Interest] = [.local, .history, .nature]

    /// The mock show: the weather, then two segments from the listener's interests (their first
    /// two picks, topped up from `mockFillers`). Mirrors mockBriefingFor() on the web.
    static func mockBriefing(for profile: Profile) -> Briefing {
        var picks = Array(profile.interests.prefix(2))
        for filler in mockFillers where picks.count < 2 && !picks.contains(filler) {
            picks.append(filler)
        }

        let name = profile.name.isEmpty ? "friend" : profile.name
        let town = profile.city.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
        let place = town.isEmpty ? "" : " in \(town)"

        let weather = BriefingSegment(
            id: "weather",
            kind: .weather,
            topic: "Weather",
            brief: "Good morning, \(name). It's going to rain all afternoon\(place), clearing up around six.",
            question: "Do you think you'll still get your walk in?",
            mockReply: "Probably this morning, before it starts. I'll take the long way round the lake."
        )

        let interests = picks.compactMap { interest -> BriefingSegment? in
            guard let line = mockLines[interest] else { return nil }
            return BriefingSegment(
                id: interest.rawValue,
                kind: SegmentKind(rawValue: interest.rawValue) ?? .news,
                topic: line.topic,
                brief: line.brief,
                question: line.question,
                mockReply: line.mockReply
            )
        }

        return Briefing(source: .mock, segments: [weather] + interests)
    }
}

extension Duration {
    /// This duration in seconds, for comparing against `Date` intervals.
    var timeInterval: TimeInterval {
        Double(components.seconds) + Double(components.attoseconds) / 1e18
    }
}
