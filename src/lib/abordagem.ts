import { CATEGORIAS_ATAS } from "./categorias";
import {
  CARGO_ADMINISTRACAO,
  CARGO_EDUCACAO,
  CARGO_PREFEITO,
  CARGO_SAUDE,
} from "./decisores";

/**
 * "Abordagem sugerida" da gaveta do município (2026-10-04, fase 2 de
 * design; tom revisado em 2026-10-23, etapa 6 do Projeto RNA). Modelos de
 * texto fixos por cargo, sem IA. Cada texto é uma mensagem curta, cordial e
 * sóbria, pronta para o consultor adaptar e enviar por WhatsApp ou e-mail.
 *
 * Regras do tom (valem para todas as variações):
 *  - o consultor se identifica logo no começo como pessoa de uma plataforma
 *    privada, que não é órgão público nem o PNCP;
 *  - o motivo do contato cita só dado de fonte pública (PNCP, SICONFI), de
 *    forma neutra, sem insinuar conhecimento interno;
 *  - a adesão é apresentada como caminho previsto em lei (Lei 14.133/2021,
 *    art. 86), e a decisão e a instrução do processo são do órgão;
 *  - nada de urgência, pressão, promessa de economia ou de resultado;
 *  - o agente público é tratado só pelo cargo, nunca pelo nome;
 *  - a mensagem oferece as informações da ata e o modelo de documentos e
 *    pergunta quem é o responsável pelo tema.
 */

const IDENTIFICACAO =
  "sou consultor(a) de uma plataforma privada que organiza informações sobre atas de registro de preços (não sou órgão público nem falo pelo PNCP).";

const BASE_LEGAL =
  "A adesão é um caminho previsto em lei (Lei 14.133/2021, art. 86); a decisão e a instrução do processo cabem ao órgão.";

const OFERTA = "Posso enviar as informações da ata e o modelo de documentos?";

/** Siglas que podem ficar em caixa alta num texto vindo do PNCP. */
const SIGLAS = new Set(["PNCP", "SICONFI", "REURB", "PCA", "SUS", "UBS", "UPA", "EPI", "TI"]);

/**
 * Expressões que nunca devem sair numa mensagem, nem quando vierem no texto de
 * um registro público (o objeto de um contrato, por exemplo): promessa,
 * pressa, apelo de oportunidade, insinuação de informação interna. Comparadas
 * sem acento e em minúsculas. Se o registro traz alguma, a frase com a fonte
 * é descartada inteira (o consultor continua vendo o motivo no card).
 */
const NAO_CITAR: RegExp[] = [
  /sem (nova |novo |abrir (uma )?(nova |novo )?)?(licitacao|certame|processo licitatorio)|sem licitar/,
  /garant/,
  /imperdivel|oportunidade unica|ultima chance|ultimas? (vagas|unidades)|aproveite|nao perca|nao deixe/,
  /\bcorra\b|so hoje|\bhoje mesmo\b|urgente|urgencia|imediat|o quanto antes|com pressa|ultimo dia|prazo (acaba|encerra|esgota|final)/,
  /economi(a|z)|desconto|barato|vantagem|\bganho|lucro|melhor preco|menor preco|\b(reduc|reduz)\w* (\w+ )?(\w+ )?(custo|gasto)/,
  /exclusiv|privilegiad|informacao interna|informacoes internas|bastidor|sabemos que|ficamos sabendo|fontes? internas?|acesso antecipado|sem burocracia/,
  /voce precisa|voces precisam|nao pode (perder|deixar)|risco de perder|perder a ata/,
];

/** E-mail, CPF com pontuação e telefone com DDD: dado de pessoa que não deve ir numa mensagem de abordagem. */
const DADO_PESSOAL = /@|\d{3}\.\d{3}\.\d{3}-\d{2}|\(\d{2}\)\s?\d{4,5}-?\d{4}/;

