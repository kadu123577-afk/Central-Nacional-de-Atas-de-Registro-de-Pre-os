import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { FormularioNovaAtaAdmin } from "./formulario";

export const dynamic = "force-dynamic";

/**
 * Cadastro de ata pelo admin (2026-09-26) — decisão de negócio: quem
 * cadastra a ata agora é a Tech 10, manualmente; o painel do fornecedor
 * virou vitrine, não ferramenta de autocadastro (ver
 * src/app/fornecedor/atas/nova/page.tsx, pausada).
 */
export default async function NovaAtaAdminPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  return <FormularioNovaAtaAdmin />;
}
