import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin, rejeitarAta } from "../../../actions";
import { NAV_ADMIN } from "../../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { alertasAutomaticos, type RespostasConformidade } from "@/lib/conformidade";
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
