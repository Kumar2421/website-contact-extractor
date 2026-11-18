import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./platform.css";
import "./views-ops.css";
import "./app.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Contact Extractor: emails, phones, WhatsApp and socials from any website list",
  description:
    "Paste business websites or upload a CSV. Get verified emails, phone numbers, WhatsApp and social profiles, each with the page it came from. Pay only for sites where a contact is found.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
