import SwiftUI

/// Everything chosen at sign-up, in one place. Text size changes the app the moment it is tapped;
/// the rest is saved when the person taps Done, so today's show is only rewritten once.
/// Mirrors SettingsScreen.tsx on the web.
struct SettingsView: View {
    @Binding var textSize: TextSizeStep
    let onDone: (Profile) -> Void

    @ScaledMetric(relativeTo: .title) private var headlineSize: CGFloat = 34

    @State private var draft: Profile
    @State private var nameError: String?
    @State private var nameFocus = 0

    init(profile: Profile, textSize: Binding<TextSizeStep>, onDone: @escaping (Profile) -> Void) {
        _draft = State(initialValue: profile)
        _textSize = textSize
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
                                placeholder: "Coquitlam, BC",
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

                    RetroWindow(title: "Text size", index: 2) {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("How big should the writing be?")
                                .font(AppFont.body(21, bold: true))
                                .foregroundStyle(AppTheme.ink)
                                .accessibilityAddTraits(.isHeader)
                            TextSizePicker(selection: $textSize)
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
