import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alternarStatusEntidadeAlvo, alternarStatusPontoFocal, logoutAdmin } from "../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { ROTULO_TIPO_ENTIDADE } from "@/lib/entidades-alvo";
import { FormularioNovoContato } from "./formulario";

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

export default async function DetalheEntidadeAlvoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const entidade = await prisma.entidadeAlvo.findUnique({
    where: { id },
    include: {
      contatos: {
        orderBy: [{ cargo: "asc" }, { nomeContato: "asc" }],
        include: { _count: { select: { interacoes: true } } },
      },
    },
  });

  if (!entidade) {
    notFound();
  }

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
            {entidade.nome}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ROTULO_TIPO_ENTIDADE[entidade.tipo] ?? entidade.tipo}
            {entidade.esfera ? ` · ${entidade.esfera}` : ""}
            {entidade.uf ? ` · ${entidade.uf}` : ""}
            {entidade.municipio ? ` · ${entidade.municipio}` : ""}
          </p>
        </div>
        <Link href="/admin/entidades" className="botao-atas link">
          ← Municípios/Entidades
        </Link>
      </div>

      <Secao
        titulo="Dados"
        acao={
          <div className="flex items-center gap-3">
            <Badge tom={entidade.ativo ? "neutro" : "critico"}>
              {entidade.ativo ? "Ativa" : "Inativa"}
            </Badge>
            <form action={alternarStatusEntidadeAlvo}>
              <input type="hidden" name="entidadeAlvoId" value={entidade.id} />
              <button
                type="submit"
                className={entidade.ativo ? "botao-atas critico" : "botao-atas secundario"}
              >
                {entidade.ativo ? "Desativar" : "Reativar"}
              </button>
            </form>
          </div>
        }
      >
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Endereço: {entidade.endereco ?? "—"}
        </p>
      </Secao>

      <FormularioNovoContato entidadeAlvoId={entidade.id} />

      <Secao titulo={`Contatos (${entidade.contatos.length})`}>
        {entidade.contatos.length === 0 ? (
          <VazioComAcao
            titulo="Nenhum contato cadastrado"
            descricao="Cadastre o prefeito, cada secretário ou um intermediário usando o formulário acima."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {entidade.contatos.map((c) => (
              <li key={c.id} className="painel p-4">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/admin/entidades/${entidade.id}/contatos/${c.id}`}>
                    <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                      {c.nomeContato} — {c.cargo}
                      {c.area ? ` (${c.area})` : ""}
                    </p>
                    <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      {c.telefone ?? "sem telefone"} · {c.email ?? "sem e-mail"} · {c._count.interacoes}{" "}
                      {c._count.interacoes === 1 ? "interação" : "interações"}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge tom={c.ativo ? "neutro" : "critico"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                    <form action={alternarStatusPontoFocal}>
                      <input type="hidden" name="pontoFocalId" value={c.id} />
                      <button
                        type="submit"
                        className={c.ativo ? "botao-atas critico" : "botao-atas secundario"}
                      >
                        {c.ativo ? "Desativar" : "Reativar"}
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
