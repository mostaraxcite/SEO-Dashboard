import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getI18n, getThemePref } from "@/server/i18n";

export const metadata: Metadata = {
  title: { default: "Project Hub", template: "%s · Project Hub" },
  description: "Requests in. Work organized. Clients informed.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121715" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir } = await getI18n();
  const theme = await getThemePref();
  return (
    <html lang={locale} dir={dir} data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
