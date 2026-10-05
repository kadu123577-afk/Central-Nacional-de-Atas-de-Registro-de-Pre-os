import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alternarStatusPontoFocal, confirmarContatoAdmin, logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { haQuantoTempo } from "@/lib/kanban-view";

export const dynamic = "force-dynamic";

/**
 * Fila de revisão de contatos (fase 2 de design, 2026-10-05): o vendedor
 * marca "contato errado" no dossiê do município e o contato deixa de ser
 * sugerido como decisor. Aqui o admin decide: manter (contato válido),
 * corrigir (abre a edição) ou desativar.
 */
export default async function ContatosRevisaoPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const contatos = await prisma.pontoFocal.findMany({
    where: { contatoErradoEm: { not: null }, ativo: true },
    include: { entidadeAlvo: true },
    orderBy: { contatoErradoEm: "desc" },
  });

  const vendedorIds = [...new Set(contatos.map((c) => c.contatoErradoPorId).filter((v): v is string => !!v))];
  const vendedores = vendedorIds.length
    ? await prisma.vendedor.findMany({ where: { id: { in: vendedorIds } }, select: { id: true, nome: true } })
    : [];
  const nomeVendedor = new Map(vendedores.map((v) => [v.id, v.nome]));

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
      <div>
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          Revisão de contatos
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Contatos que um vendedor marcou como errados. Enquanto estiverem aqui, não são sugeridos como decisor
          principal.
        </p>
      </div>

      <Secao titulo={`Aguardando revisão (${contatos.length})`}>
        {contatos.length === 0 ? (
          <VazioComAcao
            titulo="Nenhum contato para revisar"
            descricao="Quando um vendedor marcar um contato como errado, ele aparece aqui."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {contatos.map((c) => (
              <li key={c.id} className="painel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                      {c.nomeContato}{" "}
                      <span style={{ color: "var(--cor-texto-3)", fontWeight: 400 }}>— {c.cargo}</span>
                    </p>
                    <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      <Link href={`/admin/entidades/${c.entidadeAlvoId}`} className="underline">
                        {c.entidadeAlvo.nome}
                        {c.entidadeAlvo.uf ? ` / ${c.entidadeAlvo.uf}` : ""}
                      </Link>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-2)" }}>
                      {c.telefone ?? "sem telefone"} · {c.email ?? "sem e-mail"}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Marcado {c.contatoErradoEm ? haQuantoTempo(c.contatoErradoEm.toISOString()) : ""} por{" "}
                      {(c.contatoErradoPorId && nomeVendedor.get(c.contatoErradoPorId)) || "vendedor"}
                      {c.contatoErradoMotivo ? ` — “${c.contatoErradoMotivo}”` : ""}
                    </p>
                  </div>
                  <Badge tom="critico">Errado?</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={confirmarContatoAdmin}>
                    <input type="hidden" name="pontoFocalId" value={c.id} />
                    <button type="submit" className="botao-atas secundario">
                      Manter (contato válido)
                    </button>
                  </form>
                  <Link href={`/admin/entidades/${c.entidadeAlvoId}/contatos/${c.id}`} className="botao-atas">
                    Corrigir
                  </Link>
                  <form action={alternarStatusPontoFocal}>
                    <input type="hidden" name="pontoFocalId" value={c.id} />
                    <button type="submit" className="botao-atas critico">
                      Desativar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
