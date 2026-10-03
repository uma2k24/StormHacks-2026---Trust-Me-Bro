import AVFoundation
import Foundation

/// Talks to the web backend (frontend/src/app/api/briefing), which holds the Gemini and ElevenLabs
/// keys so they never ship in the app. The simulator reaches the Mac's dev server at 127.0.0.1:3000;
/// DEBUG builds accept `-briefingURL http://host:port` to point elsewhere. Every failure falls back
/// to the mock show and to on-screen reading time.
enum BriefingService {
    static var baseURL: URL {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "-briefingURL"),
           args.indices.contains(index + 1),
           let url = URL(string: args[index + 1]) {
            return url
        }
        #endif
        return URL(string: "http://127.0.0.1:3000")!
    }

    /// Today's show, or nil when the backend can't be reached.
    static func fetchBriefing(name: String) async -> Briefing? {
        var components = URLComponents(
            url: baseURL.appending(path: "api/briefing"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "name", value: name)]
        guard let url = components?.url else { return nil }

        var request = URLRequest(url: url)
        // writing a grounded show can take a while; the mock plays if Play is tapped first
        request.timeoutInterval = 40

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            let briefing = try JSONDecoder().decode(Briefing.self, from: data)
            return briefing.segments.isEmpty ? nil : briefing
        } catch {
            return nil
        }
    }

    /// One line read aloud as MP3, or nil when there's no voice (no key, no backend).
    fileprivate static func fetchSpeech(_ text: String) async -> (data: Data?, unavailable: Bool) {
        var request = URLRequest(url: baseURL.appending(path: "api/briefing/speech"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["text": text])
        request.timeoutInterval = 10

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            return (status == 200 ? data : nil, status == 503)
        } catch {
            return (nil, true)
        }
    }
}

/// The radio's voice: plays ElevenLabs clips one at a time. When there is no voice it waits out the
/// reading time instead, so the show still paces itself. Mirrors frontend/src/lib/radioVoice.ts.
@MainActor
final class RadioVoice: NSObject, AVAudioPlayerDelegate {
    static let shared = RadioVoice()

    private var clips: [String: Task<Data?, Never>] = [:]
    private var voiceUnavailable = false
    private var player: AVAudioPlayer?
    private var finished: CheckedContinuation<Void, Never>?
    private var sessionReady = false

    /// Starts fetching a line's audio so it's ready by the time it's needed.
    @discardableResult
    func prefetch(_ text: String) -> Task<Data?, Never> {
        if let clip = clips[text] { return clip }
        if voiceUnavailable { return Task { nil } }

        let clip = Task { @MainActor [weak self] () -> Data? in
            let result = await BriefingService.fetchSpeech(text)
            if result.unavailable { self?.voiceUnavailable = true }
            if result.data == nil { self?.clips[text] = nil } // let a later attempt try again
            return result.data
        }
        clips[text] = clip
        return clip
    }

    /// Reads a line aloud and returns when it has finished, or when the calling task is cancelled.
    func speak(_ text: String) async {
        let data = await prefetch(text).value
        guard !Task.isCancelled else { return }

        guard let data, let player = try? AVAudioPlayer(data: data) else {
            try? await Task.sleep(for: CheckInScript.readingTime(text))
            return
        }

        prepareSession()
        player.delegate = self
        self.player = player
        guard player.play() else {
            try? await Task.sleep(for: CheckInScript.readingTime(text))
            return
        }

        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                finished = continuation
            }
        } onCancel: {
            Task { @MainActor in RadioVoice.shared.stop() }
        }
    }

    func stop() {
        player?.stop()
        player = nil
        finished?.resume()
        finished = nil
    }

    /// Spoken-word playback that still sounds with the ring/silent switch on.
    private func prepareSession() {
        guard !sessionReady else { return }
        sessionReady = true
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in RadioVoice.shared.stop() }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in RadioVoice.shared.stop() }
    }
}
