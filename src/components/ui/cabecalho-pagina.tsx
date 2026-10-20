import Link from "next/link";

/**
 * Cabeçalho de página no padrão do site: rótulo (selo verde com ponto ou
 * rótulo dourado), título grande em 800 com tracking negativo, palavra de
 * destaque opcional em verde, descrição e ações à direita.
 */
export function CabecalhoPagina({
  titulo,
  destaque,
  descricao,
  selo,
  rotulo,
  voltar,
  acoes,
}: {
  titulo: React.ReactNode;
  /** Trecho do título em verde, logo depois de `titulo` ("Pipeline" + " de vendas"). */
  destaque?: React.ReactNode;
  descricao?: React.ReactNode;
  /** Selo verde com ponto ("● Operação de hoje"). */
  selo?: string;
  /** Rótulo dourado em caixa alta ("ANÁLISE DA ATA"). */
  rotulo?: string;
  voltar?: { href: string; rotulo: string };
  acoes?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {voltar && (
        <Link href={voltar.href} className="botao-atas link self-start text-[13px]">
          ← {voltar.rotulo}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          {selo && <p className="selo-ponto mb-3">{selo}</p>}
          {rotulo && <p className="eyebrow mb-2">{rotulo}</p>}
          <h1 className="marca" style={{ color: "var(--cor-texto)" }}>
            {titulo}
            {destaque && <span className="marca-destaque"> {destaque}</span>}
          </h1>
          {descricao && (
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
              {descricao}
            </p>
          )}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </header>
  );
}
