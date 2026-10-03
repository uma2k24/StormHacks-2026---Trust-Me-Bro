import SwiftUI

struct IdleView: View {
    let userName: String
    let segments: [BriefingSegment]
    let onStart: () -> Void
    let onOpenSettings: () -> Void

    @ScaledMetric(relativeTo: .largeTitle) private var headlineSize: CGFloat = 38
    @ScaledMetric(relativeTo: .body) private var orbBase: CGFloat = 220

    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { proxy in
                // the big button shrinks on short screens instead of forcing a scroll
                let orb = min(orbBase, 270, proxy.size.height * 0.26)

                ScrollView {
                    VStack(spacing: 0) {
                        header

                        Spacer(minLength: 12)

                        startButton(size: orb)

                        Spacer(minLength: 12)

                        lineup
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 8)
                    .frame(minHeight: proxy.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
            }

            // pinned, so Settings is always in reach however large the text is
            settingsButton
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 12)
        }
    }

    private var header: some View {
        VStack(spacing: 18) {
            CenteredFlowLayout(spacing: headlineSize * 0.26) {
                Text("Good")
                Text("Morning,")
                // the name and its full stop travel together
                HStack(spacing: 0) {
                    Text(userName).markerHighlight(size: headlineSize)
                    Text(".")
                }
            }
            .font(AppFont.head(headlineSize, relativeTo: .largeTitle))
            .tracking(-0.9)
            .foregroundStyle(AppTheme.ink)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Good Morning, \(userName).")
            .accessibilityAddTraits(.isHeader)

            Text("Your morning radio is ready.\nTap to tune in.")
                .font(AppFont.body(20))
                .foregroundStyle(AppTheme.inkSoft)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .popIn(0)
    }

    private func startButton(size: CGFloat) -> some View {
        ZStack {
            SonarRings(diameter: size)

            Button(action: onStart) {
                VStack(spacing: 6) {
                    Image(systemName: "radio.fill")
                        .font(.system(size: size * 0.29, weight: .semibold))
                    Text("Play")
                        .font(AppFont.head(34, relativeTo: .title))
                }
            }
            .buttonStyle(OrbButtonStyle(size: size))
            .accessibilityLabel("Tap to play your morning radio")
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
    }

    private var settingsButton: some View {
        Button(action: onOpenSettings) {
            HStack(spacing: 14) {
                Image(systemName: "gearshape.fill").font(.system(size: 28, weight: .semibold))
                Text("Settings")
            }
        }
        .buttonStyle(PillButtonStyle(large: true))
        .padding(.trailing, 5)
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
