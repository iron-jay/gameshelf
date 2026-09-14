import type { Metadata } from "next";
import { Archivo, Archivo_Narrow, IBM_Plex_Mono } from "next/font/google";

import "./globals.css";

// Archivo throughout, Narrow for dense metadata rows and version tables. Same
// superfamily, so it reads as one voice at two densities.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const archivoNarrow = Archivo_Narrow({
  variable: "--font-archivo-narrow",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Mono is for genuinely fixed-width data only. Plex Mono is a grotesque like
// Archivo, so the two sit together without announcing themselves.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "gameshelf",
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
      className={`${archivo.variable} ${archivoNarrow.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
