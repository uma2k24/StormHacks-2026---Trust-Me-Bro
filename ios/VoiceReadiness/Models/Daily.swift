import Foundation

/// The radio's place in the listener's day, all worked out on the device (nothing here calls
/// Gemini): the greeting and the date, which mornings they have tuned in, a short list of little
/// things for today, the reminder the radio reads at the end of the show, and the message they can
/// send their family. Mirrors frontend/src/data/daily.ts.
enum Daily {
    // MARK: The time of day

    static func greeting(at date: Date = .now) -> String {
        let hour = Calendar.current.component(.hour, from: date)
        if hour < 12 { return "Good Morning" }
        if hour < 17 { return "Good Afternoon" }
        return "Good Evening"
    }

    private static let weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    private static let months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ]

    /// "Saturday", "October 3": the date written out in full, so nobody has to work out what day it is.
    static func dateParts(_ date: Date = .now) -> (weekday: String, date: String) {
        let parts = Calendar.current.dateComponents([.weekday, .month, .day], from: date)
        return (weekdays[(parts.weekday ?? 1) - 1], "\(months[(parts.month ?? 1) - 1]) \(parts.day ?? 1)")
    }

    // MARK: Mornings tuned in

    /// How many days of history are kept on the device.
    static let historyDays = 60

    private static func date(of day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    private static func shift(_ day: String, by offset: Int) -> String {
        guard let date = date(of: day),
              let shifted = Calendar.current.date(byAdding: .day, value: offset, to: date) else { return day }
        return Learning.dayKey(shifted)
    }

    struct WeekDay: Identifiable {
        let day: String
        /// "Mon"
        let label: String
        /// "Monday", for VoiceOver
        let name: String
        let listened: Bool
        let today: Bool
        var id: String { day }
    }

    /// The last seven days, oldest first, ending today.
    static func lastSevenDays(_ history: History, today: String) -> [WeekDay] {
        (0..<7).map { index in
            let day = shift(today, by: index - 6)
            let weekday = date(of: day).map { Calendar.current.component(.weekday, from: $0) } ?? 1
            let name = weekdays[weekday - 1]
            return WeekDay(
                day: day,
                label: String(name.prefix(3)),
                name: name,
                listened: history.days[day] != nil,
                today: index == 6
            )
        }
    }

    /// Mornings in a row, counting back from today (or from yesterday, when today is still to come).
    static func streak(_ history: History, today: String) -> Int {
        var day = history.days[today] != nil ? today : shift(today, by: -1)
        var count = 0
        while history.days[day] != nil {
            count += 1
            day = shift(day, by: -1)
        }
        return count
    }

    static func streakLine(_ streak: Int) -> String {
        streak <= 1 ? "A lovely start!" : "\(streak) mornings in a row!"
    }

    private static let monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    /// How many days the trend chart looks back over, today included.
    static let trendDays = 14

    /// The measured mornings before today within the trend's window, oldest first, labelled "Oct 1".
    static func trendBefore(_ history: History, today: String) -> [TrendPoint] {
        (1..<trendDays).reversed().compactMap { back in
            let day = shift(today, by: -back)
            guard let record = history.days[day], record.measured == true else { return nil }
            let parts = day.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            return TrendPoint(day: "\(monthsShort[parts[1] - 1]) \(parts[2])", score: record.score)
        }
    }

    /// Yesterday's score, if that morning was measured.
    static func yesterdayScore(_ history: History, today: String) -> Int? {
        guard let record = history.days[shift(today, by: -1)], record.measured == true else { return nil }
        return record.score
    }

    /// A lived-in week for demo launches, so the lamps aren't all dark: five of the six days before today.
    static func demoHistory(today: String) -> History {
        var history = History()
        for offset in [-6, -5, -3, -2, -1] {
            history.days[shift(today, by: offset)] = DayRecord(score: 80, done: [])
        }
        return history
    }

    // MARK: The reminder

    private static let secondPerson: [String: String] = [
        "i'm": "you're", "i am": "you are", "my": "your", "mine": "yours", "myself": "yourself", "me": "you", "i": "you"
    ]

    /// "Take my blood pressure pill" -> "take your blood pressure pill": how the radio says it back.
    private static func spokenTask(_ text: String) -> String {
        var task = text.trimmingCharacters(in: .whitespacesAndNewlines)
        while let last = task.last, ".!".contains(last) { task.removeLast() }
        let pattern = try! NSRegularExpression(pattern: "\\b(i'm|i am|my|mine|myself|me|i)\\b", options: .caseInsensitive)
        var result = ""
        var cursor = task.startIndex
        for match in pattern.matches(in: task, range: NSRange(task.startIndex..., in: task)) {
            guard let range = Range(match.range, in: task) else { continue }
            result += task[cursor..<range.lowerBound]
            result += secondPerson[task[range].lowercased()] ?? String(task[range])
            cursor = range.upperBound
        }
        result += task[cursor...]
        return result.prefix(1).lowercased() + result.dropFirst()
    }

    /// The reminder as a line on today's list, e.g. "Take your blood pressure pill". Empty when there is none.
    static func reminderTask(_ profile: Profile) -> String {
        let task = spokenTask(profile.reminder)
        return task.prefix(1).uppercased() + task.dropFirst()
    }

    /// What the radio says at the very end of the show, or nil when there's nothing to remind them of.
    static func reminderLine(_ profile: Profile) -> String? {
        let task = spokenTask(profile.reminder)
        guard !task.isEmpty else { return nil }
        return "Before you go, a little reminder: \(task)."
    }

    // MARK: Little things for today

    enum TodayIcon: String {
        case reminder, drink, rest, walk, umbrella, careful, sun, chat, water

        /// Mirrors the icons in TodayScreen.tsx.
        var systemImage: String {
            switch self {
            case .reminder: return "pills.fill"
            case .drink: return "cup.and.saucer.fill"
            case .rest: return "sofa.fill"
            case .walk: return "figure.walk"
            case .umbrella: return "umbrella.fill"
            case .careful: return "snowflake"
            case .sun: return "sun.max.fill"
            case .chat: return "bubble.left.and.bubble.right.fill"
            case .water: return "drop.fill"
            }
        }
    }

    struct TodayItem: Identifiable, Equatable {
        let id: String
        let icon: TodayIcon
        let text: String
    }

    private static func weatherItem(_ weather: String?) -> TodayItem {
        let text = (weather ?? "").lowercased()
        func has(_ pattern: String) -> Bool { text.range(of: pattern, options: .regularExpression) != nil }

        if has("snow|\\bice\\b|icy|frost|slipp") {
            return TodayItem(id: "careful", icon: .careful, text: "Mind your step: it may be icy")
        }
        if has("rain|shower|drizzle|storm") {
            return has("afternoon|later|tonight|evening")
                ? TodayItem(id: "walk", icon: .walk, text: "Go for a walk before the rain")
                : TodayItem(id: "umbrella", icon: .umbrella, text: "Take an umbrella out")
        }
        if has("\\bhot\\b|heat") {
            return TodayItem(id: "water", icon: .water, text: "Drink plenty of water")
        }
        if has("sun|clear|bright|warm") {
            return TodayItem(id: "sun", icon: .sun, text: "Enjoy a little sunshine")
        }
        return TodayItem(id: "walk", icon: .walk, text: "Get some fresh air")
    }

    /// Three little things for today: their own reminder first, then one for their voice, then one for
    /// the weather, topped up with a chat or a glass of water. Gentle and never diagnostic.
    static func plan(for profile: Profile, results: ScreeningResults, weather: String?) -> [TodayItem] {
        let family = profile.familyName.trimmingCharacters(in: .whitespaces)
        let chat = TodayItem(id: "chat", icon: .chat, text: family.isEmpty ? "Have a chat with a friend" : "Have a chat with \(family)")
        let warning = { (label: String) in results.metrics.first { $0.label == label }?.isWarning ?? false }

        var items: [TodayItem] = []
        let task = reminderTask(profile)
        if !task.isEmpty { items.append(TodayItem(id: "reminder", icon: .reminder, text: task)) }

        if results.statusColor == .red {
            items.append(TodayItem(id: "rest", icon: .rest, text: "Rest your voice today"))
        } else if warning("HNR") {
            items.append(TodayItem(id: "drink", icon: .drink, text: "Sip a warm drink"))
        } else if warning("Jitter") {
            items.append(TodayItem(id: "rest", icon: .rest, text: "Take it gently this morning"))
        } else {
            items.append(chat)
        }

        items.append(weatherItem(weather))

        for extra in [chat, TodayItem(id: "water", icon: .water, text: "Drink a glass of water")] {
            if items.count >= 3 { break }
            if !items.contains(where: { $0.id == extra.id }) { items.append(extra) }
        }
        return Array(items.prefix(3))
    }

    // MARK: Family

    /// The text they can send their family, written from today's result. A tired day asks for a call.
    static func familyMessage(_ profile: Profile, status: StatusColor) -> String {
        let family = profile.familyName.trimmingCharacters(in: .whitespaces)
        let hello = "Hi \(family.isEmpty ? "there" : family), it's \(profile.name.trimmingCharacters(in: .whitespaces)). I listened to my Morning Radio today"
        switch status {
        case .green: return "\(hello), and I'm feeling ready for the day."
        case .yellow: return "\(hello). My voice sounded a little tired, so I'm taking it easy."
        case .red: return "\(hello). My voice sounded quite tired, so I'm resting. Could you give me a call when you're free?"
        }
    }

    /// What the button that sends it says: a tired day asks for a call outright.
    static func familyAction(_ profile: Profile, status: StatusColor) -> String {
        let name = profile.familyName.trimmingCharacters(in: .whitespaces)
        return status == .red ? "Ask \(name) to call me" : "Tell \(name) how I am"
    }

    /// Just the digits (and a leading +), for tel: and sms: links.
    static func dialable(_ phone: String) -> String {
        let trimmed = phone.trimmingCharacters(in: .whitespaces)
        return (trimmed.hasPrefix("+") ? "+" : "") + trimmed.filter(\.isNumber)
    }

    static func hasFamily(_ profile: Profile) -> Bool {
        !profile.familyName.trimmingCharacters(in: .whitespaces).isEmpty
            && dialable(profile.familyPhone).filter(\.isNumber).count >= 3
    }

    static func callURL(_ profile: Profile) -> URL? {
        URL(string: "tel:\(dialable(profile.familyPhone))")
    }

    /// Opens Messages with the text written out, ready to send.
    static func messageURL(_ profile: Profile, status: StatusColor) -> URL? {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=?+")
        let body = familyMessage(profile, status: status).addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
        return URL(string: "sms:\(dialable(profile.familyPhone))&body=\(body)")
    }
}

