import { MolduraPainel } from "@/components/moldura-painel";
import { PermissoesProvider } from "@/components/ui/permissoes-contexto";
import { adminIdLogado } from "@/lib/auth";
import { permissoesDoAdmin } from "@/lib/permissoes-db";

/**
 * Layout do admin. Entrega as permissões da conta logada ao menu lateral (que
 * esconde o que a pessoa não pode usar); sem sessão (tela de login), não filtra.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const adminId = await adminIdLogado();
  const permissoes = adminId ? await permissoesDoAdmin(adminId) : null;
  return (
    <MolduraPainel>
      <PermissoesProvider permissoes={permissoes}>{children}</PermissoesProvider>
    </MolduraPainel>
  );
}
