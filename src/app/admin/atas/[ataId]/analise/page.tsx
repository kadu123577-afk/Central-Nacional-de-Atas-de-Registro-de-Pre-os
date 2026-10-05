import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin, rejeitarAta } from "../../../actions";
import { NAV_ADMIN } from "../../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { ITENS_CONFORMIDADE, alertasAutomaticos, type RespostasConformidade } from "@/lib/conformidade";
import { percentualDeFracao } from "@/lib/formato";
import { FormularioAnalise } from "./formulario";

export const dynamic = "force-dynamic";

const ROTULO_STATUS = { PENDENTE: "Pendente", APROVADA: "Aprovada", REJEITADA: "Rejeitada" } as const;

/**
 * Análise interna da ata (2026-10-04) — o gestor confere o checklist de
 * conformidade (SCP cl. 8), confirma o contrato de intermediação e só
 * então aprova. A ata só chega ao vendedor se estiver aprovada E com
 * contrato cadastrado.
 */
export default async function AnaliseAtaPage({ params }: { params: Promise<{ ataId: string }> }) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const { ataId } = await params;
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: {
      fornecedor: true,
      orgaoGerenciador: true,
      contrato: true,
      conformidade: true,
      documentos: { select: { id: true, nomeArquivo: true } },
      _count: { select: { itens: true } },
    },
  });
  if (!ata) notFound();

  const alertas = alertasAutomaticos({
    dataVigenciaFim: ata.dataVigenciaFim,
    itensCount: ata._count.itens,
    categoria: ata.categoria,
    documentosCount: ata.documentos.length,
  });
  if (!ata.contrato) {
    alertas.push("Sem contrato de intermediação — o vendedor não verá esta ata até o contrato ser cadastrado.");
  }

  const c = ata.conformidade;
  const respostasAtuais: RespostasConformidade = {
    fornecedorRegular: c?.fornecedorRegular ?? false,
    editalPermiteAdesao: c?.editalPermiteAdesao ?? false,
    limitesRespeitados: c?.limitesRespeitados ?? false,
    pesquisaPrecos: c?.pesquisaPrecos ?? false,
    anuenciaGerenciador: c?.anuenciaGerenciador ?? false,
    estimativaQuantidades: c?.estimativaQuantidades ?? false,
  };

  const totalItens = ITENS_CONFORMIDADE.length;
  const confirmados = ITENS_CONFORMIDADE.filter((i) => respostasAtuais[i.campo]).length;
  const pctConformidade = Math.round((confirmados / totalItens) * 100);
  // O vendedor só enxerga a ata aprovada E com contrato (portão do pool).
  const visivelAoVendedor = ata.status === "APROVADA" && Boolean(ata.contrato);

  return (
    <AppShell
      area="Administração"
      itens={NAV_ADMIN}
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Análise da ata {ata.numero}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.fornecedor.razaoSocial} · {ata.orgaoGerenciador.nome} ({ata.orgaoGerenciador.uf})
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.objeto}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tom={ata.status === "APROVADA" ? "marca" : "neutro"}>{ROTULO_STATUS[ata.status]}</Badge>
          <Link href="/admin" className="botao-atas link">
            ← Painel
          </Link>
        </div>
      </div>

      <div className="kb-kpis">
        <div className="kb-kpi">
          <p className="eyebrow">1 · Conformidade</p>
          <p
            className="kb-kpi-valor numero"
            style={{
              color:
                confirmados === totalItens ? "var(--cor-marca-clara)" : confirmados > 0 ? "var(--cor-atencao)" : undefined,
            }}
          >
            {confirmados}/{totalItens}
          </p>
          <p className="kb-kpi-nota">
            {confirmados === totalItens ? "checklist completo" : `${totalItens - confirmados} item(ns) a confirmar`}
          </p>
          <div className="kb-progresso">
            <div style={{ width: `${pctConformidade}%` }} />
          </div>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">2 · Contrato</p>
          <p className="kb-kpi-valor numero" style={{ color: ata.contrato ? "var(--cor-marca-clara)" : "var(--cor-alerta)" }}>
            {ata.contrato ? percentualDeFracao(Number(ata.contrato.percentualComissao)) : "Pendente"}
          </p>
          <p className="kb-kpi-nota">
            {ata.contrato ? "comissão pactuada com o fornecedor" : "sem contrato o vendedor não vê a ata"}
          </p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">3 · Aprovação</p>
          <p
            className="kb-kpi-valor"
            style={{ color: ata.status === "APROVADA" ? "var(--cor-marca-clara)" : ata.status === "REJEITADA" ? "var(--cor-critico)" : undefined }}
          >
            {ROTULO_STATUS[ata.status]}
          </p>
          <p className="kb-kpi-nota">
            {ata.status === "APROVADA" ? "liberada no catálogo público" : "só aparece no catálogo depois de aprovada"}
          </p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Visível ao vendedor</p>
          <p className="kb-kpi-valor" style={{ color: visivelAoVendedor ? "var(--cor-marca-clara)" : "var(--cor-atencao)" }}>
            {visivelAoVendedor ? "Sim" : "Não"}
          </p>
          <p className="kb-kpi-nota">
            {visivelAoVendedor ? "no pool de atas disponíveis" : "precisa estar aprovada e com contrato"}
          </p>
        </div>
      </div>

      {alertas.length > 0 && (
        <div
          className="rounded-[var(--raio)] border px-4 py-3 text-sm"
          style={{ borderColor: "var(--cor-atencao)", color: "var(--cor-texto)" }}
        >
          <p className="mb-1 font-medium">Alertas</p>
          <ul className="list-disc pl-5">
            {alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <Secao
        titulo="Contrato de intermediação"
        acao={
          <Link href={`/admin/atas/${ata.id}/contrato`} className="botao-atas secundario">
            {ata.contrato ? "Editar contrato" : "Cadastrar contrato"}
          </Link>
        }
      >
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          {ata.contrato
            ? `Comissão pactuada: ${String(Number((Number(ata.contrato.percentualComissao) * 100).toFixed(2))).replace(".", ",")}%`
            : "Nenhum contrato cadastrado."}
        </p>
      </Secao>

      <Secao titulo="Checklist de conformidade">
        {ata.documentos.length > 0 && (
          <p className="mb-3 text-xs" style={{ color: "var(--cor-texto-3)" }}>
            Documentos:{" "}
            {ata.documentos.map((d) => (
              <a
                key={d.id}
                href={`/api/documentos/${d.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-3 underline"
              >
                {d.nomeArquivo}
              </a>
            ))}
          </p>
        )}
        <FormularioAnalise ataId={ata.id} respostasAtuais={respostasAtuais} parecerAtual={c?.parecer ?? ""} />
        {ata.status !== "REJEITADA" && (
          <form action={rejeitarAta} className="mt-4">
            <input type="hidden" name="ataId" value={ata.id} />
            <button type="submit" className="botao-atas critico">
              Rejeitar ata
            </button>
          </form>
        )}
      </Secao>
    </AppShell>
  );
}
