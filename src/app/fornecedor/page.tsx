import { redirect } from "next/navigation";
import { fornecedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel, limitePorOrgao } from "@/lib/saldo";
import { rotuloDaCategoria } from "@/lib/categorias";
import { percentualSaldoItem } from "@/lib/vitrine";
import { logoutFornecedor } from "./actions";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Numero } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { tomStatusAta } from "@/lib/severidade";

export const dynamic = "force-dynamic";

// O status vem do banco em caixa alta; o selo do site é pílula sem caixa alta.
const ROTULO_STATUS = { PENDENTE: "Pendente", APROVADA: "Aprovada", REJEITADA: "Rejeitada" } as const;

function IconeAnexo() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10.5 4.5 5.4 9.6a1.6 1.6 0 0 0 2.3 2.3l5.4-5.4a3 3 0 0 0-4.3-4.3L3.4 7.6a4.4 4.4 0 0 0 6.2 6.2l4.1-4.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function PainelFornecedorPage() {
  const fornecedorId = await fornecedorIdLogado();
  if (!fornecedorId) {
    redirect("/fornecedor/login");
  }

  const fornecedor = await prisma.fornecedor.findUnique({
    where: { id: fornecedorId },
    include: {
      atas: {
        include: { itens: { include: { saldo: true } }, documentos: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!fornecedor) {
    redirect("/fornecedor/login");
  }

  // Números-resumo da faixa — só contagens do que a própria página lista
  // abaixo (cartões, selos "Pendente" e linhas das tabelas), sem regra nova.
  const pendentes = fornecedor.atas.filter((a) => a.status === "PENDENTE").length;
  const totalDeItens = fornecedor.atas.reduce((soma, a) => soma + a.itens.length, 0);

  return (
    <AppShell
      area="Fornecedor"
      itens={[
        { rotulo: "Minhas atas", href: "/fornecedor" },
        { rotulo: "Pedidos recebidos", href: "/fornecedor/adesoes" },
        { rotulo: "Perfil", href: "/fornecedor/perfil" },
      ]}
      rodape={
        <form action={logoutFornecedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina rotulo="Painel do fornecedor" titulo="Minhas atas" descricao={fornecedor.razaoSocial} />

      {fornecedor.atas.length === 0 ? (
        <VazioComAcao
          titulo="Nenhuma ata ainda"
          descricao="O cadastro de atas é feito pela Tech 10 — fale com o time comercial pra colocar sua primeira ata na plataforma."
        />
      ) : (
        <>
          <FaixaNumeros
            itens={[
              { valor: fornecedor.atas.length, rotulo: fornecedor.atas.length === 1 ? "Ata" : "Atas" },
              { valor: pendentes, rotulo: "Aguardando aprovação", tom: pendentes > 0 ? "atencao" : undefined },
              { valor: totalDeItens, rotulo: totalDeItens === 1 ? "Item registrado" : "Itens registrados" },
            ]}
          />

          <ul className="flex flex-col gap-6">
            {fornecedor.atas.map((ata) => (
              <li key={ata.id} className="painel p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="codigo" style={{ color: "var(--cor-texto-3)", fontSize: 11.5 }}>
                      Ata Nº {ata.numero}
                    </p>
                    <h2
                      className="marca mt-1.5 text-[17px] leading-snug"
                      style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.025em" }}
                    >
                      {ata.objeto}
                    </h2>
                    <p className="mt-1 text-[13px]" style={{ color: "var(--cor-texto-3)" }}>
                      {[
                        ata.categoria ? rotuloDaCategoria(ata.categoria) : null,
                        `vigência até ${ata.dataVigenciaFim.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`,
                        `${ata.itens.length} ${ata.itens.length === 1 ? "item" : "itens"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Badge tom={tomStatusAta(ata.status)}>{ROTULO_STATUS[ata.status]}</Badge>
                </div>

                {ata.documentos.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ata.documentos.map((doc) => (
                      <a
                        key={doc.id}
                        href={`/api/documentos/${doc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors hover:border-[var(--cor-marca-borda)] hover:text-[var(--cor-marca-clara)]"
                        style={{ borderColor: "var(--cor-borda)", color: "var(--cor-texto-2)", background: "var(--cor-superficie)" }}
                      >
                        <IconeAnexo />
                        {doc.nomeArquivo}
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-5 overflow-x-auto rounded-[12px] border" style={{ borderColor: "var(--cor-borda)" }}>
                  <table className="tabela-atas min-w-[620px]">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="text-right">Registrado</th>
                        <th className="text-right">Limite por órgão</th>
                        <th className="w-[170px]">Saldo disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ata.itens.map((item) => {
                        const saldo = percentualSaldoItem(item);
                        return (
                          <tr key={item.id}>
                            <td>
                              <span className="titulo-linha">{item.descricao}</span>
                            </td>
                            <td className="whitespace-nowrap text-right" style={{ color: "var(--cor-texto)" }}>
                              <Numero>
                                {item.quantidadeRegistrada} {item.unidade}
                              </Numero>
                            </td>
                            <td className="whitespace-nowrap text-right">
                              <Numero>{limitePorOrgao(item.quantidadeRegistrada)}</Numero>
                            </td>
                            <td>
                              <span className="block text-[13px] font-bold" style={{ color: "var(--cor-texto)" }}>
                                <Numero>
                                  {saldoAgregadoDisponivel(
                                    item.quantidadeRegistrada,
                                    item.saldo?.quantidadeConsumida ?? 0,
                                  )}
                                </Numero>
                              </span>
                              {saldo !== null && (
                                <div className="barra-saldo mt-1.5" title={`${saldo}% do teto de adesões`}>
                                  <div style={{ width: `${saldo}%` }} />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
