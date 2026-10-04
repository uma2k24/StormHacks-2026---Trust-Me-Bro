import SwiftUI

/// The morning show is one little radio with one line of text on its screen, and nobody has to
/// touch it once it has started:
///   briefing  - the radio reads the segment's brief (weather, a score, local news)
///   speaking  - then asks what you think
///   ready     - (a moment) the question stays up, then the microphone opens by itself
///   listening - "Listening…" while your answer is recorded; a pause after you've spoken sends it
///   thinking  - "Just a moment…" while it is turned into words
///   heard     - your own words, while the host thinks of a reply
///   replying  - the host's reply, read aloud, then on to the next segment
///   notice    - something to say before it listens again (it didn't catch that, no microphone)
///   closing   - after the last segment, the listener's own daily reminder ("take your pill"), then done
/// Whatever the radio says appears word by word as it is said, and the text scrolls up by itself
/// when it is longer than the screen. The Talk / Done button is still there: tap it to send an
/// answer early, or hold it and let go.
///
/// It's a real conversation: the answer is recorded, ElevenLabs turns it into words, and Gemini writes
/// the host's reply (with today's weather and news for what you're into). Without a microphone, a key
/// or a backend it falls back to a sample answer after a moment, so the show still plays.
///
/// The answers are also what the voice analysis listens to, so the show keeps asking plain questions
/// (`chat` turns, no Gemini) after the last briefing segment until enough talking has been heard, and
/// always ends with the sustained "ahhh" (the `vowel` turn): jitter, shimmer and HNR are measured on it.
/// Everything that was recorded is handed to `onComplete`.
/// Mirrors ActiveScreen.tsx on the web.
private enum Phase {
    case briefing
    case speaking
    case ready
    case listening
    case thinking
    case heard
    case replying
    case notice
    case closing
}

