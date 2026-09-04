import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/ui/logo";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";

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

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-10">
      <div>
        <Logo altura={26} />
        <h1 className="marca mt-4 text-2xl" style={{ color: "var(--cor-texto)" }}>
          Catálogo de atas de registro de preços
        </h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Consulta pública, sem necessidade de cadastro. Um órgão público pode aderir a
          qualquer item aqui listado, respeitando o limite de 50% por órgão e o teto do
          dobro da quantidade registrada, previstos no art. 86 da Lei 14.133/2021.
        </p>
      </div>

      <Secao titulo="Buscar">
        <form className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input name="q" defaultValue={q} placeholder="Buscar um item específico" className="campo-atas col-span-2 sm:col-span-1" />
          <input name="categoria" defaultValue={categoria} placeholder="Tema da ata" className="campo-atas" />
          <input
            name="uf"
            defaultValue={uf}
            placeholder="UF"
            maxLength={2}
            className="campo-atas uppercase"
          />
          <input
            name="valorMax"
            defaultValue={valorMax}
            placeholder="Valor unitário até (R$)"
            type="number"
            step="0.01"
            className="campo-atas"
          />
          <button type="submit" className="botao-atas col-span-2 sm:col-span-4">
            Buscar
          </button>
        </form>
      </Secao>

      {q ? <ResultadoBuscaPorItem q={q} /> : <ListaDeAtas categoria={categoria} uf={uf} valorMax={valorMax} />}

      <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
        <Link href="/atas" className="underline">
          Ver cadastro interno de atas
        </Link>
      </p>
    </main>
  );
}

/**
 * Busca por item específico (ex.: "máscara cirúrgica") pula direto pra
 * dentro da ata que o contém, em vez de listar cada item solto — atas de
 * escala PNCP têm dezenas de itens quase idênticos, e o que importa pra
 * quem pesquisa é a ata, não a linha.
 */
async function ResultadoBuscaPorItem({ q }: { q: string }) {
  const itens = await prisma.item.findMany({
    where: {
      descricao: { contains: q, mode: "insensitive" },
      ata: ataDisponivel,
    },
    include: { ata: { include: { fornecedor: true, orgaoGerenciador: true } } },
    orderBy: { descricao: "asc" },
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
              <h2 className="font-medium" style={{ color: "var(--cor-texto)" }}>
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
    ...(categoria ? { categoria: { contains: categoria, mode: "insensitive" } } : {}),
    ...(valorMax && !Number.isNaN(Number(valorMax))
      ? { itens: { some: { valorUnitario: { lte: new Prisma.Decimal(valorMax) } } } }
      : {}),
  };

  const atas = await prisma.ata.findMany({
    where,
    include: {
      fornecedor: true,
      orgaoGerenciador: true,
      _count: { select: { itens: true } },
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
    <ul className="flex flex-col gap-3">
      {atas.map((ata) => (
        <li key={ata.id} className="painel p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-medium" style={{ color: "var(--cor-texto)" }}>
              Ata {ata.numero}
            </h2>
            <Badge tom="neutro">{ata.orgaoGerenciador.uf}</Badge>
          </div>
          {ata.categoria && <p className="eyebrow mt-1">{ata.categoria}</p>}
          <p className="mt-2 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.objeto}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.fornecedor.razaoSocial} · Órgão gerenciador: {ata.orgaoGerenciador.nome}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--cor-texto-3)" }}>
              {ata._count.itens} {ata._count.itens === 1 ? "item" : "itens"}
            </span>
            <Link href={`/catalogo/${ata.id}`} className="botao-atas secundario">
              Ver itens da ata
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
