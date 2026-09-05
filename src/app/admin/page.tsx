import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel } from "@/lib/saldo";
import { aprovarAta, logoutAdmin, rejeitarAta } from "./actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { CartaoIndicador } from "@/components/ui/cartao-indicador";
import { Badge } from "@/components/ui/badge";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";

export const dynamic = "force-dynamic";

// Mesmo valor usado em src/lib/rastreador-pncp.ts pro fornecedor
// placeholder quando o PNCP não retorna o vencedor da compra.
const CNPJ_FORNECEDOR_A_CONFIRMAR = "00000000000000";

/** Ata importada automaticamente (PNCP ou Compras.gov.br) que ainda não tem
 * fornecedor real identificado ou nenhum item enriquecido — acha da revisão
 * de telas de 2026-09-04: essas atas se perdiam misturadas com a fila
 * normal de moderação. Mesma checagem serve pras duas fontes, que rodam em
 * paralelo desde 2026-09-04. */
function ataImportadaIncompleta(ata: { origem: string; itens: unknown[]; fornecedor: { cnpj: string } }): boolean {
  return (
    (ata.origem === "PNCP" || ata.origem === "COMPRAS_GOV") &&
    (ata.itens.length === 0 || ata.fornecedor.cnpj === CNPJ_FORNECEDOR_A_CONFIRMAR)
  );
}

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
  { rotulo: "Municípios/Entidades", href: "/admin/entidades" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

export default async function PainelAdminPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const [
    totalAtas,
    atasComAdesao,
    itensComSaldo,
    pedidosEmAndamento,
    pedidosFaturados,
    atasPendentes,
    faturamentos,
  ] = await Promise.all([
    prisma.ata.count({ where: { status: "APROVADA" } }),
    // Funil de conversão (mapa do núcleo de atas, 2026-09-05): quantas atas
    // aprovadas conseguiram fechar pelo menos uma adesão de verdade — não
    // existe estágio de "cancelada" em Adesao hoje, então qualquer adesão
    // registrada já conta.
    prisma.ata.count({
      where: { status: "APROVADA", itens: { some: { adesoes: { some: {} } } } },
    }),
    prisma.item.findMany({ include: { saldo: true } }),
    prisma.adesao.count({ where: { estagio: { not: "FATURADA" } } }),
    prisma.adesao.count({ where: { estagio: "FATURADA" } }),
    prisma.ata
      .findMany({
        where: { status: "PENDENTE" },
        include: { fornecedor: true, orgaoGerenciador: true, itens: true, documentos: true },
        orderBy: { createdAt: "asc" },
      })
      .then((atas) =>
        // Incompletas primeiro — são as que mais precisam de atenção do
        // admin antes de aprovar/rejeitar, não deveriam ficar perdidas no
        // meio da fila comum.
        [...atas].sort((a, b) => Number(ataImportadaIncompleta(b)) - Number(ataImportadaIncompleta(a))),
      ),
    prisma.faturamento.findMany(),
  ]);

  const taxaConversao = totalAtas > 0 ? Math.round((atasComAdesao / totalAtas) * 100) : null;

  const saldoTotalDisponivel = itensComSaldo.reduce(
    (total, item) =>
      total + saldoAgregadoDisponivel(item.quantidadeRegistrada, item.saldo?.quantidadeConsumida ?? 0),
    0,
  );

  const totalAReceber = faturamentos
    .filter((f) => !f.pago)
    .reduce((total, f) => total + Number(f.valorTaxaIntermediacao), 0);
  const totalRecebido = faturamentos
    .filter((f) => f.pago)
    .reduce((total, f) => total + Number(f.valorTaxaIntermediacao), 0);

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
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Painel administrativo
      </h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CartaoIndicador rotulo="Atas aprovadas" valor={totalAtas} />
        <CartaoIndicador rotulo="Saldo total disponível" valor={saldoTotalDisponivel} />
        <CartaoIndicador
          rotulo="Pedidos em andamento"
          valor={pedidosEmAndamento}
          tom={pedidosEmAndamento > 0 ? "atencao" : "neutro"}
        />
        <CartaoIndicador rotulo="Contratos faturados" valor={pedidosFaturados} tom="marca" />
        <CartaoIndicador
          rotulo="Total a receber"
          valor={<Cifra valor={totalAReceber} />}
          tom={totalAReceber > 0 ? "atencao" : "neutro"}
        />
        <CartaoIndicador rotulo="Total recebido" valor={<Cifra valor={totalRecebido} />} />
        <CartaoIndicador
          rotulo="Atas com adesão"
          valor={atasComAdesao}
          nota={`de ${totalAtas} aprovadas`}
        />
        <CartaoIndicador
          rotulo="Taxa de conversão"
          valor={taxaConversao === null ? "—" : `${taxaConversao}%`}
          tom={taxaConversao !== null && taxaConversao > 0 ? "marca" : "neutro"}
          nota="atas aprovadas que já fecharam ao menos 1 adesão"
        />
      </div>

      <Secao titulo="Atas aguardando moderação">
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Uma ata só aparece no catálogo público depois de aprovada aqui.
        </p>

        {atasPendentes.length === 0 ? (
          <div className="mt-4">
            <VazioComAcao
              titulo="Nada pendente"
              descricao="Nenhuma ata aguardando moderação no momento."
            />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {atasPendentes.map((ata) => (
              <li key={ata.id} className="painel p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-medium" style={{ color: "var(--cor-texto)" }}>
                    Ata {ata.numero}
                  </h3>
                  <div className="flex items-center gap-2">
                    {ataImportadaIncompleta(ata) && <Badge tom="alerta">Importação incompleta</Badge>}
                    <span className="eyebrow">
                      {ata.origem === "PNCP"
                        ? "Importada do PNCP"
                        : ata.origem === "COMPRAS_GOV"
                          ? "Importada do Compras.gov.br"
                          : "Cadastro manual"}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
                  {ata.objeto}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  {ata.fornecedor.cnpj === CNPJ_FORNECEDOR_A_CONFIRMAR
                    ? "Fornecedor a confirmar"
                    : ata.fornecedor.razaoSocial}{" "}
                  · Órgão gerenciador: {ata.orgaoGerenciador.nome} ({ata.orgaoGerenciador.uf}) ·{" "}
                  {ata.itens.length === 0
                    ? "sem itens (a completar)"
                    : `${ata.itens.length} ${ata.itens.length === 1 ? "item" : "itens"}`}
                </p>
                {ata.documentos.map((doc) => (
                  <a
                    key={doc.id}
                    href={`/api/documentos/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs underline"
                    style={{ color: "var(--cor-texto-2)" }}
                  >
                    📎 {doc.nomeArquivo}
                  </a>
                ))}

                <div className="mt-3 flex gap-2">
                  {ataImportadaIncompleta(ata) && (
                    <Link href={`/admin/atas/${ata.id}/completar`} className="botao-atas secundario">
                      Completar
                    </Link>
                  )}
                  <form action={aprovarAta}>
                    <input type="hidden" name="ataId" value={ata.id} />
                    <button type="submit" className="botao-atas">
                      Aprovar
                    </button>
                  </form>
                  <form action={rejeitarAta}>
                    <input type="hidden" name="ataId" value={ata.id} />
                    <button type="submit" className="botao-atas critico">
                      Rejeitar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
