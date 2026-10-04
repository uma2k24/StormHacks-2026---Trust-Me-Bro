import AVFoundation

/// Records one spoken answer from the microphone. The microphone is only open from `start` until
/// `stop` or `cancel`, so the orange recording dot is on exactly while the radio listens.
///
/// While recording it also listens for the end of the answer, like a voice assistant: a pause after
/// they have spoken, nothing at all for a long while, or the time limit all call `onEnd`, and the
/// screen then sends the answer. (While the button is held, only the time limit applies: the person
/// is in charge of when they are done. See `held`.) The sustained "ahhh" also ends by itself once it
/// has been held long enough (`voicedTarget`).
///
/// The answer is recorded as uncompressed 16 kHz mono audio: it is both what speech-to-text hears and
/// what the voice analysis measures, and compression would blur the fine detail jitter and shimmer
/// are made of. (The session's default mode applies no automatic gain or noise suppression.)
/// Mirrors frontend/src/lib/recorder.ts.
@MainActor
final class AnswerRecorder {
    enum Problem: Error {
        /// They said no, in the permission question or in Settings.
        case blocked
        /// No microphone, or it wouldn't start.
        case unavailable
    }

    enum EndReason {
        case silence
        case noSpeech
        case limit
        case target
    }

    struct Recording {
        /// 16-bit PCM at 16 kHz in a WAV file, which ElevenLabs reads as audio/wav.
        let data: Data
        /// The whole recording, silence included.
        let duration: TimeInterval
        let startedAt: Date
        /// How long after it began they started speaking; nil when no speech was ever picked up.
        let speechStart: TimeInterval?
        /// From their first word to their last: how long they actually talked.
        let speech: TimeInterval
        /// Time actually spent talking: `speech` less the pauses between words and sentences.
        let voiced: TimeInterval

        /// The audio itself, without the WAV header, for the voice analysis.
        var samples: [Int16] { WAV.samples(in: data) }
    }

    /// While true, a pause doesn't end the answer (the person is holding the button).
    var held = false {
        didSet { if !held { lastLoudAt = .now } } // the pause starts counting from letting go
    }

    /// How loud the microphone is right now, 0 (a quiet room) to 1 (loud talking), for the bars on
    /// screen. Read at the meter's own pace (ten times a second); the bars smooth it out.
    var level: Double {
        let level = (Double(power) - Self.levelFloor) / (Self.levelFull - Self.levelFloor)
        return min(1, max(0, level))
    }

    /// How long they have really been talking so far (pauses not counted), for the bar that shows how
    /// long to hold the "ahhh".
    var voicedSoFar: TimeInterval { voiced }

    /// A pause shorter than this between words doesn't stop the clock on how long they have talked.
    private static let voicedHangover: TimeInterval = 0.3
    // level: this loud (dBFS) or quieter reads 0, this loud or louder reads 1 (as in recorder.ts)
    private static let levelFloor: Double = -55
    private static let levelFull: Double = -15

    private let recorder: AVAudioRecorder
    private let url: URL
    private let onEnd: (EndReason) -> Void
    private let voicedTarget: TimeInterval?
    private let startedAt = Date.now
    private var firstLoudAt: Date?
    private var lastLoudAt = Date.now
    private var lastTickAt = Date.now
    private var voiced: TimeInterval = 0
    private var power: Float = -160
    private var ended = false
    private var meter: Task<Void, Never>?

    private init(recorder: AVAudioRecorder, url: URL, voicedTarget: TimeInterval?, onEnd: @escaping (EndReason) -> Void) {
        self.recorder = recorder
        self.url = url
        self.voicedTarget = voicedTarget
        self.onEnd = onEnd
    }

