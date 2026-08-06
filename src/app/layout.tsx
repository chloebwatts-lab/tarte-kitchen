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
  metadataBase: new URL("https://kitchen.tarte.com.au"),
  title: "Tarte Kitchen",
  description: "Recipe costing for Tarte Bakery & Cafe",
  // Link-share previews (WhatsApp, iMessage, Slack...). The image must be a
  // path Caddy serves without basic auth — /icons/* is already exempt for the
  // PWA install flow, so the 512px Ta. logo there doubles as the share image.
  openGraph: {
    title: "Tarte Kitchen",
    description: "Recipe costing for Tarte Bakery & Cafe",
    siteName: "Tarte Kitchen",
    url: "/",
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "Ta. — Tarte Bakery & Cafe",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Tarte Kitchen",
    description: "Recipe costing for Tarte Bakery & Cafe",
    images: ["/icons/icon-512.png"],
  },
  // Home-screen install support (PWA). The manifest (src/app/manifest.ts)
  // scopes the installed app to /kitchen; linking it app-wide is harmless
  // since install is opt-in.
  appleWebApp: {
    capable: true,
    title: "Tarte",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
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
