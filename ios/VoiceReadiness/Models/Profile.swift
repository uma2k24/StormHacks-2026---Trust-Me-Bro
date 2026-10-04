import SwiftUI

/// Who is listening: the name, place and interests that shape the morning show, plus the text
/// size. Set up once in the sign-up flow and editable any time from Settings.
/// Mirrors frontend/src/data/profile.ts.

enum Interest: String, CaseIterable, Codable, Identifiable {
    case sports
    case local
    case garden
    case music
    case food
    case nature
    case history
    case arts

    var id: String { rawValue }

    /// What the choice says on the sign-up and settings screens.
    var label: String {
        switch self {
        case .sports: return "Sports"
        case .local: return "Local news"
        case .garden: return "Gardening"
        case .music: return "Music"
        case .food: return "Cooking"
        case .nature: return "Nature"
        case .history: return "History"
        case .arts: return "Books & films"
        }
    }
}

/// When the daily "your radio is ready" reminder goes off, or `.off` for none.
enum ShowTime: String, CaseIterable, Codable, Identifiable {
    case seven = "07:00"
    case eight = "08:00"
    case nine = "09:00"
    case ten = "10:00"
    case off

    var id: String { rawValue }

    var label: String {
        switch self {
        case .seven: return "7 am"
        case .eight: return "8 am"
        case .nine: return "9 am"
        case .ten: return "10 am"
        case .off: return "No reminder"
        }
    }

    /// The hour it goes off, or nil for none.
    var hour: Int? {
        self == .off ? nil : Int(rawValue.prefix(2))
    }
}

struct Profile: Codable, Equatable {
    var name = ""
    /// Where the weather and local news come from, e.g. "Coquitlam, BC". May be empty.
    var city = ""
    var interests: [Interest] = []
    /// Anything else they would like to hear about, in their own words (a team, a hobby).
    var extras = ""
    /// Someone who would like to hear how they are doing: one tap calls them or sends today's news. May be empty.
    var familyName = ""
    var familyPhone = ""
    /// Something the radio reminds them of at the end of each show, e.g. "Take your blood pressure pill". May be empty.
    var reminder = ""
    var showTime: ShowTime = .off

    /// Stands in for a real profile when a demo launch argument jumps straight to a later screen.
    static let demo = Profile(
        name: "David",
        city: "Coquitlam",
        interests: [.sports, .local, .garden],
        extras: "",
        familyName: "Sarah",
        familyPhone: "604 555 0134",
        reminder: "Take your blood pressure pill",
        showTime: .eight
    )

    /// The details with stray whitespace removed.
    var tidied: Profile {
        var tidy = self
        tidy.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        tidy.city = city.trimmingCharacters(in: .whitespacesAndNewlines)
        tidy.extras = extras.trimmingCharacters(in: .whitespacesAndNewlines)
        tidy.familyName = familyName.trimmingCharacters(in: .whitespacesAndNewlines)
        tidy.familyPhone = familyPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        tidy.reminder = reminder.trimmingCharacters(in: .whitespacesAndNewlines)
        return tidy
    }

    /// Changes whenever the show would change; used to know when to ask for a fresh one. Family, the
    /// reminder and the show time don't shape the show, so editing them never costs a new one.
    var showKey: String {
        [name, city, interests.map(\.rawValue).joined(separator: ","), extras].joined(separator: "\u{1F}")
    }

    // The profile is stored as JSON text in @AppStorage.
    init(
        name: String = "",
        city: String = "",
        interests: [Interest] = [],
        extras: String = "",
        familyName: String = "",
        familyPhone: String = "",
        reminder: String = "",
        showTime: ShowTime = .off
    ) {
        self.name = name
        self.city = city
        self.interests = interests
        self.extras = extras
        self.familyName = familyName
        self.familyPhone = familyPhone
        self.reminder = reminder
        self.showTime = showTime
    }

    private enum CodingKeys: String, CodingKey {
        case name, city, interests, extras, familyName, familyPhone, reminder, showTime
    }

    /// Fields added later are optional, so a profile saved before them still loads.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        city = try container.decodeIfPresent(String.self, forKey: .city) ?? ""
        interests = try container.decodeIfPresent([Interest].self, forKey: .interests) ?? []
        extras = try container.decodeIfPresent(String.self, forKey: .extras) ?? ""
        familyName = try container.decodeIfPresent(String.self, forKey: .familyName) ?? ""
        familyPhone = try container.decodeIfPresent(String.self, forKey: .familyPhone) ?? ""
        reminder = try container.decodeIfPresent(String.self, forKey: .reminder) ?? ""
        showTime = (try? container.decodeIfPresent(ShowTime.self, forKey: .showTime)) ?? .off
    }

    init?(json: String) {
        guard let data = json.data(using: .utf8),
              let profile = try? JSONDecoder().decode(Profile.self, from: data),
              !profile.name.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        self = profile
    }

    var json: String {
        guard let data = try? JSONEncoder().encode(self) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }
}

/// In-app text size, layered on top of the system Dynamic Type setting. Text is big by default.
enum TextSizeStep: String, CaseIterable, Identifiable {
    case big
    case bigger
    case biggest

    static let standard = TextSizeStep.bigger

    var id: String { rawValue }

    var label: String {
        switch self {
        case .big: return "Big"
        case .bigger: return "Bigger"
        case .biggest: return "Biggest"
        }
    }

    /// Each choice is written at its own size, so you can see what you are picking.
    var samplePoints: CGFloat {
        switch self {
        case .big: return 22
        case .bigger: return 28
        case .biggest: return 34
        }
    }

    /// Never smaller than what the person already chose in iOS Settings.
    func dynamicTypeSize(system: DynamicTypeSize) -> DynamicTypeSize {
        switch self {
        case .big: return max(system, .xxLarge)
        case .bigger: return max(system, .xxxLarge)
        case .biggest: return max(system, .accessibility1)
        }
    }
}

/// How fast the radio talks. Applied to ElevenLabs clips and the device voice fallback.
enum TalkSpeedStep: String, CaseIterable, Identifiable {
    case slow
    case steady
    case fast

    static let standard = TalkSpeedStep.steady
    static let storageKey = "talkSpeed"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .slow: return "Slow"
        case .steady: return "Steady"
        case .fast: return "Fast"
        }
    }

    /// Multiplier for `AVAudioPlayer.rate` and for pacing when there is no voice.
    var rate: Float {
        switch self {
        case .slow: return 0.7
        case .steady: return 0.85
        case .fast: return 1
        }
    }

    /// What the radio is currently set to (kept in AppStorage / UserDefaults).
    static var current: TalkSpeedStep {
        let raw = UserDefaults.standard.string(forKey: storageKey) ?? standard.rawValue
        return TalkSpeedStep(rawValue: raw) ?? .standard
    }
}
