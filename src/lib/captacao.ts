/**
 * Regras puras da Captação de atas (2026-11-14): o Kanban do captador (Dr. Almério, Dr. Marcelo).
 * Sem banco e sem rede, para poderem ser testadas; as ações e as telas só leem e gravam.
 *
 * Um cartão por ATA que a Central quer trazer para dentro do sistema. Ela chega por dois
 * caminhos: o Radar de atas (o captador clica em "Captar") ou um contato do próprio captador
 * (cadastro manual, a "indicação"). Depois o cartão anda pelo funil até a ata ser cadastrada.
 *
 * LGPD: o cartão guarda dado de EMPRESA (CNPJ) e anotação da equipe. O contato de pessoa
 * (ContatoEmpresa) é só o profissional: nome, cargo, telefone, e-mail, sempre com "de onde veio".
 * Nunca CPF, endereço residencial nem dado sensível.
 */
import { rotuloDaCategoria, CATEGORIAS_ATAS } from "@/lib/categorias";
import { cnpjValido, normalizarCnpj } from "@/lib/radar-atas";
import {
  contatoVencido,
  cortarTexto,
  hojeBrasilia,
  LIMITE_OBSERVACOES,
  lerDataSoDia,
  normalizarObservacao,
  ufValida,
} from "@/lib/radar-atas-view";
import { nomeFornecedorParaTela } from "@/lib/acompanhamento-view";
import { resumir } from "@/lib/sinais-preditivos";

// ───────────────────────────── Estágios ─────────────────────────────

/** Do primeiro olhar ao fechamento; "perdida" fica fora da fila. */
export const ESTAGIOS_CAPTACAO = ["identificada", "em_contato", "interessada", "fechada", "perdida"] as const;

export type EstagioCaptacao = (typeof ESTAGIOS_CAPTACAO)[number];

export const ROTULO_ESTAGIO_CAPTACAO: Record<EstagioCaptacao, string> = {
  identificada: "Identificada",
  em_contato: "Em contato",
  interessada: "Interessada",
  fechada: "Fechada",
  perdida: "Não deu",
};

/** Quando o cartão deve estar em cada coluna: aparece embaixo do título da coluna. */
export const EXPLICACAO_ESTAGIO_CAPTACAO: Record<EstagioCaptacao, string> = {
  identificada: "Ata achada (no radar ou por indicação); ainda ninguém falou com a empresa.",
  em_contato: "A empresa já foi procurada e a conversa está andando.",
  interessada: "A empresa topou trazer a ata para a Central.",
  fechada: "Ata cadastrada no sistema. Segue para os itens e saldos, depois o contrato de intermediação.",
  perdida: "Recusou, não respondeu ou a ata não serve mais.",
};

/** Cor (token do sistema) do ponto de cada coluna. Nunca hex. */
export const COR_ESTAGIO_CAPTACAO: Record<EstagioCaptacao, string> = {
  identificada: "var(--cor-texto-3)",
  em_contato: "var(--cor-atencao)",
  interessada: "var(--cor-info)",
  fechada: "var(--cor-marca)",
  perdida: "var(--cor-alerta)",
};

/** Os estágios em que o cartão ainda está sendo trabalhado. */
export const ESTAGIOS_ABERTOS_CAPTACAO = ["identificada", "em_contato", "interessada"] as const;

export function estagioCaptacaoValido(valor: unknown): valor is EstagioCaptacao {
  return typeof valor === "string" && (ESTAGIOS_CAPTACAO as readonly string[]).includes(valor);
}

export function rotuloEstagioCaptacao(valor: string): string {
  return estagioCaptacaoValido(valor) ? ROTULO_ESTAGIO_CAPTACAO[valor] : valor;
}

/**
 * Transições feitas à mão:
 *  - identificada ↔ em_contato ↔ interessada, um passo por vez;
 *  - qualquer estágio aberto pode ir para "perdida" (com o motivo);
 *  - "perdida" só volta para "identificada" (recomeçar);
 *  - "fechada" NÃO se alcança nem se deixa à mão: ela só acontece quando a ata é cadastrada no
 *    sistema (sem ata cadastrada não há ata fechada).
 * Ficar no mesmo estágio não é mudança: devolve ok.
 */
