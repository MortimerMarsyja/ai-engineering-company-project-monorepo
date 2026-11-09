import type { Metadata } from "next";
import { Barlow, Oswald } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import ToastProvider from "@/components/ToastProvider";

// Same two families as the public site (uis/brasaland-web/app/layout.tsx)
// — Barlow for body copy, Oswald for headings — so the backoffice reads
// as the same brand, just adapted for administrative density/contrast.
const barlow = Barlow({
  subsets: ["latin"],
  variable: "--font-barlow",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brasaland Backoffice",
  description: "Internal dashboard for Brasaland restaurant chain operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${barlow.variable} ${oswald.variable}`}>
      <body className="bg-surface-muted text-[#221810] antialiased">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
