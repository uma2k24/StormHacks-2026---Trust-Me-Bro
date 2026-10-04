import Foundation

/// Talking back to the radio: sends a recorded answer to the web backend's /api/conversation/transcribe
/// (ElevenLabs Scribe) and asks /api/conversation/reply (Gemini, with a light fun fact or news) for
/// the host's answer to it. When the show needs more talking, the same request also writes the next
/// question. The keys stay on the server. Every failure is reported as "unavailable" or nil so the
/// show carries on with a sample answer, a fixed warm line or a fixed question.
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

    /// Set when the show needs more talking: the same request also writes the next question, about `focus`.
    struct FollowUpRequest: Encodable {
        let focus: String
        /// What was asked about lately ("Hockey", "First job"), so the question is about something new.
        let avoid: [String]
        /// Questions of this kind already asked this show.
        let asked: Int
    }

    struct HostReply {
        let text: String
        /// True for the server's fixed line, used when Gemini wasn't available: the caller picks its own, so they take turns.
        let isFallback: Bool
        /// The next question, when one was asked for and written; otherwise the caller asks a fixed one.
        let next: FollowUp?
    }

    /// The host's reply to what they said, or nil when the backend can't be reached (the caller has a fixed line for that).
    static func reply(
        profile: Profile,
        segment: BriefingSegment,
        transcript: String,
        earlier: [Earlier],
        index: Int,
        last: Bool,
        followUp: FollowUpRequest? = nil
    ) async -> HostReply? {
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
            let followUp: FollowUpRequest?
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
            last: last,
            followUp: followUp
        ))
        // a person is waiting for this one; the server gives up on a slow search well before this
        request.timeoutInterval = 30

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let body = try? JSONDecoder().decode(ReplyBody.self, from: data) else { return nil }
            let text = body.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }

            // a question nobody asked for, or an empty one, is no question
            var next: FollowUp?
            if followUp != nil, let written = body.next,
               !written.question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                next = FollowUp(
                    topic: written.topic.trimmingCharacters(in: .whitespacesAndNewlines),
                    brief: written.brief.trimmingCharacters(in: .whitespacesAndNewlines),
                    question: written.question.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            }
            return HostReply(text: text, isFallback: body.source != "live", next: next)
        } catch {
            return nil
        }
    }

    private struct TextBody: Decodable {
        let text: String
    }

    /// A reply never gets thrown away because the question that came with it can't be read.
    private struct ReplyBody: Decodable {
        let text: String
        /// "live" when Gemini wrote it, "fallback" for the server's fixed line.
        let source: String?
        let next: FollowUp?

        private enum CodingKeys: String, CodingKey {
            case text
            case source
            case next
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            text = try container.decode(String.self, forKey: .text)
            source = try? container.decodeIfPresent(String.self, forKey: .source)
            next = try? container.decodeIfPresent(FollowUp.self, forKey: .next)
        }
    }
}
