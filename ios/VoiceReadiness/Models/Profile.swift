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

struct Profile: Codable, Equatable {
    var name = ""
    /// Where the weather and local news come from, e.g. "Coquitlam, BC". May be empty.
    var city = ""
    var interests: [Interest] = []
    /// Anything else they would like to hear about, in their own words (a team, a hobby).
    var extras = ""

    /// Stands in for a real profile when a demo launch argument jumps straight to a later screen.
    static let demo = Profile(
        name: "David",
        city: "Coquitlam",
        interests: [.sports, .local, .garden],
        extras: ""
    )

    /// The details with stray whitespace removed.
    var tidied: Profile {
        Profile(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            city: city.trimmingCharacters(in: .whitespacesAndNewlines),
            interests: interests,
            extras: extras.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    /// Changes whenever the show would change; used to know when to ask for a fresh one.
    var showKey: String {
        [name, city, interests.map(\.rawValue).joined(separator: ","), extras].joined(separator: "\u{1F}")
    }

    // The profile is stored as JSON text in @AppStorage.
    init(name: String = "", city: String = "", interests: [Interest] = [], extras: String = "") {
        self.name = name
        self.city = city
        self.interests = interests
        self.extras = extras
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
