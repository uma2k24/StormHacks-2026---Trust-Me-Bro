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

    /// Today's show for this listener covering the two `picks`, or nil when the backend can't be reached.
    static func fetchBriefing(for profile: Profile, picks: [Interest]) async -> Briefing? {
        var components = URLComponents(
            url: baseURL.appending(path: "api/briefing"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "name", value: profile.name),
            URLQueryItem(name: "city", value: profile.city),
            URLQueryItem(name: "interests", value: profile.interests.map(\.rawValue).joined(separator: ",")),
            URLQueryItem(name: "extras", value: profile.extras),
            URLQueryItem(name: "picks", value: picks.map(\.rawValue).joined(separator: ","))
        ]
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
/// reading time instead, so the show still paces itself. Playback follows the listener's talking-speed
/// setting. Mirrors frontend/src/lib/radioVoice.ts.
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

    /// Returns once a line's audio is ready (or has failed), so its text and voice can start together.
    func prepare(_ text: String) async {
        _ = await prefetch(text).value
    }

    /// Reads a line aloud and returns when it has finished, or when the calling task is cancelled.
    /// `onProgress` is told how far through the line the voice is (0...1) many times a second, so its
    /// words can appear as they are said. Without audio it paces itself over the reading time instead,
    /// so the words still arrive.
    func speak(_ text: String, onProgress: ((Double) -> Void)? = nil) async {
        let data = await prefetch(text).value
        guard !Task.isCancelled else { return }

        guard let data, let player = try? AVAudioPlayer(data: data) else {
            await pace(text, onProgress: onProgress)
            return
        }

        prepareSession()
        player.enableRate = true
        player.rate = TalkSpeedStep.current.rate
        player.delegate = self
        self.player = player
        guard player.play() else {
            await pace(text, onProgress: onProgress)
            return
        }

        onProgress?(0)
        let ticker = Task { @MainActor in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(50))
                if player.duration > 0 { onProgress?(min(1, player.currentTime / player.duration)) }
            }
        }
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                finished = continuation
            }
        } onCancel: {
            Task { @MainActor in RadioVoice.shared.stop() }
        }
        ticker.cancel()
        if !Task.isCancelled { onProgress?(1) }
    }

    /// Reads something aloud because the listener asked (the voice summary): the radio's voice when
    /// there is one, otherwise the device's own voice, so pressing Play is never silent. Mirrors
    /// readAloud() in radioVoice.ts.
    func readAloud(_ text: String, onProgress: ((Double) -> Void)? = nil) async {
        let data = await prefetch(text).value
        guard !Task.isCancelled else { return }
        if data != nil {
            await speak(text, onProgress: onProgress)
        } else {
            await DeviceVoice.shared.speak(text, onProgress: onProgress)
        }
    }

    /// No voice: the line stays up for about as long as it takes to read, with its words arriving over that time.
    private func pace(_ text: String, onProgress: ((Double) -> Void)?) async {
        let rate = Double(TalkSpeedStep.current.rate)
        let total = CheckInScript.readingTime(text).timeInterval / max(rate, 0.1)
        let startedAt = Date.now
        onProgress?(0)
        while !Task.isCancelled {
            let elapsed = Date.now.timeIntervalSince(startedAt)
            if elapsed >= total { break }
            onProgress?(elapsed / total)
            try? await Task.sleep(for: .milliseconds(50))
        }
        if !Task.isCancelled { onProgress?(1) }
    }

    func stop() {
        player?.stop()
        player = nil
        finished?.resume()
        finished = nil
    }

    /// One session for the whole show: the radio plays, and the listener's answers are recorded, without
    /// the session changing in between. Plays through the speaker, and still sounds with the silent switch on.
    func prepareSession() {
        guard !sessionReady else { return }
        sessionReady = true
        try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in RadioVoice.shared.stop() }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in RadioVoice.shared.stop() }
    }
}

/// The phone's built-in voice, a touch slower than usual: the fallback when the radio's voice isn't there.
@MainActor
final class DeviceVoice: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = DeviceVoice()

    private let synthesizer = AVSpeechSynthesizer()
    private var finished: CheckedContinuation<Void, Never>?
    private var progress: ((Double) -> Void)?
    private var length = 1

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// Returns when it has finished, or when the calling task is cancelled.
    func speak(_ text: String, onProgress: ((Double) -> Void)? = nil) async {
        stop()
        RadioVoice.shared.prepareSession() // through the speaker, even with the silent switch on
        let utterance = AVSpeechUtterance(string: text)
        let rate = AVSpeechUtteranceDefaultSpeechRate * 0.9 * TalkSpeedStep.current.rate
        utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate, max(AVSpeechUtteranceMinimumSpeechRate, rate))
        length = max(text.utf16.count, 1)
        progress = onProgress
        onProgress?(0)

        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                guard !Task.isCancelled else { return continuation.resume() }
                finished = continuation
                synthesizer.speak(utterance)
            }
        } onCancel: {
            Task { @MainActor in DeviceVoice.shared.stop() }
        }
        progress = nil
        if !Task.isCancelled { onProgress?(1) }
    }

    func stop() {
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        finish()
    }

    private func finish() {
        finished?.resume()
        finished = nil
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        willSpeakRangeOfSpeechString characterRange: NSRange,
        utterance: AVSpeechUtterance
    ) {
        Task { @MainActor in
            let voice = DeviceVoice.shared
            voice.progress?(Double(characterRange.location) / Double(voice.length))
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in DeviceVoice.shared.finish() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in DeviceVoice.shared.finish() }
    }
}
