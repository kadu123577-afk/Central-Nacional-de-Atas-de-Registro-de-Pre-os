"use server";

import { loginAdmin } from "@/app/admin/actions";
import { loginFornecedor } from "@/app/fornecedor/actions";
import { loginOrgao } from "@/app/orgao/actions";
import { loginVendedor } from "@/app/vendedor/actions";
import { registrarAuditoria } from "@/lib/auditoria";
import { gastarTempoDeHash, verificarSenha } from "@/lib/auth";
import { destinoSeguro } from "@/lib/destino-login";
import {
  checarBloqueioLogin,
  checarBloqueioLoginContas,
  registrarFalhaLogin,
  registrarFalhaLoginContas,
} from "@/lib/limite-tentativas";
import {
  buscarCandidatosEntrada,
  ehMensagemDeBloqueio,
  MENSAGEM_ENTRADA_INVALIDA,
  normalizarEmailEntrada,
  perfilEntradaDe,
  ROTULO_PERFIL,
  TIPO_LIMITE_ENTRADA,
  type CandidatoEntrada,
  type PerfilEntrada,
} from "@/lib/login-unico";

export interface OpcaoPerfilEntrada {
  perfil: PerfilEntrada;
  rotulo: string;
}

export interface EstadoEntrar {
  erro?: string;
  /** O erro é sobre o código do autenticador (só vem depois de a senha conferir). */
  exigeCodigo?: boolean;
  /** A senha serviu em mais de um perfil: lista só esses, para a pessoa escolher. */
  escolher?: OpcaoPerfilEntrada[];
}

interface Credenciais {
  email: string;
  senha: string;
  codigo: string;
  destino: string;
}

/**
 * Entrada única do sistema (/entrar). Descobre em quais perfis o e-mail tem
 * conta e entrega a conferência da senha, o 2FA, a sessão, a auditoria e o
 * limite de tentativas à action de login do perfil (loginAdmin,
 * loginVendedor, loginFornecedor, loginOrgao), que seguem sendo o único lugar
 * onde isso acontece. O que esta action acrescenta:
 *
 * - Anti-enumeração: e-mail inexistente, senha errada, conta inativa ou sem
 *   senha dão a mesma resposta e o mesmo gasto de hash. Nada diz que o e-mail
 *   existe, nem em qual perfil, antes de a senha conferir.
 * - E-mail em mais de um perfil: a senha é conferida contra cada conta (sem
 *   criar sessão); se serve em uma só, entra nela; se serve em mais de uma,
 *   devolve a lista (só dos perfis em que serviu) e espera a escolha.
 * - O destino pós-login só vale para órgão, e passa por destinoSeguro.
 *
 * Contagem de falhas: nunca em dobro. Cada envio errado conta uma falha por
 * conta envolvida e uma no IP, só que as ações do perfil contam por conta
 * (chave login:<perfil>:<e-mail>) e e-mail sem conta conta em
 * login:entrar:<e-mail>, de modo que o limite de 5 por conta e 30 por IP vale
 * igual para e-mail que existe e para o que não existe.
 */
export async function entrar(
  _estadoAnterior: EstadoEntrar,
  formData: FormData,
): Promise<EstadoEntrar> {
  const email = normalizarEmailEntrada(formData.get("email"));
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const credenciais: Credenciais = {
    email,
    senha,
    codigo: String(formData.get("codigo") ?? ""),
    // Só o órgão usa o destino; mesmo assim ele é validado aqui, antes de tudo.
    destino: destinoSeguro(formData.get("destino"), "orgao", "/orgao"),
  };

  // Bloqueio por e-mail (normalizado) e por IP, antes de qualquer consulta de
  // conta: a resposta é a mesma exista o e-mail ou não.
  const bloqueio = await checarBloqueioLogin(TIPO_LIMITE_ENTRADA, email);
  if (bloqueio) {
    return { erro: bloqueio };
  }

  const candidatos = await buscarCandidatosEntrada(email);

  if (candidatos.length === 0) {
    // Mesmo tempo de resposta de uma conferência de senha de verdade.
    await gastarTempoDeHash(senha);
    await registrarFalhaLogin(TIPO_LIMITE_ENTRADA, email);
    return { erro: MENSAGEM_ENTRADA_INVALIDA };
  }

  // Um perfil só, ou a escolha feita na segunda etapa: a action do perfil
  // confere a senha, conta a falha e cria a sessão. Um perfil escolhido que
  // não existe para este e-mail é ignorado (não muda a resposta).
  const escolhido = perfilEntradaDe(formData.get("perfil"));
  const direto =
    candidatos.length === 1 ? candidatos[0] : candidatos.find((c) => c.perfil === escolhido);
  if (direto) {
    return entrarComo(direto, credenciais);
  }

  // E-mail em mais de um perfil: confere a senha contra todos, sem sessão.
  const perfis = candidatos.map((c) => c.perfil);
  const bloqueioContas = await checarBloqueioLoginContas(perfis, email);
  if (bloqueioContas) {
    return { erro: bloqueioContas };
  }

  const confere = await Promise.all(candidatos.map((c) => verificarSenha(senha, c.senhaHash)));
  const serviram = candidatos.filter((_, i) => confere[i]);

  if (serviram.length === 0) {
    await registrarFalhaLoginContas(perfis, email);
    await Promise.all(
      candidatos.map((c) =>
        registrarAuditoria({ ator: `${c.perfil}:${c.id}`, acao: `${c.perfil}.login_falhou` }),
      ),
    );
    return { erro: MENSAGEM_ENTRADA_INVALIDA };
  }

  if (serviram.length === 1) {
    return entrarComo(serviram[0], credenciais);
  }

  return {
    escolher: serviram.map((c) => ({ perfil: c.perfil, rotulo: ROTULO_PERFIL[c.perfil] })),
  };
}

/**
 * Chama a action de login do perfil com o e-mail como está gravado. Em caso de
 * sucesso ela cria a sessão e redireciona (a exceção do redirect passa direto
 * por aqui); só volta quando há erro. Do erro, só passam duas coisas: o
 * bloqueio por excesso de tentativas (mesma mensagem para qualquer e-mail) e o
 * pedido do código do autenticador, que o loginAdmin só faz depois de a senha
 * conferir. O resto vira a mensagem genérica.
 */
async function entrarComo(candidato: CandidatoEntrada, c: Credenciais): Promise<EstadoEntrar> {
  const dados = new FormData();
  dados.set("email", candidato.email);
  dados.set("senha", c.senha);

  let resultado: { erro?: string; exigeCodigo?: boolean };
  switch (candidato.perfil) {
    case "admin":
      dados.set("codigo", c.codigo);
      resultado = await loginAdmin({}, dados);
      break;
    case "vendedor":
      resultado = await loginVendedor({}, dados);
      break;
    case "fornecedor":
      resultado = await loginFornecedor({}, dados);
      break;
    case "orgao":
      dados.set("destino", c.destino);
      resultado = await loginOrgao({}, dados);
      break;
  }

  if (ehMensagemDeBloqueio(resultado.erro)) {
    return { erro: resultado.erro };
  }
  if (candidato.perfil === "admin" && resultado.exigeCodigo && resultado.erro) {
    return { erro: resultado.erro, exigeCodigo: true };
  }
  return { erro: MENSAGEM_ENTRADA_INVALIDA };
}
