import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Mesma fonte do site público (Is' Art): títulos em 800 com tracking
// negativo, corpo em 400/500, números com algarismos tabulares.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// Código de ata ("Nº 121"), UF e identificadores — como no site.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Central de Atas de Registro de Preços",
  description:
    "Plataforma de intermediação de adesões a atas de registro de preços vigentes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      data-theme="light"
      className={`${jakarta.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
