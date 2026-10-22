/**
 * Busca os preços de referência dos itens das atas na API pública de pesquisa
 * de preços do Compras.gov.br (dadosabertos.compras.gov.br) e grava só as
 * ESTATÍSTICAS em ReferenciaPreco — 2026-10-22, Projeto RNA etapa 4
 * ("vantajosidade"). Não usa o Claude. O comparativo é AUXILIAR: não substitui
 * a pesquisa de preços do órgão (Lei 14.133/2021, art. 23). Regras puras em
 * src/lib/precos-referencia.ts e src/lib/vantajosidade.ts.
 *
 * O que faz:
 *  1. lê os códigos de catálogo distintos de Item.codigoCatalogo (só dígitos);
 *  2. para cada código sem ReferenciaPreco, ou com consulta mais velha que 30
 *     dias (consulta que falhou é repetida depois de 1 dia), consulta a API
 *     (material; se vier vazio e houver --servico, ou o código parecer de
 *     serviço, tenta o endpoint de serviço e grava tipoCatalogo "servico");
 *  3. pagina com 500 registros por vez até acabar (teto de 20 páginas por
 *     código), janela de 12 meses até hoje;
 *  4. converte, tira duplicidade por idItemCompra, separa por unidade de
 *     fornecimento (sigla + capacidade), escolhe o grupo da unidade do item e
 *     calcula as estatísticas desse grupo (grupos de unidades diferentes
 *     nunca se misturam);
 *  5. grava com upsert (código + tipo). Falha: grava só o erro e a data da
 *     consulta, sem apagar as estatísticas anteriores. Sem preço: n = 0 e
 *     quantis nulos.
 *
 * Serviço (CATSER): o endpoint informa só a unidade de MEDIDA (quase sempre
 * "UNIDADE"), sem capacidade, e um mesmo código reúne cobranças de natureza
 * diferente (valor fixo, hora, quilômetro...). A faixa de preços costuma ser
 * larga: tratar o comparativo de serviço com mais cautela que o de material.
 *
 * Nunca guarda amostras individuais: só n, nUsadas, mínimo, p25, mediana, p75,
 * máximo e média. Nada de fornecedor, órgão ou idCompra é lido ou gravado.
 *
 * A API é pública e gratuita: o script é gentil com ela (1 segundo entre
 * chamadas, 90 s de timeout, 3 tentativas com espera crescente e parada depois
 * de 5 falhas seguidas).
 *
 * Uso: npx tsx scripts/inteligencia/buscar-precos-referencia.ts [opções]
 * Opções:
 *   --dry-run          consulta a API e mostra o resultado, mas não grava nada
 *   --limit=N          consulta no máximo N códigos
 *   --codigo=123,456   só estes códigos (mesmo que nenhum item do banco os use)
 *   --forcar           consulta também os códigos com referência recente
 *   --servico          se o material vier vazio, tenta o endpoint de serviço
 *   --mostrar          detalha cada código (grupos de unidade, estatísticas)
 *   --tipo=servico     (teste) consulta só o endpoint de serviço (ou "material")
 *   --paginas=N        (teste) teto de páginas por código (padrão e máximo: 20)
 *
 * Com --dry-run, se o banco estiver fora do ar o script segue sem ele (sem
 * dica de unidade e sem saber o que já foi consultado).
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "../../src/generated/prisma/client";
import {
  MESES_JANELA_PADRAO,
  TAMANHO_PAGINA_MAXIMO,
  agruparPorUnidade,
  codigoCatalogoValido,
  dedupePorIdItemCompra,
  escolherGrupoDeUnidade,
  janelaDeDatas,
  pareceCodigoDeServico,
  precisaConsultar,
  registroParaAmostra,
  rotuloUnidade,
  siglaDaUnidadeDoItem,
  urlPrecoMaterial,
  urlPrecoServico,
  type AmostraRegistro,
  type GrupoEscolhido,
  type TipoCatalogo,
} from "../../src/lib/precos-referencia";
import { estatisticasDePrecos, formatarReais, type EstatisticasPrecos } from "../../src/lib/vantajosidade";

const TETO_PAGINAS = 20;
const ESPERA_ENTRE_CHAMADAS_MS = 1000;
const TIMEOUT_MS = 90_000;
const TENTATIVAS = 3;
/** Espera antes da 2ª e da 3ª tentativa (cresce). */
const ESPERA_ENTRE_TENTATIVAS_MS = [3000, 8000];
const MAX_FALHAS_SEGUIDAS = 5;

