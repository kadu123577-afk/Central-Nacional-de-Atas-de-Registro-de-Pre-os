import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { bloqueioDaAcao, situacaoDoCiclo } from "@/lib/ciclo-ata";
import { carregarAtaNoCiclo } from "@/lib/ciclo-ata-db";
import { temAlguma } from "@/lib/permissoes";
import { exigirPermissaoDe, permissoesDoAdmin } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../../../actions";
import { NAV_ADMIN } from "../../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { FormularioContrato } from "./formulario";
import { montarSugestaoContrato } from "./sugestao";

export const dynamic = "force-dynamic";

/**
 * Faixas ativas de comissão sugerida. A sugestão é um complemento: se a
 * consulta falhar, o contrato continua podendo ser cadastrado à mão, e a tela
 * avisa que a sugestão não está disponível em vez de fingir que não há faixas.
 */
async function carregarFaixasAtivas() {
  try {
    const linhas = await prisma.faixaComissao.findMany({
      where: { ativo: true },
      select: { valorMinimo: true, percentual: true },
    });
    return {
      faixas: linhas.map((l) => ({ valorMinimo: Number(l.valorMinimo), percentual: Number(l.percentual) })),
      falhou: false,
    };
  } catch (erro) {
    console.error("Falha ao consultar as faixas de comissão sugerida:", erro);
    return { faixas: [], falhou: true };
  }
}

function paraInputData(data: Date | null): string {
  return data ? data.toISOString().slice(0, 10) : "";
}

/**
 * Contrato de intermediação da ata (2026-10-04) — pré-requisito pra o
 * vendedor negociar a ata com qualquer município (Projeto RNA §2: nenhuma
 * aproximação sem contrato firmado com o fornecedor).
 */
export default async function ContratoAtaPage({ params }: { params: Promise<{ ataId: string }> }) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "atas.contrato");

  const { ataId } = await params;
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: {
      fornecedor: true,
      contrato: true,
      itens: { select: { quantidadeRegistrada: true, valorUnitario: true } },
    },
  });
  if (!ata) notFound();

  const contrato = ata.contrato;
  // O contrato (etapa 4) só abre depois da empresa fechada (2) e dos itens e saldos cadastrados (3).
  const noCiclo = await carregarAtaNoCiclo(ata.id);
  const bloqueio = noCiclo ? bloqueioDaAcao("contrato", noCiclo.dados) : null;
  // O que vem depois do contrato: a conformidade (etapa 5), que, concluída, libera a ata. O botão só
  // aparece para quem pode agir nessa etapa.
  const permissoes = (await permissoesDoAdmin(adminId)) ?? [];
  const podeSeguir = temAlguma(permissoes, ["atas.conformidade"]);
  const proximaEtapa = noCiclo ? situacaoDoCiclo(noCiclo.dados).etapaAtual : null;
  const { faixas, falhou } = await carregarFaixasAtivas();
  const sugestao = montarSugestaoContrato({
    itens: ata.itens.map((i) => ({ quantidadeRegistrada: i.quantidadeRegistrada, valorUnitario: Number(i.valorUnitario) })),
    faixas,
    falhou,
  });

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
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
        titulo="Contrato de intermediação — Ata"
        destaque={ata.numero}
        descricao={
          <>
            <span className="font-semibold" style={{ color: "var(--cor-texto)" }}>
              {ata.fornecedor.razaoSocial}
            </span>{" "}
            · {ata.objeto}
          </>
        }
        voltar={{ href: "/admin", rotulo: "Painel" }}
      />

      {bloqueio && (
        <Aviso tom="atencao" titulo="O contrato ainda não pode ser cadastrado.">
          {bloqueio.mensagem}{" "}
          <Link href={bloqueio.etapa.caminho(ata.id)} className="font-semibold underline underline-offset-2">
            {bloqueio.etapa.acao}
          </Link>
        </Aviso>
      )}

      <Secao
        titulo={contrato ? "Contrato cadastrado" : "Cadastrar contrato"}
        destaque
        descricao={
          <>
            Sem contrato cadastrado, nenhum vendedor consegue marcar um município como &quot;Aderiu&quot; nesta ata. O
            percentual é o pactuado com o fornecedor — o vendedor não o digita.
          </>
        }
      >
        {bloqueio ? (
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            O formulário abre quando a etapa anterior estiver cumprida.
          </p>
        ) : (
          <FormularioContrato
            ataId={ata.id}
            percentualAtual={contrato ? String(Number((Number(contrato.percentualComissao) * 100).toFixed(2))).replace(".", ",") : ""}
            dataAssinaturaAtual={paraInputData(contrato?.dataAssinatura ?? null)}
            vigenciaFimAtual={paraInputData(contrato?.vigenciaFim ?? null)}
            observacoesAtuais={contrato?.observacoes ?? ""}
            sugestao={sugestao}
          />
        )}
      </Secao>

      {contrato && !bloqueio && (
        <Secao
          titulo="Próximo passo"
          descricao={
            proximaEtapa === 5
              ? "Contrato feito. Agora vem a conformidade da ata: o checklist jurídico. Concluída, a ata fica disponível para a equipe de vendas."
              : "Contrato feito. A ata já passou das etapas seguintes: veja a análise."
          }
        >
          {podeSeguir ? (
            <Link href={`/admin/atas/${ata.id}/analise`} className="botao-atas">
              {proximaEtapa === 5 ? "Fazer a conformidade da ata" : "Abrir a análise da ata"}
            </Link>
          ) : (
            <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
              A ata segue para quem faz a conformidade.
            </p>
          )}
        </Secao>
      )}
    </AppShell>
  );
}
