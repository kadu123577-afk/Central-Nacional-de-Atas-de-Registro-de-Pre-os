import Link from "next/link";
import { exigirAcessoFinanceiro } from "@/lib/acesso-financeiro";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { contagem } from "@/lib/acompanhamento-view";
import {
  formatarReais,
  hojeEmSaoPaulo,
  participacoesVigentesEm,
  ROTULO_TIPO_SOCIO,
  validarParticipacoes,
  type TipoSocio,
} from "@/lib/financeiro-scp";
import { carregarFinanceiroDoPeriodo, LIMITE_DESPESAS_LISTA } from "@/lib/financeiro-scp-db";
import { percentualDeFracao } from "@/lib/formato";
import { calcularPartilha, numerosDoPeriodo } from "./apuracao";
import { AvisosDaReceita } from "./avisos-periodo";
import { FormularioDivisao, type SocioDaDivisao } from "./formulario-divisao";
import { FormularioNovaDespesa, type OpcaoSocio } from "./formulario-nova-despesa";
import { FormularioNovoSocio } from "./formulario-novo-socio";
import { centavosParaCampo, diaCampo, diaTexto, escolherMes, fracaoParaCampo, rotuloDoMes, textoDoMes } from "./leitura";
import { LinhaDespesa, type DadosDespesa } from "./linha-despesa";
import { LinhaSocio, type DadosSocio } from "./linha-socio";
import { QuadroPartilha } from "./quadro-partilha";
import { SeletorMes } from "./seletor-mes";

export const dynamic = "force-dynamic";

const ROTA = "/admin/financeiro-scp";

/**
 * Financeiro da SCP (Projeto RNA, etapa 7, 2026-10-26): a receita é a comissão
 * efetivamente RECEBIDA no mês (lida das liquidações), as despesas são lançadas à
 * mão, e o resultado é partilhado entre os sócios segundo as participações
 * cadastradas. Só leitura para a receita; sócios, divisão da partilha e despesas
 * se editam aqui, com auditoria.
 *
 * ACESSO: exigirAcessoFinanceiro() é a PRIMEIRA chamada, antes de ler a URL e o
 * banco (sem sessão vai para /entrar; sem a permissão do financeiro responde 404;
 * sem 2FA vai para o perfil). REGRA DE OURO: nenhum dado real mora no código;
 * tudo vem do banco. O mês vem de ?mes=AAAA-MM, validado no servidor; mês inválido
 * cai no mês atual.
 */
