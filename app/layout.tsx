import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";

import "./globals.css";

// One variable Archivo across its width axis: condensed for dense metadata,
// extended and heavy for names, so the whole app speaks in one voice at
// three densities (§5b).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

// Mono is for genuinely fixed-width data only, and the number on a rating
// sticker. Plex Mono is a grotesque like Archivo, so the two sit together.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  // A page names itself before the app, so a row of tabs can be told apart.
  title: { default: "gameshelf", template: "%s · gameshelf" },
  description: "Self-hosted game tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