    /// Asks for the microphone if nobody has been asked yet (the system asks once and remembers).
    /// Called when Play is tapped, so the question comes before the show and never in the middle of
    /// it: after that the show listens and replies without anyone touching the screen.
    static func requestPermission() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return true
        case .denied: return false
        default: return await AVAudioApplication.requestRecordPermission()
        }
    }

    /// Opens the microphone and starts recording. Throws a `Problem` when it can't.
    static func start(voicedTarget: TimeInterval? = nil, onEnd: @escaping (EndReason) -> Void) async throws -> AnswerRecorder {
        guard await requestPermission() else { throw Problem.blocked }
        RadioVoice.shared.prepareSession()

        let url = FileManager.default.temporaryDirectory.appending(path: "answer-\(UUID().uuidString).wav")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false
        ]
        guard let recorder = try? AVAudioRecorder(url: url, settings: settings) else { throw Problem.unavailable }
        recorder.isMeteringEnabled = true
        guard recorder.record() else { throw Problem.unavailable }

        let answer = AnswerRecorder(recorder: recorder, url: url, voicedTarget: voicedTarget, onEnd: onEnd)
        answer.meter = Task { @MainActor [weak answer] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                answer?.tick()
            }
        }
        return answer
    }

    private func tick() {
        recorder.updateMeters()
        let now = Date.now
        let sinceTick = now.timeIntervalSince(lastTickAt)
        lastTickAt = now
        power = recorder.averagePower(forChannel: 0)
        if power > CheckInScript.speechDB {
            if firstLoudAt == nil { firstLoudAt = now }
            lastLoudAt = now
        }
        if firstLoudAt != nil, now.timeIntervalSince(lastLoudAt) < Self.voicedHangover { voiced += sinceTick }

        guard !ended else { return }
        let elapsed = now.timeIntervalSince(startedAt)
        let reason: EndReason? =
            elapsed >= CheckInScript.maxAnswer ? .limit
            : (voicedTarget.map { voiced >= $0 } ?? false) ? .target
            : held ? nil
            : (firstLoudAt != nil && now.timeIntervalSince(lastLoudAt) >= CheckInScript.silenceEnd) ? .silence
            : (firstLoudAt == nil && elapsed >= CheckInScript.noSpeech) ? .noSpeech
            : nil
        if let reason {
            ended = true
            onEnd(reason)
        }
    }

    /// Stops listening and returns what was recorded; the microphone is released.
    func stop() -> Recording? {
        meter?.cancel()
        recorder.stop()
        defer { try? FileManager.default.removeItem(at: url) }
        guard let data = try? Data(contentsOf: url) else { return nil }
        return Recording(
            data: data,
            duration: Date.now.timeIntervalSince(startedAt),
            startedAt: startedAt,
            speechStart: firstLoudAt.map { $0.timeIntervalSince(startedAt) },
            speech: firstLoudAt.map { lastLoudAt.timeIntervalSince($0) } ?? 0,
            voiced: voiced
        )
    }

    /// Stops and throws the recording away.
    func cancel() {
        meter?.cancel()
        recorder.stop()
        try? FileManager.default.removeItem(at: url)
    }
}

/// Reads the audio out of a WAV file (16-bit little-endian PCM, as AnswerRecorder writes it).
enum WAV {
    static func samples(in data: Data) -> [Int16] {
        let bytes = [UInt8](data)
        guard bytes.count > 12, String(decoding: bytes[0..<4], as: UTF8.self) == "RIFF" else { return [] }

        // walk the chunks to the one called "data" (there can be others, such as padding, before it)
        var position = 12
        while position + 8 <= bytes.count {
            let name = String(decoding: bytes[position..<position + 4], as: UTF8.self)
            let size = Int(bytes[position + 4]) | Int(bytes[position + 5]) << 8
                | Int(bytes[position + 6]) << 16 | Int(bytes[position + 7]) << 24
            let start = position + 8
            if name == "data" {
                // a file still being written can claim more than there is
                let end = min(bytes.count, size == 0 || size > bytes.count ? bytes.count : start + size)
                let count = max(0, (end - start) / 2)
                return (0..<count).map { index in
                    Int16(bitPattern: UInt16(bytes[start + 2 * index]) | UInt16(bytes[start + 2 * index + 1]) << 8)
                }
            }
            position = start + size + (size & 1)
        }
        return []
    }
}
