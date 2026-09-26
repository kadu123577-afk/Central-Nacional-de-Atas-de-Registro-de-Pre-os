import { redirect } from "next/navigation";

/**
 * Pausado em 2026-09-26 — decisão de negócio: o fornecedor não cadastra
 * mais a própria ata. Quem cadastra agora é a Tech 10, manualmente, via
 * /admin/atas/nova; o painel do fornecedor vira vitrine (mostrar pro
 * vendedor levar ao município), não ferramenta de autocadastro. Pode
 * voltar a ser self-service no futuro — por isso a rota fica
 * desativada por redirecionamento, não apagada, e `FormularioNovaAta` +
 * `cadastrarAtaComoFornecedor` (src/app/fornecedor/atas/actions.ts)
 * continuam intactos pra reativar sem reescrever nada.
 */
export default function NovaAtaFornecedorDesativada() {
  redirect("/fornecedor?motivo=cadastro-agora-e-com-a-tech10");
}
