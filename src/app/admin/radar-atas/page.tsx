import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { rotuloDaCategoria } from "@/lib/categorias";
import {
  DIAS_MINIMOS_ADESAO,
  DIAS_VIGENCIA_BONUS,
  PONTOS_CATEGORIA_CONHECIDA,
  PONTOS_FORNECEDOR_CNPJ,
  PONTOS_POR_MUNICIPIO,
  PONTOS_VIGENCIA_MAXIMA,
  TETO_PONTOS_DEMANDA,
} from "@/lib/radar-atas";
import {
  calcularPaginacao,
  cnpjParaTela,
  diaBrasilia,
  hrefRadar,
  ITENS_POR_PAGINA,
  lerFiltrosRadar,
  SEM_CATEGORIA,
} from "@/lib/radar-atas-view";
import { TabelaAtasRadar, type DadosAtaRadar } from "./tabela-atas-radar";

export const dynamic = "force-dynamic";

const COMANDO_SCRIPT = "npx tsx scripts/inteligencia/gerar-radar-atas.ts";

/**
 * Radar de atas (Projeto RNA, etapa 5, 2026-10-22): atas vigentes que os
 * municípios-alvo publicaram no PNCP e que podem ser oferecidas a OUTROS
 * municípios com necessidade da mesma categoria (adesão, Lei 14.133/2021,
 * art. 86). O script scripts/inteligencia/gerar-radar-atas.ts calcula a
 * lista a partir da coleta; aqui o gestor só lê, filtra e abre a ata no PNCP.
 * Os filtros são GET (sem JavaScript). Só empresa aparece como fornecedor.
 */