struct RecordingView: View {
    let segments: [BriefingSegment]
    /// Who is listening: the host's replies are written for them.
    let profile: Profile
    /// Called each time the listener finishes an answer, with how they went about it.
    let onAnswer: (BriefingSegment, AnswerTiming) -> Void
    /// The show is over, with what was recorded for the voice analysis.
    let onComplete: (CapturedVoice) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .body) private var orbBase: CGFloat = 116
    // Extra questions asked after the briefing's segments, when more talking was needed. The "ahhh" comes last.
    @State private var extraTurns: [BriefingSegment] = []
    @State private var turnIndex = 0
    @State private var phase: Phase = .briefing
    // what they said (shown while the host thinks), and the radio's own line when it isn't the segment's
    @State private var said = ""
    @State private var spoken = ""
    // how many words of the radio's current line have been said so far; nil when the line is simply shown
    @State private var revealed: Int?
    @State private var flowTask: Task<Void, Never>?
    @State private var answerTask: Task<Void, Never>?
    @State private var listenTask: Task<Void, Never>?
    @State private var pressStartedAt: Date?
    // when the question finished: how soon they answer is part of what the radio learns from
    @State private var askedAt = Date.now
    // the microphone: opened by itself when a question has been asked
    @State private var opening: Task<AnswerRecorder?, Never>?
    @State private var recorder: AnswerRecorder?
    // true once real answers aren't possible (no microphone, no transcription): the sample answer plays instead
    @State private var sample = false
    // answers that came back empty, for this segment
    @State private var missed = 0
    // true once transcription isn't possible (no key, no backend): the answers are still recorded, the show plays sample answers
    @State private var noTranscript = false
    // what has been recorded for the voice analysis, and how much of it is talking
    @State private var captured = CapturedVoice()
    @State private var talked: TimeInterval = 0
    @State private var extrasAsked = 0
    @State private var vowelTries = 0
    // the last question went unanswered twice: more questions won't help
    @State private var gaveUp = false
    // what they said earlier in the show, so a reply can pick up where they left off
    @State private var earlier: [ConversationService.Earlier] = []
    @State private var pressing = false
    @State private var pulse = false

    private var turns: [BriefingSegment] { segments + extraTurns }
    // One lamp for each briefing segment and one for the last stretch (any extra questions, then the "ahhh").
    private var totalTurns: Int { segments.count + 1 }
    private var lampIndex: Int { min(turnIndex, segments.count) }
    private var turn: BriefingSegment { turns[min(turnIndex, turns.count - 1)] }
    private var segmentNumber: Int { lampIndex + 1 }
    private var orbSize: CGFloat { min(orbBase, 150) }
    private var canPress: Bool { phase == .ready || phase == .listening || phase == .notice }

    private var caption: String {
        switch phase {
        case .briefing: return turn.brief
        case .listening: return turn.kind == .vowel ? CheckInScript.vowelListeningLine : "Listening…"
        case .thinking: return CheckInScript.thinkingLine
        case .heard: return "“\(said)”"
        case .replying, .notice, .closing: return spoken
        case .speaking, .ready: return turn.question
        }
    }

    private var captionKey: String {
        switch phase {
        case .briefing: return "\(turn.id)-brief"
        case .listening: return "listening"
        case .thinking: return "thinking"
        case .heard: return "\(turn.id)-heard"
        case .replying: return "\(turn.id)-replying"
        case .notice: return "\(turn.id)-notice"
        case .closing: return "closing"
        case .speaking, .ready: return "\(turn.id)-question"
        }
    }

    /// The words said so far while the radio is speaking a line; nil when the line is simply shown.
    private var liveWords: Int? {
        switch phase {
        case .briefing, .speaking, .replying, .notice, .closing: return revealed
        default: return nil
        }
    }

    /// Longer text reads a size down so it usually fits; whatever still doesn't fit scrolls.
    /// Mirrors captionSize() in ActiveScreen.tsx.
    private var captionFontSize: CGFloat {
        switch caption.count {
        case ...60: return 34
        case ...120: return 27
        default: return 22
        }
    }

    private var screenColor: Color {
        switch phase {
        case .listening: return AppTheme.accentGlow
        case .heard: return AppTheme.paper
        case .briefing, .speaking, .ready, .thinking, .replying, .notice, .closing: return AppTheme.tealGlow
        }
    }

    var body: some View {
        radio
            .padding(.horizontal, 20)
            .padding(.trailing, 8)
            .padding(.top, 22)
            .padding(.bottom, 22)
            .onAppear { playSegment() }
            .onDisappear {
                // Leaving the screen stops everything: the voice, any timers, and above all the microphone.
                flowTask?.cancel()
                answerTask?.cancel()
                listenTask?.cancel()
                RadioVoice.shared.stop()
                let pending = opening
                opening = nil
                recorder?.cancel()
                recorder = nil
                Task { @MainActor in await pending?.value?.cancel() }
            }
    }

    // MARK: Radio

    private var radio: some View {
        let body = RoundedRectangle(cornerRadius: 30, style: .continuous)

        return VStack(spacing: 22) {
            topRow
            screen
            controls
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 26)
        .background(body.fill(AppTheme.teal))
        .overlay { body.stroke(AppTheme.ink, lineWidth: AppTheme.line) }
        .hardShadow(body, offset: 8)
    }

    private var topRow: some View {
        HStack {
            // a row of speaker slots
            HStack(spacing: 7) {
                ForEach(0..<6, id: \.self) { _ in
                    Capsule().fill(AppTheme.ink.opacity(0.8)).frame(width: 7, height: 26)
                }
            }
            .accessibilityHidden(true)

            Spacer(minLength: 12)

            // progress lamps
            HStack(spacing: 10) {
                ForEach(0..<totalTurns, id: \.self) { index in
                    lamp(for: index)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Show progress")
            .accessibilityValue("Segment \(segmentNumber) of \(totalTurns)")
        }
        .padding(.horizontal, 4)
    }

    private func lamp(for index: Int) -> some View {
        let isCurrent = index == lampIndex
        let fill: Color = index < lampIndex ? AppTheme.paper : (isCurrent ? AppTheme.accent : AppTheme.ink.opacity(0.28))

        return Circle()
            .fill(fill)
            .frame(width: 16, height: 16)
            .overlay { Circle().stroke(AppTheme.ink, lineWidth: 2.5) }
            .opacity(isCurrent && pulse ? 0.55 : 1)
            .animation(
                isCurrent && !reduceMotion
                    ? .easeInOut(duration: 1).repeatForever(autoreverses: true)
                    : .default,
                value: pulse
            )
            .onAppear { pulse = true }
    }

    /// One line of text at a time, in a little CRT.
    private var screen: some View {
        let glass = RoundedRectangle(cornerRadius: 20, style: .continuous)

        return VStack(spacing: 22) {
            // which segment is on air (or the reminder, at the very end)
            Label {
                Text(phase == .closing ? "REMINDER" : turn.topic.uppercased())
            } icon: {
                Image(systemName: phase == .closing ? "bell.fill" : turn.kind.systemImage)
            }
            .font(AppFont.body(18, bold: true))
            .tracking(1.4)
            .foregroundStyle(screenColor)
            .opacity(0.85)

            // Centered when it fits; when it doesn't (long brief, big text size) it scrolls, and while
            // the radio is speaking the scroll follows the word being said.
            ViewThatFits(in: .vertical) {
                captionText

                FadingScroll(follow: liveWords.map { $0 - 1 }) { captionText.padding(.vertical, 12) }
            }
            .frame(maxWidth: .infinity)
            .id(captionKey)
                .transition(
                    .asymmetric(
                        insertion: .opacity.combined(with: .offset(y: 14))
                            .animation(.easeOut(duration: 0.3).delay(0.16)),
                        removal: .opacity.animation(.easeIn(duration: 0.15))
                    )
                )

            WaveformView(
                barCount: 9,
                height: 35,
                active: waveformActive
            )
            .id(waveformActive)
            .foregroundStyle(screenColor)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: captionKey)
        .background {
            ZStack {
                glass.fill(AppTheme.ink)

                // faint CRT scanlines
                Canvas { context, size in
                    var y: CGFloat = 0
                    while y < size.height {
                        context.fill(
                            Path(CGRect(x: 0, y: y, width: size.width, height: 1)),
                            with: .color(Color.white.opacity(0.05))
                        )
                        y += 4
                    }
                }
                .clipShape(glass)

                glass.strokeBorder(Color.white.opacity(0.12), lineWidth: 2).padding(3)
            }
        }
        .overlay { glass.stroke(AppTheme.ink, lineWidth: AppTheme.line) }
        .frame(minHeight: 200)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(phase == .closing ? "Reminder" : turn.topic). \(caption)")
        .accessibilityAddTraits(.updatesFrequently)
    }

    private var waveformActive: Bool {
        phase == .briefing || phase == .speaking || phase == .listening || phase == .replying || phase == .closing
    }

    @ViewBuilder
    private var captionText: some View {
        if let revealedWords = liveWords {
            // every word is laid out from the start (so nothing shifts) but only shows once it has been said
            let words = caption.split(whereSeparator: \.isWhitespace).map(String.init)
            CenteredFlowLayout(spacing: captionFontSize * 0.28, lineSpacing: captionFontSize * 0.12) {
                ForEach(words.indices, id: \.self) { index in
                    Text(words[index])
                        .font(AppFont.head(captionFontSize, relativeTo: .title))
                        .tracking(-0.3)
                        .fixedSize()
                        .opacity(index < revealedWords ? 1 : 0)
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: index < revealedWords)
                        .id(index)
                }
            }
            .foregroundStyle(screenColor)
            .shadow(color: screenColor.opacity(0.6), radius: 9)
            .frame(maxWidth: .infinity)
        } else {
            Text(caption)
                .font(AppFont.head(captionFontSize, relativeTo: .title))
                .tracking(-0.3)
                .foregroundStyle(screenColor)
                .shadow(color: screenColor.opacity(0.6), radius: 9)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
        }
    }

    private var controls: some View {
        ZStack {
            if phase == .ready || phase == .notice || phase == .listening {
                SonarRings(diameter: orbSize, fast: phase == .listening)
                    .id(phase == .listening)
            }

            OrbFace(
                size: orbSize,
                fill: canPress ? AppTheme.accent : AppTheme.tealSoft,
                pressed: pressing || phase == .listening,
                shadow: 6
            ) {
                VStack(spacing: 2) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: orbSize * 0.34, weight: .semibold))
                    Text(phase == .listening ? "Done" : "Talk")
                        .font(AppFont.head(18, relativeTo: .headline))
                }
            }
            .contentShape(Circle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        guard !pressing else { return }
                        pressing = true
                        handlePress()
                    }
                    .onEnded { _ in
                        pressing = false
                        handleRelease()
                    }
            )
            .sensoryFeedback(.impact(weight: .heavy), trigger: phase)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(phase == .listening ? "Done talking — send my answer" : "Talk — answer with your voice")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { handleAccessibilityActivate() }
        }
        .frame(maxWidth: .infinity)
        .allowsHitTesting(canPress)
        .padding(.bottom, 6)
    }

    // MARK: Flow

    private func setPhase(_ next: Phase) {
        if reduceMotion {
            phase = next
        } else {
            withAnimation(.easeOut(duration: 0.3)) { phase = next }
        }
    }

    /// The radio says a line: it is read aloud, and its words appear as they are said.
    private func say(_ text: String) async {
        revealed = 0
        await RadioVoice.shared.speak(text) { fraction in
            let words = CheckInScript.wordsSpoken(in: text, fraction: fraction)
            if revealed != words { revealed = words }
        }
        if !Task.isCancelled { revealed = nil }
    }

    /// The radio says a line, then listens again by itself.
    private func sayThenListen(_ line: String) async {
        await say(line)
        guard !Task.isCancelled else { return }
        try? await Task.sleep(for: CheckInScript.handsFreeGap)
        guard !Task.isCancelled else { return }
        askedAt = .now
        startListening()
    }

    /// Each segment: read the brief, ask the question, then open the microphone by itself.
    private func playSegment() {
        flowTask?.cancel()
        missed = 0
        let segment = turn
        let voice = RadioVoice.shared

        voice.prefetch(segment.brief)
        voice.prefetch(segment.question)
        // warm up the next segment while this one plays (after the last one, the "ahhh")
        let upcoming = turns.indices.contains(turnIndex + 1)
            ? turns[turnIndex + 1]
            : (turnIndex == segments.count - 1 ? CheckInScript.vowelTurn(for: profile.name) : nil)
        if let upcoming {
            voice.prefetch(upcoming.brief)
            voice.prefetch(upcoming.question)
        }

        setPhase(.briefing)
        revealed = 0
        flowTask = Task { @MainActor in
            await say(segment.brief)
            guard !Task.isCancelled else { return }
            await voice.prepare(segment.question) // its voice is ready, so its words start with it
            guard !Task.isCancelled else { return }

            setPhase(.speaking)
            async let minimum: Void = Task.sleep(for: CheckInScript.receivePause)
            await say(segment.question)
            _ = try? await minimum
            guard !Task.isCancelled else { return }

            // a beat so the microphone doesn't hear the end of the question, then it opens by itself
            try? await Task.sleep(for: CheckInScript.handsFreeGap)
            guard !Task.isCancelled else { return }
            askedAt = .now
            setPhase(.ready)
            startListening()
        }
    }

    /// The show is over: the radio reads their daily reminder, if they have one, then hands over.
    private func closeShow() {
        guard let line = Daily.reminderLine(profile) else {
            onComplete(captured)
            return
        }
        answerTask?.cancel()
        spoken = line
        answerTask = Task { @MainActor in
            await RadioVoice.shared.prepare(line)
            guard !Task.isCancelled else { return }
            setPhase(.closing)
            await say(line)
            try? await Task.sleep(for: CheckInScript.afterReplyPause)
            guard !Task.isCancelled else { return }
            onComplete(captured)
        }
    }

    /// Moves to the next turn, which may have to be made up: another question, or the "ahhh".
    private func advance() {
        let next = turnIndex + 1
        if next >= turns.count {
            // with no microphone there is nothing to measure, so no "ahhh"
            guard turn.kind != .vowel, !sample else {
                closeShow()
                return
            }
            let needMore = !gaveUp && talked < CheckInScript.minSpeech && extrasAsked < CheckInScript.maxExtraQuestions
            if needMore, let extra = CheckInScript.extraTurn(extrasAsked, for: profile.name) {
                extrasAsked += 1
                extraTurns.append(extra)
            } else {
                extraTurns.append(CheckInScript.vowelTurn(for: profile.name))
            }
        }
        turnIndex = next
        playSegment()
    }

    private func startListening() {
        guard phase == .ready || phase == .notice else { return }
        answerTask?.cancel() // a line still being read stops: the radio doesn't talk over you
        revealed = nil
        setPhase(.listening)

        if sample {
            // The sample answer sends itself after a moment, like a voice assistant noticing you've stopped.
            listenTask?.cancel()
            listenTask = Task { @MainActor in
                try? await Task.sleep(for: CheckInScript.listenDuration)
                guard !Task.isCancelled else { return }
                finish()
            }
            return
        }

        opening = Task { @MainActor in
            do {
                let open = try await AnswerRecorder.start(
                    voicedTarget: turn.kind == .vowel ? CheckInScript.vowelTarget : nil
                ) { _ in finish() }
                open.held = pressStartedAt != nil
                recorder = open
                return open
            } catch {
                micFailed(error)
                return nil
            }
        }
    }

    private func finish() {
        guard phase == .listening else { return }
        listenTask?.cancel()
        listenTask = nil
        pressStartedAt = nil
        if sample {
            finishSample()
        } else {
            finishLive()
        }
    }

    /// What the recording says about how they answered: how soon they started, and how long they really talked.
    private func timing(of recording: AnswerRecorder.Recording) -> AnswerTiming {
        AnswerTiming(
            latency: recording.startedAt.timeIntervalSince(askedAt) + (recording.speechStart ?? recording.duration),
            talked: recording.speechStart == nil ? recording.duration : recording.speech
        )
    }

    /// A sample answer: what the show plays when there is no microphone or transcription.
    private func finishSample(_ timing: AnswerTiming? = nil) {
        said = turn.mockReply
        setPhase(.heard)
        if let timing { onAnswer(turn, timing) } // nothing real was heard otherwise, so there is nothing to learn from

        answerTask?.cancel()
        answerTask = Task { @MainActor in
            try? await Task.sleep(for: CheckInScript.acknowledgePause)
            guard !Task.isCancelled else { return }
            advance()
        }
    }

    /// Nothing was heard. The first time the radio asks again; the second time it moves on.
    private func missedAnswer() async {
        missed += 1
        let giveUp = missed >= 2
        let line = giveUp ? CheckInScript.giveUpLine : CheckInScript.missedLine
        spoken = line
        await RadioVoice.shared.prepare(line)
        guard !Task.isCancelled else { return }

        if giveUp {
            gaveUp = true
            setPhase(.replying)
            await say(line)
            try? await Task.sleep(for: CheckInScript.afterReplyPause)
            guard !Task.isCancelled else { return }
            advance()
            return
        }
        setPhase(.notice)
        await sayThenListen(line)
    }

    /// Keeps what was just recorded for the voice analysis.
    private func keep(_ recording: AnswerRecorder.Recording) {
        captured.speech.append(recording)
        talked += recording.voiced
    }

    /// The sustained "ahhh" is in. Too short, and the radio asks once more; otherwise it signs off.
    private func finishVowel(_ recording: AnswerRecorder.Recording) async {
        vowelTries += 1
        if captured.vowel == nil || recording.voiced > (captured.vowel?.voiced ?? 0) { captured.vowel = recording }

        if recording.voiced < CheckInScript.vowelMin && vowelTries < CheckInScript.vowelTries {
            spoken = CheckInScript.vowelAgainLine
            await RadioVoice.shared.prepare(CheckInScript.vowelAgainLine)
            guard !Task.isCancelled else { return }
            setPhase(.notice)
            await sayThenListen(CheckInScript.vowelAgainLine)
            return
        }

        let line = CheckInScript.vowelSignOff(for: profile.name)
        spoken = line
        await RadioVoice.shared.prepare(line)
        guard !Task.isCancelled else { return }
        setPhase(.replying)
        await say(line)
        try? await Task.sleep(for: CheckInScript.afterReplyPause)
        guard !Task.isCancelled else { return }
        advance()
    }

    /// The real thing: stop recording, turn it into words, show them, and let the host answer.
    private func finishLive() {
        let segment = turn
        let index = turnIndex

        answerTask?.cancel()
        setPhase(.thinking)
        answerTask = Task { @MainActor in
            let pending = opening
            let open = await pending?.value
            opening = nil
            recorder = nil
            // the microphone failed: micFailed has taken over
            guard let open, !Task.isCancelled, let recording = open.stop() else { return }
            let timing = timing(of: recording)

            // an "ahhh" has no words to turn into text
            if segment.kind == .vowel {
                await finishVowel(recording)
                return
            }

            let heard: ConversationService.Transcription = noTranscript
                ? .unavailable
                : await ConversationService.transcribe(recording.data)
            guard !Task.isCancelled else { return }

            let words: String
            switch heard {
            case .unavailable:
                // No transcription (no key, no backend): the answers are still recorded for the voice
                // analysis, but the rest of the show plays sample answers.
                noTranscript = true
                if recording.speechStart != nil { keep(recording) }
                finishSample(timing)
                return
            case .heard(let text):
                guard !text.isEmpty else {
                    await missedAnswer()
                    return
                }
                words = text
            }

            gaveUp = false
            keep(recording)
            said = words
            setPhase(.heard)
            onAnswer(segment, timing)

            // Their words stay up for a moment at least. The reply (and its voice) is ready before the screen changes.
            // Only the briefing's own segments get a reply written by Gemini; an extra question gets a fixed warm line.
            async let writing: String = {
                let written: String? = segment.kind == .chat
                    ? nil
                    : await ConversationService.reply(
                        profile: profile,
                        segment: segment,
                        transcript: words,
                        earlier: earlier,
                        index: index,
                        last: false
                    )
                let text = written ?? CheckInScript.fallbackReply(for: profile.name, segmentIndex: index, last: false)
                await RadioVoice.shared.prepare(text)
                return text
            }()
            async let pause: Void = Task.sleep(for: CheckInScript.acknowledgePause)
            let reply = await writing
            _ = try? await pause
            guard !Task.isCancelled else { return }

            if segment.kind != .chat { earlier.append(ConversationService.Earlier(topic: segment.topic, said: words)) }
            spoken = reply
            setPhase(.replying)
            await say(reply)
            try? await Task.sleep(for: CheckInScript.afterReplyPause)
            guard !Task.isCancelled else { return }
            advance()
        }
    }

    /// No microphone to listen with: say so, and play the sample answer instead.
    private func micFailed(_ error: Error) {
        guard phase == .listening || phase == .thinking else { return }
        sample = true
        opening = nil
        recorder = nil
        answerTask?.cancel()

        let line = (error as? AnswerRecorder.Problem) == .blocked
            ? CheckInScript.micBlockedLine
            : CheckInScript.micMissingLine
        spoken = line
        setPhase(.notice)
        answerTask = Task { @MainActor in await sayThenListen(line) }
    }

    private func handlePress() {
        switch phase {
        case .ready, .notice:
            pressStartedAt = .now
            startListening()
        case .listening:
            // already listening: tap again to send
            finish()
        default:
            break
        }
    }

    private func handleRelease() {
        guard let started = pressStartedAt else { return }
        pressStartedAt = nil
        if !sample && recorder == nil { return } // still waiting on the microphone: keep listening
        recorder?.held = false
        let heldFor = Date().timeIntervalSince(started)
        // A real hold sends when you let go; a quick tap just keeps listening.
        if heldFor >= CheckInScript.minHoldDuration.timeInterval {
            finish()
        }
    }

    /// VoiceOver / Switch Control activate with a single action: toggle.
    private func handleAccessibilityActivate() {
        switch phase {
        case .ready, .notice: startListening()
        case .listening: finish()
        default: break
        }
    }
}

