import Foundation

/// Talking back to the radio: sends a recorded answer to the web backend's /api/conversation/transcribe
/// (ElevenLabs Scribe) and asks /api/conversation/reply (Gemini, with today's weather and news) for
/// the host's answer to it. The keys stay on the server. Every failure is reported as "unavailable"
/// or nil so the show carries on with a sample answer or a fixed warm line.
/// Mirrors frontend/src/lib/conversationClient.ts.
enum ConversationService {
    enum Transcription {
        /// `text` is empty when nothing could be heard.
        case heard(String)
        /// No key, no backend, or Scribe failed: the show carries on with a sample answer.
        case unavailable
    }

    static func transcribe(_ audio: Data) async -> Transcription {
        var request = URLRequest(url: BriefingService.baseURL.appending(path: "api/conversation/transcribe"))
        request.httpMethod = "POST"
        request.setValue("audio/wav", forHTTPHeaderField: "Content-Type")
        request.httpBody = audio
        request.timeoutInterval = 30

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let body = try? JSONDecoder().decode(TextBody.self, from: data) else { return .unavailable }
            return .heard(body.text.trimmingCharacters(in: .whitespacesAndNewlines))
        } catch {
            return .unavailable
        }
    }

    struct Earlier: Encodable {
        let topic: String
        let said: String
    }

    /// The host's reply to what they said, or nil when the backend can't be reached (the caller has a fixed line for that).
    static func reply(
        profile: Profile,
        segment: BriefingSegment,
        transcript: String,
        earlier: [Earlier],
        index: Int,
        last: Bool
    ) async -> String? {
        struct SegmentBody: Encodable {
            let kind: String
            let topic: String
            let brief: String
            let question: String
        }
        struct Body: Encodable {
            let name: String
            let city: String
            let interests: [String]
            let extras: String
            let segment: SegmentBody
            let transcript: String
            let earlier: [Earlier]
            let index: Int
            let last: Bool
        }

        var request = URLRequest(url: BriefingService.baseURL.appending(path: "api/conversation/reply"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(Body(
            name: profile.name,
            city: profile.city,
            interests: profile.interests.map(\.rawValue),
            extras: profile.extras,
            segment: SegmentBody(
                kind: segment.kind.rawValue,
                topic: segment.topic,
                brief: segment.brief,
                question: segment.question
            ),
            transcript: transcript,
            earlier: earlier,
            index: index,
            last: last
        ))
        // a person is waiting for this one; the server gives up on a slow search well before this
        request.timeoutInterval = 30

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let body = try? JSONDecoder().decode(TextBody.self, from: data) else { return nil }
            let text = body.text.trimmingCharacters(in: .whitespacesAndNewlines)
            return text.isEmpty ? nil : text
        } catch {
            return nil
        }
    }

    private struct TextBody: Decodable {
        let text: String
    }
}
