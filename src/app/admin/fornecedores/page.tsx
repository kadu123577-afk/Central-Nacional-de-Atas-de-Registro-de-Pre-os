import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { corDaCategoria } from "@/lib/categorias";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
  { rotulo: "Municípios/Entidades", href: "/admin/entidades" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

/**
 * Catálogo interno de fornecedores (2026-09-05) — diferente de
 * `/admin/usuarios`, que só lista ativo/desativado. Aqui o time comercial
 * vê, por fornecedor, o que ele realmente fornece (quais categorias, quais
 * atas, quantos itens) — é o "quem são os fornecedores, o que eles estão
 * fornecendo" pedido nas notas de voz.
 */
export default async function FornecedoresPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const fornecedores = await prisma.fornecedor.findMany({
    orderBy: { razaoSocial: "asc" },
    include: {
      atas: {
        where: { status: "APROVADA" },
        include: { itens: true, orgaoGerenciador: true },
      },
    },
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Fornecedores
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            O que cada fornecedor realmente tem pra oferecer — categorias, atas aprovadas e
            UFs onde ele já tem ata gerenciadora.
          </p>
        </div>
        <Link href="/admin" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <Secao titulo={`Cadastrados (${fornecedores.length})`}>
        {fornecedores.length === 0 ? (
          <VazioComAcao titulo="Nenhum fornecedor cadastrado" descricao="" />
        ) : (
          <ul className="flex flex-col gap-2">
            {fornecedores.map((f) => {
              const categorias = new Set<string>();
              const ufs = new Set<string>();
              let totalItens = 0;
              for (const ata of f.atas) {
                if (ata.categoria) categorias.add(ata.categoria);
                ufs.add(ata.orgaoGerenciador.uf);
                totalItens += ata.itens.length;
              }

              return (
                <li key={f.id} className="painel p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                      {f.razaoSocial}
                    </p>
                    <Badge tom={f.ativo ? "neutro" : "critico"}>
                      {f.ativo ? "Ativo" : "Desativado"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {f.cnpj} · {f.email} · {f.atas.length}{" "}
                    {f.atas.length === 1 ? "ata aprovada" : "atas aprovadas"} · {totalItens}{" "}
                    {totalItens === 1 ? "item" : "itens"}
                  </p>

                  {categorias.size > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[...categorias].map((c) => (
                        <span
                          key={c}
                          className="eyebrow rounded-full border px-2.5 py-0.5"
                          style={{ borderColor: corDaCategoria(c), color: corDaCategoria(c) }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {ufs.size > 0 && (
                    <p className="mt-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      UFs com ata gerenciadora: {[...ufs].sort().join(", ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