export default async function FinanceiroScpPage({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  await exigirAcessoFinanceiro();

  const { mes: mesDaUrl } = await searchParams;
  const agora = new Date();
  const mes = escolherMes(mesDaUrl, agora);
  const hoje = hojeEmSaoPaulo(agora);
  const mesAtual = escolherMes(undefined, agora).texto;

  const financeiro = await carregarFinanceiroDoPeriodo(mes.periodo);
  const { socios, despesas, receita } = financeiro;
  const partilha = calcularPartilha(financeiro);
  const resultado = receita.centavos - despesas.centavos;

  // ---- sócios (para as tabelas e os formulários)
  const vigentesHoje = socios.flatMap((s) => participacoesVigentesEm(hoje, s.participacoes));
  const temParticipacao = socios.some((s) => s.participacoes.length > 0);
  const somaHoje = temParticipacao ? validarParticipacoes(vigentesHoje) : { ok: true as const };
  const rotuloTipo = (tipo: string) => ROTULO_TIPO_SOCIO[tipo as TipoSocio] ?? tipo;

  const sociosDaTabela: DadosSocio[] = socios.map((s) => {
    const emVigor = participacoesVigentesEm(hoje, s.participacoes)[0];
    return {
      id: s.id,
      nome: s.nome,
      tipoRotulo: rotuloTipo(s.tipo),
      ativo: s.ativo,
      participacaoHoje: emVigor ? percentualDeFracao(emVigor.percentual) : "—",
      historico: [...s.participacoes].reverse().map((p) => ({
        percentual: percentualDeFracao(p.percentual),
        desde: diaTexto(p.vigenteDesde),
        ate: p.vigenteAte ? diaTexto(p.vigenteAte) : null,
      })),
    };
  });

  const sociosDaDivisao: SocioDaDivisao[] = socios
    .map((s) => ({ socio: s, emVigor: participacoesVigentesEm(hoje, s.participacoes)[0] }))
    // Inativo só entra se ainda tem participação em vigor (para poder tirá-lo da partilha).
    .filter(({ socio, emVigor }) => socio.ativo || emVigor)
    .map(({ socio, emVigor }) => ({
      id: socio.id,
      nome: socio.nome,
      tipoRotulo: rotuloTipo(socio.tipo),
      ativo: socio.ativo,
      percentualAtual: emVigor ? fracaoParaCampo(emVigor.percentual) : "",
    }));

  const opcoesQuemPagou: OpcaoSocio[] = socios.filter((s) => s.ativo).map((s) => ({ id: s.id, nome: s.nome }));

  const despesasDaTabela: DadosDespesa[] = despesas.lista.map((d) => ({
    id: d.id,
    dataTexto: diaTexto(d.data),
    dataCampo: diaCampo(d.data),
    descricao: d.descricao,
    categoria: d.categoria,
    valorTexto: formatarReais(d.centavos),
    valorCampo: centavosParaCampo(d.centavos),
    pagaPorSocioId: d.pagaPorSocioId,
    pagaPorNome: d.pagaPorNome,
  }));

  const rotulo = rotuloDoMes(mes.periodo);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-6xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Financeiro"
        titulo="Financeiro"
        destaque="da SCP"
        descricao="Comissões recebidas, despesas, resultado e partilha entre os sócios, mês a mês."
        acoes={
          <Link href={`${ROTA}/demonstrativo?mes=${textoDoMes(mes.periodo)}`} className="botao-atas secundario">
            Demonstrativo imprimível
          </Link>
        }
      />

      <Aviso tom="atencao" titulo="Área restrita.">
        Os dados desta tela ficam somente no banco.
      </Aviso>

      {mes.erro && <Aviso tom="atencao">{mes.erro}</Aviso>}

      <SeletorMes rota={ROTA} periodo={mes.periodo} mesAtual={mesAtual} />

      <AvisosDaReceita receita={receita} />

      <FaixaNumeros itens={numerosDoPeriodo(financeiro)} />

      <Secao
        titulo="Partilha do período"
        destaque
        descricao={`Resultado de ${rotulo} (receita recebida menos despesas), dividido pelos percentuais de participação vigentes. Se houver prejuízo, ele é repartido pelos mesmos percentuais.`}
      >
        {partilha.situacao === "ok" && resultado < 0 && (
          <Aviso tom="atencao" titulo="Prejuízo no período." className="mb-4">
            As despesas passaram da receita recebida em {formatarReais(-resultado)}.
          </Aviso>
        )}
        <QuadroPartilha partilha={partilha} />
      </Secao>

      <Secao
        titulo="Despesas do período"
        descricao={`Lançadas à mão, com data em ${rotulo}. A receita não se lança: é a comissão recebida.`}
      >
        <div className="flex flex-col gap-4">
          {despesas.listaTruncada && (
            <Aviso tom="info">
              Mostrando as primeiras {LIMITE_DESPESAS_LISTA} de {contagem(despesas.quantidade, "despesa", "despesas")} do
              período. Os totais acima contam todas.
            </Aviso>
          )}
          {despesasDaTabela.length === 0 ? (
            <VazioComAcao
              titulo="Nenhuma despesa neste mês"
              descricao="Lance a primeira no formulário abaixo. O resultado do mês é a receita recebida menos as despesas lançadas."
            />
          ) : (
            <div className="moldura-tabela">
              <table className="tabela-atas min-w-[900px]">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Valor</th>
                    <th>Quem pagou</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {despesasDaTabela.map((d) => (
                    <LinhaDespesa key={d.id} despesa={d} socios={opcoesQuemPagou} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Secao>

      <Secao titulo="Nova despesa" descricao="O valor é em reais, com vírgula nos centavos. A data decide em que mês a despesa conta.">
        <FormularioNovaDespesa socios={opcoesQuemPagou} hoje={diaCampo(hoje)} />
      </Secao>

      <Secao
        titulo="Sócios e participações"
        descricao="A sócia ostensiva e os sócios participantes. Quem tem participação ou despesa registrada não pode ser removido, só desativado."
      >
        <div className="flex flex-col gap-4">
          {!somaHoje.ok && (
            <Aviso tom="atencao" titulo="As participações de hoje não fecham.">
              {somaHoje.erro}
            </Aviso>
          )}
          {sociosDaTabela.length === 0 ? (
            <VazioComAcao
              titulo="Nenhum sócio cadastrado"
              descricao="Cadastre os sócios e as participações para ver a partilha. Comece pelo formulário de novo sócio, abaixo."
            />
          ) : (
            <div className="moldura-tabela">
              <table className="tabela-atas min-w-[780px]">
                <thead>
                  <tr>
                    <th>Sócio</th>
                    <th>Tipo</th>
                    <th>Situação</th>
                    <th>Participação hoje</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sociosDaTabela.map((s) => (
                    <LinhaSocio key={s.id} socio={s} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Secao>

      <Secao
        titulo="Divisão da partilha"
        descricao="A partir de uma data, o percentual de cada sócio. A soma tem de dar 100%. Quem muda tem a participação anterior encerrada no dia anterior à data; o histórico fica guardado. Deixe em branco quem sai da partilha."
      >
        <FormularioDivisao socios={sociosDaDivisao} hoje={diaCampo(hoje)} />
      </Secao>

      <Secao titulo="Novo sócio" descricao="Só o nome e o tipo: o sistema não guarda documento nem contato de sócio.">
        <FormularioNovoSocio />
      </Secao>
    </AppShell>
  );
}