/** Minúsculas e sem acento, para a conferência não depender de como a palavra foi escrita. */
function semAcento(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function temExpressaoProibida(texto: string): boolean {
  const alvo = semAcento(texto);
  return NAO_CITAR.some((padrao) => padrao.test(alvo)) || DADO_PESSOAL.test(texto);
}

/**
 * Limpa um trecho de texto público antes de ele entrar na mensagem: espaços
 * normais, sem exclamação, e texto em caixa alta (comum no PNCP) vira
 * minúsculas, exceto siglas conhecidas. Em texto misto, só as palavras de 4
 * letras ou mais em caixa alta mudam; sigla curta (EPI, UBS) fica.
 */
function limpar(texto: string, max = 90): string {
  const normal = texto.replace(/\s+/g, " ").replace(/!+/g, "").trim();
  const letras = normal.match(/[A-Za-zÀ-ÿ]/g) ?? [];
  const maiusculas = letras.filter((l) => l !== l.toLowerCase()).length;
  const tudoEmCaixaAlta = letras.length > 0 && maiusculas / letras.length > 0.6;
  const baixa = (palavra: string) => (SIGLAS.has(palavra) ? palavra : palavra.toLowerCase());

  const semGrito = tudoEmCaixaAlta
    ? normal.replace(/[A-ZÀ-Ý]+/g, baixa)
    : normal.replace(/[A-ZÀ-Ý]{4,}/g, baixa);
  return semGrito.length > max ? `${semGrito.slice(0, max - 1).trimEnd()}…` : semGrito;
}

function fonteDe(fonte: "PNCP" | "SICONFI"): string {
  return `Em consulta ao ${fonte} (fonte pública),`;
}

/**
 * Frase neutra com o dado público por trás do "por que agora". Só reconhece
 * os formatos gerados pelo sistema (raio-X do PNCP e sinais por script do
 * PNCP e do SICONFI). Texto de outra origem (digitado à mão, notícia) não
 * entra na mensagem: pode trazer nome de pessoa ou opinião, e o consultor
 * continua vendo o motivo no card. Sem formato conhecido, devolve null.
 */
function citarFonte(porQueAgora: string | null): string | null {
  const t = (porQueAgora ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;

  let m = t.match(/^Contratou (.+?) há (pouco tempo|\d+ meses)(?: — .*)?$/);
  if (m) return fecharFrase(`${fonteDe("PNCP")} vi que o município contratou ${rotuloDoRaioX(m[1])} há ${m[2]}`);

  m = t.match(/^Contrato vence em (\d{2}\/\d{2}\/\d{4}): (.+)$/);
  if (m) {
    return fecharFrase(
      `${fonteDe("PNCP")} vi um contrato do município com término de vigência em ${m[1]} (objeto: ${limpar(m[2])})`,
    );
  }

  m = t.match(/^Compra prevista no PCA(?: \d{4})? para (\d{2}\/\d{4}): (.+)$/);
  if (m) {
    return fecharFrase(
      `${fonteDe("PNCP")} vi, no plano de contratações anual (PCA) do município, uma previsão para ${m[1]}: ${limpar(m[2])}`,
    );
  }

  m = t.match(/^Orçamento (\d{4}): despesa com (.+?) cresceu/);
  if (m) return fecharFrase(`${fonteDe("SICONFI")} vi os dados de despesa do município em ${m[1]}, na área de ${limpar(m[2], 60)}`);

  return null;
}

/** Põe o ponto final (sem duplicar) e descarta a frase se ela traz algo que a mensagem nunca deve dizer. */
function fecharFrase(frase: string): string | null {
  if (temExpressaoProibida(frase)) return null;
  const base = frase.replace(/[.\s]+$/, "");
  return base.endsWith("…") ? base : `${base}.`;
}

/**
 * Rótulo da categoria no meio da frase: só a primeira letra vai para
 * minúscula, e só quando a primeira palavra não é sigla ou nome composto
 * (REURB, NR-1 ficam como estão; "Equipamento de TI" vira "equipamento de TI").
 */
function minusculaInicial(rotulo: string): string {
  const primeira = rotulo.split(/[\s/(]/)[0] ?? "";
  if (/[A-ZÀ-Ý]/.test(primeira.slice(1))) return rotulo;
  return rotulo.charAt(0).toLowerCase() + rotulo.slice(1);
}

/**
 * O raio-X grava a categoria já em minúsculas ("equipamento de ti", "reurb
 * (regularização fundiária)"). Se bate com uma categoria conhecida, volta ao
 * rótulo certo, com as siglas em caixa alta; senão, só limpa o texto.
 */
function rotuloDoRaioX(minusculo: string): string {
  const alvo = minusculo.toLowerCase();
  const conhecida = CATEGORIAS_ATAS.find((c) => c.rotulo.toLowerCase() === alvo);
  return conhecida ? minusculaInicial(conhecida.rotulo) : limpar(minusculo);
}

/**
 * Categoria da ata no meio da frase. Fora do vocabulário (dado antigo, slug
 * solto, texto em caixa alta) não vaza o código cru: slug vira palavras e
 * caixa alta vira minúsculas. Sem nada legível, devolve null e a frase fica
 * sem complemento.
 */
function categoriaNaMensagem(categoria: string | null): string | null {
  const bruta = (categoria ?? "").trim();
  if (!bruta) return null;
  const conhecida = CATEGORIAS_ATAS.find((c) => c.slug === bruta || c.rotulo === bruta);
  if (conhecida) return minusculaInicial(conhecida.rotulo);
  const legivel = /^[a-z0-9]+(-[a-z0-9]+)+$/.test(bruta) ? bruta.replace(/-/g, " ") : bruta;
  return limpar(legivel, 60) || null;
}

interface ModeloDeCargo {
  titulo: string;
  tratamento: string;
  /** Quem do município pode se interessar pelo tema, já com artigo ("da Secretaria de Saúde"). */
  area: string | null;
  pergunta: string;
}

const PERGUNTA_COM_CARGO = "Se o tema não for da sua área, poderia me indicar o responsável?";
const PERGUNTA_SEM_CARGO = "Poderia me indicar quem é o responsável por esse tema no município?";

function modeloDoCargo(cargo: string | null): ModeloDeCargo {
  switch (cargo) {
    case CARGO_EDUCACAO:
      return {
        titulo: "Abordagem sugerida · Secretário(a) de Educação",
        tratamento: "Secretário(a) de Educação",
        area: "da Secretaria de Educação",
        pergunta: PERGUNTA_COM_CARGO,
      };
    case CARGO_SAUDE:
      return {
        titulo: "Abordagem sugerida · Secretário(a) de Saúde",
        tratamento: "Secretário(a) de Saúde",
        area: "da Secretaria de Saúde",
        pergunta: PERGUNTA_COM_CARGO,
      };
    case CARGO_ADMINISTRACAO:
      return {
        titulo: "Abordagem sugerida · Secretário(a) de Administração/Finanças",
        tratamento: "Secretário(a) de Administração/Finanças",
        area: "da área de administração e finanças",
        pergunta: PERGUNTA_COM_CARGO,
      };
    case CARGO_PREFEITO:
      return {
        titulo: "Abordagem sugerida · Prefeito(a)",
        tratamento: "Prefeito(a)",
        area: "da gestão municipal",
        pergunta: PERGUNTA_COM_CARGO,
      };
    default:
      return {
        titulo: "Abordagem sugerida",
        tratamento: "responsável",
        area: null,
        pergunta: PERGUNTA_SEM_CARGO,
      };
  }
}

export function abordagemSugerida(
  cargo: string | null,
  categoria: string | null,
  porQueAgora: string | null,
): { titulo: string; texto: string } {
  const modelo = modeloDoCargo(cargo);
  const tema = categoriaNaMensagem(categoria);
  const ata = tema ? `uma ata de registro de preços de ${tema}` : "uma ata de registro de preços";
  const motivo = modelo.area ? `Há ${ata} que pode ser do interesse ${modelo.area}.` : `Há ${ata}.`;

  const partes = [
    `Prezado(a) ${modelo.tratamento}, ${IDENTIFICACAO}`,
    citarFonte(porQueAgora),
    motivo,
    BASE_LEGAL,
    `${OFERTA} ${modelo.pergunta}`,
  ];

  return { titulo: modelo.titulo, texto: partes.filter(Boolean).join(" ") };
}
