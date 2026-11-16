import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { Badge, type Tom } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { rotuloDaCategoria } from "@/lib/categorias";
import { ROTULO_NIVEL, type NivelDoPar } from "@/lib/panorama";
import { carregarPanorama, type LinhaDoPanorama } from "@/lib/panorama-db";
import { diaDaReserva } from "@/lib/reserva-ata";

export const dynamic = "force-dynamic";

interface Filtros {
  uf?: string;
  categoria?: string;
  ata?: string;
  andamento?: string;
}

const TOM_DO_NIVEL: Record<NivelDoPar, Tom> = { muito_provavel: "marca", provavel: "atencao", possivel: "neutro" };
const ROTULO_SITUACAO = { livre: "Livre", em_negociacao: "Em negociação", aderiu: "Já aderiu" } as const;
const reais = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

/**
 * Panorama de vendas (16/11/2026): o match entre cada município e as atas do catálogo, para ver onde é
 * mais fácil vender. Cada par traz a nota, os motivos (o que o município consome, quando o contrato vence,
 * se já compra por adesão) e os avisos. É a visão geral da Gestão; as regras da nota ficam em
 * src/lib/panorama.ts.
 */
export default async function PanoramaPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "visao.geral");

  const bruto = await searchParams;
  const filtros = {
    uf: /^[A-Z]{2}$/.test(bruto.uf ?? "") ? bruto.uf : undefined,
    categoria: /^[a-z0-9-]{1,60}$/.test(bruto.categoria ?? "") ? bruto.categoria : undefined,
    ataId: /^[A-Za-z0-9_-]{1,64}$/.test(bruto.ata ?? "") ? bruto.ata : undefined,
    incluirEmAndamento: bruto.andamento === "1",
  };

  const hoje = new Date();
  const [panorama, atas, ufs, categorias] = await Promise.all([
    carregarPanorama(filtros, hoje),
    prisma.ata.findMany({
      where: { status: "APROVADA", contrato: { isNot: null }, dataVigenciaFim: { gte: hoje }, categoria: { not: null } },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true, fornecedor: { select: { razaoSocial: true } } },
    }),
    prisma.entidadeAlvo.findMany({
      where: { tipo: "municipal", uf: { not: null } },
      distinct: ["uf"],
      orderBy: { uf: "asc" },
      select: { uf: true },
    }),
    prisma.ata.findMany({
      where: { status: "APROVADA", contrato: { isNot: null }, dataVigenciaFim: { gte: hoje }, categoria: { not: null } },
      distinct: ["categoria"],
      select: { categoria: true },
    }),
  ]);

  const filtrando = Boolean(filtros.uf || filtros.categoria || filtros.ataId || filtros.incluirEmAndamento);

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
        rotulo="Inteligência"
        titulo="Panorama"
        destaque="de vendas"
        descricao="Para cada município, as atas que combinam com o que ele já consome, das mais fáceis de vender para as menos. Serve para escolher por onde começar, não garante a venda."
      />

      <form
        method="get"
        className="painel grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-[0.6fr_1fr_1.6fr_auto_auto] lg:items-end"
        aria-label="Filtros do panorama"
      >
        <label className="block">
          <span className="rotulo-campo">UF</span>
          <select name="uf" defaultValue={filtros.uf ?? ""} className="campo-atas">
            <option value="">Todas as UFs</option>
            {ufs.map((u) => (
              <option key={u.uf} value={u.uf ?? ""}>
                {u.uf}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo-campo">Categoria</span>
          <select name="categoria" defaultValue={filtros.categoria ?? ""} className="campo-atas">
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.categoria} value={c.categoria ?? ""}>
                {rotuloDaCategoria(c.categoria ?? "")}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo-campo">Ata</span>
          <select name="ata" defaultValue={filtros.ataId ?? ""} className="campo-atas">
            <option value="">Todas as atas</option>
            {atas.map((a) => (
              <option key={a.id} value={a.id}>
                Ata {a.numero} — {a.fornecedor.razaoSocial}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="andamento" value="1" defaultChecked={filtros.incluirEmAndamento} />
          Incluir os já em andamento
        </label>
        <div className="flex items-center gap-4">
          <button type="submit" className="botao-atas">
            Filtrar
          </button>
          {filtrando && (
            <Link href="/admin/panorama" className="botao-atas link">
              Limpar
            </Link>
          )}
        </div>
      </form>

      <FaixaNumeros
        itens={[
          { valor: panorama.totalPares.toLocaleString("pt-BR"), rotulo: "Pares município e ata", tom: panorama.totalPares > 0 ? "marca" : undefined },
          { valor: panorama.porNivel.muito_provavel.toLocaleString("pt-BR"), rotulo: "Muito prováveis", tom: panorama.porNivel.muito_provavel > 0 ? "marca" : undefined },
          { valor: panorama.totalMunicipios.toLocaleString("pt-BR"), rotulo: "Municípios com par" },
          { valor: panorama.totalAtas.toLocaleString("pt-BR"), rotulo: "Atas no catálogo" },
          {
            valor: panorama.municipiosSemConsumo.toLocaleString("pt-BR"),
            rotulo: "Sem consumo salvo",
            nota: "o robô não chegou ou nada se encaixou",
            tom: panorama.municipiosSemConsumo > 0 ? "atencao" : undefined,
          },
        ]}
      />

      {panorama.totalAtas === 0 ? (
        <VazioComAcao
          titulo="Nenhuma ata no catálogo ainda"
          descricao="O panorama cruza o consumo dos municípios com as atas liberadas (conformidade concluída, com contrato e vigentes). Quando houver ata liberada, os pares aparecem aqui."
        />
      ) : panorama.linhas.length === 0 ? (
        <VazioComAcao
          titulo="Nenhum par neste filtro"
          descricao="Nenhum município consome as categorias das atas escolhidas, ou os que consomem já estão em andamento. Tente outro filtro."
        />
      ) : (
        <Secao
          titulo={`Pares (${panorama.linhas.length}${panorama.totalPares > panorama.linhas.length ? ` de ${panorama.totalPares.toLocaleString("pt-BR")}` : ""})`}
          descricao="Os mais fáceis de vender primeiro. A nota vai de 0 a 100; os motivos dizem de onde ela veio."
          destaque
        >
          {panorama.municipiosSemConsumo > 0 && (
            <Aviso tom="info" className="mb-4">
              {panorama.municipiosSemConsumo.toLocaleString("pt-BR")} município(s) ainda não têm consumo salvo (o robô do raio-X ainda não chegou neles, ou nada do que
              compram cai nas categorias conhecidas) e por isso não aparecem. Ver ROBO-DO-RAIO-X.md.
            </Aviso>
          )}
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[980px]">
              <thead>
                <tr>
                  <th>Município</th>
                  <th>Ata</th>
                  <th className="w-[130px]">Nota</th>
                  <th className="w-[130px]">Consumo por ano</th>
                  <th>Por quê</th>
                  <th className="w-[1%]">Situação</th>
                </tr>
              </thead>
              <tbody>
                {panorama.linhas.map((l) => (
                  <LinhaDoPar key={`${l.municipioId}-${l.ataId}`} linha={l} />
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}
    </AppShell>
  );
}

function LinhaDoPar({ linha: l }: { linha: LinhaDoPanorama }) {
  return (
    <tr>
      <td className="align-top">
        <Link href={`/admin/entidades/${l.municipioId}`} className="titulo-linha block hover:text-[var(--cor-marca-clara)]">
          {l.municipio}
        </Link>
        {l.uf && <span className="selo-uf">{l.uf}</span>}
      </td>
      <td className="align-top">
        <span className="codigo text-xs" style={{ color: "var(--cor-texto-3)" }}>
          Ata {l.ataNumero}
        </span>
        <span className="mt-0.5 block text-[13px]">{l.ataObjeto}</span>
        <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
          {rotuloDaCategoria(l.categoria)}
        </span>
      </td>
      <td className="align-top">
        <Badge tom={TOM_DO_NIVEL[l.nivel]}>{ROTULO_NIVEL[l.nivel]}</Badge>
        <span className="numero mt-1 block text-[13px]">{l.pontos} / 100</span>
      </td>
      <td className="align-top">
        <span className="numero font-semibold">{reais(l.consumoAnual)}</span>
        {l.consumoAnualEstimado && (
          <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
            estimativa
          </span>
        )}
      </td>
      <td className="align-top">
        <ul className="flex flex-col gap-1 text-[13px] leading-snug" style={{ color: "var(--cor-texto-2)" }}>
          {l.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
          {l.avisos.map((a) => (
            <li key={a} style={{ color: "var(--cor-atencao)" }}>
              Atenção: {a}
            </li>
          ))}
        </ul>
      </td>
      <td className="align-top whitespace-nowrap">
        <Badge tom={l.situacao === "livre" ? "marca" : "neutro"}>{ROTULO_SITUACAO[l.situacao]}</Badge>
        {l.ataReservadaAte && (
          <span className="mt-1 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
            ata reservada até {diaDaReserva(l.ataReservadaAte)}
          </span>
        )}
      </td>
    </tr>
  );
}
