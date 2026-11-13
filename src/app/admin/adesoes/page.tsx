import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { exigirPermissaoDe, permissoesDoAdmin } from "@/lib/permissoes-db";
import { temPermissao } from "@/lib/permissoes";
import { prisma } from "@/lib/prisma";
import { carregarFilaDaInstrucao } from "@/lib/fila-instrucao-db";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { ONDE_PRONTA_PARA_REGISTRAR } from "@/lib/registrar-adesao-db";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";

export const dynamic = "force-dynamic";

const dataBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

/**
 * Adesões (2026-11-14), o caminho do município depois da negociação: instruir (atividade 11, o
 * Dr. Rui e o consultor), declarar a conformidade (12, o jurídico) e registrar a adesão (13, o
 * estagiário da captação). Cada pessoa vê primeiro a lista do que é dela: quem registra, os
 * municípios prontos; os demais, os que esperam instrução e declaração.
 */
export default async function AdesoesPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, ["adesao.registrar", "adesao.declarar", "adesao.instruir"]);
  const permissoes = (await permissoesDoAdmin(adminId)) ?? [];
  const podeRegistrar = temPermissao(permissoes, "adesao.registrar");
  const podeDeclarar = temPermissao(permissoes, "adesao.declarar");
  const podeInstruir = temPermissao(permissoes, "adesao.instruir");
  // Cada pessoa vê só o bloco da etapa dela (14/11/2026): o estagiário não vê a fila de instrução.
  const verProntas = podeRegistrar;
  const verInstrucao = podeInstruir || podeDeclarar;
  const verRegistradas = podeRegistrar || podeDeclarar;

  await expirarOportunidadesVencidas();

  const [prontas, totalProntas, fila, registradas] = await Promise.all([
    prisma.oportunidadeVenda.findMany({
      where: ONDE_PRONTA_PARA_REGISTRAR,
      orderBy: { atualizadoEm: "asc" },
      take: 100,
      select: {
        id: true,
        estagio: true,
        entidadeAlvo: { select: { nome: true, municipio: true, uf: true } },
        ata: { select: { numero: true, objeto: true } },
        vendedor: { select: { nome: true } },
        instrucao: { select: { declaracaoEm: true } },
      },
    }),
    prisma.oportunidadeVenda.count({ where: ONDE_PRONTA_PARA_REGISTRAR }),
    carregarFilaDaInstrucao(100),
    prisma.oportunidadeVenda.findMany({
      where: { estagio: "aderiu" },
      orderBy: { atualizadoEm: "desc" },
      take: 30,
      select: {
        id: true,
        valorAderido: true,
        atualizadoEm: true,
        entidadeAlvo: { select: { nome: true, municipio: true, uf: true } },
        ata: { select: { numero: true } },
        vendedor: { select: { nome: true } },
        _count: { select: { itensAderidos: true } },
      },
    }),
  ]);

  const blocoPronto = (
    <Secao
      key="prontas"
      titulo={`Prontas para registrar (${totalProntas})`}
      descricao="Declaração do jurídico feita e contrato na ata. O registro leva a quantidade de cada item: o saldo da ata anda e os limites do art. 86 (50% por município, 200% no total) são conferidos na hora."
      destaque={podeRegistrar}
    >
      {prontas.length === 0 ? (
        <VazioComAcao
          titulo="Nada para registrar agora"
          descricao="Quando o jurídico registrar a declaração de conformidade de um município, ele aparece aqui."
        />
      ) : (
        <div className="moldura-tabela">
          <table className="tabela-atas min-w-[720px]">
            <thead>
              <tr>
                <th>Município</th>
                <th>Ata</th>
                <th>Consultor</th>
                <th>Declaração</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prontas.map((o) => (
                <tr key={o.id}>
                  <td className="align-top">
                    <span className="titulo-linha">{o.entidadeAlvo.municipio ?? o.entidadeAlvo.nome}</span>
                    {o.entidadeAlvo.uf && (
                      <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {o.entidadeAlvo.uf}
                      </span>
                    )}
                  </td>
                  <td className="align-top">
                    <span className="codigo">{o.ata.numero}</span>
                    <span className="block max-w-[320px] truncate text-xs" style={{ color: "var(--cor-texto-3)" }} title={o.ata.objeto}>
                      {o.ata.objeto}
                    </span>
                  </td>
                  <td className="align-top">{o.vendedor.nome}</td>
                  <td className="align-top">{o.instrucao?.declaracaoEm ? dataBr(o.instrucao.declaracaoEm) : "—"}</td>
                  <td className="align-top text-right">
                    <Link href={`/admin/adesoes/${o.id}`} className="botao-atas">
                      {podeRegistrar ? "Registrar" : "Ver"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalProntas > prontas.length && (
            <p className="px-3 py-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Mostrando as {prontas.length} mais antigas de {totalProntas}.
            </p>
          )}
        </div>
      )}
    </Secao>
  );

  const blocoInstrucao = (
    <Secao
      key="instrucao"
      titulo={`Em instrução, esperando a declaração (${fila.total})`}
      descricao="Municípios em negociação. Os itens da instrução são marcados pelo consultor e pelo Dr. Rui; a declaração de conformidade é do jurídico e libera o registro. Os prontos para declarar vêm primeiro."
      destaque={podeDeclarar}
    >
      {fila.itens.length === 0 ? (
        <VazioComAcao
          titulo="Nenhum município em instrução"
          descricao="Quando um consultor levar um município para Em negociação, ele aparece aqui."
        />
      ) : (
        <div className="moldura-tabela">
          <table className="tabela-atas min-w-[720px]">
            <thead>
              <tr>
                <th>Município</th>
                <th>Ata</th>
                <th>Consultor</th>
                <th>Instrução</th>
                <th>Prazo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fila.itens.map((i) => (
                <tr key={i.id}>
                  <td className="align-top">
                    <span className="titulo-linha">{i.municipio}</span>
                    {i.uf && (
                      <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {i.uf}
                      </span>
                    )}
                  </td>
                  <td className="codigo align-top">{i.ataNumero}</td>
                  <td className="align-top">{i.consultor}</td>
                  <td className="align-top">
                    {i.prontoParaDeclarar ? (
                      <Badge tom="marca">Pronta para declarar</Badge>
                    ) : (
                      <span className="numero text-sm">
                        {i.obrigatoriosFeitos} de {i.obrigatoriosTotal} itens
                      </span>
                    )}
                  </td>
                  <td className="align-top">{i.prazoEm ? dataBr(i.prazoEm) : "—"}</td>
                  <td className="align-top text-right">
                    <Link href={`/admin/adesoes/${i.id}`} className="botao-atas">
                      {podeDeclarar && i.prontoParaDeclarar ? "Declarar" : "Abrir"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {fila.total > fila.itens.length && (
            <p className="px-3 py-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Mostrando {fila.itens.length} de {fila.total}.
            </p>
          )}
        </div>
      )}
    </Secao>
  );

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-6xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Adesão"
        titulo="Instruir e registrar"
        destaque="adesões"
        descricao={[
          verInstrucao ? `${fila.prontosParaDeclarar} município(s) com a instrução completa, esperando a declaração` : null,
          verProntas ? `${totalProntas} pronto(s) para registrar` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        voltar={{ href: "/admin", rotulo: "Minhas tarefas" }}
      />

      {podeRegistrar
        ? [verProntas && blocoPronto, verInstrucao && blocoInstrucao]
        : [verInstrucao && blocoInstrucao, verProntas && blocoPronto]}

      {verRegistradas && (
      <Secao titulo="Registradas recentemente" descricao="As 30 últimas. Abra uma para ver as quantidades por item.">
        {registradas.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Nenhuma adesão registrada ainda.
          </p>
        ) : (
          <div className="moldura-tabela">
            <table className="tabela-atas min-w-[720px]">
              <thead>
                <tr>
                  <th>Município</th>
                  <th>Ata</th>
                  <th>Consultor</th>
                  <th>Itens</th>
                  <th>Valor aderido</th>
                  <th>Em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {registradas.map((o) => (
                  <tr key={o.id}>
                    <td className="align-top">
                      <span className="titulo-linha">{o.entidadeAlvo.municipio ?? o.entidadeAlvo.nome}</span>
                      {o.entidadeAlvo.uf && (
                        <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {o.entidadeAlvo.uf}
                        </span>
                      )}
                    </td>
                    <td className="codigo align-top">{o.ata.numero}</td>
                    <td className="align-top">{o.vendedor.nome}</td>
                    <td className="numero align-top">{o._count.itensAderidos}</td>
                    <td className="numero align-top">
                      {o.valorAderido != null ? `R$ ${Number(o.valorAderido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="align-top">{dataBr(o.atualizadoEm)}</td>
                    <td className="align-top text-right">
                      <Link href={`/admin/adesoes/${o.id}`} className="botao-atas link">
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
      )}
    </AppShell>
  );
}
