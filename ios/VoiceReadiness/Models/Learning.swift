import Foundation

/// What the radio has learned about one listener, kept on their device. Nothing here calls Gemini:
/// learning is a little arithmetic over how the person answers, and the only thing it changes is
/// which two interests the next show is written about.
///
/// What someone ticked in Settings stays the foundation. How they actually respond then tilts the
/// odds: an interest they light up about comes up more, one they never respond to comes up less,
/// and one they never ticked but clearly enjoy is added to the regulars.
/// Mirrors frontend/src/data/learning.ts.

/// A running average of how much they responded, with how many answers it is based on.
struct Taste: Codable, Equatable {
    /// Answers counted so far; fades with time so old habits are forgotten.
    var n = 0.0
    /// 0...1, how much they responded compared with how they usually answer (0.5 is their usual).
    var mean = 0.5
    /// The day (yyyy-MM-dd) of the last answer, for fading.
    var last = ""
}

struct Learned: Codable, Equatable {
    /// How they answer anything at all: the yardstick each interest is measured against.
    var baseline = Taste()
    /// Keyed by `Interest.rawValue`.
    var interests: [String: Taste] = [:]

    init() {}

    /// Anything unreadable starts the radio off with nothing learned.
    init(json: String) {
        if let data = json.data(using: .utf8),
           let learned = try? JSONDecoder().decode(Learned.self, from: data) {
            self = learned
        } else {
            self = Learned()
        }
    }

    var json: String {
        guard let data = try? JSONEncoder().encode(self) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }
}

/// What the person did on one segment, measured from their recording: timing, never what they said.
struct AnswerTiming {
    /// From the question being asked until they started speaking.
    var latency: TimeInterval
    /// From their first word to their last: how long they actually talked, not counting pauses around it.
    var talked: TimeInterval
}

/// Today's show and the choices behind it, kept so opening the app again doesn't start over.
struct TodaysShow: Codable {
    var day: String
    /// `Profile.showKey` of the profile it was made for.
    var key: String
    var picks: [Interest]
    /// The live show, once it has arrived.
    var briefing: Briefing?

    /// Anything saved by an older or broken build is dropped, so a bad show is never played.
    init?(json: String) {
        guard let data = json.data(using: .utf8),
              let show = try? JSONDecoder().decode(TodaysShow.self, from: data),
              show.picks.count == 2 else { return nil }
        self = show
        if briefing?.source != .live || briefing?.segments.isEmpty == true { briefing = nil }
    }

    init(day: String, key: String, picks: [Interest], briefing: Briefing? = nil) {
        self.day = day
        self.key = key
        self.picks = picks
        self.briefing = briefing
    }

    var json: String {
        guard let data = try? JSONEncoder().encode(self) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }
}

enum Learning {
    // The numbers worth tuning. Keep in step with the constants in learning.ts.
    private static let quick: TimeInterval = 1.5 // pressing Talk this fast counts as eager
    private static let slow: TimeInterval = 9 // and this slow counts as not very interested
    private static let priorN = 3.0 // a new interest starts as if it had three "usual" answers
    private static let sharpness = 5.0 // how strongly evidence tilts the odds of an interest being picked
    private static let memory = 12.0 // once an interest has this many answers, newer ones count for 1/12
    private static let halfLifeDays = 45.0 // evidence this old counts half
    private static let explore = 0.06 // odds of something they never ticked, next to 1 for what they did
    private static let adoptN = 2.0 // answers needed before an unticked interest can become a regular...
    private static let adoptMean = 0.7 // ...and how far above their usual they must have been on average
    private static let minBaseline = 1.0 // answers needed before "above their usual" means anything

    private static func clamp01(_ value: Double) -> Double { min(1, max(0, value)) }

    // MARK: Days

