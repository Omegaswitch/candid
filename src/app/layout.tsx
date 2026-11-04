import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { csCZ } from "@clerk/localizations";
import { cookies } from "next/headers";
import { Providers } from "@/components/app/providers";
import { authMode } from "@/lib/auth/session";
import { currentLocale, t } from "@/i18n";
import "./globals.css";

// latin-ext covers Czech (ě š č ř ž ý á í é ů ú ň ť ď).
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

// Link previews (Teams, Slack, email) show the app name, one line and the static OG image
// (src/app/opengraph-image.tsx). Nothing per page or per project is ever exposed here.
// A function, not a constant, so the tagline follows the viewer's language on every request.
export const generateMetadata = (): Metadata => ({
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: { default: t.common.appName, template: `%s · ${t.common.appName}` },
  description: t.common.tagline,
  applicationName: t.common.appName,
  robots: { index: false, follow: false, nocache: true },
  openGraph: { type: "website", siteName: t.common.appName, title: t.common.appName, description: t.common.tagline, locale: currentLocale() === "cs" ? "cs_CZ" : "en" },
  twitter: { card: "summary_large_image", title: t.common.appName, description: t.common.tagline },
});

// The ground colour of each theme (globals.css --ground), for the browser chrome.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The language cookie (set by LanguageSwitch). `t` reads the same cookie for this request, so
  // server HTML, <html lang> and the client's first render all agree.
  await cookies(); // marks the layout dynamic: the language is per request
  const locale = currentLocale(); // the same source `t` uses, so <html lang> always matches the text
  // ClerkProvider sits inside <body>, as the current Clerk SDK expects; the dev stand-in has none.
  const app = <Providers>{children}</Providers>;
  return (
    <html lang={locale} suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground text-sm">
        {authMode === "clerk" ? <ClerkProvider signInUrl="/sign-in" localization={locale === "cs" ? csCZ : undefined}>{app}</ClerkProvider> : app}
      </body>
    </html>
  );
}