export default async function RadarAtasPage({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const filtros = lerFiltrosRadar(await searchParams);
  const agora = new Date();

  const where: Prisma.RadarAtaWhereInput = {
    ...(filtros.categoria === SEM_CATEGORIA ? { categoria: null } : filtros.categoria ? { categoria: filtros.categoria } : {}),
    ...(filtros.uf ? { uf: filtros.uf } : {}),
    ...(filtros.fornecedor ? { fornecedorCnpj: filtros.fornecedor } : {}),
  };
  const filtrando = Boolean(filtros.categoria || filtros.uf || filtros.fornecedor);

  const [porCategoria, porUf, comFornecedor, ultima, totalFiltrado] = await Promise.all([
    prisma.radarAta.groupBy({ by: ["categoria"], _count: { _all: true } }),
    prisma.radarAta.groupBy({ by: ["uf"], _count: { _all: true } }),
    prisma.radarAta.count({ where: { fornecedorCnpj: { not: null } } }),
    prisma.radarAta.aggregate({ _max: { calculadoEm: true } }),
    prisma.radarAta.count({ where }),
  ]);

  const totalNoRadar = porCategoria.reduce((soma, c) => soma + c._count._all, 0);
  const categoriasCobertas = porCategoria.filter((c) => c.categoria).length;
  const calculadoEm = ultima._max.calculadoEm;

  const paginacao = calcularPaginacao(totalFiltrado, filtros.pagina);
  const atas: DadosAtaRadar[] =
    totalFiltrado === 0
      ? []
      : await prisma.radarAta.findMany({
          where,
          // Pontuação maior primeiro; os desempates deixam a ordem sempre igual entre uma página e outra.
          orderBy: [{ pontuacao: "desc" }, { vigenciaFim: "desc" }, { numeroControlePncpAta: "asc" }],
          skip: paginacao.pular,
          take: ITENS_POR_PAGINA,
          select: {
            id: true,
            numeroControlePncpAta: true,
            orgaoNome: true,
            uf: true,
            municipioNome: true,
            objeto: true,
            categoria: true,
            vigenciaFim: true,
            fornecedorCnpj: true,
            fornecedorNome: true,
            municipiosComDemanda: true,
            pontuacao: true,
          },
        });

  // Opções dos filtros: só o que existe no radar (mais o valor já escolhido, para o seletor não "perdê-lo").
  const opcoesCategoria = porCategoria
    .map((c) => ({
      valor: c.categoria ?? SEM_CATEGORIA,
      rotulo: c.categoria ? rotuloDaCategoria(c.categoria) : "Sem categoria",
      quantidade: c._count._all,
    }))
    .sort((a, b) => {
      // "Sem categoria" fica por último.
      if (a.valor === SEM_CATEGORIA) return 1;
      if (b.valor === SEM_CATEGORIA) return -1;
      return a.rotulo.localeCompare(b.rotulo, "pt-BR");
    });
  if (filtros.categoria && !opcoesCategoria.some((o) => o.valor === filtros.categoria)) {
    opcoesCategoria.push({ valor: filtros.categoria, rotulo: rotuloDaCategoria(filtros.categoria), quantidade: 0 });
  }
  const opcoesUf = porUf
    .filter((u): u is typeof u & { uf: string } => Boolean(u.uf))
    .map((u) => ({ valor: u.uf, quantidade: u._count._all }))
    .sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR"));
  if (filtros.uf && !opcoesUf.some((o) => o.valor === filtros.uf)) opcoesUf.push({ valor: filtros.uf, quantidade: 0 });

  const cnpjDoFiltro = cnpjParaTela(filtros.fornecedor);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-7xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Rede"
        titulo="Radar de"
        destaque="atas"
        descricao="Atas vigentes que municípios publicaram no PNCP e que podem ser oferecidas a outros municípios com necessidade da mesma categoria. A pontuação soma a demanda desses municípios, o prazo que a ata ainda tem e se o fornecedor foi identificado."
        acoes={
          <Link href="/admin/prospeccao-fornecedores" className="botao-atas secundario">
            Ver a prospecção de fornecedores
          </Link>
        }
      />

      <FaixaNumeros
        itens={[
          { valor: totalNoRadar, rotulo: "Atas no radar", tom: totalNoRadar > 0 ? "marca" : undefined },
          {
            valor: comFornecedor,
            rotulo: "Com fornecedor identificado",
            nota: totalNoRadar > 0 ? `de ${totalNoRadar} atas` : undefined,
          },
          { valor: categoriasCobertas, rotulo: "Categorias cobertas", nota: "com ao menos uma ata no radar" },
          {
            valor: diaBrasilia(calculadoEm),
            rotulo: "Última atualização",
            nota: "quando o script rodou",
          },
        ]}
      />

      {totalNoRadar === 0 ? (
        <Secao titulo="Atas candidatas" destaque>
          <VazioComAcao
            titulo="O radar ainda está vazio"
            descricao="Esta lista é preenchida por um script que lê as atas e os contratos que os municípios publicaram no PNCP (já guardados pela coleta automática), separa as atas vigentes abertas à adesão e cruza cada uma com a necessidade dos municípios-alvo. Rode o script e volte a esta página."
            acao={
              <div className="flex flex-col items-center gap-3">
                <p className="text-center text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  Rotina: <span className="codigo break-all">{COMANDO_SCRIPT}</span>
                  <br />
                  Com <span className="codigo">--dry-run</span> ela só mostra o que gravaria, sem gravar.
                </p>
                <Link href="/admin/prospeccao-fornecedores" className="botao-atas secundario">
                  Ver a prospecção de fornecedores
                </Link>
              </div>
            }
          />
        </Secao>
      ) : (
        <>
          <Secao
            titulo={`Atas candidatas (${totalFiltrado.toLocaleString("pt-BR")})`}
            descricao="Da maior para a menor pontuação. O radar só aponta candidatas: a adesão depende da concordância do órgão gerenciador e do fornecedor."
            destaque
          >
            <div className="flex flex-col gap-5">
              <form method="get" action="/admin/radar-atas" className="flex flex-wrap items-end gap-3">
                <label className="block min-w-[14rem] flex-1 sm:max-w-xs">
                  <span className="rotulo-campo">Categoria</span>
                  <select name="categoria" defaultValue={filtros.categoria ?? ""} className="campo-atas">
                    <option value="">Todas</option>
                    {opcoesCategoria.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.rotulo} ({o.quantidade})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-[9rem]">
                  <span className="rotulo-campo">UF</span>
                  <select name="uf" defaultValue={filtros.uf ?? ""} className="campo-atas">
                    <option value="">Todas</option>
                    {opcoesUf.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.valor} ({o.quantidade})
                      </option>
                    ))}
                  </select>
                </label>
                {filtros.fornecedor && <input type="hidden" name="fornecedor" value={filtros.fornecedor} />}
                <button type="submit" className="botao-atas">
                  Filtrar
                </button>
                {filtrando && (
                  <Link href="/admin/radar-atas" className="botao-atas link">
                    Limpar filtros
                  </Link>
                )}
              </form>

              {filtros.fornecedor && (
                <Aviso tom="info">
                  Mostrando só as atas do fornecedor{cnpjDoFiltro ? <span className="codigo"> {cnpjDoFiltro}</span> : null}.{" "}
                  <Link
                    href={hrefRadar({ categoria: filtros.categoria, uf: filtros.uf })}
                    className="font-semibold underline underline-offset-2"
                  >
                    Ver de todos os fornecedores
                  </Link>
                </Aviso>
              )}

              {atas.length === 0 ? (
                <VazioComAcao
                  titulo="Nenhuma ata com esses filtros"
                  descricao="Tire ou troque um filtro para ver mais atas."
                  acao={
                    <Link href="/admin/radar-atas" className="botao-atas secundario">
                      Limpar filtros
                    </Link>
                  }
                />
              ) : (
                <>
                  <TabelaAtasRadar atas={atas} agora={agora} />

                  <nav aria-label="Páginas do radar" className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[13px]" style={{ color: "var(--cor-texto-2)" }}>
                      Mostrando{" "}
                      <b className="numero" style={{ color: "var(--cor-texto)" }}>
                        {paginacao.de.toLocaleString("pt-BR")} a {paginacao.ate.toLocaleString("pt-BR")}
                      </b>{" "}
                      de <span className="numero">{totalFiltrado.toLocaleString("pt-BR")}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      {paginacao.pagina > 1 && (
                        <Link href={hrefRadar(filtros, paginacao.pagina - 1)} className="botao-atas secundario pequeno" rel="prev">
                          ← Anterior
                        </Link>
                      )}
                      <span className="numero text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        Página {paginacao.pagina} de {paginacao.totalPaginas}
                      </span>
                      {paginacao.pagina < paginacao.totalPaginas && (
                        <Link href={hrefRadar(filtros, paginacao.pagina + 1)} className="botao-atas secundario pequeno" rel="next">
                          Próxima →
                        </Link>
                      )}
                    </div>
                  </nav>
                </>
              )}
            </div>
          </Secao>

          <Secao titulo="Como ler a pontuação" descricao="Os números abaixo são os mesmos que o script usa para calcular.">
            <ul className="lista-linhas text-[13.5px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
              <li>
                <b style={{ color: "var(--cor-texto)" }}>Municípios com demanda.</b> Quantos municípios-alvo, além do órgão
                que publicou a ata, mostram necessidade da mesma categoria (sinais de compra e raio-X de consumo).{" "}
                {PONTOS_POR_MUNICIPIO} pontos por município, até {TETO_PONTOS_DEMANDA}.
              </li>
              <li>
                <b style={{ color: "var(--cor-texto)" }}>Prazo.</b> Até {PONTOS_VIGENCIA_MAXIMA} pontos, proporcionais aos dias
                de vigência que restam (o máximo vale a partir de {DIAS_VIGENCIA_BONUS} dias). O script só põe no radar a
                ata com pelo menos {DIAS_MINIMOS_ADESAO} dias pela frente na hora em que roda; os dias da tabela são
                contados de hoje.
              </li>
              <li>
                <b style={{ color: "var(--cor-texto)" }}>Fornecedor e categoria.</b> {PONTOS_FORNECEDOR_CNPJ} pontos quando o
                fornecedor é uma empresa identificada (pessoa física não é identificada) e {PONTOS_CATEGORIA_CONHECIDA}{" "}
                quando o objeto da ata caiu numa categoria conhecida.
              </li>
            </ul>
          </Secao>
        </>
      )}
    </AppShell>
  );
}
