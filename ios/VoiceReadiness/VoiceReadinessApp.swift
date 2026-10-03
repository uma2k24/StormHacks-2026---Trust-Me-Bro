import SwiftUI

@main
struct VoiceReadinessApp: App {
    init() {
        FontRegistrar.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
