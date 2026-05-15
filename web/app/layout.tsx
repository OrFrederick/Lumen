import "./globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { HoverCardProvider } from "@/components/HoverCard";
import { ThemeProvider } from "@/components/ThemeProvider";
import { personCount, storyCount } from "@/lib/queries";

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lumen — a library of story-moments from the history of science",
  description:
    "Distilled from long-form science video: the anecdotes, experiments, fun facts and unguarded quotes that make a discovery memorable.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Counts are read server-side once per request; small + cheap.
  const stories = storyCount();
  const people = personCount();
  return (
    <html lang="en" suppressHydrationWarning className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <ThemeProvider>
          <HoverCardProvider>
            <Header storyCount={stories} personCount={people} />
            {children}
          </HoverCardProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
