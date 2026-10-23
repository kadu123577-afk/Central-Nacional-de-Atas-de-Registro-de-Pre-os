import { redirect } from "next/navigation";
import { caminhoEntrar } from "@/lib/destino-login";

/**
 * A entrada é única e fica em /entrar (descobre o perfil pelo e-mail e leva à
 * área certa). Esta rota só continua existindo para os links, favoritos e
 * redirecionamentos de "sem sessão" que ainda apontam para cá: redireciona
 * (temporário) levando junto apenas um destino válido, se houver.
 */
export default async function PaginaLoginAntiga({
  searchParams,
}: {
  searchParams: Promise<{ ata?: string; destino?: string }>;
}) {
  redirect(caminhoEntrar(await searchParams));
}