    /// Today's date on the listener's own clock, e.g. "2026-10-03".
    static func dayKey(_ date: Date = .now) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    private static func dayNumber(_ key: String) -> Double? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let utc = TimeZone(identifier: "UTC") else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        guard let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else {
            return nil
        }
        return (date.timeIntervalSince1970 / 86_400).rounded()
    }

    private static func daysBetween(_ from: String, _ to: String) -> Double {
        guard let start = dayNumber(from), let end = dayNumber(to) else { return 0 }
        return max(0, end - start)
    }

    /// A taste with its age taken into account: n shrinks, mean stays.
    private static func fresh(_ taste: Taste?, _ day: String) -> Taste {
        guard let taste, !taste.last.isEmpty else { return Taste(n: 0, mean: 0.5, last: day) }
        var aged = taste
        aged.n = taste.n * pow(0.5, daysBetween(taste.last, day) / halfLifeDays)
        return aged
    }

    // MARK: Learning

    /// 0...1: how much of an answer there was. Talking for a while and starting promptly both count.
    static func engagement(of timing: AnswerTiming) -> Double {
        let talked = clamp01(timing.talked / CheckInScript.listenDuration.timeInterval)
        let eager = 1 - clamp01((timing.latency - quick) / (slow - quick))
        return 0.6 * talked + 0.4 * eager
    }

    private static func updated(_ taste: Taste?, _ value: Double, _ day: String) -> Taste {
        let current = fresh(taste, day)
        let n = current.n + 1
        // a plain average while there is little to go on, then a moving one that follows their changes
        return Taste(n: n, mean: current.mean + (value - current.mean) / min(n, memory), last: day)
    }

    /// Folds one answered segment into what has been learned. Every answer teaches the yardstick
    /// (how they usually answer); one about an interest also teaches how much they like that
    /// interest. Weather, and anything else that isn't one of their interests, only teaches the yardstick.
    static func learn(_ learned: Learned, kind: SegmentKind, engagement: Double, day: String) -> Learned {
        let usual = fresh(learned.baseline, day)
        var next = learned
        next.baseline = updated(learned.baseline, engagement, day)
        guard let interest = Interest(rawValue: kind.rawValue) else { return next }

        // Measured against how they usually answer, so a quiet person isn't taken to dislike everything
        // and a chatty one isn't taken to love it. The very first answer has nothing to be measured against.
        let lift = usual.n < minBaseline ? 0.5 : clamp01(0.5 + engagement - usual.mean)
        next.interests[interest.rawValue] = updated(learned.interests[interest.rawValue], lift, day)
        return next
    }

    // MARK: Using what was learned

    /// How likely an interest is to be on the show: the odds of their pick, tilted by how they respond.
    private static func weight(of interest: Interest, chosen: Set<Interest>, learned: Learned, day: String) -> Double {
        let taste = fresh(learned.interests[interest.rawValue], day)
        let regular = chosen.isEmpty || chosen.contains(interest) || (taste.n >= adoptN && taste.mean >= adoptMean)
        let score = (taste.n * taste.mean + priorN * 0.5) / (taste.n + priorN) // few answers stay close to "usual"
        return (regular ? 1 : explore) * exp(sharpness * (score - 0.5))
    }

    /// The two interests for today's show, drawn by weight so favourites come up most days while the
    /// odd surprise still gets a turn (that's how a new interest gets noticed). The draw is seeded by
    /// the day, so it doesn't change however often the app is opened.
    static func chooseInterests(for profile: Profile, learned: Learned, day: String) -> [Interest] {
        let chosen = Set(profile.interests)
        var random = SeededRandom("\(day)|\(profile.name)")
        var pool = Interest.allCases.map {
            (interest: $0, weight: weight(of: $0, chosen: chosen, learned: learned, day: day))
        }

        var picks: [Interest] = []
        while picks.count < 2, !pool.isEmpty {
            var roll = random.next() * pool.reduce(0) { $0 + $1.weight }
            var index = pool.count - 1
            for (position, item) in pool.enumerated() {
                roll -= item.weight
                if roll < 0 {
                    index = position
                    break
                }
            }
            picks.append(pool.remove(at: index).interest)
        }
        return picks
    }
}

/// A small seeded generator, so the same day gives the same picks (same maths as seeded() on the web).
private struct SeededRandom {
    private var state: UInt32

    init(_ text: String) {
        var hash: UInt32 = 2166136261 // FNV-1a over the UTF-8 bytes
        for byte in text.utf8 { hash = (hash ^ UInt32(byte)) &* 16777619 }
        state = hash
    }

    mutating func next() -> Double {
        state = state &+ 0x6D2B79F5 // mulberry32
        var t = (state ^ (state >> 15)) &* (state | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4294967296
    }
}
