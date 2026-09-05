import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { limitePorOrgao, saldoAgregadoDisponivel } from "@/lib/saldo";
import { Badge } from "@/components/ui/badge";
import { Secao } from "@/components/ui/secao";
import { Numero } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { tomStatusAta } from "@/lib/severidade";

// Depende sempre de dados atuais do banco — nunca pré-renderizar em build.
export const dynamic = "force-dynamic";

interface FiltrosAtas {
  objeto?: string;
  municipio?: string;
}

/**
 * Cadastro interno de atas — mostra TODO status (inclusive PENDENTE e
 * REJEITADA, que não têm nada a ver com o catálogo público) com dado
 * completo de fornecedor e órgão. Achado da revisão de telas de
 * 2026-09-04 (prompt 3): esta página não tinha nenhum guard de
 * autenticação, embora o cadastro (`/atas/nova`) já tivesse sido
 * desativado antes por essa mesma razão. Trava aqui também, atrás do
 * login de admin — não é fluxo de fornecedor nem de órgão.
 *
 * Filtro por objeto + cidade (2026-09-05) — pedido explícito pra
 * conseguir enxergar, entre TODAS as atas (qualquer status/origem), só as
 * de um objeto específico numa cidade específica. Filtra pelo texto livre
 * de `Ata.objeto` e por `Orgao.municipio` do órgão gerenciador — não é o
 * mesmo filtro do catálogo público (que só mostra atas aprovadas e
 * vigentes, e filtra por UF, não por município).
 */
export default async function AtasPage({
  searchParams,
}: {
  searchParams: Promise<FiltrosAtas>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const filtros = await searchParams;
  const objeto = filtros.objeto?.trim() ?? "";
  const municipio = filtros.municipio?.trim() ?? "";

  const where: Prisma.AtaWhereInput = {
    ...(objeto ? { objeto: { contains: objeto, mode: "insensitive" } } : {}),
    ...(municipio
      ? { orgaoGerenciador: { municipio: { contains: municipio, mode: "insensitive" } } }
      : {}),
  };

  const atas = await prisma.ata.findMany({
    where,
    include: {
      fornecedor: true,
      orgaoGerenciador: true,
      itens: { include: { saldo: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          Atas cadastradas
        </h1>
        <Link href="/atas/nova" className="botao-atas">
          Nova ata
        </Link>
      </div>

      <Secao titulo="Filtrar">
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            name="objeto"
            defaultValue={objeto}
            placeholder="Objeto da ata (ex.: material hospitalar)"
            className="campo-atas sm:col-span-2"
          />
          <input name="municipio" defaultValue={municipio} placeholder="Cidade" className="campo-atas" />
          <button type="submit" className="botao-atas sm:col-span-3">
            Filtrar
          </button>
        </form>
      </Secao>

      {atas.length === 0 ? (
        <VazioComAcao
          titulo={objeto || municipio ? "Nenhuma ata bate com esse filtro" : "Nenhuma ata cadastrada ainda"}
          descricao={
            objeto || municipio
              ? "Ajuste o objeto ou a cidade buscada."
              : "Comece pela primeira ata — fornecedor, órgão gerenciador e ao menos um item."
          }
          acao={
            !objeto && !municipio ? (
              <Link href="/atas/nova" className="botao-atas">
                Cadastrar ata
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {atas.map((ata) => (
            <Secao
              key={ata.id}
              titulo={`Ata ${ata.numero} — ${ata.fornecedor.razaoSocial}`}
              acao={<Badge tom={tomStatusAta(ata.status)}>{ata.status}</Badge>}
            >
              <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                {ata.objeto}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                Órgão gerenciador: {ata.orgaoGerenciador.nome} — {ata.orgaoGerenciador.municipio}/
                {ata.orgaoGerenciador.uf}
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="tabela-atas">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qtd. registrada</th>
                      <th>Limite por órgão (50%)</th>
                      <th>Saldo agregado disponível</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ata.itens.map((item) => (
                      <tr key={item.id}>
                        <td>{item.descricao}</td>
                        <td>
                          <Numero>
                            {item.quantidadeRegistrada} {item.unidade}
                          </Numero>
                        </td>
                        <td>
                          <Numero>{limitePorOrgao(item.quantidadeRegistrada)}</Numero>
                        </td>
                        <td>
                          <Numero>
                            {saldoAgregadoDisponivel(
                              item.quantidadeRegistrada,
                              item.saldo?.quantidadeConsumida ?? 0,
                            )}
                          </Numero>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Secao>
          ))}
        </ul>
      )}
    </main>
  );
}