const prisma = new PrismaClient();
const opcoes = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.slice(2).split("=");
      return [k, v ?? "1"];
    }),
);
const dryRun = Boolean(opcoes["dry-run"]);
const forcar = Boolean(opcoes.forcar);
const tentarServico = Boolean(opcoes.servico);
const mostrar = Boolean(opcoes.mostrar);

function inteiroDaOpcao(nome: string, padrao: number, maximo: number): number {
  const bruto = opcoes[nome];
  if (bruto === undefined) return padrao;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > maximo) {
    console.error(`Opção --${nome} inválida (use um número inteiro de 1 a ${maximo}).`);
    process.exit(1);
  }
  return n;
}
const limite = opcoes.limit === undefined ? null : inteiroDaOpcao("limit", 1, 1_000_000);
const maxPaginas = inteiroDaOpcao("paginas", TETO_PAGINAS, TETO_PAGINAS);
const tipoFixo: TipoCatalogo | null = (() => {
  const t = opcoes.tipo;
  if (t === undefined) return null;
  if (t === "material" || t === "servico") return t;
  console.error('Opção --tipo inválida (use "material" ou "servico").');
  process.exit(1);
})();

// ------------------------------------------------------------- consulta à API

class ErroConsulta extends Error {
  constructor(
    mensagem: string,
    readonly repetir: boolean,
  ) {
    super(mensagem);
  }
}

let requisicoes = 0;
let ultimaChamadaEm = 0;

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Garante pelo menos 1 segundo entre o início de uma chamada e o da seguinte. */
async function esperarSuaVez(): Promise<void> {
  const falta = ultimaChamadaEm + ESPERA_ENTRE_CHAMADAS_MS - Date.now();
  if (falta > 0) await dormir(falta);
  ultimaChamadaEm = Date.now();
}

