import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

// Atkinson Hyperlegible was designed by the Braille Institute for low-vision
// readers, so every glyph is built to be told apart at a glance.
const body = Atkinson_Hyperlegible({
  variable: "--ff-body",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// A heavy, slightly quirky grotesque that gives the headlines a 90s poster feel.
const display = Bricolage_Grotesque({
  variable: "--ff-display",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

export const metadata: Metadata = {
  title: "Morning Radio",
  description:
    "A personal morning radio show: local weather, scores and news, read aloud.",
};

export const viewport: Viewport = {
  themeColor: "#FBF5E6",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
