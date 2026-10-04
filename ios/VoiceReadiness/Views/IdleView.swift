import SwiftUI

/// Home. Before the show: Play, and what's on. Once they've listened: their day's list (with a
/// little Play again button beside it), and the week of mornings they've tuned in. Either way the
/// bottom row is one tap from Settings and, when they've added someone, from calling their family.
/// Mirrors IdleScreen.tsx on the web.
struct IdleView: View {
    let profile: Profile
    let segments: [BriefingSegment]
    /// Today's show is done: the big button opens the day's list instead, and the week is shown.
    let doneToday: Bool
    /// Live (or timed-out) show is ready — Play stays off until then so the mock isn't frozen in.
    let playReady: Bool
    let week: [Daily.WeekDay]
    let streak: Int
    /// Today's show has only just been heard: today's lamp lights up as home appears (once).
    let lightToday: Bool
    let onLampLit: () -> Void
    /// A lamp for an earlier morning was tapped: look at that morning's results again.
    let onOpenDay: (String) -> Void
    /// How many of today's little things are ticked off, out of how many.
    let listDone: Int
    let listTotal: Int
    let onStart: () -> Void
    let onOpenToday: () -> Void
    let onOpenSettings: () -> Void

    @ScaledMetric(relativeTo: .largeTitle) private var headlineSize: CGFloat = 38
    @ScaledMetric(relativeTo: .body) private var orbBase: CGFloat = 220

    private var allDone: Bool { listDone >= listTotal }

    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { proxy in
                // the big button shrinks on short screens instead of forcing a scroll, and makes room
                // for the little one beside it once today's show is done
                let byHeight = min(orbBase, 270, proxy.size.height * (doneToday ? 0.25 : 0.26))
                let orb = doneToday ? min(byHeight, (proxy.size.width - 66) / 1.64) : byHeight

                ScrollView {
                    VStack(spacing: 0) {
                        header

                        Spacer(minLength: 12)

                        if doneToday {
                            knobs(size: orb)
                        } else {
                            startButton(size: orb)
                        }

                        Spacer(minLength: 12)

                        if doneToday {
                            WeekLamps(week: week, streak: streak, lightToday: lightToday, onLit: onLampLit, onOpen: onOpenDay)
                        } else if playReady {
                            lineup
                        } else {
                            waitingLineup
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 8)
                    .frame(minHeight: proxy.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
            }

            // pinned, so these are always in reach however large the text is
            bottomRow
                .padding(.horizontal, 20)
                .padding(.trailing, 5)
                .padding(.top, 8)
                .padding(.bottom, 12)
        }
    }

    private var header: some View {
        let greeting = Daily.greeting()
        let words = greeting.split(separator: " ").map(String.init) // "Good", "Morning"

        return VStack(spacing: 18) {
            CenteredFlowLayout(spacing: headlineSize * 0.26) {
                ForEach(words.dropLast(), id: \.self) { word in Text(word) }
                Text((words.last ?? "") + ",")
                // the name and its full stop travel together
                HStack(spacing: 0) {
                    Text(profile.name).markerHighlight(size: headlineSize)
                    Text(".")
                }
            }
            .font(AppFont.head(headlineSize, relativeTo: .largeTitle))
            .tracking(-0.9)
            .foregroundStyle(AppTheme.ink)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(greeting), \(profile.name).")
            .accessibilityAddTraits(.isHeader)

            Text(playReady
                   ? (doneToday ? "You've tuned in today. Lovely!" : "Your morning radio is ready.\nTap to tune in.")
                   : "Tuning in to today's show…")
                .font(AppFont.body(20))
                .foregroundStyle(AppTheme.inkSoft)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.updatesFrequently)
        }
        .popIn(0)
    }

