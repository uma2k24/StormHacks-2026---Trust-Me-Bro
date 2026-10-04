import Foundation

/// The morning briefing. The check-in is disguised as a little morning radio show: each segment
/// reads a short, useful brief (weather, a score, local news) and then asks for the listener's
/// opinion. Their answers are the conversational audio the screening needs.
///
/// Live segments come from the web backend's /api/briefing (Gemini + Google Search) and are read
/// aloud by ElevenLabs via /api/briefing/speech (see BriefingService). Which two interests the show
/// covers is decided on the device from what the listener has responded to (Learning.swift), so
/// Gemini only writes the words. Without a backend the mock show below plays, shaped by the
/// listener's profile. Mirrors frontend/src/data/checkInScript.ts.

/// "weather" and "news" are always available; the rest match the listener's `Interest`s. `chat` is an
/// extra question asked when there hasn't been enough talking yet, and `vowel` is the last question of
/// every show: the sustained "ahhh". Neither is part of the briefing, and neither is sent to Gemini.
enum SegmentKind: String, Codable {
    case weather
    case news
    case chat
    case vowel
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
        case .chat: return "bubble.left.fill"
        case .vowel: return "waveform"
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
    /// The sample answer played when there is no microphone or transcription to hear a real one.
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

    // Real answers (see AnswerRecorder). Mirrors the constants in frontend/src/data/checkInScript.ts.
    /// Louder than this (in dBFS) counts as talking.
    static let speechDB: Float = -40
    /// This long without talking, after they have talked, sends the answer.
    static let silenceEnd: TimeInterval = 2.2
    /// This long without ever talking sends it anyway: nothing was heard.
    static let noSpeech: TimeInterval = 15
    /// The longest one answer can be.
    static let maxAnswer: TimeInterval = 45
    /// A breath after the radio's reply before the next segment.
    static let afterReplyPause: Duration = .milliseconds(600)
    /// After the radio stops talking the microphone opens this much later, so it doesn't hear itself.
    static let handsFreeGap: Duration = .milliseconds(400)

    // Enough voice for the classifier (see frontend/src/lib/voice/analysis.ts). Mirrors the constants in
    // frontend/src/data/checkInScript.ts. The classifier listens four seconds at a time, so that it has
    // plenty to go on the show keeps asking questions until at least this much talking has been heard
    // (counting every answer, from each answer's own recording, but not the "ahhh"), and always ends with
    // the sustained "ahhh", which jitter, shimmer and HNR are measured on. Every answer that was kept is
    // sent to the classifier; the silences between are cut out there.
    /// Talking across the show, pauses not counted.
    static let minSpeech: TimeInterval = 30
    /// Extra questions asked at most, so a quiet listener isn't kept for ever.
    static let maxExtraQuestions = 6
    /// The "ahhh" stops by itself once it has been held this long.
    static let vowelTarget: TimeInterval = 8
    /// A shorter "ahhh" than this is asked for once more.
    static let vowelMin: TimeInterval = 4
    static let vowelTries = 2

    static let vowelListeningLine = "Say “ahhh”…"
    static let vowelAgainLine = "Let's try that once more. Take a deep breath and say “ahhh” for as long as you comfortably can."
    private static let vowelSignOffLine = "Lovely, thank you, {name}. That's the show for today. Have a lovely day."

    private struct ExtraLine {
        let brief: String
        let question: String
        let mockReply: String
    }

    /// Plain questions that get people talking, asked in this order when more speech is needed. {name} is the listener.
    private static let extraLines = [
        ExtraLine(
            brief: "I'm enjoying our chat, {name}. Let's keep going a little longer.",
            question: "What are you looking forward to this week?",
            mockReply: "A visit with my grandchildren on Sunday. They always bring a puzzle."
        ),
        ExtraLine(
            brief: "Here's something I'm curious about.",
            question: "Tell me about a place you've loved visiting, and what made it special.",
            mockReply: "A little town by the sea, where we spent every summer when the children were small."
        ),
        ExtraLine(
            brief: "Let's go back in time for a moment.",
            question: "What was your first job, and what do you remember about it?",
            mockReply: "I worked in a bakery. I still remember the smell of the bread at five in the morning."
        ),
        ExtraLine(
            brief: "Now for something tasty.",
            question: "What's a meal you could happily eat again and again?",
            mockReply: "My mother's chicken and dumplings. Nobody has ever made them quite the same."
        ),
        ExtraLine(
            brief: "Music can take us right back.",
            question: "Is there a song you remember from when you were young? Tell me what it brings to mind.",
            mockReply: "An old dance tune we all knew by heart. I can still see the whole hall singing along."
        ),
        ExtraLine(
            brief: "One more, if you don't mind.",
            question: "Tell me about a celebration you remember fondly, and who was there.",
            mockReply: "Our fortieth anniversary. The whole family came, and my sister made a cake far too big."
        )
    ]