export function podeMoverEstagioCaptacao(de: string, para: string): { ok: boolean; erro?: string } {
  if (!estagioCaptacaoValido(de)) return { ok: false, erro: "Estágio atual desconhecido." };
  if (!estagioCaptacaoValido(para)) return { ok: false, erro: "Estágio de destino desconhecido." };
  if (de === para) return { ok: true };
  if (de === "fechada") return { ok: false, erro: "A ata já foi cadastrada no sistema: o cartão não volta." };
  if (para === "fechada") {
    return { ok: false, erro: "A captação só fecha quando a ata é cadastrada: use “Fechou: cadastrar a ata”." };
  }
  if (para === "perdida") return { ok: true };
  if (de === "perdida") {
    return para === "identificada"
      ? { ok: true }
      : { ok: false, erro: "O que não deu só pode voltar para “Identificada”." };
  }
  const fila = ESTAGIOS_ABERTOS_CAPTACAO as readonly string[];
  if (Math.abs(fila.indexOf(de) - fila.indexOf(para)) === 1) return { ok: true };
  return { ok: false, erro: "Mude um estágio por vez: avance ou volte um passo." };
}

/** Destinos que a tela oferece a partir de um estágio. */
export function estagiosPermitidosCaptacao(de: string): EstagioCaptacao[] {
  return ESTAGIOS_CAPTACAO.filter((para) => para !== de && podeMoverEstagioCaptacao(de, para).ok);
}

export const MOTIVOS_PERDA = [
  { valor: "recusou", rotulo: "A empresa recusou" },
  { valor: "sem_retorno", rotulo: "Sem retorno da empresa" },
  { valor: "ata_inviavel", rotulo: "Ata vencida ou sem condição de adesão" },
  { valor: "outro", rotulo: "Outro motivo" },
] as const;

export function motivoPerdaValido(valor: unknown): valor is (typeof MOTIVOS_PERDA)[number]["valor"] {
  return typeof valor === "string" && MOTIVOS_PERDA.some((m) => m.valor === valor);
}

export function rotuloMotivoPerda(valor: string | null | undefined): string {
  return MOTIVOS_PERDA.find((m) => m.valor === valor)?.rotulo ?? "";
}

/** Contato vencido: a data marcada passou e o cartão ainda está sendo trabalhado. */
export function captacaoComContatoVencido(
  estagio: string,
  proximoContato: Date | null | undefined,
  agora: Date,
): boolean {
  return (ESTAGIOS_ABERTOS_CAPTACAO as readonly string[]).includes(estagio) && contatoVencido(proximoContato, agora);
}

// ───────────────────────────── Canais e origem ─────────────────────────────

