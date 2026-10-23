import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { contagem } from "@/lib/acompanhamento-view";
import { carregarIndicadoresSemanais } from "@/lib/indicadores-db";
import { escolherSemana, fotoExata, rotuloSemana } from "@/lib/indicadores-semanais";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { FaixaIndicadores } from "./faixa-indicadores";
import { NotasIndicadores } from "./notas-indicadores";
import { SeletorSemana } from "./seletor-semana";
import { TabelaConsultores } from "./tabela-consultores";

export const dynamic = "force-dynamic";

/**
 * Indicadores semanais da operação comercial (Projeto RNA, etapa 6,
 * 2026-10-23): contatos, municípios em negociação, adesões e comissão, no
 * total e por consultor, de segunda a domingo (Brasília), sempre comparados
 * com a semana anterior. A semana vem de ?semana=AAAA-MM-DD, lida e validada
 * no servidor. Só leitura: nada aqui grava dado de negócio. Sem metas: o
 * dono do produto ainda não definiu números-alvo.
 */
export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const { semana: semanaDaUrl } = await searchParams;
  const agora = new Date();
  const { semana, erro } = escolherSemana(semanaDaUrl, agora);

  // Mesma expiração "preguiçosa" das telas do Kanban: negociação com prazo vencido não conta como em andamento.
  await expirarOportunidadesVencidas(agora);
  const resumo = await carregarIndicadoresSemanais(semana);
  const exata = fotoExata(semana, agora);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-7xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Operação"
        titulo="Indicadores"
        destaque="da semana"
        descricao="Contatos, negociações, adesões e comissão de cada consultor, de segunda a domingo, comparados com a semana anterior."
      />

      {erro && <Aviso tom="atencao">{erro}</Aviso>}

      <SeletorSemana semana={semana} agora={agora} />

      <FaixaIndicadores linha={resumo.total} fotoExata={exata} />

      {resumo.liquidacoesSemPercentual > 0 && (
        <Aviso tom="atencao" titulo="Comissão incompleta.">
          {contagem(resumo.liquidacoesSemPercentual, "liquidação", "liquidações")} com data de liquidação ou de recebimento nesta semana{" "}
          {resumo.liquidacoesSemPercentual === 1 ? "pertence" : "pertencem"} a negociações sem percentual de comissão e
          não {resumo.liquidacoesSemPercentual === 1 ? "entrou" : "entraram"} na conta.
        </Aviso>
      )}

      <Secao
        titulo="Por consultor"
        descricao={`Semana de ${rotuloSemana(semana)}. Sob cada número, a semana anterior (ant.) e a variação.`}
        destaque
      >
        <TabelaConsultores consultores={resumo.consultores} total={resumo.total} fotoExata={exata} />
      </Secao>

      <NotasIndicadores />
    </AppShell>
  );
}