private struct ScrollMetrics: Equatable {
    var contentHeight: CGFloat = 0
    var scrolled: CGFloat = 0
}

private struct ScrollMetricsKey: PreferenceKey {
    static let defaultValue = ScrollMetrics()
    static func reduce(value: inout ScrollMetrics, nextValue: () -> ScrollMetrics) {
        value = nextValue()
    }
}

/// A vertical scroll view that fades its bottom edge while there is more to read below
/// (the web screen's `.radio-scroll[data-scroll="more"]`). iOS 17 has no scroll-offset API, so
/// the content reports its own height and position through a preference.
private struct FadingScroll<Content: View>: View {
    /// The index of a word (its `.id`) to keep in view: the one being spoken.
    var follow: Int?
    @ViewBuilder let content: Content

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var viewportHeight: CGFloat = 0
    @State private var metrics = ScrollMetrics()

    private var moreBelow: Bool {
        metrics.contentHeight - metrics.scrolled - viewportHeight > 2
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical) {
                content.background {
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: ScrollMetricsKey.self,
                            value: ScrollMetrics(
                                contentHeight: proxy.size.height,
                                scrolled: -proxy.frame(in: .named("fadingScroll")).minY
                            )
                        )
                    }
                }
            }
            .coordinateSpace(name: "fadingScroll")
            .onPreferenceChange(ScrollMetricsKey.self) { metrics = $0 }
            .onGeometryChangeCompat { viewportHeight = $0 }
            .scrollIndicators(.visible)
            .scrollIndicatorsFlash(onAppear: true)
            .scrollBounceBehavior(.basedOnSize)
            // As the radio speaks, keep the word being said a little below the middle, so the text scrolls up by itself.
            .onChange(of: follow) { _, word in
                guard let word, word >= 0 else { return }
                if reduceMotion {
                    proxy.scrollTo(word, anchor: UnitPoint(x: 0.5, y: 0.6))
                } else {
                    withAnimation(.easeOut(duration: 0.3)) { proxy.scrollTo(word, anchor: UnitPoint(x: 0.5, y: 0.6)) }
                }
            }
            .mask {
                LinearGradient(
                    stops: [
                        .init(color: .black, location: 0),
                        .init(color: .black, location: 0.85),
                        .init(color: moreBelow ? .clear : .black, location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
        }
    }
}

private extension View {
    /// Reports this view's height (iOS 17 has no onGeometryChange).
    func onGeometryChangeCompat(_ perform: @escaping (CGFloat) -> Void) -> some View {
        background {
            GeometryReader { proxy in
                Color.clear
                    .onAppear { perform(proxy.size.height) }
                    .onChange(of: proxy.size.height) { _, height in perform(height) }
            }
        }
    }
}
