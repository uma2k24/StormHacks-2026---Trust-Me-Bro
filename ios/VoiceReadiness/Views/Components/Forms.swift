import SwiftUI

// Shared pieces of the sign-up and settings screens. Mirror Field, InterestPicker, TextSizePicker
// and PagerDots on the web.

// MARK: - Text field

/// One big, clearly labelled text box.
struct LabelledField: View {
    let label: String
    var hint: String?
    @Binding var text: String
    var placeholder = ""
    /// Shown with a warning icon, so it never relies on colour alone.
    var error: String?
    var maxLength = 60
    var capitalization: TextInputAutocapitalization = .words
    var contentType: UITextContentType?
    var submitLabel: SubmitLabel = .next
    var autoFocus = false
    /// Bump this number to move the cursor into the box (e.g. when there is an error to fix).
    var focusRequest = 0
    var onSubmit: () -> Void = {}

    @FocusState private var focused: Bool

    private var box: RoundedRectangle {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(AppFont.body(21, bold: true))
                .foregroundStyle(AppTheme.ink)
                .accessibilityHidden(true)

            if let hint {
                Text(hint)
                    .font(AppFont.body(17))
                    .foregroundStyle(AppTheme.inkSoft)
                    .accessibilityHidden(true)
            }

            TextField(
                "",
                text: $text,
                prompt: Text(placeholder).foregroundStyle(Color(hex: 0x5D7478))
            )
            .font(AppFont.body(23))
            .foregroundStyle(AppTheme.ink)
            .tint(AppTheme.ink)
            .textInputAutocapitalization(capitalization)
            .textContentType(contentType)
            .autocorrectionDisabled()
            .submitLabel(submitLabel)
            .focused($focused)
            .onSubmit(onSubmit)
            .onChange(of: text) { _, newValue in
                if newValue.count > maxLength { text = String(newValue.prefix(maxLength)) }
            }
            .padding(.horizontal, 18)
            .frame(minHeight: 64)
            .background(box.fill(error == nil ? Color.white : AppTheme.accentSoft))
            .overlay { box.stroke(AppTheme.ink, lineWidth: AppTheme.line) }
            .padding(.top, 4)
            .accessibilityLabel(label)
            .accessibilityHint(hint ?? "")

            if let error {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 18, weight: .bold))
                    Text(error)
                        .font(AppFont.body(18, bold: true))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(AppTheme.ink)
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task {
            guard autoFocus else { return }
            try? await Task.sleep(for: .milliseconds(400)) // after the step has settled in
            focused = true
        }
        .onChange(of: focusRequest) { focused = true }
    }
}

// MARK: - Tick-box choices

/// A white sticker that fills teal when chosen. Selected = a tick plus the fill, never colour alone.
struct ChoiceButtonStyle: ButtonStyle {
    let selected: Bool

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        configuration.label
            .foregroundStyle(AppTheme.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
            .background(shape.fill(selected ? AppTheme.teal : Color.white))
            .overlay { shape.stroke(AppTheme.ink, lineWidth: AppTheme.line) }
            .hardShadow(shape, offset: pressed ? 0 : 4)
            .offset(x: pressed ? 4 : 0, y: pressed ? 4 : 0)
            .animation(.easeOut(duration: 0.09), value: pressed)
            .sensoryFeedback(.selection, trigger: selected)
    }
}

struct ChoiceBox: View {
    let on: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(Color.white)
            .frame(width: 28, height: 28)
            .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(AppTheme.ink, lineWidth: 3) }
            .overlay {
                if on {
                    Image(systemName: "checkmark")
                        .font(.system(size: 16, weight: .black))
                        .foregroundStyle(AppTheme.ink)
                }
            }
            .accessibilityHidden(true)
    }
}

/// Tick-boxes for what the show should cover.
struct InterestPicker: View {
    @Binding var selected: [Interest]
    /// One column when the screen is narrow or the text is very large.
    var columns = 2

    var body: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: columns),
            spacing: 12
        ) {
            ForEach(Interest.allCases) { interest in
                let on = selected.contains(interest)
                Button {
                    if on {
                        selected.removeAll { $0 == interest }
                    } else {
                        selected.append(interest)
                    }
                } label: {
                    HStack(spacing: 8) {
                        ChoiceBox(on: on)
                        Text(interest.label)
                            .font(AppFont.body(16, bold: true))
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                            .multilineTextAlignment(.leading)
                    }
                }
                .buttonStyle(ChoiceButtonStyle(selected: on))
                .accessibilityLabel(interest.label)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(.trailing, 4)
        .padding(.bottom, 4)
    }
}

/// Each choice is written at its own size, so you can see what you are picking.
struct TextSizePicker: View {
    @Binding var selection: TextSizeStep

    var body: some View {
        VStack(spacing: 12) {
            ForEach(TextSizeStep.allCases) { step in
                let on = selection == step
                Button {
                    selection = step
                } label: {
                    HStack(spacing: 12) {
                        ChoiceBox(on: on)
                        Text(step.label).font(AppFont.fixedHead(step.samplePoints))
                    }
                    .frame(minHeight: 48)
                }
                .buttonStyle(ChoiceButtonStyle(selected: on))
                .accessibilityLabel("\(step.label) text")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(.trailing, 4)
        .padding(.bottom, 4)
    }
}

// MARK: - Progress dots

/// Little progress dots: filled for done, coral for here.
struct PagerDots: View {
    let count: Int
    /// Zero-based.
    let current: Int
    let label: String

    var body: some View {
        HStack(spacing: 11) {
            ForEach(0..<count, id: \.self) { index in
                Circle()
                    .fill(index < current ? AppTheme.ink : (index == current ? AppTheme.accent : Color.white))
                    .frame(width: 15, height: 15)
                    .overlay { Circle().stroke(AppTheme.ink, lineWidth: 2.5) }
                    .scaleEffect(index == current ? 1.25 : 1)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: current)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue("Step \(current + 1) of \(count)")
    }
}
