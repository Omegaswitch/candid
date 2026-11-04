import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/app/providers";
import { authMode } from "@/lib/auth/session";
import { t } from "@/i18n";
import "./globals.css";

// latin-ext covers Czech (ě š č ř ž ý á í é ů ú ň ť ď).
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

// Link previews (Teams, Slack, email) show the app name, one line and the static OG image
// (src/app/opengraph-image.tsx). Nothing per page or per project is ever exposed here.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: { default: t.common.appName, template: `%s · ${t.common.appName}` },
  description: t.common.tagline,
  applicationName: t.common.appName,
  robots: { index: false, follow: false, nocache: true },
  openGraph: { type: "website", siteName: t.common.appName, title: t.common.appName, description: t.common.tagline, locale: "en" },
  twitter: { card: "summary_large_image", title: t.common.appName, description: t.common.tagline },
};

// The ground colour of each theme (globals.css --ground), for the browser chrome.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // ClerkProvider sits inside <body>, as the current Clerk SDK expects; the dev stand-in has none.
  const app = <Providers>{children}</Providers>;
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground text-sm">
        {authMode === "clerk" ? <ClerkProvider signInUrl="/sign-in">{app}</ClerkProvider> : app}
      </body>
    </html>
  );
}
