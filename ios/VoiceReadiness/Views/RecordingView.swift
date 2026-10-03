import SwiftUI

/// The morning show is one little radio with one line of text on its screen:
///   briefing  - the radio reads the segment's brief (weather, a score, local news)
///   speaking  - then asks what you think
///   ready     - the question stays up while you decide to answer
///   listening - "Listening…"
///   heard     - your own words, briefly, before the next segment
/// Talking works both ways: hold the button and let go to send (walkie-talkie), or just tap once
/// to start and tap again when you're done (voice mode). Mirrors ActiveScreen.tsx on the web.
private enum Phase {
    case briefing
    case speaking
    case ready
    case listening
    case heard
}

struct RecordingView: View {
    let segments: [BriefingSegment]
    let onComplete: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .body) private var orbBase: CGFloat = 116
    @State private var turnIndex = 0
    @State private var phase: Phase = .briefing
    @State private var flowTask: Task<Void, Never>?
    @State private var listenTask: Task<Void, Never>?
    @State private var pressStartedAt: Date?
    @State private var pressing = false
    @State private var pulse = false

    private var totalTurns: Int { segments.count }
    private var turn: BriefingSegment { segments[min(turnIndex, totalTurns - 1)] }
    private var segmentNumber: Int { min(turnIndex + 1, totalTurns) }
    private var orbSize: CGFloat { min(orbBase, 150) }
    private var canPress: Bool { phase == .ready || phase == .listening }

    private var caption: String {
        switch phase {
        case .briefing: return turn.brief
        case .listening: return "Listening…"
        case .heard: return "“\(turn.mockReply)”"
        case .speaking, .ready: return turn.question
        }
    }

    private var captionKey: String {
        switch phase {
        case .briefing: return "\(turn.id)-brief"
        case .listening: return "listening"
        case .heard: return "\(turn.id)-reply"
        case .speaking, .ready: return "\(turn.id)-question"
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
        case .briefing, .speaking, .ready: return AppTheme.tealGlow
        }
    }

    var body: some View {
        radio
            .padding(.horizontal, 20)
            .padding(.trailing, 8)
            .padding(.top, 22)
            .padding(.bottom, 22)
            .onAppear { playSegment() }
            #if DEBUG
            // `-autoplay` answers the first question on its own (handy for demos and screenshots).
            .onChange(of: phase) { _, next in
                if next == .ready, turnIndex == 0,
                   ProcessInfo.processInfo.arguments.contains("-autoplay") {
                    startListening()
                }
            }
            #endif
            .onDisappear {
                flowTask?.cancel()
                listenTask?.cancel()
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
        let isCurrent = index == turnIndex
        let fill: Color = index < turnIndex ? AppTheme.paper : (isCurrent ? AppTheme.accent : AppTheme.ink.opacity(0.28))

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
            // which segment is on air
            Label {
                Text(turn.topic.uppercased())
            } icon: {
                Image(systemName: turn.kind.systemImage)
            }
            .font(AppFont.body(18, bold: true))
            .tracking(1.4)
            .foregroundStyle(screenColor)
            .opacity(0.85)

            // Centered when it fits; when it doesn't (long brief, big text size) it scrolls.
            ViewThatFits(in: .vertical) {
                captionText

                FadingScroll { captionText.padding(.vertical, 12) }
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
                active: phase == .briefing || phase == .speaking || phase == .listening
            )
            .id(phase == .briefing || phase == .speaking || phase == .listening)
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
        .accessibilityLabel("\(turn.topic). \(caption)")
        .accessibilityAddTraits(.updatesFrequently)
    }

    private var captionText: some View {
        Text(caption)
            .font(AppFont.head(captionFontSize, relativeTo: .title))
            .tracking(-0.3)
            .foregroundStyle(screenColor)
            .shadow(color: screenColor.opacity(0.6), radius: 9)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
    }

    private var controls: some View {
        ZStack {
            if phase == .ready || phase == .listening {
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

    /// Each segment: read the brief, ask the question, then wake the talk button.
    private func playSegment() {
        flowTask?.cancel()
        let segment = turn
        let voice = RadioVoice.shared

        voice.prefetch(segment.brief)
        voice.prefetch(segment.question)
        // warm up the next segment while this one plays
        if segments.indices.contains(turnIndex + 1) {
            voice.prefetch(segments[turnIndex + 1].brief)
            voice.prefetch(segments[turnIndex + 1].question)
        }

        setPhase(.briefing)
        flowTask = Task { @MainActor in
            await voice.speak(segment.brief)
            guard !Task.isCancelled else { return }

            setPhase(.speaking)
            async let minimum: Void = Task.sleep(for: CheckInScript.receivePause)
            await voice.speak(segment.question)
            _ = try? await minimum
            guard !Task.isCancelled else { return }
            setPhase(.ready)
        }
    }

    private func startListening() {
        guard phase == .ready else { return }
        setPhase(.listening)

        // The mock sends itself after a moment, like a voice assistant noticing you've stopped.
        listenTask?.cancel()
        listenTask = Task { @MainActor in
            try? await Task.sleep(for: CheckInScript.listenDuration)
            guard !Task.isCancelled else { return }
            finish()
        }
    }

    private func finish() {
        guard phase == .listening else { return }
        listenTask?.cancel()
        listenTask = nil
        pressStartedAt = nil
        setPhase(.heard)

        flowTask?.cancel()
        flowTask = Task { @MainActor in
            try? await Task.sleep(for: CheckInScript.acknowledgePause)
            guard !Task.isCancelled else { return }

            let next = turnIndex + 1
            if next >= totalTurns {
                onComplete()
                return
            }
            turnIndex = next
            playSegment()
        }
    }

    private func handlePress() {
        switch phase {
        case .ready:
            pressStartedAt = .now
            startListening()
        case .listening:
            // already listening after a tap: tap again to send
            finish()
        default:
            break
        }
    }

    private func handleRelease() {
        guard let started = pressStartedAt else { return }
        pressStartedAt = nil
        let heldFor = Date().timeIntervalSince(started)
        // A real hold sends when you let go; a quick tap just keeps listening.
        if heldFor >= CheckInScript.minHoldDuration.timeInterval {
            finish()
        }
    }

    /// VoiceOver / Switch Control activate with a single action: toggle.
    private func handleAccessibilityActivate() {
        switch phase {
        case .ready: startListening()
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
    @ViewBuilder let content: Content

    @State private var viewportHeight: CGFloat = 0
    @State private var metrics = ScrollMetrics()

    private var moreBelow: Bool {
        metrics.contentHeight - metrics.scrolled - viewportHeight > 2
    }

    var body: some View {
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
