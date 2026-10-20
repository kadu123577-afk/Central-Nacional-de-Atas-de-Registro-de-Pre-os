import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Fontes do site público (as do designer). Pelo next/font elas são baixadas
 * no build e servidas pelo próprio domínio, então o site não depende do
 * Google Fonts em tempo de execução (nada a liberar no CSP).
 */
export const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

export const CLASSES_FONTES = `${jakarta.variable} ${jetbrains.variable}`;
