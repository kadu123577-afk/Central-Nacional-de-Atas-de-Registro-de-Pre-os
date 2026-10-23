import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { moedaCurta } from "@/lib/formato";
import {
  formatarInteiro,
  qualidadeDaComparacaoDeNegociacoes,
  type LinhaIndicadores,
  type QualidadeComparacao,
  type Variacao,
} from "@/lib/indicadores-semanais";
import { TextoVariacao } from "./texto-variacao";

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

/**
 * Um número da semana com a semana anterior e a variação embaixo:
 * "5" / "ant. 4 · +1 (+25%)". `minimo` marca o número como "pelo menos"
 * (≥), para o que não tem foto exata.
 */
function Medida({
  rotulo,
  atual,
  anterior,
  variacao,
  formatar = formatarInteiro,
  minimoAtual = false,
  minimoAnterior = false,
  qualidade = "exata",
  principal = false,
}: {
  rotulo?: string;
  atual: number;
  anterior: number;
  variacao: Variacao;
  formatar?: (n: number) => string;
  minimoAtual?: boolean;
  minimoAnterior?: boolean;
  /** Quão confiável é a variação (um número mínimo tira a exatidão da conta). */
  qualidade?: QualidadeComparacao;
  principal?: boolean;
}) {
  return (
    <div className={principal ? "" : "mt-2.5"}>
      {rotulo && (
        <span className="block text-[11.5px]" style={COR_SECUNDARIA}>
          {rotulo}
        </span>
      )}
      <span className="numero block text-[15px] font-bold" style={{ color: "var(--cor-texto)" }}>
        {minimoAtual ? "≥ " : ""}
        {formatar(atual)}
      </span>
      <span className="block text-xs" style={COR_SECUNDARIA}>
        ant. <span className="numero">{minimoAnterior ? "≥ " : ""}{formatar(anterior)}</span> ·{" "}
        <TextoVariacao variacao={variacao} formatar={formatar} qualidade={qualidade} />
      </span>
    </div>
  );
}

function Linha({ linha, fotoExata, total = false }: { linha: LinhaIndicadores; fotoExata: boolean; total?: boolean }) {
  const { atual, anterior, variacao } = linha;
  return (
    <tr style={total ? { background: "var(--cor-superficie-2)" } : undefined}>
      <td className="align-top">
        <span className="titulo-linha block">{linha.nome}</span>
        {!total && !linha.ativo && (
          <span className="mt-1 block">
            <Badge tom="neutro">Inativo</Badge>
          </span>
        )}
      </td>
      <td className="align-top">
        <Medida principal atual={atual.contatos} anterior={anterior.contatos} variacao={variacao.contatos} />
      </td>
      <td className="align-top">
        <Medida
          principal
          rotulo="Em negociação"
          atual={atual.negociacoesAtivas}
          anterior={anterior.negociacoesAtivas}
          variacao={variacao.negociacoesAtivas}
          minimoAtual={!fotoExata}
          minimoAnterior
          qualidade={qualidadeDaComparacaoDeNegociacoes(fotoExata)}
        />
        <Medida rotulo="Avançaram" atual={atual.avancaram} anterior={anterior.avancaram} variacao={variacao.avancaram} />
      </td>
      <td className="align-top">
        <Medida principal rotulo="Fechadas" atual={atual.adesoes} anterior={anterior.adesoes} variacao={variacao.adesoes} />
        <Medida
          rotulo="Valor aderido"
          atual={atual.valorAderido}
          anterior={anterior.valorAderido}
          variacao={variacao.valorAderido}
          formatar={moedaCurta}
        />
      </td>
      <td className="align-top">
        <Medida
          principal
          rotulo="Liquidada"
          atual={atual.comissaoLiquidada}
          anterior={anterior.comissaoLiquidada}
          variacao={variacao.comissaoLiquidada}
          formatar={moedaCurta}
        />
        <Medida
          rotulo="Recebida"
          atual={atual.comissaoRecebida}
          anterior={anterior.comissaoRecebida}
          variacao={variacao.comissaoRecebida}
          formatar={moedaCurta}
        />
      </td>
    </tr>
  );
}

/**
 * Os quatro indicadores por consultor, mais a linha do total no fim. Rola na
 * horizontal dentro da moldura em tela estreita.
 */
export function TabelaConsultores({
  consultores,
  total,
  fotoExata,
}: {
  consultores: LinhaIndicadores[];
  total: LinhaIndicadores;
  fotoExata: boolean;
}) {
  if (consultores.length === 0) {
    return (
      <VazioComAcao
        titulo="Nenhum consultor cadastrado ainda"
        descricao="Quando houver consultores comerciais cadastrados, os números de cada um aparecem aqui."
        acao={
          <Link href="/admin/usuarios" className="botao-atas secundario">
            Ver usuários
          </Link>
        }
      />
    );
  }

  return (
    <div className="moldura-tabela">
      <table className="tabela-atas min-w-[960px]">
        <thead>
          <tr>
            <th>Consultor</th>
            <th>Contatos registrados</th>
            <th>Municípios em negociação</th>
            <th>Adesões fechadas</th>
            <th>Comissão sobre o liquidado</th>
          </tr>
        </thead>
        <tbody>
          {consultores.map((linha) => (
            <Linha key={linha.consultorId} linha={linha} fotoExata={fotoExata} />
          ))}
          <Linha linha={total} fotoExata={fotoExata} total />
        </tbody>
      </table>
    </div>
  );
}
