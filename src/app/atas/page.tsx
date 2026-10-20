import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { limitePorOrgao, saldoAgregadoDisponivel } from "@/lib/saldo";
import { percentualSaldoItem } from "@/lib/vitrine";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { SeloCategoria } from "@/components/ui/selo-categoria";
import { Numero } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { tomStatusAta } from "@/lib/severidade";
import { ESFERAS_ORGAO } from "@/lib/esferas";
import { rotuloDaCategoria } from "@/lib/categorias";
import { logoutAdmin } from "@/app/admin/actions";
import { NAV_ADMIN } from "@/app/admin/nav";

// Depende sempre de dados atuais do banco — nunca pré-renderizar em build.
export const dynamic = "force-dynamic";

const ROTULO_STATUS = { PENDENTE: "Pendente", APROVADA: "Aprovada", REJEITADA: "Rejeitada" } as const;

interface FiltrosAtas {
  objeto?: string;
  municipio?: string;
  orgao?: string;
  esfera?: string;
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
 *
 * Banco de atas segmentado (2026-09-05) — filtro por esfera e por nome do
 * órgão, pra fatiar "só municipal", "só estadual" etc. e achar ministério/
 * secretaria específicos pelo nome (não são esfera, são tipo de órgão
 * dentro dela — daí o filtro de texto no nome, não um campo novo).
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
  const orgao = filtros.orgao?.trim() ?? "";
  const esfera = filtros.esfera?.trim() ?? "";

  const where: Prisma.AtaWhereInput = {
    ...(objeto ? { objeto: { contains: objeto, mode: "insensitive" } } : {}),
    ...(orgao || municipio || esfera
      ? {
          orgaoGerenciador: {
            ...(municipio ? { municipio: { contains: municipio, mode: "insensitive" } } : {}),
            ...(orgao ? { nome: { contains: orgao, mode: "insensitive" } } : {}),
            ...(esfera ? { esfera } : {}),
          },
        }
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

  const temFiltro = Boolean(objeto || municipio || orgao || esfera);

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
        rotulo="Operação"
        titulo="Atas"
        destaque="cadastradas"
        descricao={
          <>
            <span className="numero font-semibold" style={{ color: "var(--cor-texto)" }}>
              {atas.length}
            </span>{" "}
            {atas.length === 1 ? "ata" : "atas"}
            {temFiltro ? " no filtro atual" : ""}, de qualquer status e origem — inclusive pendentes e
            rejeitadas, que não aparecem no catálogo público.
          </>
        }
        acoes={
          <Link href="/admin/atas/nova" className="botao-atas">
            Nova ata
          </Link>
        }
      />

      <form className="painel grid grid-cols-2 gap-x-4 gap-y-3 p-5 lg:grid-cols-[1.6fr_1fr_1.3fr_1fr_auto] lg:items-end">
        <label className="col-span-2 lg:col-span-1">
          <span className="rotulo-campo">Objeto da ata</span>
          <input
            name="objeto"
            defaultValue={objeto}
            placeholder="Objeto da ata (ex.: material hospitalar)"
            className="campo-atas"
          />
        </label>
        <label>
          <span className="rotulo-campo">Cidade</span>
          <input name="municipio" defaultValue={municipio} placeholder="Cidade" className="campo-atas" />
        </label>
        <label>
          <span className="rotulo-campo">Órgão</span>
          <input
            name="orgao"
            defaultValue={orgao}
            placeholder="Nome do órgão (ex.: Ministério da Saúde)"
            className="campo-atas"
          />
        </label>
        <label className="col-span-2 lg:col-span-1">
          <span className="rotulo-campo">Esfera</span>
          <select name="esfera" defaultValue={esfera} className="campo-atas">
            <option value="">Qualquer esfera</option>
            {ESFERAS_ORGAO.map((e) => (
              <option key={e} value={e}>
                {e[0].toUpperCase() + e.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="botao-atas col-span-2 lg:col-span-1">
          Filtrar
        </button>
      </form>

      {atas.length === 0 ? (
        <VazioComAcao
          titulo={temFiltro ? "Nenhuma ata bate com esse filtro" : "Nenhuma ata cadastrada ainda"}
          descricao={
            temFiltro
              ? "Ajuste o objeto, a cidade, o órgão ou a esfera buscados."
              : "Comece pela primeira ata — fornecedor, órgão gerenciador e ao menos um item."
          }
          acao={
            !temFiltro ? (
              <Link href="/admin/atas/nova" className="botao-atas">
                Cadastrar ata
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-5">
          {atas.map((ata) => (
            <li key={ata.id}>
              <article className="painel p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="codigo text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Nº {ata.numero}
                    </p>
                    <h2
                      className="marca mt-1 text-[17px]"
                      style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.025em" }}
                    >
                      {ata.fornecedor.razaoSocial}
                    </h2>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
                      {ata.objeto}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Órgão gerenciador: {ata.orgaoGerenciador.nome} — {ata.orgaoGerenciador.municipio}
                      <span className="selo-uf">{ata.orgaoGerenciador.uf}</span>
                    </p>
                  </div>
                  <Badge tom={tomStatusAta(ata.status)}>{ROTULO_STATUS[ata.status]}</Badge>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {ata.categoria ? (
                    <SeloCategoria categoria={rotuloDaCategoria(ata.categoria)} />
                  ) : (
                    <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Sem categoria
                    </span>
                  )}
                  {ata.origem === "CIABC" && <Badge tom="atencao">CIABC</Badge>}
                  <Link href={`/admin/atas/${ata.id}/municipios`} className="botao-atas link ml-auto">
                    Municípios com necessidade →
                  </Link>
                </div>

                <div
                  className="mt-5 overflow-x-auto rounded-[var(--raio-grande)] border"
                  style={{ borderColor: "var(--cor-borda)" }}
                >
                  <table className="tabela-atas min-w-[620px]">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="w-[150px]">Qtd. registrada</th>
                        <th className="w-[160px]">Limite por órgão (50%)</th>
                        <th className="w-[190px]">Saldo agregado disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ata.itens.map((item) => {
                        const pctSaldo = percentualSaldoItem(item);
                        return (
                          <tr key={item.id}>
                            <td>
                              <span className="titulo-linha">{item.descricao}</span>
                            </td>
                            <td style={{ color: "var(--cor-texto)" }}>
                              <Numero>
                                {item.quantidadeRegistrada} {item.unidade}
                              </Numero>
                            </td>
                            <td>
                              <Numero>{limitePorOrgao(item.quantidadeRegistrada)}</Numero>
                            </td>
                            <td>
                              <span className="block font-bold" style={{ color: "var(--cor-texto)" }}>
                                <Numero>
                                  {saldoAgregadoDisponivel(
                                    item.quantidadeRegistrada,
                                    item.saldo?.quantidadeConsumida ?? 0,
                                  )}
                                </Numero>
                              </span>
                              {pctSaldo !== null && (
                                <div className="barra-saldo mt-1.5 max-w-[140px]" title={`${pctSaldo}% do teto agregado`}>
                                  <div style={{ width: `${pctSaldo}%` }} />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
