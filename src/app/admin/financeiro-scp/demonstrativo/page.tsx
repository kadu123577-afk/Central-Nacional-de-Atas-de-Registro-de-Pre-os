import Link from "next/link";
import { exigirAcessoFinanceiro } from "@/lib/acesso-financeiro";
import { logoutAdmin } from "../../actions";
import { NAV_ADMIN } from "../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { contagem } from "@/lib/acompanhamento-view";
import { formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro-scp";
import { carregarFinanceiroDoPeriodo, LIMITE_DESPESAS_DEMONSTRATIVO } from "@/lib/financeiro-scp-db";
import { percentualDeFracao } from "@/lib/formato";
import { calcularPartilha, numerosDoPeriodo } from "../apuracao";
import { AvisosDaReceita } from "../avisos-periodo";
import { diaTexto, escolherMes, mesVizinho, rotuloDoMes, textoDoMes } from "../leitura";
import { QuadroPartilha } from "../quadro-partilha";
import { BotaoImprimir } from "./botao-imprimir";

export const dynamic = "force-dynamic";

const ROTA = "/admin/financeiro-scp";
const ROTA_DEMONSTRATIVO = `${ROTA}/demonstrativo`;

/**
 * Demonstrativo do mês, para imprimir ou gerar PDF (Projeto RNA, etapa 7,
 * 2026-10-26): comissões recebidas por oportunidade (só município e número da ata,
 * nunca nome de pessoa), despesas, resultado e partilha. Sóbrio: na impressão
 * somem o menu e os botões e entra o timbre (classes .sem-impressao e
 * .timbre-impressao, de globals.css, como no comprovante de adesão).
 *
 * Mesmo acesso da tela principal: exigirAcessoFinanceiro() é a primeira chamada,
 * antes de ler a URL e o banco. Os números vêm das mesmas consultas e das mesmas
 * regras da tela principal, então não divergem.
 */
export default async function DemonstrativoPage({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  await exigirAcessoFinanceiro();

  const { mes: mesDaUrl } = await searchParams;
  const agora = new Date();
  const mes = escolherMes(mesDaUrl, agora);
  const financeiro = await carregarFinanceiroDoPeriodo(mes.periodo, { limiteDespesas: LIMITE_DESPESAS_DEMONSTRATIVO });
  const { despesas, receita } = financeiro;
  const partilha = calcularPartilha(financeiro);

  const rotulo = rotuloDoMes(mes.periodo);
  const anterior = mesVizinho(mes.periodo, -1);
  const seguinte = mesVizinho(mes.periodo, 1);
  // Data e hora de emissão no calendário de Brasília, em texto fixo ("26/10/2026 às 12:00").
  const emitidoEm = `${diaTexto(hojeEmSaoPaulo(agora))} às ${agora.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  const totalLiquidado = receita.porOportunidade.reduce((soma, o) => soma + o.valorLiquidadoCentavos, 0);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-4xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      {/* Timbre: só aparece na impressão/PDF. */}
      <div className="timbre-impressao mb-2 border-b pb-4" style={{ borderColor: "var(--cor-borda)" }}>
        <p className="marca-wordmark text-lg">Central Nacional de Atas de Registro de Preços</p>
        <p className="text-xs">Demonstrativo gerencial da SCP — {rotulo}</p>
      </div>

      <div className="sem-impressao flex flex-wrap items-center gap-3 text-[13px]">
        <Link href={`${ROTA}?mes=${textoDoMes(mes.periodo)}`} className="botao-atas link">
          ← Voltar ao financeiro
        </Link>
        {anterior && (
          <Link href={`${ROTA_DEMONSTRATIVO}?mes=${textoDoMes(anterior)}`} className="botao-atas link">
            Mês anterior
          </Link>
        )}
        {seguinte && (
          <Link href={`${ROTA_DEMONSTRATIVO}?mes=${textoDoMes(seguinte)}`} className="botao-atas link">
            Mês seguinte
          </Link>
        )}
      </div>

      <CabecalhoPagina
        rotulo="Demonstrativo gerencial"
        titulo="Financeiro da SCP"
        destaque={rotulo}
        descricao="Comissões recebidas no mês, despesas, resultado e partilha entre os sócios."
        acoes={
          <div className="sem-impressao">
            <BotaoImprimir />
          </div>
        }
      />

      {mes.erro && <Aviso tom="atencao">{mes.erro}</Aviso>}

      <Aviso tom="atencao" titulo="Documento confidencial.">
        De uso restrito aos sócios. Não encaminhe a quem não é sócio.
      </Aviso>

      <AvisosDaReceita receita={receita} />

      <FaixaNumeros itens={numerosDoPeriodo(financeiro)} />

      <Secao titulo="Receitas por oportunidade" descricao="Comissões efetivamente recebidas no mês, uma linha por oportunidade (município e ata).">
        {receita.porOportunidade.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Nenhuma comissão recebida neste mês.
          </p>
        ) : (
          <div className="moldura-tabela">
            <table className="tabela-atas min-w-[640px]">
              <thead>
                <tr>
                  <th>Município</th>
                  <th>Ata</th>
                  <th>Recebimentos</th>
                  <th>Valor liquidado</th>
                  <th>Percentual</th>
                  <th>Comissão recebida</th>
                </tr>
              </thead>
              <tbody>
                {receita.porOportunidade.map((o) => (
                  <tr key={o.oportunidadeId}>
                    <td className="align-top">
                      <span className="titulo-linha">{o.entidade}</span>
                      {o.uf && <span className="selo-uf ml-2">{o.uf}</span>}
                    </td>
                    <td className="align-top">
                      <span className="codigo">{o.ataNumero}</span>
                    </td>
                    <td className="numero align-top text-[13.5px]">{o.recebimentos}</td>
                    <td className="numero align-top text-[13.5px]">{formatarReais(o.valorLiquidadoCentavos)}</td>
                    <td className="numero align-top text-[13.5px]">
                      {o.percentual === null ? "sem percentual" : percentualDeFracao(o.percentual)}
                    </td>
                    <td className="numero align-top text-[15px] font-extrabold" style={{ color: "var(--cor-texto)" }}>
                      {formatarReais(o.comissaoCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="font-bold" style={{ color: "var(--cor-texto)" }}>
                    Total ({contagem(receita.quantidade, "recebimento", "recebimentos")})
                  </td>
                  <td />
                  <td />
                  <td className="numero text-[13.5px]">{formatarReais(totalLiquidado)}</td>
                  <td />
                  <td className="numero text-[15px] font-extrabold" style={{ color: "var(--cor-texto)" }}>
                    {formatarReais(receita.centavos)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Secao>

      <Secao titulo="Despesas" descricao="Despesas lançadas com data no mês.">
        {despesas.listaTruncada && (
          <Aviso tom="atencao" className="mb-4">
            A lista mostra as primeiras {LIMITE_DESPESAS_DEMONSTRATIVO} de {contagem(despesas.quantidade, "despesa", "despesas")}.
            O total abaixo conta todas.
          </Aviso>
        )}
        {despesas.lista.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Nenhuma despesa lançada neste mês.
          </p>
        ) : (
          <div className="moldura-tabela">
            <table className="tabela-atas min-w-[640px]">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Quem pagou</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {despesas.lista.map((d) => (
                  <tr key={d.id}>
                    <td className="numero align-top text-[13.5px]">{diaTexto(d.data)}</td>
                    <td className="align-top">
                      <span className="titulo-linha">{d.descricao}</span>
                    </td>
                    <td className="align-top text-[13.5px]">{d.categoria ?? "—"}</td>
                    <td className="align-top text-[13.5px]">{d.pagaPorNome ?? "—"}</td>
                    <td className="numero align-top text-[15px] font-extrabold" style={{ color: "var(--cor-texto)" }}>
                      {formatarReais(d.centavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="font-bold" style={{ color: "var(--cor-texto)" }} colSpan={4}>
                    Total ({contagem(despesas.quantidade, "despesa", "despesas")})
                  </td>
                  <td className="numero text-[15px] font-extrabold" style={{ color: "var(--cor-texto)" }}>
                    {formatarReais(despesas.centavos)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Secao>

      <Secao
        titulo="Resultado e partilha"
        descricao="Resultado do mês (receita recebida menos despesas) dividido pelos percentuais de participação vigentes."
      >
        <QuadroPartilha partilha={partilha} />
      </Secao>

      <p className="mt-2 border-t pt-3 text-xs" style={{ borderColor: "var(--cor-borda)", color: "var(--cor-texto-3)" }}>
        Demonstrativo gerencial, sem valor fiscal. Emitido em {emitidoEm} (horário de Brasília).
      </p>
    </AppShell>
  );
}
