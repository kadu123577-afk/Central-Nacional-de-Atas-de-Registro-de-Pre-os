import { ufValida } from "@/lib/site/ufs";

/**
 * Demandas do formulário "Não achei a ata" (vitrine pública). Validação e
 * vocabulário ficam aqui, em funções puras, para testar sem banco.
 */

export const STATUS_DEMANDA = ["nova", "em_busca", "respondida", "descartada"] as const;
export type StatusDemanda = (typeof STATUS_DEMANDA)[number];

export const ROTULO_STATUS_DEMANDA: Record<StatusDemanda, string> = {
  nova: "Nova",
  em_busca: "Em busca",
  respondida: "Respondida",
  descartada: "Descartada",
};

export function statusDemandaValido(valor: string): valor is StatusDemanda {
  return (STATUS_DEMANDA as readonly string[]).includes(valor);
}

export const PRAZOS_DEMANDA = ["Urgente, até 30 dias", "De 1 a 3 meses", "Mais de 3 meses"] as const;

export interface DadosDemanda {
  objeto: string;
  quantidade: string;
  uf: string;
  prazo: string;
  orgao: string;
  nome: string;
  cargo: string;
  contato: string;
  observacoes: string;
}

export type ErrosDemanda = Partial<Record<keyof DadosDemanda, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Telefone com DDD: 10 ou 11 dígitos (aceita +55 na frente). */
function parecemTelefone(texto: string): boolean {
  let digitos = texto.replace(/\D/g, "");
  if (digitos.startsWith("55") && digitos.length >= 12) digitos = digitos.slice(2);
  return digitos.length === 10 || digitos.length === 11;
}

export function contatoValido(contato: string): boolean {
  const c = contato.trim();
  return EMAIL.test(c) || parecemTelefone(c);
}

/** Lê os campos do formulário, já aparados e com limite de tamanho. */
export function lerDemanda(formData: FormData): DadosDemanda {
  const campo = (nome: string, max: number) => String(formData.get(nome) ?? "").trim().slice(0, max);
  return {
    objeto: campo("objeto", 300),
    quantidade: campo("quantidade", 100),
    uf: campo("uf", 2).toUpperCase(),
    prazo: campo("prazo", 40),
    orgao: campo("orgao", 200),
    nome: campo("nome", 120),
    cargo: campo("cargo", 100),
    contato: campo("contato", 160),
    observacoes: campo("obs", 2000),
  };
}

export function validarDemanda(d: DadosDemanda): ErrosDemanda {
  const erros: ErrosDemanda = {};
  if (d.objeto.length < 3) erros.objeto = "Diga o que o seu órgão precisa comprar.";
  if (d.orgao.length < 2) erros.orgao = "Informe o nome do órgão.";
  if (d.nome.length < 2) erros.nome = "Informe o seu nome.";
  if (!d.contato) erros.contato = "Informe um e-mail ou telefone para retorno.";
  else if (!contatoValido(d.contato)) erros.contato = "Informe um e-mail válido ou um telefone com DDD.";
  if (d.uf && !ufValida(d.uf)) erros.uf = "Estado inválido.";
  if (d.prazo && !(PRAZOS_DEMANDA as readonly string[]).includes(d.prazo)) erros.prazo = "Prazo inválido.";
  return erros;
}
