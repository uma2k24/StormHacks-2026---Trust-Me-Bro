import CoreText
import SwiftUI

/// "Teal Desktop" palette. Mirrors the CSS tokens in frontend/src/app/globals.css.
///
/// One colour theme: TEAL (calm, good, the app itself) and CORAL (the one warm accent: main
/// actions, live states, "pay attention"). Everything else is cream paper and a very dark teal ink.
///
/// Contrast (WCAG): ink on paper 13.2:1, ink-soft on paper 8.3:1, white on teal-deep 7.1:1,
/// ink on teal 7.2:1, ink on coral 6.6:1, ink on the soft tints >= 11:1.
enum AppTheme {
    static let paper = Color(hex: 0xFBF5E6)
    static let paperDeep = Color(hex: 0xF1E6CE)
    static let ink = Color(hex: 0x0F2E33)
    static let inkSoft = Color(hex: 0x334D51)

    static let teal = Color(hex: 0x41CBBC)
    static let tealDeep = Color(hex: 0x0A6360)
    static let tealSoft = Color(hex: 0xCFF0EA)
    static let tealGlow = Color(hex: 0x7EF0DE)

    static let accent = Color(hex: 0xFF9873)
    static let accentSoft = Color(hex: 0xFFD9CA)
    static let accentGlow = Color(hex: 0xFFAA90)
    static let marker = Color(hex: 0xFFC6B0)

    // Readiness zones: Rest < 60 <= Pay Attention < 80 <= Ready
    static let zoneRest = Color(hex: 0xFF9873)
    static let zoneAttention = Color(hex: 0xFFC6B2)
    static let zoneReady = Color(hex: 0x41CBBC)

    static let line: CGFloat = 3
    static let pop: CGFloat = 6
    static let radius: CGFloat = 18
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

/// Atkinson Hyperlegible (designed by the Braille Institute for low-vision readers)
/// for text, Bricolage Grotesque for headlines. Both are bundled in Fonts/.
/// Every size scales with Dynamic Type; if a font fails to load SwiftUI falls back to the system font.
enum AppFont {
    private static let regular = "AtkinsonHyperlegible-Regular"
    private static let bold = "AtkinsonHyperlegible-Bold"
    private static let display = "BricolageGrotesque-ExtraBold"

    static func body(_ size: CGFloat, bold isBold: Bool = false, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(isBold ? bold : regular, size: size, relativeTo: style)
    }

    static func head(_ size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom(display, size: size, relativeTo: style)
    }

    /// Does not scale: for chrome that must stay put (the app bar).
    static func fixedHead(_ size: CGFloat) -> Font {
        .custom(display, fixedSize: size)
    }
}

enum FontRegistrar {
    static func registerAll() {
        for name in ["AtkinsonHyperlegible-Regular", "AtkinsonHyperlegible-Bold", "BricolageGrotesque-ExtraBold"] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "ttf") else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}
