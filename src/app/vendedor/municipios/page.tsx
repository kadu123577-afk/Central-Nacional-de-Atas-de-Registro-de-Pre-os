import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Icone } from "@/components/ui/icones";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { linkEmail, linkTelefone, linkWhatsapp } from "@/lib/contato-links";
import {
  CARGO_ADMINISTRACAO,
  CARGO_EDUCACAO,
  CARGO_PREFEITO,
  CARGO_SAUDE,
  temCanal,
} from "@/lib/decisores";
import { iniciais } from "@/lib/formato";
import { montarContatosView } from "@/lib/kanban-view";
import { logoutVendedor } from "../actions";
import { NAV_VENDEDOR } from "../nav";

export const dynamic = "force-dynamic";

const POR_PAGINA = 40;

type Filtro = "todos" | "com_contato" | "sem_contato" | "com_sinal" | "meus";

const ROTULO_FILTRO: Record<Filtro, string> = {
  todos: "Todos",
  com_contato: "Com decisor com contato",
  sem_contato: "Sem contato",
  com_sinal: "Com sinal de compra",
  meus: "Em negociação por mim",
};

const COBERTURA = [
  { sigla: "Prefeito", cargo: CARGO_PREFEITO },
  { sigla: "Adm.", cargo: CARGO_ADMINISTRACAO },
  { sigla: "Saúde", cargo: CARGO_SAUDE },
  { sigla: "Educação", cargo: CARGO_EDUCACAO },
] as const;


/**
 * Base de municípios do vendedor (2026-10-01, redesenhada na fase 2 em
 * 2026-10-05) — a informação de background: quem decide em cada prefeitura e
 * como falar com essa pessoa. Cobertura de decisores por município (prefeito,
 * administração, saúde, educação), sinais de compra e raio-X, com filtros pra
 * achar onde falta contato.
 */
