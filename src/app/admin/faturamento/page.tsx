import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { StatusFaturamento } from "./status-faturamento";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

export default async function FaturamentoAdminPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const faturamentos = await prisma.faturamento.findMany({
    include: {
      adesao: {
        include: {
          orgaoAderente: true,
          item: { include: { ata: { include: { fornecedor: true } } } },
        },
      },
    },
    orderBy: { criadoEm: "desc" },
  });

  const totalAReceber = faturamentos
    .filter((f) => !f.pago)
    .reduce((total, f) => total + Number(f.valorTaxaIntermediacao), 0);

  // Só para a faixa de números — contagens sobre a mesma lista já carregada.
  const emAberto = faturamentos.filter((f) => !f.pago).length;
  const recebidas = faturamentos.length - emAberto;
  // Texto pronto (mesma formatação do <Cifra>): dentro da faixa, um <span>
  // herdaria o estilo de rótulo de `.faixa-numeros span` (12,5px, cinza) e
  // perderia o tamanho e a cor de atenção do número.
  const totalAReceberFormatado = totalAReceber.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

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
        rotulo="Financeiro"
        titulo="Contas"
        destaque="a receber"
        descricao="Taxa de intermediação devida por cada fornecedor, por adesão empenhada."
        voltar={{ href: "/admin", rotulo: "Painel" }}
      />

      <FaixaNumeros
        itens={[
          {
            valor: totalAReceberFormatado,
            rotulo: "Total em aberto",
            tom: totalAReceber > 0 ? "atencao" : undefined,
            nota: `${emAberto} ${emAberto === 1 ? "cobrança a receber" : "cobranças a receber"}`,
          },
          { valor: recebidas, rotulo: "Recebidas" },
          { valor: faturamentos.length, rotulo: "Cobranças geradas" },
        ]}
      />

      {faturamentos.length === 0 ? (
        <VazioComAcao
          titulo="Nenhuma cobrança gerada ainda"
          descricao="Cobranças nascem sozinhas quando um pedido de adesão chega em Empenhada."
        />
      ) : (
        <div className="painel overflow-x-auto">
          <table className="tabela-atas min-w-[820px]">
            <thead>
              <tr>
                <th className="w-[1%]">Ata</th>
                <th>Fornecedor</th>
                <th>Órgão aderente</th>
                <th>Valor do contrato</th>
                <th>A receber</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {faturamentos.map((f) => (
                <tr key={f.id}>
                  <td className="whitespace-nowrap">
                    <Link
                      href={`/adesoes/${f.adesaoId}`}
                      className="codigo text-xs font-semibold text-[var(--cor-marca-clara)] underline-offset-2 hover:underline"
                    >
                      Nº {f.adesao.item.ata.numero}
                    </Link>
                  </td>
                  <td>
                    <span className="titulo-linha block">{f.adesao.item.ata.fornecedor.razaoSocial}</span>
                    <span className="codigo mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      CNPJ {f.adesao.item.ata.fornecedor.cnpj}
                    </span>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <span style={{ color: "var(--cor-texto)" }}>{f.adesao.orgaoAderente.nome}</span>
                      <span className="selo-uf">{f.adesao.orgaoAderente.uf}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <Cifra valor={f.valorContrato} />
                  </td>
                  <td className="whitespace-nowrap font-bold" style={{ color: "var(--cor-texto)" }}>
                    <Cifra valor={f.valorTaxaIntermediacao} />
                  </td>
                  <StatusFaturamento faturamentoId={f.id} pagoInicial={f.pago} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
