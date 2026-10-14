import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Serif, Martian_Mono } from "next/font/google";
import { profile } from "@/content/profile";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["wdth", "opsz"],
  variable: "--font-bricolage",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

const mono = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-martian",
  display: "swap",
});

const description = `${profile.name} — ${profile.role}. ${profile.tagline.replace(/\*/g, "")} Talk to my AI twin: it answers in my own voice.`;

export const metadata: Metadata = {
  title: `${profile.name} — ${profile.role}`,
  description,
  openGraph: {
    title: `${profile.name} — ${profile.role}`,
    description,
    type: "website",
  },
  twitter: { card: "summary_large_image", title: profile.name, description },
};

export const viewport: Viewport = {
  themeColor: "#08090a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
          <filter id="text-outline" x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="grown" />
            <feComposite in="grown" in2="SourceAlpha" operator="out" result="ring" />
            <feFlood floodColor="#ecebe4" floodOpacity="0.5" />
            <feComposite in2="ring" operator="in" />
          </filter>
        </svg>
        {children}
      </body>
    </html>
  );
}
