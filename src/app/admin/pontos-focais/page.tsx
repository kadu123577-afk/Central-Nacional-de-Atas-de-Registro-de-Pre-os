import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FormularioNovoPontoFocal } from "./formulario";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Pontos focais", href: "/admin/pontos-focais" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

export default async function PontosFocaisPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const pontosFocais = await prisma.pontoFocal.findMany({
    orderBy: [{ esfera: "asc" }, { uf: "asc" }, { nomeContato: "asc" }],
    include: { _count: { select: { interacoes: true } } },
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
            Pontos focais
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Cadastro interno de contato por esfera, UF e município — uso restrito ao
            admin, nunca visível para fornecedor ou órgão.
          </p>
        </div>
        <Link href="/admin" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <FormularioNovoPontoFocal />

      <Secao titulo={`Cadastrados (${pontosFocais.length})`}>
        {pontosFocais.length === 0 ? (
          <div className="mt-3">
            <VazioComAcao
              titulo="Nenhum ponto focal cadastrado"
              descricao="Use o formulário acima para registrar o primeiro contato."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {pontosFocais.map((p) => (
              <li key={p.id} className="painel p-4">
                <Link href={`/admin/pontos-focais/${p.id}`} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                      {p.nomeContato} — {p.cargo}
                    </p>
                    <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      {p.esfera}
                      {p.uf ? ` · ${p.uf}` : ""}
                      {p.municipio ? ` · ${p.municipio}` : ""} · {p._count.interacoes}{" "}
                      {p._count.interacoes === 1 ? "interação" : "interações"}
                    </p>
                  </div>
                  <Badge tom={p.ativo ? "neutro" : "critico"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
