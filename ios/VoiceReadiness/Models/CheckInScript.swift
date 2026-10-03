import Foundation

struct CheckInTurn: Identifiable {
    let id: String
    let assistant: String
    let mockReply: String
}

enum CheckInScript {
    static let listenDuration: Duration = .milliseconds(2500)
    static let acknowledgePause: Duration = .milliseconds(900)

    static let turns: [CheckInTurn] = [
        CheckInTurn(
            id: "feeling",
            assistant: "How are you feeling this morning, David?",
            mockReply: "Pretty good — a little tired."
        ),
        CheckInTurn(
            id: "morning",
            assistant: "Tell me about your morning so far.",
            mockReply: "I made coffee and sat by the window for a bit."
        ),
        CheckInTurn(
            id: "ready",
            assistant: "One last thing — what's one word for how ready you feel today?",
            mockReply: "Steady."
        )
    ]
}