async function umaTentativa(url: string): Promise<unknown> {
  await esperarSuaVez();
  requisicoes++;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(url, { signal: controle.signal, headers: { Accept: "application/json" } });
    const texto = await resposta.text();
    if (!resposta.ok) {
      throw new ErroConsulta(`HTTP ${resposta.status}`, resposta.status === 429 || resposta.status === 408 || resposta.status >= 500);
    }
    try {
      return JSON.parse(texto);
    } catch {
      throw new ErroConsulta("Resposta que não é JSON", true);
    }
  } catch (e) {
    if (e instanceof ErroConsulta) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new ErroConsulta(`Tempo esgotado (${TIMEOUT_MS / 1000} s)`, true);
    throw new ErroConsulta(`Falha de rede: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120), true);
  } finally {
    clearTimeout(relogio);
  }
}

/** GET com até 3 tentativas e espera crescente; só repete o que vale repetir (rede, timeout, 429, 5xx). */
async function pegarJson(url: string): Promise<unknown> {
  let ultimo: ErroConsulta | null = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      return await umaTentativa(url);
    } catch (e) {
      const erro = e instanceof ErroConsulta ? e : new ErroConsulta(e instanceof Error ? e.message : String(e), false);
      ultimo = erro;
      if (!erro.repetir || tentativa === TENTATIVAS) break;
      const espera = ESPERA_ENTRE_TENTATIVAS_MS[Math.min(tentativa - 1, ESPERA_ENTRE_TENTATIVAS_MS.length - 1)];
      console.log(`    tentativa ${tentativa} falhou (${erro.message}); nova tentativa em ${espera / 1000} s`);
      await dormir(espera);
    }
  }
  throw ultimo ?? new ErroConsulta("Falha desconhecida", false);
}

interface Pagina {
  registros: unknown[];
  restantes: number;
}

function lerPagina(json: unknown, pagina: number): Pagina {
  if (!json || typeof json !== "object" || !Array.isArray((json as { resultado?: unknown }).resultado)) {
    throw new ErroConsulta("Resposta fora do formato esperado", false);
  }
  const j = json as { resultado: unknown[]; paginasRestantes?: unknown; totalPaginas?: unknown };
  const restantes = Number(j.paginasRestantes);
  if (Number.isFinite(restantes)) return { registros: j.resultado, restantes };
  const total = Number(j.totalPaginas);
  return { registros: j.resultado, restantes: Number.isFinite(total) ? Math.max(0, total - pagina) : 0 };
}

interface RegistrosDaApi {
  registros: unknown[];
  paginas: number;
  /** true quando o teto de páginas foi atingido com páginas ainda por ler. */
  truncado: boolean;
}

async function buscarRegistros(
  tipo: TipoCatalogo,
  codigo: string,
  janela: { inicio: string; fim: string },
): Promise<RegistrosDaApi> {
  const registros: unknown[] = [];
  let paginas = 0;
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const params = { codigo, inicio: janela.inicio, fim: janela.fim, pagina, tamanhoPagina: TAMANHO_PAGINA_MAXIMO };
    const url = tipo === "material" ? urlPrecoMaterial(params) : urlPrecoServico(params);
    const lida = lerPagina(await pegarJson(url), pagina);
    paginas++;
    registros.push(...lida.registros);
    if (lida.restantes <= 0 || lida.registros.length === 0) return { registros, paginas, truncado: false };
  }
  return { registros, paginas, truncado: true };
}

// ------------------------------------------------------------- processamento de um código

interface ResultadoDoTipo {
  tipo: TipoCatalogo;
  registros: number;
  validas: number;
  aposDedupe: number;
  grupos: [string, number][];
  escolha: GrupoEscolhido<AmostraRegistro> | null;
  estatisticas: EstatisticasPrecos | null;
  paginas: number;
  truncado: boolean;
}

async function consultarTipo(
  tipo: TipoCatalogo,
  codigo: string,
  janela: { inicio: string; fim: string },
  unidadeDoItem: string | null,
): Promise<ResultadoDoTipo> {
  const bruto = await buscarRegistros(tipo, codigo, janela);
  const validas = bruto.registros.map((r) => registroParaAmostra(r)).filter((a): a is AmostraRegistro => a !== null);
  const unicas = dedupePorIdItemCompra(validas);
  const grupos = agruparPorUnidade(unicas);
  const escolha = escolherGrupoDeUnidade(grupos, unidadeDoItem);
  return {
    tipo,
    registros: bruto.registros.length,
    validas: validas.length,
    aposDedupe: unicas.length,
    grupos: [...grupos.entries()].map(([chave, lista]) => [chave, lista.length] as [string, number]).sort((a, b) => b[1] - a[1]),
    escolha,
    estatisticas: escolha ? estatisticasDePrecos(escolha.amostras) : null,
    paginas: bruto.paginas,
    truncado: bruto.truncado,
  };
}

interface LinhaExistente {
  tipoCatalogo: string;
  consultadoEm: Date;
  erro: string | null;
  nUsadas: number;
}

/** Quais endpoints tentar, em ordem; para no primeiro que devolver registros. */
function tiposParaTentar(codigo: string, unidadeDoItem: string | null, existentes: LinhaExistente[]): TipoCatalogo[] {
  if (tipoFixo) return [tipoFixo];
  // Código que já deu certo como serviço: começa por ele (evita uma consulta de material à toa).
  if (existentes.some((l) => l.tipoCatalogo === "servico" && !l.erro && l.nUsadas > 0)) return ["servico", "material"];
  return tentarServico || pareceCodigoDeServico(codigo, unidadeDoItem) ? ["material", "servico"] : ["material"];
}

const decimal = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? null : new Prisma.Decimal(n.toFixed(4)));

const dataUtc = (aaaammdd: string) => new Date(`${aaaammdd}T00:00:00Z`);

async function gravarSucesso(
  codigo: string,
  r: ResultadoDoTipo,
  janela: { inicio: string; fim: string },
  agora: Date,
): Promise<void> {
  const e = r.estatisticas;
  const dados = {
    n: e?.n ?? 0,
    nUsadas: e?.nUsadas ?? 0,
    minimo: decimal(e?.minimo),
    p25: decimal(e?.p25),
    mediana: decimal(e?.mediana),
    p75: decimal(e?.p75),
    maximo: decimal(e?.maximo),
    media: decimal(e?.media),
    janelaInicio: dataUtc(janela.inicio),
    janelaFim: dataUtc(janela.fim),
    unidadeFornecimento: r.escolha ? rotuloUnidade(r.escolha.chave) : null,
    consultadoEm: agora,
    erro: null,
  };
  await prisma.referenciaPreco.upsert({
    where: { codigoCatalogo_tipoCatalogo: { codigoCatalogo: codigo, tipoCatalogo: r.tipo } },
    create: { codigoCatalogo: codigo, tipoCatalogo: r.tipo, ...dados },
    update: dados,
  });
}

/** Falha: só o erro e a data da consulta; estatísticas anteriores ficam como estavam. */
async function gravarFalha(
  codigo: string,
  tipo: TipoCatalogo,
  mensagem: string,
  janela: { inicio: string; fim: string },
  agora: Date,
): Promise<void> {
  await prisma.referenciaPreco.upsert({
    where: { codigoCatalogo_tipoCatalogo: { codigoCatalogo: codigo, tipoCatalogo: tipo } },
    create: {
      codigoCatalogo: codigo,
      tipoCatalogo: tipo,
      n: 0,
      nUsadas: 0,
      janelaInicio: dataUtc(janela.inicio),
      janelaFim: dataUtc(janela.fim),
      consultadoEm: agora,
      erro: mensagem,
    },
    update: { erro: mensagem, consultadoEm: agora },
  });
}

function descreverResultado(r: ResultadoDoTipo): string {
  const e = r.estatisticas;
  if (r.registros === 0) return `${r.tipo}: a API não devolveu preços.`;
  if (!e || !r.escolha) return `${r.tipo}: ${r.registros} registros, nenhum com preço utilizável.`;
  const rotulo = rotuloUnidade(r.escolha.chave);
  const unidade = rotulo ? `unidade ${rotulo}` : "unidade não informada";
  return (
    `${r.tipo}: ${r.registros} registros -> ${r.aposDedupe} preços únicos -> ${unidade} (${e.n}; usados ${e.nUsadas}): ` +
    `mediana ${formatarReais(e.mediana)}, faixa ${formatarReais(e.p25)} a ${formatarReais(e.p75)}`
  );
}

function detalhar(r: ResultadoDoTipo): void {
  console.log(`    páginas lidas: ${r.paginas}${r.truncado ? " (TETO ATINGIDO: ainda havia páginas; amostra parcial)" : ""}`);
  console.log(`    registros: ${r.registros}; com preço válido: ${r.validas}; sem duplicidade: ${r.aposDedupe}`);
  if (r.grupos.length > 0) {
    console.log(`    grupos de unidade: ${r.grupos.map(([c, n]) => `${c} (${n})`).join(", ")}`);
  }
  if (r.escolha) console.log(`    escolha: ${r.escolha.chave}. ${r.escolha.motivo}`);
  const e = r.estatisticas;
  if (e) {
    console.log(
      `    estatísticas: n=${e.n} usadas=${e.nUsadas} mín=${formatarReais(e.minimo)} p25=${formatarReais(e.p25)} mediana=${formatarReais(e.mediana)} p75=${formatarReais(e.p75)} máx=${formatarReais(e.maximo)} média=${formatarReais(e.media)}`,
    );
  }
}

// ------------------------------------------------------------- banco

interface DadosDoBanco {
  /** código => unidade mais comum entre os itens que usam o código. */
  unidadePorCodigo: Map<string, string>;
  existentesPorCodigo: Map<string, LinhaExistente[]>;
  bancoDisponivel: boolean;
}

/** Unidade mais frequente do código, dando preferência a uma que seja reconhecida. */
function unidadeMaisComum(contagem: Map<string, number>): string {
  const ordenadas = [...contagem.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return (ordenadas.find(([u]) => siglaDaUnidadeDoItem(u) !== "") ?? ordenadas[0])[0];
}

async function carregarDoBanco(): Promise<DadosDoBanco> {
  const itens = await prisma.item.findMany({
    where: { codigoCatalogo: { not: null } },
    select: { codigoCatalogo: true, unidade: true },
    distinct: ["codigoCatalogo", "unidade"],
  });
  const contagens = new Map<string, Map<string, number>>();
  for (const it of itens) {
    const codigo = codigoCatalogoValido(it.codigoCatalogo);
    if (!codigo) continue;
    const c = contagens.get(codigo) ?? new Map<string, number>();
    c.set(it.unidade, (c.get(it.unidade) ?? 0) + 1);
    contagens.set(codigo, c);
  }
  const unidadePorCodigo = new Map([...contagens.entries()].map(([codigo, c]) => [codigo, unidadeMaisComum(c)] as [string, string]));

  const linhas = await prisma.referenciaPreco.findMany({
    select: { codigoCatalogo: true, tipoCatalogo: true, consultadoEm: true, erro: true, nUsadas: true },
  });
  const existentesPorCodigo = new Map<string, LinhaExistente[]>();
  for (const l of linhas) {
    const lista = existentesPorCodigo.get(l.codigoCatalogo) ?? [];
    lista.push(l);
    existentesPorCodigo.set(l.codigoCatalogo, lista);
  }
  return { unidadePorCodigo, existentesPorCodigo, bancoDisponivel: true };
}

/** A consulta mais recente do código decide se ele precisa ser consultado de novo. */
function precisaAtualizar(existentes: LinhaExistente[], agora: Date): boolean {
  if (existentes.length === 0) return true;
  const maisRecente = [...existentes].sort((a, b) => b.consultadoEm.getTime() - a.consultadoEm.getTime())[0];
  return precisaConsultar(maisRecente, agora);
}

// ------------------------------------------------------------- principal

async function main() {
  const agora = new Date();
  const janela = janelaDeDatas(agora, MESES_JANELA_PADRAO);

  let banco: DadosDoBanco;
  try {
    banco = await carregarDoBanco();
  } catch (e) {
    if (!dryRun) throw e;
    console.log(`Aviso: banco indisponível (${e instanceof Error ? e.message.split("\n").pop() : String(e)}). Seguindo sem ele, como --dry-run.`);
    banco = { unidadePorCodigo: new Map(), existentesPorCodigo: new Map(), bancoDisponivel: false };
  }

  // Quais códigos olhar: os da opção --codigo ou todos os do banco.
  let codigos: string[];
  if (opcoes.codigo !== undefined) {
    const informados = String(opcoes.codigo).split(",").map((c) => c.trim()).filter(Boolean);
    const validos = informados.map((c) => codigoCatalogoValido(c));
    const invalidos = informados.filter((_, i) => validos[i] === null);
    if (invalidos.length > 0) console.log(`Códigos ignorados (devem ter só dígitos, de 1 a 10): ${invalidos.join(", ")}`);
    codigos = [...new Set(validos.filter((c): c is string => c !== null))];
  } else {
    codigos = [...banco.unidadePorCodigo.keys()];
  }

  const resumo = {
    janela: `${janela.inicio} a ${janela.fim}`,
    codigosNoBanco: banco.unidadePorCodigo.size,
    codigosConsiderados: codigos.length,
    jaAtualizados: 0,
    consultados: 0,
    comPreco: 0,
    semPreco: 0,
    comoServico: 0,
    falhas: 0,
    unidadePodeDivergir: 0,
    amostraParcial: 0,
    requisicoes: 0,
    paradoPorFalhas: false,
  };

  console.log(
    `Preços de referência (Compras.gov.br): janela ${resumo.janela}; ${codigos.length} código(s) de catálogo${dryRun ? "; SIMULAÇÃO (nada será gravado)" : ""}.`,
  );

  const pendentes = codigos
    .filter((c) => {
      const precisa = forcar || precisaAtualizar(banco.existentesPorCodigo.get(c) ?? [], agora);
      if (!precisa) resumo.jaAtualizados++;
      return precisa;
    })
    // Primeiro os que nunca foram consultados, depois os mais velhos.
    .sort((a, b) => {
      const ta = Math.max(0, ...(banco.existentesPorCodigo.get(a) ?? []).map((l) => l.consultadoEm.getTime()));
      const tb = Math.max(0, ...(banco.existentesPorCodigo.get(b) ?? []).map((l) => l.consultadoEm.getTime()));
      return ta - tb || Number(a) - Number(b);
    });
  const lote = limite === null ? pendentes : pendentes.slice(0, limite);
  if (lote.length < pendentes.length) console.log(`Limite: ${lote.length} de ${pendentes.length} código(s) pendentes.`);
  if (resumo.jaAtualizados > 0) console.log(`${resumo.jaAtualizados} código(s) com referência recente (use --forcar para consultar de novo).`);

  let falhasSeguidas = 0;
  for (let i = 0; i < lote.length; i++) {
    const codigo = lote[i];
    const unidadeDoItem = banco.unidadePorCodigo.get(codigo) ?? null;
    const existentes = banco.existentesPorCodigo.get(codigo) ?? [];
    console.log(`[${i + 1}/${lote.length}] ${codigo}${unidadeDoItem ? ` (unidade do item: ${unidadeDoItem})` : ""}`);

    let tentando: TipoCatalogo = "material";
    try {
      let escolhido: ResultadoDoTipo | null = null;
      let primeiroVazio: ResultadoDoTipo | null = null;
      for (const tipo of tiposParaTentar(codigo, unidadeDoItem, existentes)) {
        tentando = tipo;
        const r = await consultarTipo(tipo, codigo, janela, unidadeDoItem);
        if (mostrar) detalhar(r);
        if (r.registros > 0) {
          escolhido = r;
          break;
        }
        primeiroVazio ??= r;
      }
      const final = escolhido ?? primeiroVazio!;
      console.log(`    ${descreverResultado(final)}`);
      if (escolhido && escolhido.tipo === "servico" && !tipoFixo) console.log("    (material vazio; preços do endpoint de serviço)");

      resumo.consultados++;
      if (final.estatisticas) resumo.comPreco++;
      else resumo.semPreco++;
      if (final.tipo === "servico" && final.estatisticas) resumo.comoServico++;
      if (final.escolha && !final.escolha.unidadeConfere && final.tipo === "material") resumo.unidadePodeDivergir++;
      if (final.truncado) {
        resumo.amostraParcial++;
        console.log(`    Aviso: teto de ${maxPaginas} páginas atingido; estatística feita com amostra parcial.`);
      }
      if (!dryRun) await gravarSucesso(codigo, final, janela, agora);
      falhasSeguidas = 0;
    } catch (e) {
      const mensagem = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 200);
      console.log(`    FALHA (${tentando}): ${mensagem}`);
      resumo.falhas++;
      falhasSeguidas++;
      if (!dryRun) {
        try {
          await gravarFalha(codigo, tentando, mensagem, janela, agora);
        } catch (e2) {
          console.log(`    (não foi possível registrar a falha no banco: ${e2 instanceof Error ? e2.message.split("\n").pop() : String(e2)})`);
        }
      }
      if (falhasSeguidas >= MAX_FALHAS_SEGUIDAS) {
        console.log(`Parando: ${MAX_FALHAS_SEGUIDAS} falhas seguidas. A API pode estar fora do ar; tente de novo mais tarde.`);
        resumo.paradoPorFalhas = true;
        break;
      }
    }
  }

  resumo.requisicoes = requisicoes;
  console.log(dryRun ? "SIMULAÇÃO (nada gravado)" : "Referências de preço gravadas");
  console.log(resumo);
  if (resumo.paradoPorFalhas) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
