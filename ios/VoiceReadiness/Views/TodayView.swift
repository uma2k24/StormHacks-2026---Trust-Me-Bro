import SwiftUI

/// After the results: a few little things for today, ticked off with one tap and remembered until
/// tomorrow, and one tap to tell their family how they're doing. Mirrors TodayScreen.tsx on the web.
struct TodayView: View {
    let profile: Profile
    let status: StatusColor
    let items: [Daily.TodayItem]
    /// The ids of the items already ticked off today.
    let done: [String]
    let onToggle: (String) -> Void
    let onDone: () -> Void

    @ScaledMetric(relativeTo: .title) private var headlineSize: CGFloat = 32

    private var allDone: Bool { items.allSatisfy { done.contains($0.id) } }
    /// A tired day puts telling the family first.
    private var familyFirst: Bool { status == .red }

    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 24) {
                        header
                        list
                    }
                    .padding(.horizontal, 20)
                    .padding(.trailing, AppTheme.pop)
                    .padding(.vertical, 20)
                    // a short list sits in the middle of the screen
                    .frame(minHeight: proxy.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
            }

            nav
        }
        .sensoryFeedback(.success, trigger: allDone) { _, nowDone in nowDone }
    }

    private var header: some View {
        VStack(spacing: 14) {
            CenteredFlowLayout(spacing: headlineSize * 0.26) {
                Text("Your")
                Text("day,")
                Text(profile.name).markerHighlight(size: headlineSize)
            }
            .font(AppFont.head(headlineSize, relativeTo: .title))
            .tracking(-0.6)
            .foregroundStyle(AppTheme.ink)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Your day, \(profile.name)")
            .accessibilityAddTraits(.isHeader)

            Text(allDone ? "All done. Well done, you!" : "Tap each one when done.")
                .font(AppFont.body(22))
                .foregroundStyle(AppTheme.inkSoft)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .contentTransition(.opacity)
                .animation(.easeOut(duration: 0.2), value: allDone)
        }
        .popIn(0)
    }

    private var list: some View {
        VStack(spacing: 14) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                let on = done.contains(item.id)
                Button {
                    onToggle(item.id)
                } label: {
                    HStack(spacing: 14) {
                        ChoiceBox(on: on)
                        Text(item.text)
                            .font(AppFont.body(20, bold: true))
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 4)
                        Image(systemName: item.icon.systemImage)
                            .font(.system(size: 24, weight: .semibold))
                            .accessibilityHidden(true)
                    }
                    .padding(.vertical, 6)
                }
                .buttonStyle(ChoiceButtonStyle(selected: on))
                .accessibilityLabel(item.text)
                .accessibilityAddTraits(on ? .isSelected : [])
                .popIn(index + 1)
            }
        }
        .padding(.trailing, 4)
    }

    private var nav: some View {
        VStack(spacing: 16) {
            if Daily.hasFamily(profile), let message = Daily.messageURL(profile, status: status) {
                Link(destination: message) {
                    HStack(spacing: 10) {
                        Image(systemName: "message.fill").font(.system(size: 20, weight: .bold))
                        Text(Daily.familyAction(profile, status: status))
                    }
                }
                .buttonStyle(PillButtonStyle(fill: familyFirst ? AppTheme.accent : AppTheme.teal))
            }

            Button(action: onDone) {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark").font(.system(size: 22, weight: .heavy))
                    Text("Done")
                }
            }
            .buttonStyle(PillButtonStyle(fill: familyFirst ? .white : AppTheme.accent))
        }
        .padding(.horizontal, 20)
        .padding(.trailing, AppTheme.pop)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }
}
