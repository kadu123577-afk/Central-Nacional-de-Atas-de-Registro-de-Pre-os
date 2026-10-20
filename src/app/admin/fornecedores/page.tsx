import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { atualizarContatoTecnicoFornecedor, logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { SeloCategoria } from "@/components/ui/selo-categoria";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { rotuloDaCategoria } from "@/lib/categorias";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

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
      <CabecalhoPagina
        rotulo="Cadastros"
        titulo="Fornecedores"
        descricao="O que cada fornecedor realmente tem pra oferecer — categorias, atas aprovadas e UFs onde ele já tem ata gerenciadora."
        voltar={{ href: "/admin", rotulo: "Painel" }}
      />

      <Secao titulo={`Cadastrados (${fornecedores.length})`}>
        {fornecedores.length === 0 ? (
          <VazioComAcao titulo="Nenhum fornecedor cadastrado" descricao="" />
        ) : (
          <ul className="lista-linhas">
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
                <li key={f.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold" style={{ color: "var(--cor-texto)", letterSpacing: "-0.01em" }}>
                        {f.razaoSocial}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        <span className="codigo">{f.cnpj}</span> · {f.email} ·{" "}
                        <span className="numero">{f.atas.length}</span>{" "}
                        {f.atas.length === 1 ? "ata aprovada" : "atas aprovadas"} ·{" "}
                        <span className="numero">{totalItens}</span> {totalItens === 1 ? "item" : "itens"}
                      </p>
                    </div>
                    <Badge tom={f.ativo ? "neutro" : "critico"}>{f.ativo ? "Ativo" : "Desativado"}</Badge>
                  </div>

                  {categorias.size > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {[...categorias].map((c) => (
                        <SeloCategoria key={c} categoria={rotuloDaCategoria(c)} />
                      ))}
                    </div>
                  )}

                  {ufs.size > 0 && (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      UFs com ata gerenciadora:
                      {[...ufs].sort().map((uf) => (
                        <span key={uf} className="selo-uf">
                          {uf}
                        </span>
                      ))}
                    </p>
                  )}

                  <form
                    action={atualizarContatoTecnicoFornecedor}
                    className="flex flex-col gap-3 rounded-[var(--raio)] p-4 sm:flex-row sm:items-end"
                    style={{ background: "var(--cor-superficie-2)" }}
                  >
                    <input type="hidden" name="fornecedorId" value={f.id} />
                    <label className="block flex-1">
                      <span className="rotulo-campo">Contato técnico — nome</span>
                      <input
                        name="contatoTecnicoNome"
                        defaultValue={f.contatoTecnicoNome ?? ""}
                        className="campo-atas"
                      />
                    </label>
                    <label className="block flex-1">
                      <span className="rotulo-campo">Telefone</span>
                      <input
                        name="contatoTecnicoTelefone"
                        defaultValue={f.contatoTecnicoTelefone ?? ""}
                        className="campo-atas"
                      />
                    </label>
                    <label className="block flex-1">
                      <span className="rotulo-campo">E-mail</span>
                      <input
                        name="contatoTecnicoEmail"
                        type="email"
                        defaultValue={f.contatoTecnicoEmail ?? ""}
                        className="campo-atas"
                      />
                    </label>
                    <button type="submit" className="botao-atas secundario">
                      Salvar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