export const CANAIS_CONTATO = [
  { valor: "telefone", rotulo: "Ligação" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "presencial", rotulo: "Pessoalmente" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export function rotuloCanal(valor: string): string {
  return CANAIS_CONTATO.find((c) => c.valor === valor)?.rotulo ?? valor;
}

export const ORIGENS_CAPTACAO = ["radar", "indicacao"] as const;

export const ROTULO_ORIGEM_CAPTACAO: Record<string, string> = {
  radar: "Radar de atas",
  indicacao: "Indicação do captador",
};

// ───────────────────────────── Nome da ata ─────────────────────────────

const PALAVRAS_MIUDAS = new Set(["de", "da", "do", "das", "dos", "e", "em"]);

/** "MUNICIPIO DE RIO VERDE" (caixa alta do PNCP) → "Municipio de Rio Verde"; o que já tem minúscula fica como está. */
export function nomeProprioParaTela(texto: string | null | undefined): string {
  return aparar(texto ?? "");
}

function aparar(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!t || /[a-zà-ú]/.test(t)) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && PALAVRAS_MIUDAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

const LIMITE_NOME = 140;

export interface EntradaNomeCaptacao {
  categoria?: string | null;
  objeto: string;
  orgaoNome?: string | null;
  uf?: string | null;
  vigenciaFim?: Date | null;
}

/**
 * O nome que a equipe vê no cartão: "Ata de Limpeza e conservação · Municipio de Rio Verde/GO ·
 * vence 03/2027". Sem categoria, usa o começo do objeto; sem órgão ou vigência, esses pedaços
 * simplesmente não entram.
 */
export function nomeDaCaptacao(e: EntradaNomeCaptacao): string {
  const tema = e.categoria ? rotuloDaCategoria(e.categoria) : resumir(e.objeto, 50);
  const partes = [`Ata de ${tema || "objeto não informado"}`];
  const orgao = e.orgaoNome ? cortarTexto(aparar(e.orgaoNome), 46) : "";
  if (orgao) partes.push(e.uf && !orgao.endsWith(`/${e.uf}`) ? `${orgao}/${e.uf}` : orgao);
  else if (e.uf) partes.push(e.uf);
  if (e.vigenciaFim instanceof Date && !Number.isNaN(e.vigenciaFim.getTime())) {
    const mes = String(e.vigenciaFim.getUTCMonth() + 1).padStart(2, "0");
    partes.push(`vence ${mes}/${e.vigenciaFim.getUTCFullYear()}`);
  }
  return cortarTexto(partes.join(" · "), LIMITE_NOME);
}

// ───────────────────────────── Texto livre ─────────────────────────────

/** Uma linha só, sem caracteres de controle nem de direção de texto, sem espaços repetidos nem nas pontas. */
export function textoCurto(texto: string): string {
  let saida = "";
  for (const ch of texto) {
    const c = ch.codePointAt(0) ?? 0;
    // Controle, separadores de linha/parágrafo e marcas de direção de texto (que embaralhariam a leitura).
    const invisivel =
      c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 ||
      (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);
    saida += invisivel ? " " : ch;
  }
  return saida.replace(/\s+/g, " ").trim();
}

// ───────────────────────────── Do radar para o cartão ─────────────────────────────

export interface LinhaDoRadar {
  numeroControlePncpAta: string;
  orgaoNome: string;
  uf: string | null;
  municipioNome: string | null;
  objeto: string;
  categoria: string | null;
  vigenciaFim: Date;
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
}

export interface DadosDaCaptacao {
  nome: string;
  origem: "radar" | "indicacao";
  numeroControlePncpAta: string | null;
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  orgaoNome: string | null;
  uf: string | null;
  municipioNome: string | null;
  objeto: string;
  categoria: string | null;
  numeroAta: string | null;
  vigenciaFim: Date | null;
}

const LIMITE_OBJETO = 1000;

/**
 * Cópia da ata do radar para o cartão. O fornecedor entra só quando é empresa (CNPJ de 14
 * dígitos); pessoa física fica sem nome e sem documento, para a equipe identificar a empresa.
 */
export function dadosDaCaptacaoDoRadar(r: LinhaDoRadar): DadosDaCaptacao {
  const nomeLimpo = nomeFornecedorParaTela(r.fornecedorNome);
  const pessoaFisica = nomeLimpo?.toLowerCase() === "pessoa física";
  const cnpj = pessoaFisica ? null : normalizarCnpj(r.fornecedorCnpj ?? "");
  const objeto = cortarTexto(r.objeto.replace(/\s+/g, " ").trim(), LIMITE_OBJETO) || "Objeto não informado";
  return {
    nome: nomeDaCaptacao({
      categoria: r.categoria,
      objeto,
      orgaoNome: r.orgaoNome,
      uf: r.uf,
      vigenciaFim: r.vigenciaFim,
    }),
    origem: "radar",
    numeroControlePncpAta: r.numeroControlePncpAta,
    fornecedorCnpj: cnpj,
    fornecedorNome: pessoaFisica ? null : nomeLimpo,
    orgaoNome: r.orgaoNome || null,
    uf: r.uf,
    municipioNome: r.municipioNome,
    objeto,
    categoria: r.categoria,
    numeroAta: null,
    vigenciaFim: r.vigenciaFim,
  };
}

// ───────────────────────────── Contato da empresa (LGPD) ─────────────────────────────

/** Quantos contatos cabem por empresa: o necessário para falar com ela, não uma agenda. */
export const LIMITE_CONTATOS_POR_EMPRESA = 10;

export const AVISO_LGPD_CONTATO =
  "Guarde só o que for preciso para falar com a empresa sobre a ata: nome, cargo, telefone e e-mail profissionais, " +
  "e de onde o contato veio. Não anote CPF, endereço de casa, dados de saúde nem opinião pessoal. " +
  "A pessoa pode pedir para ser apagada: a gestão apaga o contato por completo.";

export interface ContatoLido {
  nome: string;
  cargo: string | null;
  /** Só dígitos, com DDD (10 ou 11). */
  telefone: string | null;
  whatsapp: boolean;
  email: string | null;
  comoObteve: string;
}

export type ResultadoContato = { ok: true; contato: ContatoLido } | { ok: false; erro: string };

/** Telefone digitado → 10 ou 11 dígitos com DDD (aceita máscara e +55); outra coisa devolve null. */
export function normalizarTelefone(valor: string): string | null {
  let d = valor.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  // DDD de 11 a 99 e celular (11 dígitos) começando por 9.
  if (Number(d.slice(0, 2)) < 11) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return d;
}

/** 62999990000 → (62) 99999-0000. */
export function formatarTelefone(digitos: string | null | undefined): string {
  const d = (digitos ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Valida e limpa o cartão de contato. Pelo menos o telefone ou o e-mail; "de onde veio" é obrigatório. */
export function lerContatoEmpresa(c: {
  nome: string;
  cargo?: string;
  telefone?: string;
  whatsapp?: boolean;
  email?: string;
  comoObteve: string;
}): ResultadoContato {
  const nome = textoCurto(c.nome);
  if (!nome) return { ok: false, erro: "Informe o nome de quem atende na empresa." };
  if (nome.length > 120) return { ok: false, erro: "O nome passa de 120 caracteres." };

  const cargo = textoCurto(c.cargo ?? "");
  if (cargo.length > 80) return { ok: false, erro: "O cargo passa de 80 caracteres." };

  const telefoneBruto = (c.telefone ?? "").trim();
  const telefone = telefoneBruto ? normalizarTelefone(telefoneBruto) : null;
  if (telefoneBruto && !telefone) {
    return { ok: false, erro: "Telefone inválido. Digite o DDD e o número, por exemplo (62) 99999-0000." };
  }

  const emailBruto = (c.email ?? "").trim().toLowerCase();
  if (emailBruto && (emailBruto.length > 160 || !EMAIL.test(emailBruto))) {
    return { ok: false, erro: "E-mail inválido." };
  }

  if (!telefone && !emailBruto) return { ok: false, erro: "Informe ao menos o telefone ou o e-mail do contato." };

  const comoObteve = textoCurto(c.comoObteve);
  if (!comoObteve) return { ok: false, erro: "Diga de onde veio este contato (site da empresa, indicação, ligação...)." };
  if (comoObteve.length > 200) return { ok: false, erro: "“De onde veio” passa de 200 caracteres." };

  return {
    ok: true,
    contato: {
      nome,
      cargo: cargo || null,
      telefone,
      // WhatsApp só faz sentido com telefone.
      whatsapp: Boolean(c.whatsapp) && telefone !== null,
      email: emailBruto || null,
      comoObteve,
    },
  };
}

// ───────────────────────────── Cadastro manual (indicação) ─────────────────────────────

export interface CamposNovaCaptacao {
  fornecedorNome: string;
  fornecedorCnpj: string;
  orgaoNome?: string;
  uf?: string;
  municipioNome?: string;
  objeto: string;
  categoria?: string;
  numeroAta?: string;
  vigenciaFim?: string;
  proximoContatoEm?: string;
  observacoes?: string;
  contatoNome?: string;
  contatoCargo?: string;
  contatoTelefone?: string;
  contatoWhatsapp?: boolean;
  contatoEmail?: string;
  contatoComoObteve?: string;
}

export type ResultadoNovaCaptacao =
  | {
      ok: true;
      dados: DadosDaCaptacao;
      proximoContatoEm: Date | null;
      observacoes: string | null;
      contato: ContatoLido | null;
    }
  | { ok: false; erro: string };

/** Valida o cadastro de uma ata que o captador achou por conta própria. */
export function lerNovaCaptacao(c: CamposNovaCaptacao): ResultadoNovaCaptacao {
  const fornecedorNome = textoCurto(c.fornecedorNome);
  if (!fornecedorNome) return { ok: false, erro: "Informe a razão social da empresa." };
  if (fornecedorNome.length > 150) return { ok: false, erro: "A razão social passa de 150 caracteres." };

  if (!cnpjValido(c.fornecedorCnpj)) {
    return { ok: false, erro: "CNPJ inválido. Confira os 14 dígitos (CPF não vale: a captação é de empresa)." };
  }
  const fornecedorCnpj = normalizarCnpj(c.fornecedorCnpj)!;

  const objeto = textoCurto(c.objeto);
  if (!objeto) return { ok: false, erro: "Diga do que é a ata (o objeto, em poucas palavras)." };
  if (objeto.length > LIMITE_OBJETO) return { ok: false, erro: `O objeto passa de ${LIMITE_OBJETO} caracteres.` };

  const categoria = (c.categoria ?? "").trim();
  if (categoria && !CATEGORIAS_ATAS.some((x) => x.slug === categoria)) {
    return { ok: false, erro: "Escolha um tema válido para a ata." };
  }

  const uf = (c.uf ?? "").trim().toUpperCase();
  if (uf && !ufValida(uf)) return { ok: false, erro: "UF inválida." };

  const orgaoNome = textoCurto(c.orgaoNome ?? "");
  if (orgaoNome.length > 150) return { ok: false, erro: "O nome do órgão passa de 150 caracteres." };
  const municipioNome = textoCurto(c.municipioNome ?? "");
  if (municipioNome.length > 100) return { ok: false, erro: "O município passa de 100 caracteres." };
  const numeroAta = textoCurto(c.numeroAta ?? "");
  if (numeroAta.length > 60) return { ok: false, erro: "O número da ata passa de 60 caracteres." };

  const vigencia = lerDataSoDia(c.vigenciaFim ?? "");
  if (!vigencia.ok) return { ok: false, erro: "Data de vigência inválida. Escolha uma data real." };
  const proximo = lerDataSoDia(c.proximoContatoEm ?? "");
  if (!proximo.ok) return { ok: false, erro: "Data do próximo contato inválida. Escolha uma data real." };

  const observacoes = normalizarObservacao(c.observacoes ?? "");
  if (observacoes.length > LIMITE_OBSERVACOES) {
    return {
      ok: false,
      erro: `As anotações têm ${observacoes.length} caracteres; o limite é ${LIMITE_OBSERVACOES}. Resuma o texto.`,
    };
  }

  // O contato é opcional, mas se vier qualquer parte dele, vale a regra inteira.
  const algumContato = [c.contatoNome, c.contatoTelefone, c.contatoEmail, c.contatoCargo].some((v) => (v ?? "").trim());
  let contato: ContatoLido | null = null;
  if (algumContato) {
    const lido = lerContatoEmpresa({
      nome: c.contatoNome ?? "",
      cargo: c.contatoCargo,
      telefone: c.contatoTelefone,
      whatsapp: c.contatoWhatsapp,
      email: c.contatoEmail,
      comoObteve: c.contatoComoObteve ?? "",
    });
    if (!lido.ok) return { ok: false, erro: lido.erro };
    contato = lido.contato;
  }

  const dados: DadosDaCaptacao = {
    nome: nomeDaCaptacao({ categoria: categoria || null, objeto, orgaoNome, uf, vigenciaFim: vigencia.data }),
    origem: "indicacao",
    numeroControlePncpAta: null,
    fornecedorCnpj,
    fornecedorNome,
    orgaoNome: orgaoNome || null,
    uf: uf || null,
    municipioNome: municipioNome || null,
    objeto,
    categoria: categoria || null,
    numeroAta: numeroAta || null,
    vigenciaFim: vigencia.data,
  };
  return { ok: true, dados, proximoContatoEm: proximo.data, observacoes: observacoes || null, contato };
}

// ───────────────────────────── Registro de contato (histórico) ─────────────────────────────

export const LIMITE_RESUMO_INTERACAO = 500;

export type ResultadoInteracao =
  | { ok: true; canal: string; resumo: string; quando: Date }
  | { ok: false; erro: string };

/**
 * Um contato com a empresa: canal e o que ficou combinado. A data é opcional (vazio = agora);
 * escolhida só como dia, vale ao meio-dia (UTC) para cair no mesmo dia em Brasília. Não aceita
 * dia futuro: o que ainda vai acontecer é o "próximo contato", não um registro.
 */
export function lerInteracao(
  c: { canal: string; resumo: string; quando?: string },
  agora: Date,
): ResultadoInteracao {
  if (!CANAIS_CONTATO.some((x) => x.valor === c.canal)) return { ok: false, erro: "Escolha como foi o contato." };
  const resumo = normalizarObservacao(c.resumo);
  if (!resumo) return { ok: false, erro: "Escreva em poucas palavras o que foi conversado." };
  if (resumo.length > LIMITE_RESUMO_INTERACAO) {
    return {
      ok: false,
      erro: `O texto tem ${resumo.length} caracteres; o limite é ${LIMITE_RESUMO_INTERACAO}. Resuma.`,
    };
  }
  let quando = agora;
  const dia = lerDataSoDia(c.quando ?? "");
  if (!dia.ok) return { ok: false, erro: "Data do contato inválida. Escolha uma data real." };
  if (dia.data) {
    // Futuro = depois de hoje em Brasília (o dia escolhido é só-dia, à meia-noite UTC).
    if (dia.data.getTime() > hojeBrasilia(agora).getTime()) {
      return { ok: false, erro: "A data do contato não pode ser no futuro. Para marcar uma conversa futura, use o próximo contato." };
    }
    quando = new Date(dia.data.getTime() + 12 * 3_600_000);
  }
  return { ok: true, canal: c.canal, resumo, quando };
}
