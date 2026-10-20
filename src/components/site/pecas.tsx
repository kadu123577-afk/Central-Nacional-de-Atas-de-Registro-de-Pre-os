import Link from "next/link";
import type { CSSProperties } from "react";
import type { AtaResumo } from "@/lib/catalogo-publico";
import { nomeDoGrupo } from "@/lib/site/categorias";
import { plural } from "@/lib/site/formato";
import type { ExibicaoVigencia } from "@/lib/site/regras";
import { IconeCategoria, IconeRelogio, IconeTriangulo } from "./icones";

/** Peças visuais reutilizadas nas páginas do site (home, catálogo, ata). */

export function SeloVigencia({
  vigencia,
  compacto = false,
}: {
  vigencia: ExibicaoVigencia;
  compacto?: boolean;
}) {
  const { tom, linha1, linha2 } = vigencia;
  const triangulo = tom === "alerta" || tom === "critico";
  return (
    <span className={`vig${tom ? ` vig--${tom}` : ""}${compacto ? " vig--linha" : ""}`}>
      {tom ? triangulo ? <IconeTriangulo /> : <IconeRelogio /> : null}
      <span className="tab">
        {linha1}
        {linha2 ? <small>{linha2}</small> : null}
      </span>
    </span>
  );
}

export function BarraSaldo({ valor, rotulo = "Saldo para adesão" }: { valor: number; rotulo?: string }) {
  const pct = Math.round(valor * 100);
  return (
    <div className={`saldo${pct < 30 ? " saldo--baixo" : ""}`}>
      <div className="saldo__topo">
        <span>{rotulo}</span>
        <strong>{pct}%</strong>
      </div>
      <div className="saldo__trilho" role="img" aria-label={`${rotulo}: ${pct}% disponível`}>
        <div className="saldo__fill" style={{ "--p": `${pct}%` } as CSSProperties} />
      </div>
    </div>
  );
}

/**
 * Cada ata é um lançamento do "livro de registro". O visitante só recebe
 * código, objeto e categoria (versão "simples"); órgão logado e equipe também
 * recebem UF, vigência e saldo.
 */
export function LivroAtas({ atas }: { atas: AtaResumo[] }) {
  const simples = atas.every((a) => a.uf === undefined);
  return (
    <div className={`livro${simples ? " livro--simples" : ""}`}>
      <div className="livro__cabeca" aria-hidden="true">
        <span>Nº</span>
        <span>Objeto da ata</span>
        <span>Categoria</span>
        {simples ? null : (
          <>
            <span>UF</span>
            <span>Vigência</span>
            <span>Saldo para adesão</span>
          </>
        )}
      </div>
      <ol className="livro__lista">
        {atas.map((ata, i) => (
          <li className="lanc" style={{ "--i": i } as CSSProperties} key={ata.id}>
            <span className="lanc__num mono">Nº {ata.codigo}</span>
            <div className="lanc__objeto">
              <h3>
                <Link href={`/catalogo/${ata.id}`}>{ata.titulo}</Link>
              </h3>
              {ata.nItens !== undefined || ata.orgao ? (
                <p>
                  {ata.orgao ? `${ata.orgao} · ` : ""}
                  {ata.nItens !== undefined ? plural(ata.nItens, "item", "itens") : ""}
                </p>
              ) : null}
              {ata.correspondencia ? (
                <p className="lanc__achado">
                  {plural(ata.correspondencia.total, "item corresponde", "itens correspondem")}:{" "}
                  {ata.correspondencia.primeiro}
                  {ata.correspondencia.total > 1 ? " e outros" : ""}
                </p>
              ) : null}
            </div>
            <span className="lanc__cat">
              <IconeCategoria id={ata.grupoId} />
              <span>{nomeDoGrupo(ata.grupoId)}</span>
            </span>
            {ata.uf !== undefined ? (
              <span className="lanc__uf mono" title="UF do órgão gerenciador">
                {ata.uf}
              </span>
            ) : null}
            {ata.vigencia ? (
              <span className="lanc__vig">
                <SeloVigencia vigencia={ata.vigencia} />
              </span>
            ) : null}
            {ata.saldoMedio !== undefined ? (
              <span className="lanc__saldo">
                <BarraSaldo valor={ata.saldoMedio} rotulo="saldo" />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}