// MARK: - History

/// One morning's check-in: the readiness score and which of the day's little things are ticked off.
struct DayRecord: Codable, Equatable {
    var score: Int
    var done: [String]
    /// True when the score was worked out from their voice (it is missing on mornings saved by older
    /// versions); only measured mornings are drawn on the trend.
    var measured: Bool?
}

/// Which mornings they've tuned in, keyed by `Learning.dayKey()` ("2026-10-03"). Stored as JSON in
/// `@AppStorage("history")`; mirrors `voice-readiness:history` on the web.
struct History: Equatable {
    var days: [String: DayRecord] = [:]

    init() {}

    init(json: String) {
        guard let data = json.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String: DayRecord].self, from: data) else { return }
        days = decoded
    }

    var json: String {
        // only the most recent days are kept
        let kept = Dictionary(uniqueKeysWithValues: days.keys.sorted().suffix(Daily.historyDays).map { ($0, days[$0]!) })
        guard let data = try? JSONEncoder().encode(kept) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }

    /// Today's check-in is done. Anything already ticked off today stays ticked. `measured` says the
    /// score came from their voice: the show records the morning first (with a placeholder score) and
    /// again once the analysis has a real one, and a placeholder never replaces a real score.
    func recordingCheckIn(on day: String, score: Int, measured: Bool = false) -> History {
        var next = self
        if !measured, days[day] != nil { return next }
        next.days[day] = DayRecord(score: score, done: days[day]?.done ?? [], measured: measured ? true : nil)
        return next
    }

    /// Ticks one of the day's little things off, or back on.
    func toggling(_ id: String, on day: String) -> History {
        guard var record = days[day] else { return self }
        if record.done.contains(id) {
            record.done.removeAll { $0 == id }
        } else {
            record.done.append(id)
        }
        var next = self
        next.days[day] = record
        return next
    }
}
