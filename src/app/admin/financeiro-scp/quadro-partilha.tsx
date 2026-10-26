import { Aviso } from "@/components/ui/aviso";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { formatarReais } from "@/lib/financeiro-scp";
import type { PartilhaDoPeriodo } from "./apuracao";
import { diaTexto } from "./leitura";

/** Valor com sinal: o prejuízo sai com sinal de menos e na cor de atenção. */
function Valor({ centavos }: { centavos: number }) {
  return (
    <span
      className="numero text-[15px] font-extrabold"
      style={{ color: centavos < 0 ? "var(--cor-atencao)" : "var(--cor-texto)" }}
    >
      {formatarReais(centavos)}
    </span>
  );
}

/**
 * A partilha do período, em três estados: sem cadastro (explica o que fazer),
 * bloqueada (mostra o erro, sem calcular nada) ou calculada (tabela com sócio,
 * participação e valor, mais o detalhe por trecho se a participação mudou no mês).
 * Usado pela tela principal e pelo demonstrativo impresso.
 */
export function QuadroPartilha({ partilha }: { partilha: PartilhaDoPeriodo }) {
  if (partilha.situacao === "sem_cadastro") {
    return (
      <VazioComAcao
        titulo="Nada a partilhar ainda"
        descricao="Cadastre os sócios e as participações para ver a partilha."
      />
    );
  }

  if (partilha.situacao === "bloqueada") {
    return (
      <Aviso tom="critico" titulo="Partilha não calculada.">
        {partilha.erro}
      </Aviso>
    );
  }

  const { apuracao, linhas, variaNoPeriodo } = partilha;
  return (
    <div className="flex flex-col gap-4">
      <div className="moldura-tabela">
        <table className="tabela-atas min-w-[480px]">
          <thead>
            <tr>
              <th>Sócio</th>
              <th>Participação</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.socioId}>
                <td className="align-top">
                  <span className="titulo-linha">{l.nome}</span>
                </td>
                <td className="numero align-top text-[13.5px]">{l.participacao}</td>
                <td className="align-top">
                  <Valor centavos={l.centavos} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="font-bold" style={{ color: "var(--cor-texto)" }}>
                Resultado do período
              </td>
              <td />
              <td>
                <Valor centavos={apuracao.resultadoCentavos} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {variaNoPeriodo && (
        <Aviso tom="info" titulo="A participação mudou durante o período.">
          Cada trecho foi partilhado pelos percentuais vigentes nele, e o valor de cada sócio é a soma dos trechos.
          <ul className="lista-linhas mt-2 text-xs">
            {apuracao.faixas.map((f) => (
              <li key={f.inicio.toISOString()} className="numero">
                {diaTexto(f.inicio)} a {diaTexto(f.fim)}: receita {formatarReais(f.receitasCentavos)}, despesas{" "}
                {formatarReais(f.despesasCentavos)}, resultado {formatarReais(f.resultadoCentavos)}
              </li>
            ))}
          </ul>
        </Aviso>
      )}
    </div>
  );
}
