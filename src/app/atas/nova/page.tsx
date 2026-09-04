import { redirect } from "next/navigation";

/**
 * Rota antiga de cadastro de ata — era pública, sem autenticação nenhuma
 * (achado da auditoria de 2026-09-04: qualquer um podia submeter
 * fornecedor+ata sem login). O cadastro de ata agora vive dentro do painel
 * autenticado do fornecedor, em /fornecedor/atas/nova.
 *
 * Desativada por redirecionamento, não apagada — a lógica antiga continua
 * em src/app/atas/actions.ts (cadastrarAta) caso seja preciso reverter.
 */
export default function AtasNovaDesativada() {
  redirect("/fornecedor/login?motivo=cadastro-exige-login");
}
