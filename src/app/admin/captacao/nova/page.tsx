import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { logoutAdmin } from "../../actions";
import { NAV_ADMIN } from "../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FormularioNovaCaptacao } from "./formulario";

export const dynamic = "force-dynamic";

/**
 * Nova ata por indicação (2026-11-14): o captador soube da ata por um contato próprio, fora do PNCP e
 * do radar. Cria um cartão "Identificada" no quadro da Captação, em nome dele.
 */
export default async function NovaCaptacaoPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "atas.captar");

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
        rotulo="Captação"
        titulo="Nova ata"
        destaque="por indicação"
        descricao="Você soube de uma ata por um contato seu, sem passar pelo PNCP nem pelo radar. Guarde aqui a empresa e o que você já sabe; o cartão entra no quadro como “Identificada”, no seu nome."
        voltar={{ href: "/admin/captacao", rotulo: "Captação" }}
      />
      <FormularioNovaCaptacao />
    </AppShell>
  );
}
