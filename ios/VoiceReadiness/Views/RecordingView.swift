import SwiftUI

private enum ChatRole {
    case assistant
    case user
}

private struct ChatMessage: Identifiable {
    let id: String
    let role: ChatRole
    let text: String
}

private enum ListenState {
    case idle
    case listening
    case acknowledged
}

struct RecordingView: View {
    let onComplete: () -> Void

    @State private var turnIndex = 0
    @State private var messages: [ChatMessage] = []
    @State private var listenState: ListenState = .idle
    @State private var micPulse = false
    @State private var flowTask: Task<Void, Never>?

    private var totalTurns: Int { CheckInScript.turns.count }
    private var questionLabel: Int { min(turnIndex + 1, totalTurns) }
    private var isFinished: Bool { turnIndex >= totalTurns }
    private var canTapMic: Bool { listenState == .idle && !isFinished }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(messages) { message in
                            bubble(for: message)
                                .id(message.id)
                                .transition(.asymmetric(
                                    insertion: .opacity.combined(with: .move(edge: .bottom)),
                                    removal: .opacity
                                ))
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
                .onChange(of: messages.count) { _, _ in
                    scrollToBottom(proxy: proxy)
                }
                .onChange(of: listenState) { _, _ in
                    scrollToBottom(proxy: proxy)
                }
            }

            micBar
        }
        .onAppear {
            if messages.isEmpty, let first = CheckInScript.turns.first {
                messages = [
                    ChatMessage(
                        id: "\(first.id)-assistant",
                        role: .assistant,
                        text: first.assistant
                    )
                ]
            }
        }
        .onDisappear {
            flowTask?.cancel()
            flowTask = nil
        }
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text("Question \(questionLabel) of \(totalTurns)")
                .font(.title3.weight(.semibold))
                .foregroundStyle(AppTheme.accent)

            Text("Answer out loud when you're ready")
                .font(.body)
                .foregroundStyle(AppTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 24)
        .padding(.bottom, 12)
        .padding(.horizontal, 24)
    }

    private var micBar: some View {
        VStack(spacing: 14) {
            Group {
                switch listenState {
                case .listening:
                    VStack(spacing: 8) {
                        WaveformView(barCount: 18, compact: true)
                        Text("Listening…")
                            .font(.title3.weight(.medium))
                            .foregroundStyle(AppTheme.accent.opacity(0.95))
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.updatesFrequently)

                case .acknowledged:
                    Text("Got it")
                        .font(.title3.weight(.medium))
                        .foregroundStyle(StatusColor.green.color)
                        .accessibilityAddTraits(.updatesFrequently)

                case .idle:
                    if !isFinished {
                        Text("Tap to answer")
                            .font(.title3.weight(.medium))
                            .foregroundStyle(AppTheme.textPrimary)
                    }
                }
            }
            .frame(minHeight: 44)

            Button(action: handleMicTap) {
                ZStack {
                    if listenState == .listening {
                        Circle()
                            .fill(AppTheme.accent.opacity(0.35))
                            .frame(width: 112, height: 112)
                            .scaleEffect(micPulse ? 1.22 : 1.0)
                            .opacity(micPulse ? 0.25 : 0.6)
                    }

                    Circle()
                        .fill(AppTheme.accent)
                        .frame(width: 96, height: 96)
                        .shadow(color: AppTheme.accent.opacity(0.4), radius: 20, y: 6)
                        .opacity(canTapMic || listenState == .listening ? 1 : 0.55)

                    Image(systemName: "mic.fill")
                        .font(.system(size: 36, weight: .semibold))
                        .foregroundStyle(Color(red: 0.05, green: 0.07, blue: 0.09))
                }
            }
            .buttonStyle(.plain)
            .disabled(!canTapMic)
            .accessibilityLabel(
                listenState == .listening
                    ? "Listening to your answer"
                    : "Tap to answer with your voice"
            )
        }
        .padding(.horizontal, 24)
        .padding(.top, 18)
        .padding(.bottom, 28)
        .frame(maxWidth: .infinity)
        .background(
            AppTheme.background.opacity(0.92)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(Color(red: 0.22, green: 0.28, blue: 0.35).opacity(0.7))
                        .frame(height: 1)
                }
        )
    }

    @ViewBuilder
    private func bubble(for message: ChatMessage) -> some View {
        HStack {
            if message.role == .user { Spacer(minLength: 36) }

            VStack(alignment: .leading, spacing: 8) {
                if message.role == .assistant {
                    Text("CHECK-IN")
                        .font(.caption.weight(.semibold))
                        .tracking(1.2)
                        .foregroundStyle(AppTheme.accent.opacity(0.9))
                }

                Text(message.text)
                    .font(.title3.weight(.medium))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(
                        message.role == .assistant
                            ? AppTheme.accent.opacity(0.15)
                            : Color(red: 0.27, green: 0.33, blue: 0.40).opacity(0.95)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(
                                message.role == .assistant
                                    ? AppTheme.accent.opacity(0.3)
                                    : Color.clear,
                                lineWidth: 1
                            )
                    )
            )
            .clipShape(
                UnevenRoundedRectangle(
                    topLeadingRadius: 24,
                    bottomLeadingRadius: message.role == .assistant ? 8 : 24,
                    bottomTrailingRadius: message.role == .user ? 8 : 24,
                    topTrailingRadius: 24,
                    style: .continuous
                )
            )

            if message.role == .assistant { Spacer(minLength: 36) }
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        guard let lastId = messages.last?.id else { return }
        withAnimation(.easeOut(duration: 0.25)) {
            proxy.scrollTo(lastId, anchor: .bottom)
        }
    }

    private func handleMicTap() {
        guard canTapMic, turnIndex < CheckInScript.turns.count else { return }
        let turn = CheckInScript.turns[turnIndex]

        flowTask?.cancel()
        listenState = .listening
        withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
            micPulse = true
        }

        flowTask = Task { @MainActor in
            try? await Task.sleep(for: CheckInScript.listenDuration)
            guard !Task.isCancelled else { return }

            withAnimation(.easeOut(duration: 0.28)) {
                messages.append(
                    ChatMessage(
                        id: "\(turn.id)-user",
                        role: .user,
                        text: turn.mockReply
                    )
                )
            }
            listenState = .acknowledged
            micPulse = false

            try? await Task.sleep(for: CheckInScript.acknowledgePause)
            guard !Task.isCancelled else { return }

            let nextIndex = turnIndex + 1
            if nextIndex >= totalTurns {
                onComplete()
                return
            }

            let nextTurn = CheckInScript.turns[nextIndex]
            withAnimation(.easeOut(duration: 0.28)) {
                messages.append(
                    ChatMessage(
                        id: "\(nextTurn.id)-assistant",
                        role: .assistant,
                        text: nextTurn.assistant
                    )
                )
            }
            turnIndex = nextIndex
            listenState = .idle
        }
    }
}
