import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { Numero } from "@/components/ui/valores";
import { CATEGORIAS_ATAS } from "@/lib/categorias";
import { FormularioCompletarFornecedor } from "./formulario-fornecedor";
import { FormularioAdicionarItem } from "./formulario-item";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

const CNPJ_FORNECEDOR_A_CONFIRMAR = "00000000000000";

export default async function CompletarAtaPage({
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
    include: { fornecedor: true, orgaoGerenciador: true, itens: true },
  });
  if (!ata) notFound();

  const fornecedorEhPlaceholder = ata.fornecedor.cnpj === CNPJ_FORNECEDOR_A_CONFIRMAR;

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
        titulo="Completar Ata"
        destaque={ata.numero}
        descricao={ata.objeto}
        voltar={{ href: "/admin", rotulo: "Painel" }}
      />

      <Secao titulo="Fornecedor" destaque={fornecedorEhPlaceholder}>
        {fornecedorEhPlaceholder ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
              <Badge tom="alerta">Fornecedor a confirmar</Badge> — o PNCP não retornou o
              vencedor da compra. Informe o fornecedor real abaixo.
            </p>
            <FormularioCompletarFornecedor ataId={ata.id} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            <span className="font-bold" style={{ color: "var(--cor-texto)" }}>
              {ata.fornecedor.razaoSocial}
            </span>
            <span className="codigo text-xs" style={{ color: "var(--cor-texto-3)" }}>
              {ata.fornecedor.cnpj}
            </span>
            <Badge tom="marca">já confirmado</Badge>
          </div>
        )}
      </Secao>

      <Secao titulo={`Itens (${ata.itens.length})`}>
        {ata.itens.length > 0 && (
          <div
            className="mb-6 overflow-x-auto rounded-[var(--raio-grande)] border"
            style={{ borderColor: "var(--cor-borda)" }}
          >
            <table className="tabela-atas">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="w-[180px]">Qtd. registrada</th>
                </tr>
              </thead>
              <tbody>
                {ata.itens.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="titulo-linha">{item.descricao}</span>
                    </td>
                    <td style={{ color: "var(--cor-texto)" }}>
                      <Numero>{item.quantidadeRegistrada}</Numero> {item.unidade}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <FormularioAdicionarItem ataId={ata.id} categorias={CATEGORIAS_ATAS} />
      </Secao>
    </AppShell>
  );
}
