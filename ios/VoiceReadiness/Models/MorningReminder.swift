import UserNotifications

/// The daily "your radio is ready" nudge: a local notification at the time they chose, every
/// morning. Nothing leaves the phone. The web client can't wake anyone up, so it offers a calendar
/// event instead (frontend/src/lib/calendar.ts).
enum MorningReminder {
    private static let id = "morning-radio-daily"

    /// Asks to send notifications. Called the moment they pick a time, so the system's question
    /// makes sense where it appears.
    @discardableResult
    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
    }

    /// Sets (or clears) the daily reminder to match the profile.
    static func schedule(for profile: Profile) async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        guard let hour = profile.showTime.hour else { return }

        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }

        let content = UNMutableNotificationContent()
        let name = profile.name.trimmingCharacters(in: .whitespaces)
        content.title = "Your morning radio is ready"
        content.body = name.isEmpty ? "Good morning! Tap to tune in." : "Good morning, \(name)! Tap to tune in."
        content.sound = .default

        let trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: hour, minute: 0), repeats: true)
        try? await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}
