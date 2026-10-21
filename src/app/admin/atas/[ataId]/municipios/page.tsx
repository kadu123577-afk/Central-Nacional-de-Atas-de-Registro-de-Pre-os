import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { SeloCategoria } from "@/components/ui/selo-categoria";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { rotuloDaCategoria } from "@/lib/categorias";
import { buscarMunicipiosCompativeis } from "@/lib/match-ata-municipio";
import { FormularioCategoriaAta } from "./formulario-categoria";
import { FormularioTituloPublico } from "./formulario-titulo-publico";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

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

  const { jaContrataram, nuncaContrataram } = ata.categoria
    ? await buscarMunicipiosCompativeis(ata.categoria)
    : { jaContrataram: [], nuncaContrataram: [] };

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
      <CabecalhoPagina
        rotulo="Operação"
        titulo="Municípios com necessidade — Ata"
        destaque={ata.numero}
        descricao={
          <>
            {ata.objeto} ·{" "}
            <span className="font-semibold" style={{ color: "var(--cor-texto)" }}>
              {ata.fornecedor.razaoSocial}
            </span>
          </>
        }
        voltar={{ href: "/atas", rotulo: "Atas" }}
      />

      <Secao titulo="Categoria desta ata">
        <FormularioCategoriaAta ataId={ata.id} categoriaAtual={ata.categoria} />
      </Secao>

      <Secao titulo="Título público (o que o site mostra)">
        <FormularioTituloPublico
          ataId={ata.id}
          tituloAtual={ata.tituloPublico}
          categoria={ata.categoria}
        />
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
            destaque
          >
            {jaContrataram.length === 0 ? (
              <VazioComAcao
                titulo="Nenhum município com esse histórico ainda"
                descricao="Nenhum dos 1.073 municípios levantados mostrou ter contratado essa categoria."
              />
            ) : (
              <ul className="lista-linhas">
                {jaContrataram.map((m) => {
                  const atrasado = m.ultimaContratacao < dataLimiteAtraso;
                  return (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-3">
                      <Link href={`/admin/entidades/${m.id}`} className="group flex min-w-0 items-start gap-3">
                        {m.uf && <span className="selo-uf mt-0.5 shrink-0">{m.uf}</span>}
                        <span className="min-w-0">
                          <span
                            className="block text-[14px] font-bold text-[color:var(--cor-texto)] group-hover:text-[color:var(--cor-marca-clara)]"
                            style={{ letterSpacing: "-0.01em" }}
                          >
                            {m.nome}
                          </span>
                          <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                            {m.municipio ? `${m.municipio} · ` : ""}última contratação:{" "}
                            <span className="numero">{m.ultimaContratacao.toLocaleDateString("pt-BR")}</span>
                          </span>
                        </span>
                      </Link>
                      {atrasado && <Badge tom="atencao">Sem renovar há {ANOS_PARA_CONSIDERAR_ATRASADO}+ anos</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Secao>

          <Secao
            titulo="Possível oportunidade (raio-X não achou contratação nessa categoria)"
            acao={<SeloCategoria categoria={rotuloDaCategoria(ata.categoria)} />}
          >
            <Aviso tom="atencao" className="mb-5">
              Especulativo — pode ser que o município nunca tenha licitado isso, ou que o
              classificador por palavra-chave não tenha pegado o contrato certo.
            </Aviso>
            {nuncaContrataram.length === 0 ? (
              <VazioComAcao titulo="Nenhum candidato nesta lista" descricao="" />
            ) : (
              <ul className="flex flex-wrap gap-2">
                {nuncaContrataram.map((m) => (
                  <li key={m.id}>
                    <Link href={`/admin/entidades/${m.id}`} className="chip-site" style={{ paddingRight: 14 }}>
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
