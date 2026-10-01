import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { CartaoIndicador } from "@/components/ui/cartao-indicador";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { LinhaRecebivel } from "./linha-recebivel";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Atas", href: "/atas" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Recebíveis — vendedores", href: "/admin/recebiveis-vendedores" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
  { rotulo: "Municípios/Entidades", href: "/admin/entidades" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

/**
 * Controle de recebíveis do canal de vendedores (2026-10-01, pedido
 * explícito): "quantas atas foram aderidas e qual o valor que foi
 * aderido e qual o vendedor que vendeu, para termos controle de
 * recebíveis". Separado de /admin/faturamento (que é o canal de
 * autoatendimento do órgão, ligado a Adesao/Item) porque aqui a adesão
 * nasce do Kanban do vendedor (OportunidadeVenda), outro pipeline
 * comercial — mesma régua de negócio (percentual sobre o liquidado),
 * fonte de dados diferente.
 */
export default async function RecebiveisVendedoresPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const oportunidadesAderidas = await prisma.oportunidadeVenda.findMany({
    where: { estagio: "aderiu" },
    include: {
      ata: { include: { fornecedor: true } },
      entidadeAlvo: true,
      vendedor: true,
      liquidacoes: { orderBy: { dataLiquidacao: "desc" } },
    },
    orderBy: { atualizadoEm: "desc" },
  });

  const linhas = oportunidadesAderidas.map((o) => {
    const somaLiquidado = o.liquidacoes.reduce((soma, l) => soma + Number(l.valorLiquidado), 0);
    const percentual = o.percentualComissao ? Number(o.percentualComissao) : 0;
    return {
      oportunidade: o,
      valorAderido: o.valorAderido ? Number(o.valorAderido) : 0,
      somaLiquidado,
      valorAReceber: somaLiquidado * percentual,
    };
  });

  const totalAderido = linhas.reduce((soma, l) => soma + l.valorAderido, 0);
  const totalLiquidado = linhas.reduce((soma, l) => soma + l.somaLiquidado, 0);
  const totalAReceber = linhas.reduce((soma, l) => soma + l.valorAReceber, 0);

  // Resumo por vendedor — "qual o vendedor que vendeu", agregado.
  const porVendedor = new Map<
    string,
    { nome: string; atasAderidas: number; valorAderido: number; valorAReceber: number }
  >();
  for (const l of linhas) {
    const v = l.oportunidade.vendedor;
    const atual = porVendedor.get(v.id) ?? {
      nome: v.nome,
      atasAderidas: 0,
      valorAderido: 0,
      valorAReceber: 0,
    };
    atual.atasAderidas += 1;
    atual.valorAderido += l.valorAderido;
    atual.valorAReceber += l.valorAReceber;
    porVendedor.set(v.id, atual);
  }
  const resumoVendedores = [...porVendedor.values()].sort((a, b) => b.valorAReceber - a.valorAReceber);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Recebíveis — vendedores
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Adesões fechadas pelo time de vendas (Kanban), por município. O valor a receber é
            sempre sobre o que foi liquidado (nota fiscal), nunca sobre o valor aderido — o
            ente pode usar menos do que aderiu.
          </p>
        </div>
        <Link href="/admin" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoIndicador rotulo="Total aderido" valor={<Cifra valor={totalAderido} />} tom="neutro" />
        <CartaoIndicador rotulo="Total liquidado" valor={<Cifra valor={totalLiquidado} />} tom="neutro" />
        <CartaoIndicador
          rotulo="Total a receber"
          valor={<Cifra valor={totalAReceber} />}
          tom={totalAReceber > 0 ? "atencao" : "neutro"}
        />
      </div>

      {resumoVendedores.length > 0 && (
        <Secao titulo="Por vendedor">
          <div className="overflow-x-auto">
            <table className="tabela-atas">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Atas/municípios aderidos</th>
                  <th>Valor aderido</th>
                  <th>A receber</th>
                </tr>
              </thead>
              <tbody>
                {resumoVendedores.map((v) => (
                  <tr key={v.nome}>
                    <td>{v.nome}</td>
                    <td>{v.atasAderidas}</td>
                    <td>
                      <Cifra valor={v.valorAderido} />
                    </td>
                    <td>
                      <Cifra valor={v.valorAReceber} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao titulo={`Adesões (${linhas.length})`}>
        {linhas.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma adesão registrada ainda"
            descricao="Nasce quando um vendedor marca uma oportunidade como 'Aderiu' no Kanban."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {linhas.map(({ oportunidade: o, valorAderido }) => (
              <LinhaRecebivel
                key={o.id}
                oportunidadeId={o.id}
                nomeMunicipio={o.entidadeAlvo.nome}
                uf={o.entidadeAlvo.uf}
                ataNumero={o.ata.numero}
                fornecedorRazaoSocial={o.ata.fornecedor.razaoSocial}
                vendedorNome={o.vendedor.nome}
                valorAderido={String(valorAderido)}
                percentualComissao={o.percentualComissao ? o.percentualComissao.toString() : "0"}
                liquidacoes={o.liquidacoes.map((l) => ({
                  id: l.id,
                  valorLiquidado: l.valorLiquidado.toString(),
                  numeroNotaFiscal: l.numeroNotaFiscal,
                  dataLiquidacao: l.dataLiquidacao.toISOString(),
                }))}
              />
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
