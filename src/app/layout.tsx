import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/app/providers";
import { authMode } from "@/lib/auth/session";
import { t } from "@/i18n";
import "./globals.css";

// latin-ext covers Czech (ě š č ř ž ý á í é ů ú ň ť ď).
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: { default: t.common.appName, template: `%s · ${t.common.appName}` },
  description: "Projects, checklists, notes and documents for the team.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const page = (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground text-sm">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
  return authMode === "clerk" ? <ClerkProvider>{page}</ClerkProvider> : page;
}
