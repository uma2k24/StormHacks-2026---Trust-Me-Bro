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

/// "weather" and "news" are always available; the rest match the listener's `Interest`s. `chat` is one
/// of the fixed extra questions (`extraLines`), used only when Gemini couldn't write one, and `vowel`
/// is the last question of every show: the sustained "ahhh". Neither is part of the briefing, and
/// neither is sent to Gemini.
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

/// What Gemini writes for the next question when the show needs more talking. It arrives in the same
/// request as the host's reply to the answer before (see ConversationService.reply), so it costs no
/// request of its own. Mirrors FollowUp in frontend/src/data/checkInScript.ts.
struct FollowUp: Decodable {
    let topic: String
    let brief: String
    let question: String
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

    // When more talking is needed, the next question is made up on the spot: Gemini writes it in the
    // same request as its reply to the answer before, about an interest the app picked
    // (Learning.chooseFollowUp), so it costs no request of its own. It becomes a turn like any other,
    // and its kind is that interest, so how they answer it teaches the radio what they enjoy. Only when
    // Gemini isn't available (no key, an error, an unusable answer) are the fixed questions below asked.

    /// The sample answer for a made-up question: only seen if transcription fails halfway through the show.
    private static let followUpMockReply = "I'd have to think about that one."

    /// A made-up question as a turn, about `focus`. `index` is how many extra questions came before
    /// it. Mirrors followUpTurn() on the web.
    static func followUpTurn(_ follow: FollowUp, focus: Interest, index: Int) -> BriefingSegment {
        BriefingSegment(
            id: "ask-\(index)",
            kind: SegmentKind(rawValue: focus.rawValue) ?? .news,
            topic: follow.topic,
            brief: follow.brief,
            question: follow.question,
            mockReply: followUpMockReply
        )
    }

    private struct ExtraLine {
        let brief: String
        let question: String
        let mockReply: String
    }

    /// The fixed fallback: plain questions that get people talking, asked when more speech is needed and
    /// Gemini couldn't write one. A show's are not the last show's (see `Rotate`).
    private static let extraLines = [
        ExtraLine(
            brief: "I'm enjoying our chat. Let's keep going a little longer.",
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
        ),
        ExtraLine(
            brief: "Here's a fun one.",
            question: "If you could have dinner with anyone from any time, who would it be, and what would you talk about?",
            mockReply: "My grandmother. I'd ask her all about the old days."
        ),
        ExtraLine(
            brief: "Let's talk about home for a moment.",
            question: "What's your favourite room in the house, and what do you like to do there?",
            mockReply: "The kitchen, with the radio on and something in the oven."
        ),
        ExtraLine(
            brief: "Everyone has something they're proud of.",
            question: "What's something you've done that you're proud of?",
            mockReply: "Raising three kind children. It's the best thing I ever did."
        ),
        ExtraLine(
            brief: "Let's think about the people in our lives.",
            question: "Who's someone who always makes you smile, and why?",
            mockReply: "My old friend Margaret. She laughs at her own jokes before she finishes them."
        ),
        ExtraLine(
            brief: "A little look back, if you like.",
            question: "What's a favourite memory from your school days?",
            mockReply: "Singing in the school choir. We performed every December."
        ),
        ExtraLine(
            brief: "Let's talk about the little pleasures.",
            question: "What's a small thing that makes your day better?",
            mockReply: "A cup of tea in my favourite chair, with the window open."
        )
    ]

    private static func displayName(_ name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? "friend" : trimmed
    }

    /// The next fixed extra question. `index` is how many extras came before it in this show. Mirrors extraTurn() on the web.
    static func extraTurn(_ index: Int, rotate: Rotate) -> BriefingSegment {
        let line = extraLines[rotate("extra", extraLines.count)]
        return BriefingSegment(
            id: "chat-\(index)",
            kind: .chat,
            topic: "Chat",
            brief: line.brief,
            question: line.question,
            mockReply: line.mockReply
        )
    }

