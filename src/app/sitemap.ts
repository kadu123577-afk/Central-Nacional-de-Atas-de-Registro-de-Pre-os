import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site/config";

// Lê o banco: não pode ser gerado no build.
export const dynamic = "force-dynamic";

/** Só publica o mapa do site quando a indexação está ligada (INDEXAR_SITE=true). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!SITE.indexar) return [];

  const fixas: MetadataRoute.Sitemap = ["", "/catalogo", "/termos-de-uso", "/politica-privacidade"].map(
    (caminho) => ({ url: `${SITE.url}${caminho}` }),
  );

  const atas = await prisma.ata.findMany({
    where: { status: "APROVADA", dataVigenciaFim: { gte: new Date() }, isSeed: false },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });

  return [
    ...fixas,
    ...atas.map((a) => ({ url: `${SITE.url}/catalogo/${a.id}`, lastModified: a.updatedAt })),
  ];
}
