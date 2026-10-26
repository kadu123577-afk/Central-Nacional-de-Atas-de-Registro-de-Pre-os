import Link from "next/link";
import type { PeriodoDias } from "@/lib/financeiro-scp";
import { mesVizinho, rotuloDoMes, textoDoMes } from "./leitura";

/**
 * Escolha do mês por ?mes=AAAA-MM: formulário GET e links, tudo funciona sem
 * JavaScript. A validação do mês é feita no servidor (escolherMes); sem mês ou
 * com mês inválido a tela volta para o mês atual.
 */
export function SeletorMes({
  rota,
  periodo,
  mesAtual,
}: {
  /** A página que recebe o ?mes= (a principal ou o demonstrativo). */
  rota: string;
  periodo: PeriodoDias;
  /** "AAAA-MM" do mês atual (Brasília). */
  mesAtual: string;
}) {
  const texto = textoDoMes(periodo);
  const anterior = mesVizinho(periodo, -1);
  const seguinte = mesVizinho(periodo, 1);

  return (
    <div className="painel flex flex-wrap items-end justify-between gap-x-8 gap-y-4 p-5">
      <div className="min-w-0">
        <p className="eyebrow">Período</p>
        <p className="marca numero mt-1 text-[20px]" style={{ color: "var(--cor-texto)", fontWeight: 800 }}>
          {rotuloDoMes(periodo)}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
          Mês inteiro, pelo calendário de Brasília{texto === mesAtual ? " · mês em andamento" : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {anterior && (
          <Link href={`${rota}?mes=${textoDoMes(anterior)}`} className="botao-atas secundario">
            ← Mês anterior
          </Link>
        )}
        {seguinte && (
          <Link href={`${rota}?mes=${textoDoMes(seguinte)}`} className="botao-atas secundario">
            Mês seguinte →
          </Link>
        )}
        {texto !== mesAtual && (
          <Link href={rota} className="botao-atas secundario">
            Mês atual
          </Link>
        )}

        <form method="get" action={rota} className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="rotulo-campo">Ir para o mês</span>
            <input
              type="month"
              name="mes"
              defaultValue={texto}
              min="2000-01"
              max="2100-12"
              required
              className="campo-atas"
            />
          </label>
          <button type="submit" className="botao-atas">
            Ver mês
          </button>
        </form>
      </div>
    </div>
  );
}
