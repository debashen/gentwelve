import { siteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { SpeedInsights } from '@vercel/speed-insights/next';
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Gentwelve Printing Co | Branded Product Ideas",
  description: "Explore curated promotional product ideas and request a branded quote from Gentwelve Printing Co.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/gentwelve-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organisation = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Gentwelve Printing Co",
    url: siteUrl,
    logo: `${siteUrl}/gentwelve-icon.png`,
    telephone: "+27 10 013 0297",
    email: "debashen@gentwelve.com",
    areaServed: "South Africa",
  };
  return (
    <html lang="en-ZA">
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/nqr0cal.css" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organisation) }} />
      </head>
      <body className="antialiased">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