    /// The last question of every show. Mirrors vowelTurn() on the web.
    static func vowelTurn() -> BriefingSegment {
        BriefingSegment(
            id: "vowel",
            kind: .vowel,
            topic: "Your voice",
            brief: "One last thing.",
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
        "Thank you for telling me that. I really enjoyed hearing it.",
        "That sounds lovely. Thanks for sharing it with me.",
        "I like hearing that. Thank you for chatting.",
        "What a nice thing to share. I'm glad you told me.",
        "That's lovely to hear. Thank you for letting me in on it.",
        "Thank you, that was a pleasure to listen to.",
        "You have a lovely way of telling it. Thank you.",
        "How nice. Thanks for sharing that with me.",
        "That's wonderful. I'm so glad you told me about it.",
        "Thank you for that. It's good to hear your point of view."
    ]
    private static let signOff = "Thank you for sharing that. That's the show for today. Have a lovely day."

    /// What the radio says back when Gemini can't write a reply (no key, offline, an error): a warm,
    /// fixed line that never claims to know anything and doesn't use their name (the greeting and the
    /// goodbye do). The last segment signs off the show. Mirrors fallbackReply() on the web.
    static func fallbackReply(last: Bool = false, rotate: Rotate = firstLine) -> String {
        last ? signOff : thanks[rotate("thanks", thanks.count)]
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
        let brief: String
        let question: String
        let mockReply: String
    }

    // The fixed show: what plays when the live one can't be had (no backend, Gemini down). These lines
    // have to be right for whoever is listening, wherever and whenever they are, so they hold no scores,
    // teams, towns, dates, seasons or weather, and never suggest the listener has been here before. There
    // are several for each topic so one isn't played again until the rest have been (see `Rotate`).

    /// Which of a pool's fixed lines to use next, 0..<size. A stored counter moves each pool on every
    /// time it is asked (`FixedLines.take`). Mirrors Rotate on the web.
    typealias Rotate = (_ pool: String, _ size: Int) -> Int

    /// No rotation: always a pool's first line. For showing what a show is about when none of it is played.
    static let firstLine: Rotate = { _, _ in 0 }

    /// {name} is the listener. The weather line claims nothing about the weather: it asks them to look outside.
    private static let weatherLines = [
        MockLine(
            brief: "Good morning, {name}. I can't read you the forecast just now, so let's look out the window instead.",
            question: "What's the sky doing where you are this morning?",
            mockReply: "A few soft clouds drifting by, and a little breeze in the trees."
        ),
        MockLine(
            brief: "Good morning, {name}. The forecast isn't coming through right now, but you're the best weather reporter I know.",
            question: "How would you describe the weather outside your window?",
            mockReply: "Calm and mild, I think. A good day to be out and about."
        ),
        MockLine(
            brief: "Good morning, {name}. I don't have today's weather to hand, so I'll rely on you.",
            question: "Do you have any plans that depend on the weather today?",
            mockReply: "A little walk around the block, if it stays pleasant."
        ),
        MockLine(
            brief: "Good morning, {name}. The weather report is taking a day off, so over to you.",
            question: "What do you like to do when the weather is just right?",
            mockReply: "Sit out on the porch with a cup of tea and watch the world go by."
        ),
        MockLine(
            brief: "Good morning, {name}. No forecast from me today, but a good morning starts with a good look outside.",
            question: "What can you see from your window right now?",
            mockReply: "The neighbour's tree, and a few birds on the fence."
        ),
        MockLine(
            brief: "Good morning, {name}. I can't check the weather this time, so tell me how the day looks to you.",
            question: "Is it a day for a walk, or a day for staying cosy indoors?",
            mockReply: "A short walk, I think, and then a cup of tea by the window."
        ),
        MockLine(
            brief: "Good morning, {name}. The forecast has gone quiet, so you'll have to be my eyes today.",
            question: "How does it feel outside this morning?",
            mockReply: "Fresh and quiet. I could hear the birds from the kitchen."
        )
    ]

    private struct MockPool {
        let topic: String
        let lines: [MockLine]
    }

    private static let mockPools: [Interest: MockPool] = [
        .sports: MockPool(
            topic: "Sports",
            lines: [
                MockLine(
                    brief: "Sports have a way of bringing people together, whether you play, watch or just love the stories.",
                    question: "Is there a team or a sport you've always followed?",
                    mockReply: "Baseball, mostly. I grew up listening to the games on the radio."
                ),
                MockLine(
                    brief: "A good game can make an ordinary day feel special.",
                    question: "What's the best game you ever went to or watched?",
                    mockReply: "A big final years ago. The whole room was on its feet at the end."
                ),
                MockLine(
                    brief: "Some people love to play, some love to watch, and some just like the snacks.",
                    question: "Did you play any sports when you were younger?",
                    mockReply: "A bit of softball and swimming. I wasn't good, but I loved it."
                ),
                MockLine(
                    brief: "Every sport has its great moments, and plenty of us remember where we were for the big ones.",
                    question: "Is there a big sporting moment you remember well?",
                    mockReply: "The Olympics on a tiny television, with the whole family squeezed around it."
                ),
                MockLine(
                    brief: "A walk, a swim or a good stretch counts as sport too, and it's good for the spirits.",
                    question: "What kind of exercise do you enjoy most?",
                    mockReply: "A slow walk in the morning. It clears my head before the day gets going."
                ),
                MockLine(
                    brief: "Cheering for a team is one of life's little pleasures, win or lose.",
                    question: "Who do you like to cheer for, and how did you pick them?",
                    mockReply: "My hometown team. You never leave the team you grew up with."
                ),
                MockLine(
                    brief: "Some of the best sports stories are the ones about the fans in the stands.",
                    question: "Have you ever been to a game in person? What do you remember?",
                    mockReply: "A baseball game with my father. We shared a bag of peanuts, and I've never forgotten it."
                )
            ]
        ),
        .local: MockPool(
            topic: "Local",
            lines: [
                MockLine(
                    brief: "Every neighbourhood has its own little places that make it feel like home.",
                    question: "What's a favourite spot of yours close to home?",
                    mockReply: "The little café on the corner. They know my order without asking."
                ),
                MockLine(
                    brief: "A good community is built from small things, like a friendly wave or a chat over the fence.",
                    question: "Who's a neighbour or a local face you enjoy seeing?",
                    mockReply: "The lady next door. We chat about the weather and her dog."
                ),
                MockLine(
                    brief: "Libraries, trails and community centres are part of what makes a town special.",
                    question: "What do you like most about the place where you live?",
                    mockReply: "How friendly everyone is. You can't walk to the shops without a chat."
                ),
                MockLine(
                    brief: "Small towns and big cities both have their own kind of charm.",
                    question: "What's changed most around you over the years?",
                    mockReply: "The shops on the main street. Some of my old favourites are gone now."
                ),
                MockLine(
                    brief: "There's often something going on close to home, from a library talk to a concert in the park.",
                    question: "What do you enjoy doing in your neighbourhood?",
                    mockReply: "A stroll to the park, and a sit on my favourite bench."
                ),
                MockLine(
                    brief: "A quiet trail or a favourite bench can turn a short outing into a nice one.",
                    question: "Where would you take a visitor to show off your area?",
                    mockReply: "Down to the water, then along the path under the trees."
                ),
                MockLine(
                    brief: "A friendly hello on the street can brighten a whole morning.",
                    question: "Who do you like to say hello to when you're out?",
                    mockReply: "The fellow who walks his spaniel past my gate every day."
                )
            ]
        ),
        .garden: MockPool(
            topic: "Garden",
            lines: [
                MockLine(
                    brief: "Even a pot on a windowsill counts as a garden.",
                    question: "What do you like to grow, or what would you like to?",
                    mockReply: "Tomatoes and herbs. Nothing tastes like something you've grown yourself."
                ),
                MockLine(
                    brief: "Gardeners are patient people, and plants seem to reward it.",
                    question: "What's the best thing you've ever grown?",
                    mockReply: "A sunflower taller than the fence. The neighbours came to look at it."
                ),
                MockLine(
                    brief: "Flowers have a way of lifting the mood of a whole room.",
                    question: "Do you have a favourite flower, and what do you like about it?",
                    mockReply: "Roses. My mother grew them, and the smell takes me right back."
                ),
                MockLine(
                    brief: "Birds, bees and butterflies are happy visitors in any garden.",
                    question: "Who comes to visit your garden or your window box?",
                    mockReply: "Sparrows, mostly, and a robin who thinks the bird bath is his."
                ),
                MockLine(
                    brief: "A little time among the plants can make a busy day feel calmer.",
                    question: "What's your favourite part of looking after plants?",
                    mockReply: "Watering them first thing. It's a quiet way to start the day."
                ),
                MockLine(
                    brief: "Many gardens begin with a single cutting passed along by a friend.",
                    question: "Is there a plant that came from someone special?",
                    mockReply: "A geranium from my sister. I've kept it going for years."
                ),
                MockLine(
                    brief: "Gardens come in every size, from a big field to a single flowerpot.",
                    question: "Do you keep any plants at home, and which is your favourite?",
                    mockReply: "A big old fern in the front room. It's been with me for twenty years."
                )
            ]
        ),
        .music: MockPool(
            topic: "Music",
            lines: [
                MockLine(
                    brief: "A song can take you straight back to a moment, a place or a person.",
                    question: "What's a song that takes you right back?",
                    mockReply: "Anything by Nat King Cole. My mother used to sing along in the kitchen."
                ),
                MockLine(
                    brief: "Music is good company, whether it's playing softly in the background or turned up loud.",
                    question: "What do you like to listen to while you're busy at home?",
                    mockReply: "Old records, mostly. They make the chores go by."
                ),
                MockLine(
                    brief: "Everyone has a tune they can't help humming.",
                    question: "What's a tune you find yourself humming?",
                    mockReply: "An old waltz. I don't even know where I learned it."
                ),
                MockLine(
                    brief: "Dancing in the kitchen is completely allowed.",
                    question: "Is there a song that always gets you moving?",
                    mockReply: "Anything with a good swing to it. My feet start tapping on their own."
                ),
                MockLine(
                    brief: "Records, radio and live bands each have their own kind of magic.",
                    question: "What's the best live music you've ever heard?",
                    mockReply: "A little band at a wedding. Everyone danced until midnight."
                ),
                MockLine(
                    brief: "Many of us learned our favourite songs from someone we loved.",
                    question: "Who introduced you to the music you love?",
                    mockReply: "My father. He'd put on a record every Sunday after lunch."
                ),
                MockLine(
                    brief: "Humming along to a favourite song is good for the spirits.",
                    question: "Do you play an instrument, or did you ever?",
                    mockReply: "Piano, when I was a girl. I can still manage a few tunes."
                )
            ]
        ),
        .food: MockPool(
            topic: "Cooking",
            lines: [
                MockLine(
                    brief: "A good meal is about the company as much as the food.",
                    question: "What's a meal that brings your family together?",
                    mockReply: "Sunday dinner. Everyone has a seat at the table, and nobody leaves hungry."
                ),
                MockLine(
                    brief: "Some recipes live in our memory long after the cookbook is gone.",
                    question: "What's a recipe you remember from your childhood?",
                    mockReply: "My grandmother's apple cake. She never wrote it down, so I learned by watching."
                ),
                MockLine(
                    brief: "A warm cup of tea and something small to nibble can make any hour feel cosy.",
                    question: "What's your favourite little treat with a cup of tea?",
                    mockReply: "A butter cookie, or a slice of toast with honey."
                ),
                MockLine(
                    brief: "Cooking for someone is one of the nicest ways to say you care.",
                    question: "What do you like to make when someone's coming to visit?",
                    mockReply: "A big pot of soup and a loaf of fresh bread."
                ),
                MockLine(
                    brief: "Everyone has a dish they can make without looking at a recipe.",
                    question: "What's the dish you could make with your eyes closed?",
                    mockReply: "Scrambled eggs, the way my mother did them, slow and gentle."
                ),
                MockLine(
                    brief: "Fresh bread, ripe fruit, a good soup: simple food is often the best.",
                    question: "What simple food do you enjoy most?",
                    mockReply: "A ripe peach, eaten over the sink so nothing is wasted."
                ),
                MockLine(
                    brief: "The smell of something baking can make a house feel like home.",
                    question: "What smells in the kitchen take you back?",
                    mockReply: "Fresh bread and cinnamon. It reminds me of my grandmother's house."
                )
            ]
        ),
        .nature: MockPool(
            topic: "Nature",
            lines: [
                MockLine(
                    brief: "Wherever you live, there's usually a bird or a tree outside if you stop and look.",
                    question: "What have you noticed outdoors lately?",
                    mockReply: "A little wren on the fence, singing its heart out."
                ),
                MockLine(
                    brief: "Animals have their own routines, and watching them can be a quiet pleasure.",
                    question: "Is there an animal or a bird you enjoy watching?",
                    mockReply: "The squirrels. They seem so busy and so sure of themselves."
                ),
                MockLine(
                    brief: "Trees have a way of making any street feel friendlier.",
                    question: "Do you have a favourite tree or a favourite place to sit outside?",
                    mockReply: "An old oak at the end of the road. I sit under it with a book."
                ),
                MockLine(
                    brief: "Clouds, stars and sunsets are free entertainment for anyone who looks up.",
                    question: "What's the best sky you remember seeing?",
                    mockReply: "A sky full of stars on a camping trip. I'd never seen so many."
                ),
                MockLine(
                    brief: "A few minutes outside can make the whole day feel lighter.",
                    question: "Where do you like to go when you want some fresh air?",
                    mockReply: "Just to the front step, with a cup of tea."
                ),
                MockLine(
                    brief: "Pets can be the best company, and they always have a story.",
                    question: "Tell me about a pet you've loved.",
                    mockReply: "A little grey cat called Smudge. She slept on my lap every evening."
                ),
                MockLine(
                    brief: "Even a short look out of the window can show you a bird, a bee or a squirrel.",
                    question: "What's the best bit of nature you've seen near your home?",
                    mockReply: "A family of ducks crossing the road. Everyone stopped to let them pass."
                )
            ]
        ),
        .history: MockPool(
            topic: "History",
            lines: [
                MockLine(
                    brief: "Long ago, whole families gathered around the radio each evening for their favourite shows.",
                    question: "What did you love listening to when you were young?",
                    mockReply: "The Lone Ranger on Saturday mornings. We'd all sit on the floor and listen."
                ),
                MockLine(
                    brief: "Every family has stories that get told again and again at the table.",
                    question: "What's a story from your family that you love to tell?",
                    mockReply: "How my parents met at a dance. My father spilled punch on my mother's dress."
                ),
                MockLine(
                    brief: "The world has changed a great deal in a lifetime, in big ways and small.",
                    question: "What's something from your childhood that children today would find surprising?",
                    mockReply: "Walking to school on our own, and coming home when the streetlights came on."
                ),
                MockLine(
                    brief: "Old photographs can bring back whole afternoons.",
                    question: "Is there a photograph you're fond of, and what's the story behind it?",
                    mockReply: "One of my parents on their wedding day. They look so young and so happy."
                ),
                MockLine(
                    brief: "Many of us remember the first time we used something new, like a telephone or a television.",
                    question: "What do you remember about the first television or telephone you used?",
                    mockReply: "A big wooden set in the front room. The whole street came to watch."
                ),
                MockLine(
                    brief: "Looking back is a lovely way to spend a few minutes.",
                    question: "What's a memory from your younger years that still makes you smile?",
                    mockReply: "Summer evenings on the porch, with the whole family together."
                ),
                MockLine(
                    brief: "Old letters, recipes and photographs are small pieces of history that live in our homes.",
                    question: "Is there something old in your home that you treasure?",
                    mockReply: "My grandmother's teapot. It still pours perfectly."
                )
            ]
        ),
        .arts: MockPool(
            topic: "Books",
            lines: [
                MockLine(
                    brief: "A good book can keep you company for days.",
                    question: "What's the best book you've ever read?",
                    mockReply: "A mystery set in Venice. I couldn't put it down."
                ),
                MockLine(
                    brief: "Some films are worth watching again and again.",
                    question: "What's a film you could watch over and over?",
                    mockReply: "An old black and white romance. I know every line, and I still cry at the end."
                ),
                MockLine(
                    brief: "Stories, whether in a book, a film or a play, let us visit places we may never go.",
                    question: "Where would you like a story to take you?",
                    mockReply: "To a little village in Italy, with a long table under the trees."
                ),
                MockLine(
                    brief: "Libraries are quiet places full of possibilities.",
                    question: "What do you like to read or watch on a quiet afternoon?",
                    mockReply: "A good detective story, and a biscuit or two."
                ),
                MockLine(
                    brief: "Painting, knitting, writing: making something with your hands is good for the spirit.",
                    question: "Do you make anything yourself, or have you ever wanted to?",
                    mockReply: "I knit scarves for the family. Everyone gets one whether they like it or not."
                ),
                MockLine(
                    brief: "Everyone has an author, an actor or a character they've grown fond of.",
                    question: "Who's a favourite character or author of yours?",
                    mockReply: "Agatha Christie. I've read nearly all of her books, some of them twice."
                ),
                MockLine(
                    brief: "A good story can make an afternoon fly by.",
                    question: "What kind of stories do you enjoy most?",
                    mockReply: "Mysteries. I like trying to guess who did it before the end."
                )
            ]
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
    /// none are given). Playing it passes a `rotate` that remembers what was heard (`FixedLines.take`),
    /// so the lines change from one show to the next. Mirrors mockBriefingFor() on the web.
    static func mockBriefing(for profile: Profile, picks: [Interest]? = nil, rotate: Rotate = firstLine) -> Briefing {
        let picks = picks ?? fallbackPicks(for: profile)

        let name = profile.name.isEmpty ? "friend" : profile.name
        let line = weatherLines[rotate("weather", weatherLines.count)]

        let weather = BriefingSegment(
            id: "weather",
            kind: .weather,
            topic: "Weather",
            brief: line.brief.replacingOccurrences(of: "{name}", with: name),
            question: line.question,
            mockReply: line.mockReply
        )

        let interests = picks.compactMap { interest -> BriefingSegment? in
            guard let pool = mockPools[interest] else { return nil }
            let line = pool.lines[rotate(interest.rawValue, pool.lines.count)]
            return BriefingSegment(
                id: interest.rawValue,
                kind: SegmentKind(rawValue: interest.rawValue) ?? .news,
                topic: pool.topic,
                brief: line.brief,
                question: line.question,
                mockReply: line.mockReply
            )
        }

        return Briefing(source: .mock, segments: [weather] + interests)
    }
}

/// Which of a pool of fixed lines comes next, remembered on the device (UserDefaults, which is also
/// where ContentView's @AppStorage lives) so a line isn't heard again until the rest of its pool has
/// been. Mirrors takeFixedLine() in frontend/src/lib/storage.ts.
enum FixedLines {
    private static let key = "fixedLines"

    /// 0..<size. Each call moves that pool on by one.
    static func take(_ pool: String, _ size: Int) -> Int {
        guard size > 0 else { return 0 }
        var counts = UserDefaults.standard.string(forKey: key)
            .flatMap { $0.data(using: .utf8) }
            .flatMap { try? JSONDecoder().decode([String: Int].self, from: $0) } ?? [:]
        let used = max(0, counts[pool] ?? 0)
        counts[pool] = used + 1
        if let data = try? JSONEncoder().encode(counts) {
            UserDefaults.standard.set(String(decoding: data, as: UTF8.self), forKey: key)
        }
        return used % size
    }
}

extension Duration {
    /// This duration in seconds, for comparing against `Date` intervals.
    var timeInterval: TimeInterval {
        Double(components.seconds) + Double(components.attoseconds) / 1e18
    }
}
