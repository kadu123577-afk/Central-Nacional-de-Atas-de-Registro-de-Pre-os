import type { Tom } from "./badge";

const COR_POR_TOM: Record<Tom, string> = {
  neutro: "var(--cor-texto)",
  atencao: "var(--cor-atencao)",
  alerta: "var(--cor-alerta)",
  critico: "var(--cor-critico)",
  marca: "var(--cor-marca-clara)",
};

export interface NumeroDaFaixa {
  valor: React.ReactNode;
  rotulo: string;
  /** Cor do número — mesma escala do Badge (severidade ou marca). */
  tom?: Tom;
  /** Linha pequena embaixo do rótulo. */
  nota?: React.ReactNode;
}

/**
 * A faixa de números do site ("24 Atas vigentes · 108 Itens…"): um cartão
 * só, dividido em células. Sem `tom`, o número sai na cor de texto; para o
 * verde do site no número principal, passe tom: "marca".
 */
export function FaixaNumeros({ itens }: { itens: NumeroDaFaixa[] }) {
  return (
    <div className="faixa-numeros">
      {itens.map((item, i) => (
        <div key={i}>
          <strong style={item.tom ? { color: COR_POR_TOM[item.tom] } : undefined}>{item.valor}</strong>
          <span>{item.rotulo}</span>
          {item.nota && (
            <span className="!mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
              {item.nota}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
