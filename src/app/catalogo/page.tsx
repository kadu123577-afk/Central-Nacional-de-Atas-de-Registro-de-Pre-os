import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { BarraTopo } from "@/components/ui/barra-topo";
import { Secao } from "@/components/ui/secao";
import { CATEGORIAS_ATAS, resolverSlugCategoria } from "@/lib/categorias";
import { percentualSaldo, UFS } from "@/lib/vitrine";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { TabelaAtasVitrine } from "@/components/ui/tabela-atas-vitrine";

export const dynamic = "force-dynamic";

interface FiltrosCatalogo {
  q?: string;
  categoria?: string;
  uf?: string;
  valorMax?: string;
}

// Ata aprovada e ainda dentro da vigência — ver src/lib/atas.ts
// (ataDisponivelParaAdesao) para a mesma regra aplicada onde o pedido de
// adesão é de fato criado.
const ataDisponivel = { status: "APROVADA" as const, dataVigenciaFim: { gte: new Date() } };

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<FiltrosCatalogo>;
}) {
  const filtros = await searchParams;
  const q = filtros.q?.trim() ?? "";
  const categoria = filtros.categoria?.trim() ?? "";
  const uf = filtros.uf?.trim().toUpperCase() ?? "";
  const valorMax = filtros.valorMax?.trim() ?? "";

  const slugCategoria = categoria ? (resolverSlugCategoria(categoria) ?? categoria) : "";

  return (
    <>
      <BarraTopo />
      <main className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-6 py-12">
        <div>
          <p className="selo-ponto">Consulta pública, sem cadastro</p>
          <h1 className="marca mt-4" style={{ color: "var(--cor-texto)" }}>
            Catálogo de atas de registro de preços
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
            Um órgão público pode aderir a qualquer item aqui listado, respeitando o limite de 50%
            por órgão e o teto do dobro da quantidade registrada, previstos no art. 86 da Lei
            14.133/2021.
          </p>
        </div>

        <form className="painel grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-[1.6fr_1.2fr_0.7fr_1fr_auto] sm:items-end">
          <label className="col-span-2 sm:col-span-1">
            <span className="mb-1 block text-[11.5px] font-semibold">Objeto ou item</span>
            <input name="q" defaultValue={q} placeholder="Ex.: luminária LED, dipirona" className="campo-atas" />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="mb-1 block text-[11.5px] font-semibold">Categoria</span>
            <select name="categoria" defaultValue={slugCategoria} className="campo-atas">
              <option value="">Todas as categorias</option>
              {CATEGORIAS_ATAS.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold">UF</span>
            <select name="uf" defaultValue={uf} className="campo-atas">
              <option value="">Todas</option>
              {UFS.map((sigla) => (
                <option key={sigla} value={sigla}>
                  {sigla}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11.5px] font-semibold">Valor unitário até (R$)</span>
            <input name="valorMax" defaultValue={valorMax} placeholder="0,00" type="number" step="0.01" className="campo-atas" />
          </label>
          <button type="submit" className="botao-atas col-span-2 sm:col-span-1">
            Buscar atas
          </button>
        </form>

        {q ? <ResultadoBuscaPorItem q={q} uf={uf} /> : <ListaDeAtas categoria={categoria} uf={uf} valorMax={valorMax} />}
      </main>
    </>
  );
}

/**
 * Busca por item específico (ex.: "máscara cirúrgica") pula direto pra
 * dentro da ata que o contém, em vez de listar cada item solto — atas de
 * escala PNCP têm dezenas de itens quase idênticos, e o que importa pra
 * quem pesquisa é a ata, não a linha.
 */
async function ResultadoBuscaPorItem({ q, uf }: { q: string; uf: string }) {
  // "Buscar ata por objeto ou item" (busca do cabeçalho do site): casa a
  // descrição do item OU o objeto da ata.
  const itens = await prisma.item.findMany({
    where: {
      OR: [
        { descricao: { contains: q, mode: "insensitive" } },
        { ata: { objeto: { contains: q, mode: "insensitive" } } },
      ],
      ata: { ...ataDisponivel, ...(uf ? { orgaoGerenciador: { uf } } : {}) },
    },
    include: { ata: { include: { fornecedor: true, orgaoGerenciador: true } } },
    orderBy: { descricao: "asc" },
    take: 200,
  });

  if (itens.length === 0) {
    return (
      <VazioComAcao
        titulo="Nenhum item encontrado"
        descricao="Ajuste o termo de busca ou navegue pelos temas de ata abaixo."
      />
    );
  }

  return (
    <Secao titulo={`Itens encontrados para "${q}"`}>
      <ul className="flex flex-col gap-3">
        {itens.map((item) => (
          <li key={item.id} className="painel p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="marca text-[15px]" style={{ color: "var(--cor-texto)" }}>
                {item.descricao}
              </h2>
              <span className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                <Cifra valor={item.valorUnitario} /> / {item.unidade}
              </span>
            </div>
            <p className="mt-2 text-sm" style={{ color: "var(--cor-texto-2)" }}>
              Ata {item.ata.numero} — {item.ata.fornecedor.razaoSocial} · Órgão gerenciador:{" "}
              {item.ata.orgaoGerenciador.nome} ({item.ata.orgaoGerenciador.uf})
            </p>
            <Link
              href={`/catalogo/${item.ataId}?item=${item.id}`}
              className="botao-atas secundario mt-3"
            >
              Ver na ata
            </Link>
          </li>
        ))}
      </ul>
    </Secao>
  );
}

/**
 * Navegação por tema: lista atas (não itens soltos) — clicar numa ata
 * revela os itens dela em /catalogo/[ataId].
 */
async function ListaDeAtas({
  categoria,
  uf,
  valorMax,
}: {
  categoria: string;
  uf: string;
  valorMax: string;
}) {
  const where: Prisma.AtaWhereInput = {
    ...ataDisponivel,
    ...(uf ? { orgaoGerenciador: { uf } } : {}),
    ...(categoria
      ? { categoria: resolverSlugCategoria(categoria) ?? { contains: categoria, mode: "insensitive" } }
      : {}),
    ...(valorMax && !Number.isNaN(Number(valorMax))
      ? { itens: { some: { valorUnitario: { lte: new Prisma.Decimal(valorMax) } } } }
      : {}),
  };

  const atas = await prisma.ata.findMany({
    where,
    include: {
      orgaoGerenciador: { select: { nome: true, uf: true } },
      itens: { select: { quantidadeRegistrada: true, saldo: { select: { quantidadeConsumida: true } } } },
    },
    orderBy: { dataVigenciaFim: "asc" },
  });

  if (atas.length === 0) {
    return (
      <VazioComAcao
        titulo="Nenhuma ata encontrada"
        descricao="Ajuste os filtros de busca ou tente um tema mais genérico."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px]" style={{ color: "var(--cor-texto-3)" }}>
        {atas.length} {atas.length === 1 ? "ata vigente encontrada" : "atas vigentes encontradas"}
      </p>
      <TabelaAtasVitrine
        atas={atas.map((ata) => ({
          id: ata.id,
          numero: ata.numero,
          objeto: ata.objeto,
          categoria: ata.categoria,
          orgao: ata.orgaoGerenciador.nome,
          uf: ata.orgaoGerenciador.uf,
          itens: ata.itens.length,
          vigenciaFim: ata.dataVigenciaFim,
          saldo: percentualSaldo(ata.itens),
        }))}
      />
    </div>
  );
}
