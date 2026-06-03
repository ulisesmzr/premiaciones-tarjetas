import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Premiaciones · Captura de tarjetas",
  description: "Captura y verificación de tarjetas de premiación — BSM / Brainstore",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </head>
      <body>{children}</body>
    </html>
  );
}
