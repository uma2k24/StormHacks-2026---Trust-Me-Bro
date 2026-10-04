import SwiftUI

/// Everything chosen at sign-up, in one place. Text size and talking speed change the moment they
/// are tapped; the rest is saved when the person taps Done, so today's show is only rewritten once.
/// Mirrors SettingsScreen.tsx on the web.
struct SettingsView: View {
    @Binding var textSize: TextSizeStep
    @Binding var talkSpeed: TalkSpeedStep
    let onDone: (Profile) -> Void

    @ScaledMetric(relativeTo: .title) private var headlineSize: CGFloat = 34

    @State private var draft: Profile
    @State private var nameError: String?
    @State private var nameFocus = 0

    init(
        profile: Profile,
        textSize: Binding<TextSizeStep>,
        talkSpeed: Binding<TalkSpeedStep>,
        onDone: @escaping (Profile) -> Void
    ) {
        _draft = State(initialValue: profile)
        _textSize = textSize
        _talkSpeed = talkSpeed
        self.onDone = onDone
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 28) {
                    Text("Settings")
                        .font(AppFont.head(headlineSize, relativeTo: .title))
                        .tracking(-0.6)
                        .foregroundStyle(AppTheme.ink)
                        .accessibilityAddTraits(.isHeader)

                    RetroWindow(title: "About you", index: 0) {
                        VStack(spacing: 18) {
                            LabelledField(
                                label: "Your first name",
                                text: $draft.name,
                                placeholder: "David",
                                error: nameError,
                                maxLength: 40,
                                contentType: .givenName,
                                focusRequest: nameFocus
                            )
                            .onChange(of: draft.name) { nameError = nil }

                            LabelledField(
                                label: "Your town or city",
                                hint: "For your weather and local news",
                                text: $draft.city,
                                placeholder: "Burnaby, BC",
                                contentType: .addressCity,
                                submitLabel: .done
                            )
                        }
                    }

                    RetroWindow(title: "What you like", index: 1) {
                        VStack(alignment: .leading, spacing: 18) {
                            Text("Your show covers")
                                .font(AppFont.body(21, bold: true))
                                .foregroundStyle(AppTheme.ink)
                                .accessibilityAddTraits(.isHeader)

                            // the window is narrower than the screen: one column keeps labels on a line
                            InterestPicker(selected: $draft.interests, columns: 1)

                            LabelledField(
                                label: "Anything else?",
                                hint: "Optional: a team, a hobby, a place",
                                text: $draft.extras,
                                placeholder: "The Canucks, tulips…",
                                maxLength: 120,
                                capitalization: .sentences,
                                submitLabel: .done
                            )
                        }
                    }

                    RetroWindow(title: "Someone close", index: 2) {
                        VStack(alignment: .leading, spacing: 18) {
                            Text("Someone who'd like to hear how you're doing. One tap calls them or sends them your news.")
                                .font(AppFont.body(18))
                                .foregroundStyle(AppTheme.inkSoft)
                                .fixedSize(horizontal: false, vertical: true)

                            LabelledField(
                                label: "Their name",
                                text: $draft.familyName,
                                placeholder: "Sarah",
                                maxLength: 40
                            )

                            LabelledField(
                                label: "Their phone number",
                                text: $draft.familyPhone,
                                placeholder: "604 555 0134",
                                maxLength: 24,
                                keyboard: .phonePad,
                                contentType: .telephoneNumber,
                                submitLabel: .done
                            )
                        }
                    }

                    RetroWindow(title: "Your mornings", index: 3) {
                        VStack(alignment: .leading, spacing: 24) {
                            LabelledField(
                                label: "Each morning, remind me to…",
                                hint: "Optional: the radio says it at the end of the show",
                                text: $draft.reminder,
                                placeholder: "Take my blood pressure pill",
                                maxLength: 80,
                                capitalization: .sentences,
                                submitLabel: .done
                            )

                            VStack(alignment: .leading, spacing: 14) {
                                Text("When should your radio be ready?")
                                    .font(AppFont.body(21, bold: true))
                                    .foregroundStyle(AppTheme.ink)
                                    .accessibilityAddTraits(.isHeader)
                                ShowTimePicker(selection: $draft.showTime)
                            }
                        }
                    }

                    RetroWindow(title: "Text size", index: 4) {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("How big should the writing be?")
                                .font(AppFont.body(21, bold: true))
                                .foregroundStyle(AppTheme.ink)
                                .accessibilityAddTraits(.isHeader)
                            TextSizePicker(selection: $textSize)
                        }
                    }

                    RetroWindow(title: "Talking speed", index: 5) {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("How fast should the radio talk?")
                                .font(AppFont.body(21, bold: true))
                                .foregroundStyle(AppTheme.ink)
                                .accessibilityAddTraits(.isHeader)
                            TalkSpeedPicker(selection: $talkSpeed)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.trailing, AppTheme.pop)
                .padding(.vertical, 20)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)

            Button(action: done) {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark").font(.system(size: 22, weight: .heavy))
                    Text("Done")
                }
            }
            .buttonStyle(PillButtonStyle(fill: AppTheme.accent, large: true))
            .padding(.horizontal, 20)
            .padding(.trailing, AppTheme.pop)
            .padding(.top, 14)
            .padding(.bottom, 12)
        }
    }

    private func done() {
        if draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            nameError = "Please type your name so we know what to call you."
            nameFocus += 1
            return
        }
        onDone(draft.tidied)
    }
}
