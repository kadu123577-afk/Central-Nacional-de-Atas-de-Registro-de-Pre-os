import type { Metadata } from "next";
import { Poppins, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { AvisoCookies } from "@/components/aviso-cookies";
import { Rodape } from "@/components/rodape";
import "./globals.css";

// Marca — títulos, labels de seção, eyebrow (uppercase + letter-spacing).
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

// Interface — corpo, formulários, navegação, tabelas.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Números — todo valor monetário, percentual, data e código.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Central Nacional de Atas de Registro de Preços",
  description:
    "Plataforma de intermediação de adesões a atas de registro de preços vigentes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      data-theme="dark"
      className={`${poppins.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Rodape />
        <AvisoCookies />
      </body>
    </html>
  );
}
