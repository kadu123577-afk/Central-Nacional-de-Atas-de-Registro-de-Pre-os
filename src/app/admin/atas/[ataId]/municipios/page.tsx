import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { corDaCategoria } from "@/lib/categorias";
import { FormularioCategoriaAta } from "./formulario-categoria";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
  { rotulo: "Municípios/Entidades", href: "/admin/entidades" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

const ANOS_PARA_CONSIDERAR_ATRASADO = 2;

/**
 * "A gente tem uma ata de gráfica — qual município precisa dessa ata?"
 * (2026-09-26) — a outra metade do raio-X de consumo: em vez de olhar
 * um município e ver o que ele precisa (já existe em
 * /admin/entidades/[id]), aqui parte de uma ata e mostra quais dos
 * 1.073 municípios levantados já mostraram essa necessidade — cruzando
 * `Ata.categoria` com `HistoricoConsumoCategoria.categoria`.
 *
 * Dois grupos, claramente separados (mistura "certeza" com
 * "oportunidade especulativa" seria enganoso pro time comercial):
 *   - Já contratou essa categoria antes, mas faz tempo — sinal forte de
 *     necessidade real recorrente, ordenado do mais atrasado pro mais
 *     recente.
 *   - Raio-X já rodou pra esse município e não achou contratação nessa
 *     categoria — pode ser porque nunca contratou (oportunidade nova)
 *     ou porque o classificador por palavra-chave não pegou (é
 *     heurístico, não garante 100%) — por isso "possível oportunidade",
 *     não "confirmado".
 */
export default async function MunicipiosCompativeisPage({
  params,
}: {
  params: Promise<{ ataId: string }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const { ataId } = await params;
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: { fornecedor: true, orgaoGerenciador: true },
  });
  if (!ata) notFound();

  let jaContrataram: {
    id: string;
    nome: string;
    uf: string | null;
    municipio: string | null;
    ultimaContratacao: Date;
    valorUltimaContratacao: unknown;
  }[] = [];
  let nuncaContrataram: { id: string; nome: string; uf: string | null; municipio: string | null }[] = [];

  if (ata.categoria) {
    const comHistorico = await prisma.entidadeAlvo.findMany({
      where: {
        tipo: "municipal",
        historicoConsumo: { some: { categoria: ata.categoria } },
      },
      include: {
        historicoConsumo: { where: { categoria: ata.categoria }, take: 1 },
      },
    });
    jaContrataram = comHistorico
      .map((e) => ({
        id: e.id,
        nome: e.nome,
        uf: e.uf,
        municipio: e.municipio,
        ultimaContratacao: e.historicoConsumo[0].ultimaContratacao,
        valorUltimaContratacao: e.historicoConsumo[0].valorUltimaContratacao,
      }))
      .sort((a, b) => a.ultimaContratacao.getTime() - b.ultimaContratacao.getTime());

    nuncaContrataram = await prisma.entidadeAlvo.findMany({
      where: {
        tipo: "municipal",
        raioXAtualizadoEm: { not: null },
        historicoConsumo: { none: { categoria: ata.categoria } },
      },
      select: { id: true, nome: true, uf: true, municipio: true },
      orderBy: { nome: "asc" },
      take: 200,
    });
  }

  const dataLimiteAtraso = new Date();
  dataLimiteAtraso.setFullYear(dataLimiteAtraso.getFullYear() - ANOS_PARA_CONSIDERAR_ATRASADO);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Municípios com necessidade — Ata {ata.numero}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.objeto} · {ata.fornecedor.razaoSocial}
          </p>
        </div>
        <Link href="/atas" className="botao-atas link">
          ← Atas
        </Link>
      </div>

      <Secao titulo="Categoria desta ata">
        <FormularioCategoriaAta ataId={ata.id} categoriaAtual={ata.categoria} />
      </Secao>

      {!ata.categoria ? (
        <VazioComAcao
          titulo="Defina a categoria da ata acima"
          descricao="Sem categoria não dá pra cruzar com o raio-X de consumo dos municípios."
        />
      ) : (
        <>
          <Secao
            titulo={`Já contrataram ${jaContrataram.length > 0 ? `(${jaContrataram.length})` : ""} — candidatos fortes`}
          >
            {jaContrataram.length === 0 ? (
              <VazioComAcao
                titulo="Nenhum município com esse histórico ainda"
                descricao="Nenhum dos 1.073 municípios levantados mostrou ter contratado essa categoria."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {jaContrataram.map((m) => {
                  const atrasado = m.ultimaContratacao < dataLimiteAtraso;
                  return (
                    <li key={m.id} className="painel p-4">
                      <div className="flex items-center justify-between gap-3">
                        <Link href={`/admin/entidades/${m.id}`}>
                          <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                            {m.nome}
                          </p>
                          <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                            {m.municipio}/{m.uf} · última contratação: {m.ultimaContratacao.toLocaleDateString("pt-BR")}
                          </p>
                        </Link>
                        {atrasado && <Badge tom="atencao">Sem renovar há {ANOS_PARA_CONSIDERAR_ATRASADO}+ anos</Badge>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Secao>

          <Secao
            titulo="Possível oportunidade (raio-X não achou contratação nessa categoria)"
            acao={
              <span
                className="eyebrow rounded-full border px-2.5 py-0.5"
                style={{ borderColor: corDaCategoria(ata.categoria), color: corDaCategoria(ata.categoria) }}
              >
                {ata.categoria}
              </span>
            }
          >
            <p className="mb-3 text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Especulativo — pode ser que o município nunca tenha licitado isso, ou que o
              classificador por palavra-chave não tenha pegado o contrato certo.
            </p>
            {nuncaContrataram.length === 0 ? (
              <VazioComAcao titulo="Nenhum candidato nesta lista" descricao="" />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {nuncaContrataram.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/admin/entidades/${m.id}`}
                      className="eyebrow inline-block rounded-full border px-2.5 py-1"
                      style={{ borderColor: "var(--cor-borda-forte)", color: "var(--cor-texto-2)" }}
                    >
                      {m.nome}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </>
      )}
    </AppShell>
  );
}
