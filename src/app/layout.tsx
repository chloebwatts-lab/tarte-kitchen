import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import { SessionProvider } from "@/components/session-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tarte Kitchen",
  description: "Recipe costing for Tarte Bakery & Cafe",
  // Home-screen install (PWA) is per section: the staff layouts link
  // /manifest.webmanifest, the office (app) layout links
  // /office.webmanifest. Nothing is linked here so a page never carries
  // both and "Add to Home Screen" installs the app for the section you
  // are in.
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f6f5f2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