    private func startButton(size: CGFloat) -> some View {
        ZStack {
            if playReady { SonarRings(diameter: size) }

            Button(action: onStart) {
                VStack(spacing: 6) {
                    Image(systemName: "radio.fill")
                        .font(.system(size: size * 0.29, weight: .semibold))
                    Text(playReady ? "Play" : "…")
                        .font(AppFont.head(34, relativeTo: .title))
                }
            }
            .buttonStyle(OrbButtonStyle(size: size, fill: playReady ? AppTheme.accent : AppTheme.tealSoft))
            .disabled(!playReady)
            .accessibilityLabel(playReady ? "Tap to play your morning radio" : "Getting today's show ready")
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
    }

    /// Like a radio's big dial and the little button beside it.
    private func knobs(size: CGFloat) -> some View {
        let small = size * 0.64

        return HStack(alignment: .bottom, spacing: 18) {
            ZStack {
                if !allDone { SonarRings(diameter: size) }

                Button(action: onOpenToday) {
                    VStack(spacing: 5) {
                        Image(systemName: "checklist")
                            .font(.system(size: size * 0.2, weight: .semibold))
                        // kept well inside the rim: the circle is narrower than the box at this height
                        Text("Your day")
                            .font(AppFont.head(25, relativeTo: .title))
                            .minimumScaleFactor(0.6)
                            .lineLimit(1)
                            .frame(maxWidth: size * 0.62)
                        Text(allDone ? "All done!" : "\(listDone) of \(listTotal) done")
                            .font(AppFont.body(14, bold: true))
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.white))
                            .overlay { Capsule().stroke(AppTheme.ink, lineWidth: 2.5) }
                            .frame(maxWidth: size * 0.68)
                    }
                }
                .buttonStyle(OrbButtonStyle(size: size, fill: AppTheme.teal))
                .accessibilityLabel("Your day: \(listDone) of \(listTotal) things done")
            }

            Button(action: onStart) {
                VStack(spacing: 2) {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: small * 0.22, weight: .bold))
                    Text(playReady ? "Play again" : "Tuning in…")
                        .font(AppFont.body(15, bold: true, relativeTo: .footnote))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                        .frame(width: small * 0.72)
                }
            }
            .buttonStyle(OrbButtonStyle(size: small, fill: playReady ? .white : AppTheme.tealSoft, shadow: 5))
            .disabled(!playReady)
            .accessibilityLabel(playReady ? "Play again" : "Getting today's show ready")
        }
        .padding(.trailing, 8)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var bottomRow: some View {
        if Daily.hasFamily(profile), let call = Daily.callURL(profile) {
            HStack(spacing: 14) {
                Link(destination: call) {
                    VStack(spacing: 4) {
                        Image(systemName: "phone.fill").font(.system(size: 26, weight: .semibold))
                        Text("Call \(profile.familyName)")
                    }
                }
                .buttonStyle(TileButtonStyle())

                Button(action: onOpenSettings) {
                    VStack(spacing: 4) {
                        Image(systemName: "gearshape.fill").font(.system(size: 26, weight: .semibold))
                        Text("Settings")
                    }
                }
                .buttonStyle(TileButtonStyle())
            }
        } else {
            Button(action: onOpenSettings) {
                HStack(spacing: 14) {
                    Image(systemName: "gearshape.fill").font(.system(size: 28, weight: .semibold))
                    Text("Settings")
                }
            }
            .buttonStyle(PillButtonStyle(large: true))
        }
    }

    private var lineup: some View {
        let card = RoundedRectangle(cornerRadius: AppTheme.radius, style: .continuous)
        let topics = segments.map(\.topic).joined(separator: ", ")

        return VStack(alignment: .leading, spacing: 12) {
            Text("On today's show")
                .font(AppFont.body(20, bold: true))
                .foregroundStyle(AppTheme.inkSoft)

            CenteredFlowLayout(spacing: 8, lineSpacing: 8, centered: false) { chips }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(card.fill(Color.white))
        .overlay { card.stroke(AppTheme.ink, lineWidth: AppTheme.line) }
        .hardShadow(card, offset: 5)
        .padding(.trailing, 5)
        .popIn(1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("On today's show: \(topics)")
    }

    private var waitingLineup: some View {
        let card = RoundedRectangle(cornerRadius: AppTheme.radius, style: .continuous)

        return VStack(alignment: .leading, spacing: 12) {
            Text("On today's show")
                .font(AppFont.body(20, bold: true))
                .foregroundStyle(AppTheme.inkSoft)
            Text("Getting the lineup ready…")
                .font(AppFont.body(18))
                .foregroundStyle(AppTheme.inkSoft)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(card.fill(Color.white))
        .overlay { card.stroke(AppTheme.ink, lineWidth: AppTheme.line) }
        .hardShadow(card, offset: 5)
        .padding(.trailing, 5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("On today's show: getting the lineup ready")
    }

    private var chips: some View {
        ForEach(segments) { segment in
            HStack(spacing: 8) {
                Image(systemName: segment.kind.systemImage)
                    .font(.system(size: 17, weight: .bold))
                Text(segment.topic)
                    .font(AppFont.body(18, bold: true))
            }
            .foregroundStyle(AppTheme.ink)
            .padding(.leading, 10)
            .padding(.trailing, 14)
            .padding(.vertical, 5)
            .background(Capsule().fill(Color.white))
            .overlay { Capsule().stroke(AppTheme.ink, lineWidth: 2.5) }
        }
    }
}

/// The last seven mornings as a row of radio lamps: lit with a tick for a morning they tuned in,
/// dark for one they didn't. Kind on purpose: it celebrates the mornings that happened and never
/// scolds about the ones that didn't. A lamp for a morning whose numbers were kept is a button that
/// opens that morning's results; the others are just lamps. Mirrors WeekLamps.tsx.
struct WeekLamps: View {
    let week: [Daily.WeekDay]
    let streak: Int
    /// Told when today's lamp has started lighting, so it doesn't light up again next time.
    let onLit: () -> Void
    /// A morning whose numbers were kept can be tapped to look at them again; this is told which one.
    let onOpen: (String) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .body) private var lampSize: CGFloat = 34
    // Today's show has only just been heard: today's lamp starts dark and warms up, once. Kept from
    // the first appearance, so the lamp goes on lighting after the screen above has been told.
    @State private var lighting: Bool
    @State private var warmedUp = false
    @State private var glowing = false

    init(
        week: [Daily.WeekDay],
        streak: Int,
        lightToday: Bool = false,
        onLit: @escaping () -> Void = {},
        onOpen: @escaping (String) -> Void = { _ in }
    ) {
        self.week = week
        self.streak = streak
        self.onLit = onLit
        self.onOpen = onOpen
        _lighting = State(initialValue: lightToday)
    }

    var body: some View {
        let card = RoundedRectangle(cornerRadius: AppTheme.radius, style: .continuous)
        let listened = week.filter(\.listened).count
        let lamp = min(lampSize, 42)

        VStack(alignment: .leading, spacing: 12) {
            Text(Daily.streakLine(streak))
                .font(AppFont.head(23, relativeTo: .title3))
                .foregroundStyle(AppTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityHidden(true)

            HStack(spacing: 0) {
                ForEach(Array(week.enumerated()), id: \.element.id) { index, day in
                    Group {
                        if day.canOpen {
                            Button { onOpen(day.day) } label: { column(for: day, lamp: lamp) }
                                .buttonStyle(LampButtonStyle())
                                .accessibilityLabel("See \(day.today ? "today" : day.name)’s results")
                        } else {
                            column(for: day, lamp: lamp)
                                // the group's label says it all, so only a lamp that can be tapped is left for VoiceOver
                                .accessibilityHidden(true)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    // the lamps light up one after another
                    .popIn(index + 2)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(card.fill(Color.white))
        .overlay { card.stroke(AppTheme.ink, lineWidth: AppTheme.line) }
        .hardShadow(card, offset: 5)
        .padding(.trailing, 5)
        .popIn(1)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("This week: you tuned in \(listened) of the last 7 mornings. \(Daily.streakLine(streak))")
        .onAppear(perform: lightUp)
    }

    /// One day of the week: its lamp over its name.
    private func column(for day: Daily.WeekDay, lamp: CGFloat) -> some View {
        let lit = day.listened && !(day.today && lighting && !warmedUp)

        return VStack(spacing: 7) {
            // as big as it can be up to `lamp`, shrinking to share the row seven ways
            Circle()
                .fill(lit ? AppTheme.teal : AppTheme.paperDeep)
                .overlay { Circle().stroke(AppTheme.ink, lineWidth: 2.5) }
                .overlay {
                    if day.listened {
                        GeometryReader { box in
                            Image(systemName: "checkmark")
                                .font(.system(size: box.size.width * 0.45, weight: .black))
                                .foregroundStyle(AppTheme.ink)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                        .opacity(lit ? 1 : 0)
                        .scaleEffect(lit ? 1 : 0.5)
                    }
                }
                .background {
                    if day.listened {
                        Circle().fill(AppTheme.tealSoft).padding(-4).opacity(lit ? 1 : 0)
                    }
                }
                // the soft glow as today's lamp warms up, settling into the steady ring
                .background {
                    if day.today && lighting {
                        Circle()
                            .fill(AppTheme.tealGlow)
                            .padding(-10)
                            .blur(radius: 8)
                            .opacity(glowing ? 0.9 : 0)
                    }
                }
                // today wears a coral ring
                .overlay {
                    if day.today { Circle().stroke(AppTheme.accent, lineWidth: 3).padding(-6) }
                }
                .aspectRatio(1, contentMode: .fit)
                .frame(maxWidth: lamp)
                .padding(6)

            Text(day.label)
                .font(AppFont.body(16, bold: true))
                .underline(day.today, color: AppTheme.accent)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
    }

    /// Just after the show: once the row has popped in, today's lamp warms up with a soft glow that
    /// settles into the steady ring. No sound, nothing to tap.
    private func lightUp() {
        guard lighting, !warmedUp else { return }
        onLit()
        if reduceMotion {
            warmedUp = true
            return
        }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.1))
            withAnimation(.easeOut(duration: 0.6)) {
                warmedUp = true
                glowing = true
            } completion: {
                withAnimation(.easeOut(duration: 0.7)) { glowing = false }
            }
        }
    }
}

/// A lamp that can be opened: it dips a little while pressed, like a button on a radio.
private struct LampButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(AppTheme.ink)
            .scaleEffect(configuration.isPressed ? 0.88 : 1)
            .animation(.easeOut(duration: 0.09), value: configuration.isPressed)
            .sensoryFeedback(.impact(weight: .light), trigger: configuration.isPressed) { _, isDown in isDown }
    }
}
