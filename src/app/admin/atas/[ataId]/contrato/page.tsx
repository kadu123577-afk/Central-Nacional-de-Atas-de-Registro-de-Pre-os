import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../../../actions";
import { NAV_ADMIN } from "../../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { FormularioContrato } from "./formulario";

export const dynamic = "force-dynamic";

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

  const { ataId } = await params;
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: { fornecedor: true, contrato: true },
  });
  if (!ata) notFound();

  const contrato = ata.contrato;

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
            Contrato de intermediação — Ata {ata.numero}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.fornecedor.razaoSocial} · {ata.objeto}
          </p>
        </div>
        <Link href="/admin" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <Secao titulo={contrato ? "Contrato cadastrado" : "Cadastrar contrato"}>
        <p className="mb-3 text-xs" style={{ color: "var(--cor-texto-3)" }}>
          Sem contrato cadastrado, nenhum vendedor consegue marcar um município como &quot;Aderiu&quot; nesta ata. O
          percentual é o pactuado com o fornecedor — o vendedor não o digita.
        </p>
        <FormularioContrato
          ataId={ata.id}
          percentualAtual={contrato ? String(Number((Number(contrato.percentualComissao) * 100).toFixed(2))).replace(".", ",") : ""}
          dataAssinaturaAtual={paraInputData(contrato?.dataAssinatura ?? null)}
          vigenciaFimAtual={paraInputData(contrato?.vigenciaFim ?? null)}
          observacoesAtuais={contrato?.observacoes ?? ""}
        />
      </Secao>
    </AppShell>
  );
}
