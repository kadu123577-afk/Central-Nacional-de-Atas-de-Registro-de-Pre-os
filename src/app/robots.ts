import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site/config";

/**
 * Indexação desligada por padrão (INDEXAR_SITE != "true"): enquanto o catálogo
 * não tiver dados reais publicados, nada do site deve aparecer no Google.
 * Mesmo com a indexação ligada, as áreas internas ficam fora.
 */
export default function robots(): MetadataRoute.Robots {
  if (!SITE.indexar) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/orgao", "/fornecedor", "/vendedor", "/adesoes", "/atas", "/entrar"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
