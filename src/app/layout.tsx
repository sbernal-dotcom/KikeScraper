import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { LocaleProvider } from "@/i18n/LocaleProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mapa Interactivo Inteligente",
  description:
    "Plataforma que organiza propiedades públicas del mercado inmobiliario panameño con fuentes originales, comparaciones y detección de cambios en un mapa interactivo.",
};

// Root layout — solo html+body+fuentes. El shell (sidebar+providers) vive
// en `(app)/layout.tsx`; el landing en `/` monta su propio LandingHeader/
// LandingFooter en `src/app/page.tsx`. Así cada área tiene el chrome que
// necesita sin arrastrar contexto de la otra.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="bg-background text-foreground">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
