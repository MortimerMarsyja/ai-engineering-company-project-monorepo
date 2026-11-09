import type { Metadata } from "next";
import { Barlow, Oswald } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  variable: "--font-barlow",
  weight: ["400", "600", "700"],
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brasaland | Grill Flavor Across Colombia and Florida",
  description:
    "Brasaland is a grilled food restaurant chain founded in Medellin in 2008, now with 14 locations in Colombia and Florida. Join Brasa Points and start earning rewards.",
  metadataBase: new URL("https://brasaland.com"),
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    title: "Brasaland | Grill Flavor Across Colombia and Florida",
    description:
      "Since 2008, Brasaland has served grilled flavor across 14 locations in Colombia and Florida. Join Brasa Points.",
    url: "https://brasaland.com",
    siteName: "Brasaland",
    locale: "en_US",
    images: [
      {
        url: "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=1200&q=80",
        width: 1200,
        height: 800,
        alt: "Brasaland grilled meats served on a wooden table",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Brasaland | Grill Flavor Across Colombia and Florida",
    description:
      "14 locations, one passion for quality and flavor. Join Brasa Points and earn rewards with every visit.",
    images: [
      "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=1200&q=80",
    ],
  },
};

// schema.org structured data for search engines — ported over from the
// stale root-level duplicate of this app (removed; see that cleanup's
// commit) where it had been added but never carried into this, the real
// deployed app. Not new content, just recovering what already existed.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: "Brasaland",
  description:
    "Grilled food restaurant chain in Colombia and the United States",
  url: "https://brasaland.com",
  foundingDate: "2008",
  servesCuisine: "Grilled food, Colombian cuisine",
  priceRange: "$$",
  address: [
    {
      "@type": "PostalAddress",
      addressCountry: "CO",
      addressLocality: "Medellin",
      addressRegion: "Antioquia",
    },
    {
      "@type": "PostalAddress",
      addressCountry: "US",
      addressLocality: "Miami",
      addressRegion: "FL",
    },
  ],
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+57-4-123-4567",
    contactType: "customer service",
    availableLanguage: ["Spanish", "English"],
  },
  sameAs: [
    "https://instagram.com/brasaland",
    "https://facebook.com/brasaland",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${barlow.variable} ${oswald.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-barlow bg-brasa-bg text-brasa-text antialiased">
        {children}
      </body>
    </html>
  );
}
