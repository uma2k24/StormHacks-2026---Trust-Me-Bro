import SwiftUI

/// First launch: set up the show one question at a time. Nothing is saved until the last step, so
/// leaving half way never leaves half a profile behind. (The text size is the exception: it
/// changes the app as soon as it is chosen, so the person can see what they picked.)
/// Mirrors SignUpScreen.tsx on the web.
struct SignUpView: View {
    @Binding var textSize: TextSizeStep
    let onComplete: (Profile) -> Void

    private static let stepTitles = [
        "Welcome",
        "Your name",
        "Where you live",
        "What you like",
        "Anything else",
        "Text size",
        "All set"
    ]
    private static let lastStep = stepTitles.count - 1

    @ScaledMetric(relativeTo: .largeTitle) private var bigHeadline: CGFloat = 38
    @ScaledMetric(relativeTo: .title) private var headline: CGFloat = 30
    @ScaledMetric(relativeTo: .body) private var badge: CGFloat = 118

    @State private var step: Int
    @State private var draft = Profile()
    @State private var nameError: String?

    init(textSize: Binding<TextSizeStep>, initialStep: Int = 0, onComplete: @escaping (Profile) -> Void) {
        _textSize = textSize
        _step = State(initialValue: min(max(initialStep, 0), Self.lastStep))
        self.onComplete = onComplete
    }

    private var firstName: String { draft.name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 22) {
                        stepContent
                    }
                    .padding(.horizontal, 20)
                    .padding(.trailing, AppTheme.pop)
                    .padding(.vertical, 20)
                    // short steps sit in the middle of the screen
                    .frame(minHeight: proxy.size.height)
                    .id(step)
                }
                .scrollBounceBehavior(.basedOnSize)
                .scrollDismissesKeyboard(.interactively)
            }

            nav
        }
        .onChange(of: step) { _, newStep in
            AccessibilityNotification.Announcement(
                "Step \(newStep + 1) of \(Self.stepTitles.count): \(Self.stepTitles[newStep])"
            ).post()
        }
    }

    // MARK: Steps

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case 0:
            welcomeBadge
            headlineWords(["Welcome", "to"], marked: ["Morning", "Radio"], size: bigHeadline, spoken: "Welcome to Morning Radio")
            lede("Let's set up your own morning show. It only takes a minute.")
        case 1:
            headlineText("What should we call you?")
            LabelledField(
                label: "Your first name",
                text: $draft.name,
                placeholder: "David",
                error: nameError,
                maxLength: 40,
                contentType: .givenName,
                autoFocus: true,
                onSubmit: next
            )
            .popIn(1)
            .onChange(of: draft.name) { nameError = nil }
        case 2:
            headlineText("Where are you listening from?")
            lede("We'll use this for your weather and local news.")
            LabelledField(
                label: "Your town or city",
                hint: "Optional",
                text: $draft.city,
                placeholder: "Coquitlam, BC",
                contentType: .addressCity,
                autoFocus: true,
                onSubmit: next
            )
            .popIn(2)
        case 3:
            headlineText("What do you like to hear about?")
            lede("Pick as many as you like.")
            InterestPicker(selected: $draft.interests)
                .popIn(2)
        case 4:
            headlineText("Anything else you'd like to hear about?")
            lede("A team, a hobby, a place. You can skip this.")
            LabelledField(
                label: "In your own words",
                text: $draft.extras,
                placeholder: "The Canucks, tulips…",
                maxLength: 120,
                capitalization: .sentences,
                autoFocus: true,
                onSubmit: next
            )
            .popIn(2)
        case 5:
            headlineText("How big should the writing be?")
            lede("Tap one. You can change it any time in Settings.")
            TextSizePicker(selection: $textSize)
                .popIn(2)
        default:
            headlineWords(["You're", "all", "set,"], marked: [firstName + "!"], size: bigHeadline, spoken: "You're all set, \(firstName)!")
            lede("Your morning radio is ready.")
        }
    }

    private var welcomeBadge: some View {
        Circle()
            .fill(AppTheme.teal)
            .frame(width: badge, height: badge)
            .overlay { Circle().stroke(AppTheme.ink, lineWidth: 4) }
            .overlay {
                Image(systemName: "radio.fill")
                    .font(.system(size: badge * 0.4, weight: .semibold))
                    .foregroundStyle(AppTheme.ink)
            }
            .hardShadow(Circle(), offset: 8)
            .padding(.trailing, 8)
            .popIn(0)
            .accessibilityHidden(true)
    }

    private func headlineText(_ text: String) -> some View {
        Text(text)
            .font(AppFont.head(headline, relativeTo: .title))
            .tracking(-0.6)
            .foregroundStyle(AppTheme.ink)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
            .popIn(0)
    }

    /// A headline where some words wear the highlighter.
    private func headlineWords(_ plain: [String], marked: [String], size: CGFloat, spoken: String) -> some View {
        CenteredFlowLayout(spacing: size * 0.26) {
            ForEach(plain, id: \.self) { word in Text(word) }
            ForEach(marked, id: \.self) { word in Text(word).markerHighlight(size: size) }
        }
        .font(AppFont.head(size, relativeTo: .largeTitle))
        .tracking(-0.9)
        .foregroundStyle(AppTheme.ink)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
        .accessibilityAddTraits(.isHeader)
        .popIn(1)
    }

    private func lede(_ text: String) -> some View {
        Text(text)
            .font(AppFont.body(22))
            .foregroundStyle(AppTheme.inkSoft)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .popIn(1)
    }

    // MARK: Navigation

    private var nav: some View {
        VStack(spacing: 16) {
            PagerDots(count: Self.stepTitles.count, current: step, label: "Sign up progress")

            HStack(spacing: 14) {
                if step > 0 {
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { step -= 1 }
                    } label: {
                        Image(systemName: "arrow.left").font(.system(size: 24, weight: .bold))
                    }
                    .buttonStyle(PillButtonStyle())
                    .frame(width: 72)
                    .accessibilityLabel("Back")
                }

                Button(action: next) {
                    HStack(spacing: 10) {
                        Text(step == 0 ? "Let’s go" : (step == Self.lastStep ? "Tune in" : "Next"))
                        Image(systemName: step == Self.lastStep ? "radio.fill" : "arrow.right")
                            .font(.system(size: 20, weight: .bold))
                    }
                }
                .buttonStyle(PillButtonStyle(fill: AppTheme.accent))
            }
        }
        .padding(.horizontal, 20)
        .padding(.trailing, AppTheme.pop)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }

    private func next() {
        if step == 1, firstName.isEmpty {
            nameError = "Please type your name so we know what to call you."
            return
        }
        if step == Self.lastStep {
            onComplete(draft.tidied)
            return
        }
        withAnimation(.easeOut(duration: 0.2)) { step += 1 }
    }
}
