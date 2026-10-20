import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { SITE } from "@/lib/site/config";

// O site lê o banco a cada acesso (contagens, atas); nada é gerado no build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.nome} | Atas vigentes para adesão`,
    template: `%s | ${SITE.nome}`,
  },
  description:
    "Catálogo nacional de atas de registro de preços vigentes, por categoria e objeto. Para prefeituras e órgãos públicos pedirem adesão com mais clareza. Operado pela ARCA Capital.",
  applicationName: SITE.nome,
  icons: { icon: "/site/marca/favicon.png", apple: "/site/marca/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: SITE.nome,
    images: [{ url: "/site/marca/og-image.png", width: 1200, height: 630, alt: SITE.nome }],
  },
  twitter: { card: "summary_large_image" },
  // Só liga a indexação no Google quando houver dados reais publicados
  // (variável INDEXAR_SITE=true). Até lá, nenhuma página do site é indexada.
  robots: SITE.indexar ? { index: true, follow: true } : { index: false, follow: false },
};

export default function LayoutSite({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
