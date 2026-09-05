import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { Numero } from "@/components/ui/valores";
import { CATEGORIAS_ATAS } from "@/lib/categorias";
import { FormularioCompletarFornecedor } from "./formulario-fornecedor";
import { FormularioAdicionarItem } from "./formulario-item";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Pontos focais", href: "/admin/pontos-focais" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

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
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Completar Ata {ata.numero}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.objeto}
          </p>
        </div>
        <Link href="/admin" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <Secao titulo="Fornecedor">
        {fornecedorEhPlaceholder ? (
          <>
            <p className="mb-3 text-sm" style={{ color: "var(--cor-texto-2)" }}>
              <Badge tom="alerta">Fornecedor a confirmar</Badge> — o PNCP não retornou o
              vencedor da compra. Informe o fornecedor real abaixo.
            </p>
            <FormularioCompletarFornecedor ataId={ata.id} />
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--cor-texto)" }}>
            {ata.fornecedor.razaoSocial} ({ata.fornecedor.cnpj}) — já confirmado.
          </p>
        )}
      </Secao>

      <Secao titulo={`Itens (${ata.itens.length})`}>
        {ata.itens.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {ata.itens.map((item) => (
              <li key={item.id} className="painel p-3 text-sm">
                <span style={{ color: "var(--cor-texto)" }}>{item.descricao}</span>
                <span className="ml-2" style={{ color: "var(--cor-texto-3)" }}>
                  (<Numero>{item.quantidadeRegistrada}</Numero> {item.unidade})
                </span>
              </li>
            ))}
          </ul>
        )}
        <FormularioAdicionarItem ataId={ata.id} categorias={CATEGORIAS_ATAS} />
      </Secao>
    </AppShell>
  );
}
