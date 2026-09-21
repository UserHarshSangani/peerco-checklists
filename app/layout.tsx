import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Fraunces,
  Geist_Mono,
  Inter,
  Noto_Sans_Devanagari,
  Noto_Serif_Devanagari,
} from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/brand";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeScript } from "@/components/theme/theme-script";
import { ToastProvider } from "@/components/ui/toast";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";

// Inter (UI) and Fraunces (display serif, wordmark + page titles) are the
// Latin faces; the Devanagari families are their fallbacks in the same
// font-sans/font-serif stacks (see globals.css) so Hindi/Marathi text
// renders correctly without any per-locale font-switching logic. Caveat is
// the handwritten sign-off face.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "700"],
});
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"] });
const notoSansDevanagari = Noto_Sans_Devanagari({
  variable: "--font-noto-sans-deva",
  subsets: ["devanagari"],
});
const notoSerifDevanagari = Noto_Serif_Devanagari({
  variable: "--font-noto-serif-deva",
  subsets: ["devanagari"],
  weight: ["600", "700"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Daily checklists, stock and variance for PeerCo outlets.",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_SHORT_NAME,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#12201a" },
  ],
  width: "device-width",
  initialScale: 1,
  // Not maximumScale/userScalable: pinch-zoom stays available for
  // accessibility. touch-action: manipulation (globals.css) plus 16px
  // inputs are what actually stop the *accidental* double-tap/input zoom.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${caveat.variable} ${notoSansDevanagari.variable} ${notoSerifDevanagari.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-text">
        <ThemeProvider>
          <LanguageProvider>
            <ToastProvider>{children}</ToastProvider>
          </LanguageProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
