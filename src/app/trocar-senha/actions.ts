"use server";

import { redirect } from "next/navigation";
import { criarSessaoAdmin, criarSessaoVendedor, hashSenha, verificarSenha } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";
import { validarSenhaNova } from "@/lib/senha";
import { contaParaTrocarSenha, destinoDaConta } from "@/lib/troca-senha";

/**
 * Troca obrigatória da senha provisória (2026-11-14). Quem entra com a senha que a gestão
 * passou só chega aqui: o resto do sistema não reconhece a sessão até a troca (src/lib/auth.ts).
 * Depois de trocar, a sessão antiga é derrubada (sessaoVersao + 1) e uma nova é aberta.
 */
export interface EstadoTrocaObrigatoria {
  erro?: string;
}

function campo(formData: FormData, nome: string): string {
  const valor = formData.get(nome);
  // Arquivo anexado a um campo de texto (requisição montada à mão) não é texto.
  return typeof valor === "string" ? valor : "";
}

export async function definirSenhaDefinitiva(
  _estadoAnterior: EstadoTrocaObrigatoria,
  formData: FormData,
): Promise<EstadoTrocaObrigatoria> {
  // Primeiro a sessão: nada do formulário é lido antes de saber quem chama.
  const conta = await contaParaTrocarSenha();
  if (!conta) redirect("/entrar");
  if (!conta.provisoria) redirect(destinoDaConta(conta.tipo));

  const nova = campo(formData, "senhaNova");
  const confirmacao = campo(formData, "confirmacao");
  if (nova !== confirmacao) return { erro: "As duas senhas não são iguais." };
  const erro = validarSenhaNova(nova, conta.email);
  if (erro) return { erro };
  if (await verificarSenha(nova, conta.senhaHash)) {
    return { erro: "Escolha uma senha diferente da provisória." };
  }

  const senhaHash = await hashSenha(nova);
  const dados = { senhaHash, senhaProvisoria: false, sessaoVersao: { increment: 1 } };
  if (conta.tipo === "admin") {
    await prisma.admin.update({ where: { id: conta.id }, data: dados });
    await criarSessaoAdmin(conta.id);
  } else {
    await prisma.vendedor.update({ where: { id: conta.id }, data: dados });
    await criarSessaoVendedor(conta.id);
  }
  await registrarAuditoria({ ator: `${conta.tipo}:${conta.id}`, acao: `${conta.tipo}.senha_definida` });
  redirect(destinoDaConta(conta.tipo));
}
