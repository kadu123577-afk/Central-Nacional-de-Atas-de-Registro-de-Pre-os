import { corDaCategoria } from "@/lib/categorias";

/**
 * Selo de identidade visual por categoria/tema de ata — cor não é
 * severidade aqui (essa continua exclusiva do Badge), é só diferenciação
 * entre temas, pedida na revisão de telas de 2026-09-04 (prompt 5).
 */
export function SeloCategoria({ categoria }: { categoria: string }) {
  const cor = corDaCategoria(categoria);
  return (
    <span
      className="eyebrow inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5"
      style={{ color: cor, borderColor: cor, background: `${cor}26` }}
    >
      <span className="inline-block size-1.5 rounded-full" style={{ background: cor }} />
      {categoria}
    </span>
  );
}