export default async function MunicipiosVendedorPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; uf?: string; f?: string; pagina?: string }>;
}) {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const params = await searchParams;
  const busca = params.q?.trim() ?? "";
  const uf = params.uf?.trim().toUpperCase() ?? "";
  const filtro: Filtro = (Object.keys(ROTULO_FILTRO) as Filtro[]).includes(params.f as Filtro)
    ? (params.f as Filtro)
    : "todos";
  const pagina = Math.max(1, Number(params.pagina) || 1);

  // Contato que conta como "tem canal": ativo, não marcado como errado e com telefone ou e-mail.
  const comCanal: Prisma.PontoFocalWhereInput = {
    ativo: true,
    contatoErradoEm: null,
    OR: [{ telefone: { not: null } }, { email: { not: null } }],
  };

  const base: Prisma.EntidadeAlvoWhereInput = {
    tipo: "municipal",
    ...(busca
      ? {
          OR: [
            { nome: { contains: busca, mode: "insensitive" } },
            { uf: { contains: busca, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(uf ? { uf } : {}),
  };
  const porFiltro: Record<Filtro, Prisma.EntidadeAlvoWhereInput> = {
    todos: {},
    com_contato: { contatos: { some: comCanal } },
    sem_contato: { contatos: { none: comCanal } },
    com_sinal: { sinais: { some: {} } },
    meus: { oportunidades: { some: { vendedorId, expiradaEm: null } } },
  };

  const [contagens, municipios, ufs] = await Promise.all([
    Promise.all(
      (Object.keys(ROTULO_FILTRO) as Filtro[]).map((f) =>
        prisma.entidadeAlvo.count({ where: { ...base, ...porFiltro[f] } }),
      ),
    ),
    prisma.entidadeAlvo.findMany({
      where: { ...base, ...porFiltro[filtro] },
      include: {
        contatos: { where: { ativo: true }, orderBy: { createdAt: "asc" } },
        _count: { select: { historicoConsumo: true, sinais: true } },
        oportunidades: { where: { vendedorId, expiradaEm: null }, select: { ataId: true }, take: 1 },
      },
      // Quem já tem mais contatos levantados vem primeiro; empate por nome.
      orderBy: [{ contatos: { _count: "desc" } }, { nome: "asc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.entidadeAlvo.findMany({
      where: { tipo: "municipal", uf: { not: null } },
      distinct: ["uf"],
      orderBy: { uf: "asc" },
      select: { uf: true },
    }),
  ]);

  const chaves = Object.keys(ROTULO_FILTRO) as Filtro[];
  const total = Object.fromEntries(chaves.map((f, i) => [f, contagens[i]])) as Record<Filtro, number>;
  const totalDoFiltro = total[filtro];
  const totalPaginas = Math.max(1, Math.ceil(totalDoFiltro / POR_PAGINA));
  const pctCobertura = total.todos > 0 ? Math.round((total.com_contato / total.todos) * 100) : 0;

  const href = (extra: { f?: Filtro; pagina?: number }) => {
    const qs = new URLSearchParams();
    if (busca) qs.set("q", busca);
    if (uf) qs.set("uf", uf);
    const f = extra.f ?? filtro;
    if (f !== "todos") qs.set("f", f);
    if (extra.pagina && extra.pagina > 1) qs.set("pagina", String(extra.pagina));
    const s = qs.toString();
    return s ? `/vendedor/municipios?${s}` : "/vendedor/municipios";
  };

  return (
    <AppShell
      area="Vendedor"
      itens={NAV_VENDEDOR}
      larguraMaxima="max-w-6xl"
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Prospecção"
        titulo="Municípios"
        descricao="Quem decide em cada prefeitura e como falar com essa pessoa — a base de apoio para toda negociação."
      />

      <FaixaNumeros
        itens={[
          {
            valor: total.todos.toLocaleString("pt-BR"),
            rotulo: "Municípios",
            nota: uf || busca ? "neste filtro de busca" : "levantados no país",
          },
          {
            valor: total.com_contato.toLocaleString("pt-BR"),
            rotulo: "Com decisor com contato",
            nota: `${pctCobertura}% de cobertura`,
            tom: "marca",
          },
          {
            valor: total.sem_contato.toLocaleString("pt-BR"),
            rotulo: "Sem contato",
            nota: "sem telefone nem e-mail de ninguém",
            tom: total.sem_contato > 0 ? "atencao" : undefined,
          },
          {
            valor: total.com_sinal.toLocaleString("pt-BR"),
            rotulo: "Com sinal de compra",
            nota: "PCA, licitação, contrato a vencer…",
          },
        ]}
      />

      <div className="flex flex-col gap-4">
        {/* Busca no formato da busca da home do site: um cartão só, campos sem borda e o botão verde. */}
        <form className="painel flex flex-col gap-3 p-2 sm:flex-row sm:items-stretch">
          <label className="flex-1 px-3 py-1.5">
            <span className="block text-[11.5px] font-semibold" style={{ color: "var(--cor-texto)" }}>
              Buscar
            </span>
            <input
              name="q"
              defaultValue={busca}
              placeholder="Nome do município"
              className="mt-1 w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--cor-texto-3)]"
              style={{ color: "var(--cor-texto)" }}
            />
          </label>
          <label className="px-3 py-1.5 sm:w-44 sm:border-l" style={{ borderColor: "var(--cor-borda)" }}>
            <span className="block text-[11.5px] font-semibold" style={{ color: "var(--cor-texto)" }}>
              Estado (UF)
            </span>
            <select
              name="uf"
              defaultValue={uf}
              className="mt-1 w-full bg-transparent text-[15px] outline-none"
              style={{ color: "var(--cor-texto)" }}
            >
              <option value="">Todas as UFs</option>
              {ufs.map((u) => (
                <option key={u.uf} value={u.uf ?? ""}>
                  {u.uf}
                </option>
              ))}
            </select>
          </label>
          {filtro !== "todos" && <input type="hidden" name="f" value={filtro} />}
          <button type="submit" className="botao-atas px-6">
            Buscar
          </button>
        </form>

        <div className="kb-barra">
          {chaves.map((f) => (
            <Link key={f} href={href({ f })} className="kb-chip" aria-current={filtro === f ? "page" : undefined}>
              {ROTULO_FILTRO[f]}
              <b className="numero">{total[f].toLocaleString("pt-BR")}</b>
            </Link>
          ))}
        </div>
      </div>

      {municipios.length === 0 ? (
        <VazioComAcao titulo="Nenhum município encontrado" descricao="Tente outro termo de busca ou outro filtro." />
      ) : (
        <div className="painel overflow-x-auto">
          <table className="tabela-atas min-w-[820px]">
            <thead>
              <tr>
                <th>Município</th>
                <th className="w-[40%]">Decisor principal</th>
                <th className="w-[1%]" aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {municipios.map((m) => {
                const { principal, semCanal } = montarContatosView(m.contatos, null);
                const wa = linkWhatsapp(principal?.telefone ?? null);
                const tel = linkTelefone(principal?.telefone ?? null);
                const mail = linkEmail(principal?.email ?? null);
                const emNegociacao = m.oportunidades.length > 0;
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="flex items-center gap-2">
                        <Link
                          href={`/vendedor/municipios/${m.id}`}
                          className="titulo-linha hover:text-[var(--cor-marca-clara)]"
                        >
                          {m.nome}
                        </Link>
                        {m.uf && <span className="selo-uf">{m.uf}</span>}
                      </span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {m._count.historicoConsumo > 0
                          ? `${m._count.historicoConsumo} categoria(s) no raio-X`
                          : "raio-X sem categorias identificadas"}
                        {m._count.sinais > 0 ? ` · ${m._count.sinais} sinal(is) de compra` : ""}
                      </span>
                      <div className="kb-cobertura mt-2" aria-label="Cobertura de decisores com contato">
                        {COBERTURA.map((c) => (
                          <span
                            key={c.cargo}
                            data-ok={m.contatos.some((x) => x.cargo === c.cargo && !x.contatoErradoEm && temCanal(x))}
                          >
                            {c.sigla}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td>
                      {principal && !semCanal ? (
                        <div className="kb-decisor" style={{ marginTop: 0 }}>
                          <div className="kb-avatar">{iniciais(principal.nomeContato)}</div>
                          <div className="kb-decisor-texto">
                            <b>{principal.cargo}</b>
                            <span>{principal.nomeContato}</span>
                          </div>
                          <div className="kb-acoes">
                            {wa && (
                              <a className="kb-icone-link" data-tipo="whatsapp" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp">
                                <Icone nome="chat" />
                              </a>
                            )}
                            {tel && (
                              <a className="kb-icone-link" href={tel} aria-label="Ligar">
                                <Icone nome="tel" />
                              </a>
                            )}
                            {mail && (
                              <a className="kb-icone-link" href={mail} aria-label="Enviar e-mail">
                                <Icone nome="mail" />
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="kb-sem-canal" style={{ marginTop: 0 }}>
                          {principal ? `${principal.cargo} sem telefone nem e-mail.` : "Nenhum contato levantado."}
                        </div>
                      )}
                    </td>

                    <td>
                      <div className="flex flex-col items-end gap-1.5 whitespace-nowrap">
                        {emNegociacao && <Badge tom="marca">Em negociação por você</Badge>}
                        <Link href={`/vendedor/municipios/${m.id}`} className="botao-atas secundario">
                          Ver dossiê
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]" style={{ color: "var(--cor-texto-3)" }}>
          <span>
            Página{" "}
            <b className="numero" style={{ color: "var(--cor-texto)" }}>
              {pagina}
            </b>{" "}
            de <span className="numero">{totalPaginas}</span> ·{" "}
            <span className="numero">{totalDoFiltro.toLocaleString("pt-BR")}</span> município(s)
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={href({ pagina: pagina - 1 })} className="botao-atas secundario">
                ← Anterior
              </Link>
            )}
            {pagina < totalPaginas && (
              <Link href={href({ pagina: pagina + 1 })} className="botao-atas secundario">
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
