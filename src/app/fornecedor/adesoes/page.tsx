import Link from "next/link";
import { redirect } from "next/navigation";
import { fornecedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROTULO_ESTAGIO } from "@/lib/adesao";
import { tomEstagioAdesao } from "@/lib/severidade";
import { logoutFornecedor } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
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
        { rotulo: "Nova ata", href: "/fornecedor/atas/nova" },
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
      <div>
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          Pedidos de adesão recebidos
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Pedidos de órgãos públicos pra itens das suas atas.
        </p>
      </div>

      {adesoes.length === 0 ? (
        <VazioComAcao
          titulo="Nenhum pedido ainda"
          descricao="Quando um órgão pedir adesão a um item de uma das suas atas, aparece aqui."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela-atas">
            <thead>
              <tr>
                <th>Órgão solicitante</th>
                <th>Ata / item</th>
                <th>Estágio</th>
                <th>Pedido em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adesoes.map((adesao) => (
                <tr key={adesao.id}>
                  <td>{adesao.orgaoAderente.nome}</td>
                  <td>
                    Ata {adesao.item.ata.numero} — {adesao.item.descricao}
                  </td>
                  <td>
                    <Badge tom={tomEstagioAdesao(adesao.estagio)}>
                      {ROTULO_ESTAGIO[adesao.estagio]}
                    </Badge>
                  </td>
                  <td>{new Date(adesao.createdAt).toLocaleDateString("pt-BR")}</td>
                  <td>
                    <Link href={`/adesoes/${adesao.id}`} className="botao-atas link">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm" style={{ color: "var(--cor-texto-2)" }}>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={`/fornecedor/adesoes?pagina=${pagina - 1}`} className="botao-atas secundario">
                Anterior
              </Link>
            )}
            {pagina < totalPaginas && (
              <Link href={`/fornecedor/adesoes?pagina=${pagina + 1}`} className="botao-atas secundario">
                Próxima
              </Link>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
