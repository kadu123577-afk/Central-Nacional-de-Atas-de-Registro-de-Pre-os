import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../../../actions";
import { NAV_ADMIN } from "../../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { CATEGORIAS_ATAS, rotuloDaCategoria } from "@/lib/categorias";
import { FormularioAdicionarItem } from "../completar/formulario-item";
import { ImportarItens } from "./importar-itens";

export const dynamic = "force-dynamic";

/**
 * Itens e saldos da ata (2026-11-14), a tela do estagiário da captação (atividade 3 do
 * workflow): ver os itens já cadastrados, adicionar um item ou importar vários por planilha.
 * Exige "atas.captar".
 */
export default async function ItensDaAtaPage({ params }: { params: Promise<{ ataId: string }> }) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "atas.captar");

  const { ataId } = await params;
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: {
      orgaoGerenciador: { select: { nome: true } },
      itens: { orderBy: { descricao: "asc" } },
    },
  });
  if (!ata) notFound();

  const total = ata.itens.reduce((soma, i) => soma + Number(i.valorUnitario) * i.quantidadeRegistrada, 0);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-5xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Captação"
        titulo="Itens e saldos da ata"
        destaque={ata.numero}
        descricao={`${ata.orgaoGerenciador.nome} · ${ata.itens.length} item(ns) · valor total registrado R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        voltar={{ href: "/admin", rotulo: "Minhas tarefas" }}
      />

      <Secao titulo={`Itens cadastrados (${ata.itens.length})`}>
        {ata.itens.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Esta ata ainda não tem itens. Adicione um item abaixo ou importe a planilha.
          </p>
        ) : (
          <div className="moldura-tabela">
            <table className="tabela-atas min-w-[720px]">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Unidade</th>
                  <th>Quantidade</th>
                  <th>Valor unitário</th>
                  <th>Categoria</th>
                  <th>Código</th>
                </tr>
              </thead>
              <tbody>
                {ata.itens.map((i) => (
                  <tr key={i.id}>
                    <td className="align-top">
                      <span className="titulo-linha">{i.descricao}</span>
                      {i.marca && (
                        <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {i.marca}
                        </span>
                      )}
                    </td>
                    <td className="align-top">{i.unidade}</td>
                    <td className="numero align-top">{i.quantidadeRegistrada.toLocaleString("pt-BR")}</td>
                    <td className="numero align-top">
                      R$ {Number(i.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="align-top">{rotuloDaCategoria(i.categoria)}</td>
                    <td className="codigo align-top">{i.codigoCatalogo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao titulo="Importar itens por planilha" descricao="Para ata com muitos itens: confira antes de gravar. Se houver um erro, nada é gravado.">
        <ImportarItens ataId={ata.id} itensNaAta={ata.itens.length} />
      </Secao>

      <Secao titulo="Adicionar um item">
        <FormularioAdicionarItem ataId={ata.id} categorias={CATEGORIAS_ATAS} />
      </Secao>
    </AppShell>
  );
}