    private static func displayName(_ name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? "friend" : trimmed
    }

    /// The nth extra question (0-based), or nil once they have all been asked. Mirrors extraTurn() on the web.
    static func extraTurn(_ index: Int, for name: String) -> BriefingSegment? {
        guard extraLines.indices.contains(index) else { return nil }
        let line = extraLines[index]
        return BriefingSegment(
            id: "chat-\(index)",
            kind: .chat,
            topic: "Chat",
            brief: line.brief.replacingOccurrences(of: "{name}", with: displayName(name)),
            question: line.question,
            mockReply: line.mockReply
        )
    }

    /// The last question of every show. Mirrors vowelTurn() on the web.
    static func vowelTurn(for name: String) -> BriefingSegment {
        BriefingSegment(
            id: "vowel",
            kind: .vowel,
            topic: "Your voice",
            brief: "One last thing, \(displayName(name)).",
            question: "Take a deep breath, then say “ahhh” and hold it steady for about eight seconds.",
            mockReply: "Ahhhhhh."
        )
    }

    /// What the radio says once the "ahhh" is done. Mirrors vowelSignOff() on the web.
    static func vowelSignOff(for name: String) -> String {
        vowelSignOffLine.replacingOccurrences(of: "{name}", with: displayName(name))
    }

    /// The radio's own lines for when the conversation can't go to plan. It carries on by itself after each.
    static let missedLine = "Sorry, I didn't catch that. Could you say it again?"
    static let giveUpLine = "That's all right. Let's move on."
    static let micBlockedLine = "The microphone is blocked, so I'll use a sample answer."
    static let micMissingLine = "I can't find a microphone, so I'll use a sample answer."
    static let thinkingLine = "Just a moment…"

    private static let thanks = [
        "Thank you for telling me that, {name}. I always enjoy hearing from you.",
        "That sounds lovely, {name}. Thanks for sharing it with me.",
        "I like hearing that, {name}. Thank you for chatting."
    ]
    private static let signOff = "Thank you for sharing that, {name}. That's the show for today. Have a lovely day."

    /// What the radio says back when Gemini can't write a reply (no key, offline, an error): a warm,
    /// fixed line that never claims to know anything. The last segment signs off the show.
    /// Mirrors fallbackReply() on the web.
    static func fallbackReply(for name: String, segmentIndex: Int, last: Bool) -> String {
        let line = last ? signOff : thanks[segmentIndex % thanks.count]
        let who = name.trimmingCharacters(in: .whitespaces)
        return line.replacingOccurrences(of: "{name}", with: who.isEmpty ? "friend" : who)
    }

    /// How many words of a line have been spoken once `fraction` (0...1) of its audio has played, so
    /// the words can appear on screen as the voice reaches them. Longer words and the pause after a
    /// comma or a full stop take longer to say, so they take more of the line. A word shows a touch
    /// before it is heard: the text is never behind the voice. Mirrors wordsSpoken() on the web.
    static func wordsSpoken(in text: String, fraction: Double) -> Int {
        let words = text.split(whereSeparator: \.isWhitespace)
        if fraction >= 1 { return words.count }

        func pause(after word: Substring) -> Double {
            guard let last = word.last else { return 0 }
            if ".!?…".contains(last) { return 6 }
            if ",;:—".contains(last) { return 3 }
            return 0
        }
        let weights = words.map { Double(max(2, $0.count)) + pause(after: $0) }
        let total = weights.reduce(0, +)

        var before = 0.0
        var count = 0
        for weight in weights {
            if before / total > fraction + 0.015 { break }
            count += 1
            before += weight
        }
        return count
    }

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
    private static let fillerInterests: [Interest] = [.local, .history, .nature]

    /// The two interests for a show nobody has chosen picks for (see `Learning.chooseInterests`
    /// for how they are normally chosen): their first two, topped up from `fillerInterests`.
    /// Mirrors fallbackPicks() on the web.
    static func fallbackPicks(for profile: Profile) -> [Interest] {
        var picks = Array(profile.interests.prefix(2))
        for filler in fillerInterests where picks.count < 2 && !picks.contains(filler) {
            picks.append(filler)
        }
        return picks
    }

    /// The mock show: the weather, then a segment for each of the two picks (the fallback two when
    /// none are given). Mirrors mockBriefingFor() on the web.
    static func mockBriefing(for profile: Profile, picks: [Interest]? = nil) -> Briefing {
        let picks = picks ?? fallbackPicks(for: profile)

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
