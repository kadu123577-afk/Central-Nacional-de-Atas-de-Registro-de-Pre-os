import Link from "next/link";
import { redirect } from "next/navigation";
import { fornecedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROTULO_ESTAGIO } from "@/lib/adesao";
import { tomEstagioAdesao } from "@/lib/severidade";
import { logoutFornecedor } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";

export const dynamic = "force-dynamic";

const POR_PAGINA = 20;

export default async function AdesoesFornecedorPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const fornecedorId = await fornecedorIdLogado();
  if (!fornecedorId) {
    redirect("/fornecedor/login");
  }

  const { pagina: paginaStr } = await searchParams;
  const pagina = Math.max(1, Number(paginaStr) || 1);

  const where = { item: { ata: { fornecedorId } } };

  const [total, adesoes] = await Promise.all([
    prisma.adesao.count({ where }),
    prisma.adesao.findMany({
      where,
      include: { item: { include: { ata: true } }, orgaoAderente: true },
      orderBy: { createdAt: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <AppShell
      area="Fornecedor"
      itens={[
        { rotulo: "Minhas atas", href: "/fornecedor" },
        { rotulo: "Pedidos recebidos", href: "/fornecedor/adesoes" },
        { rotulo: "Perfil", href: "/fornecedor/perfil" },
      ]}
      rodape={
        <form action={logoutFornecedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Painel do fornecedor"
        titulo="Pedidos de adesão"
        destaque="recebidos"
        descricao="Pedidos de órgãos públicos pra itens das suas atas."
      />

      {adesoes.length === 0 ? (
        <VazioComAcao
          titulo="Nenhum pedido ainda"
          descricao="Quando um órgão pedir adesão a um item de uma das suas atas, aparece aqui."
        />
      ) : (
        <div className="painel overflow-x-auto">
          <table className="tabela-atas min-w-[760px]">
            <thead>
              <tr>
                <th>Órgão solicitante</th>
                <th className="w-[64px]">UF</th>
                <th>Ata / item</th>
                <th>Estágio</th>
                <th>Pedido em</th>
                <th className="w-[1%]"></th>
              </tr>
            </thead>
            <tbody>
              {adesoes.map((adesao) => (
                <tr key={adesao.id}>
                  <td>
                    <span className="titulo-linha block">{adesao.orgaoAderente.nome}</span>
                    <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      {adesao.orgaoAderente.municipio}
                    </span>
                  </td>
                  <td>
                    <span className="selo-uf">{adesao.orgaoAderente.uf}</span>
                  </td>
                  <td>
                    <span className="block font-semibold" style={{ color: "var(--cor-texto)" }}>
                      {adesao.item.descricao}
                    </span>
                    <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Ata <span className="codigo">Nº {adesao.item.ata.numero}</span>
                    </span>
                  </td>
                  <td>
                    <Badge tom={tomEstagioAdesao(adesao.estagio)}>{ROTULO_ESTAGIO[adesao.estagio]}</Badge>
                  </td>
                  <td className="numero whitespace-nowrap" style={{ color: "var(--cor-texto)" }}>
                    {new Date(adesao.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/adesoes/${adesao.id}`} className="botao-atas link">
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]" style={{ color: "var(--cor-texto-3)" }}>
          <span>
            Página <b className="numero" style={{ color: "var(--cor-texto)" }}>{pagina}</b> de{" "}
            <b className="numero" style={{ color: "var(--cor-texto)" }}>{totalPaginas}</b>
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={`/fornecedor/adesoes?pagina=${pagina - 1}`} className="botao-atas secundario">
                ← Anterior
              </Link>
            )}
            {pagina < totalPaginas && (
              <Link href={`/fornecedor/adesoes?pagina=${pagina + 1}`} className="botao-atas secundario">
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
