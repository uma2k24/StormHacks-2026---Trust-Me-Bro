import Foundation

/// What POST /api/voice/analyze answers: the classifier's number, and jitter / shimmer / HNR.
/// Mirrors frontend/src/types/voice.ts. Also kept on the device with each morning's check-in
/// (see DayRecord), so a morning can be looked at again from the week's lamps.
struct VoiceAnalysis: Codable, Equatable {
    struct Task: Codable, Equatable {
        /// "vowel" or "speech"
        let id: String
        /// The classifier's number for this part of the check-in, 0...1.
        let probability: Double
        /// How much of the final number this part counts for, 0...1.
        let weight: Double
        /// Seconds of voice the classifier listened to (silences left out).
        let seconds: Double
        /// How many four-second windows that was.
        let windows: Int
    }

    struct Measures: Codable, Equatable {
        let jitter: Double
        let shimmer: Double
        let hnr: Double
        let f0: Double
    }

    /// The final number, 0...1: the tasks' numbers weighed together.
    let probability: Double
    /// At or above this the voice is "flagged".
    let threshold: Double
    let tasks: [Task]
    /// Measured on the sustained "ahhh"; nil when there wasn't a steady stretch of voice to measure.
    let measures: Measures?
}

/// What the show recorded: everything said in answers, and the sustained "ahhh" (the best try).
struct CapturedVoice {
    var speech: [AnswerRecorder.Recording] = []
    var vowel: AnswerRecorder.Recording?
}

enum VoiceOutcome {
    case done(VoiceAnalysis)
    /// The server heard too little voice to measure anything.
    case tooQuiet
    /// No backend, no model or a failed upload: the dashboard shows a sample instead.
    case unavailable
}

/// Sends the recordings to the web backend, where the classifier and the jitter / shimmer / HNR
/// measures run. Mirrors frontend/src/lib/voiceClient.ts.
enum VoiceService {
    static func analyse(_ captured: CapturedVoice) async -> VoiceOutcome {
        let speech = captured.speech.flatMap(\.samples)
        let vowel = captured.vowel?.samples ?? []
        guard !speech.isEmpty || !vowel.isEmpty else { return .unavailable }

        let boundary = "voice-\(UUID().uuidString)"
        var body = Data()
        for (name, samples) in [("speech", speech), ("vowel", vowel)] {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(name).pcm\"\r\n".utf8))
            body.append(Data("Content-Type: application/octet-stream\r\n\r\n".utf8))
            body.append(samples.withUnsafeBufferPointer { Data(buffer: $0) }) // 16-bit little-endian, which is what the server reads
            body.append(Data("\r\n".utf8))
        }
        body.append(Data("--\(boundary)--\r\n".utf8))

        var request = URLRequest(url: BriefingService.baseURL.appending(path: "api/voice/analyze"))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        request.timeoutInterval = 30

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            switch (response as? HTTPURLResponse)?.statusCode {
            case 200:
                guard let analysis = try? JSONDecoder().decode(VoiceAnalysis.self, from: data) else { return .unavailable }
                return .done(analysis)
            case 422:
                return .tooQuiet
            default:
                return .unavailable
            }
        } catch {
            return .unavailable
        }
    }
}
