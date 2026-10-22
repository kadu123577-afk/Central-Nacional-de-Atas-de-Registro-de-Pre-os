import { describe, expect, it } from "vitest";
import { agregarFornecedores, type FornecedorAgregado } from "./radar-atas";
import {
  ataMaisRecente,
  avaliarAta,
  chaveMunicipio,
  compararAtas,
  contarPorCategoria,
  cortarTexto,
  dataUtc,
  fornecedorDaAta,
  grupoDoMotivo,
  lerLinha,
  ligarFornecedor,
  limitarAtas,
  linhaRadar,
  municipiosComDemanda,
  normalizarAta,
  paraAtasDoFornecedor,
  planejarProspeccao,
  planejarRadar,
  pontuarCandidata,
  registrarVinculo,
  vinculoDeContrato,
  type AtaCandidata,
  type AtaNormalizada,
  type Ligacoes,
  type ProspeccaoExistente,
  type RadarExistente,
} from "./radar-atas-fonte";

// CNPJs com dígito verificador correto.
const CNPJ_A = "11222333000181";
const CNPJ_B = "11444777000161";
const CNPJ_C = "45000000000120";

const hoje = new Date("2026-10-22T00:00:00Z");
const municipio = { entidadeAlvoId: "ent-1", uf: "GO", municipioNome: "Catalão" };

const ataBruta = (extra: Record<string, unknown> = {}) => ({
  numeroControlePNCPAta: "03532661000156-1-000075/2024-000001",
  numeroAtaRegistroPreco: "00001",
  anoAta: 2025,
  cancelado: false,
  dataCancelamento: null,
  vigenciaInicio: "2026-01-16",
  vigenciaFim: "2027-01-16",
  dataAtualizacao: "2026-05-14",
  objetoContratacao: "Aquisição de material hospitalar para a rede municipal",
  cnpjOrgao: "03532661000156",
  nomeOrgao: "FUNDO MUNICIPAL DE SAUDE - CATALAO",
  possibilidadeAdesao: null,
  ...extra,
});

const ata = (extra: Partial<AtaNormalizada> = {}): AtaNormalizada => ({
  numeroControle: "03532661000156-1-000075/2024-000001",
  orgaoCnpj: "03532661000156",
  orgaoNome: "FUNDO MUNICIPAL DE SAUDE - CATALAO",
  objeto: "Aquisição de material hospitalar para a rede municipal",
  vigenciaInicio: "2026-01-16",
  vigenciaFim: "2027-01-16",
  cancelado: false,
  dataCancelamento: null,
  possibilidadeAdesao: null,
  atualizadoEm: "2026-05-14",
  ...extra,
});

const contratoBruto = (extra: Record<string, unknown> = {}) => ({
  numeroControlePNCP: "03532661000156-2-000010/2026",
  numeroControlePncpAta: "03532661000156-1-000075/2024-000001",
  niFornecedor: CNPJ_A,
  nomeRazaoSocialFornecedor: "DISTRIBUIDORA EXEMPLO LTDA",
  tipoPessoa: "PJ",
  ...extra,
});

const candidata = (extra: Partial<AtaCandidata> = {}): AtaCandidata => {
  const av = avaliarAta(ata(), hoje, municipio);
  if (!av.elegivel) throw new Error("fixture inelegível");
  return { ...av.candidata, ...extra };
};

describe("lerLinha", () => {
  it("lê ata e contrato que cita ata", () => {
    const linhaAta = JSON.stringify({ chave: "atas:03532661000156:2026", dado: ataBruta() });
    const linhaContrato = JSON.stringify({ chave: "contratos:2025", dado: contratoBruto() });
    expect(lerLinha(linhaAta)?.tipo).toBe("ata");
    expect(lerLinha(linhaAta)?.dado).toMatchObject({ numeroControlePNCPAta: "03532661000156-1-000075/2024-000001" });
    expect(lerLinha(linhaContrato)?.tipo).toBe("contrato");
  });

  it("ignora contrato sem ata, outros tipos, linha vazia e linha truncada", () => {
    expect(lerLinha(JSON.stringify({ chave: "contratos:2025", dado: contratoBruto({ numeroControlePncpAta: null }) }))).toBeNull();
    expect(lerLinha(JSON.stringify({ chave: "pca:2026", dado: { idPcaPncp: "1" } }))).toBeNull();
    expect(lerLinha("")).toBeNull();
    expect(lerLinha('{"chave":"atas:2026","dado":{"numeroControlePNCPAta":"x')).toBeNull();
    expect(lerLinha("lixo")).toBeNull();
    expect(lerLinha("[1,2]")).toBeNull();
  });

  it("lê também quando a chave não está no começo da linha", () => {
    const linha = JSON.stringify({ dado: ataBruta(), chave: "atas:2025" });
    expect(lerLinha(linha)?.tipo).toBe("ata");
    expect(lerLinha(JSON.stringify({ dado: {}, chave: "siconfi:1" }))).toBeNull();
  });
});

describe("normalizarAta", () => {
  it("extrai os campos que o radar usa", () => {
    const a = normalizarAta(ataBruta({ possibilidadeAdesao: true, dataAtualizacao: "2026-05-14T10:00:00" }))!;
    expect(a).toMatchObject({
      numeroControle: "03532661000156-1-000075/2024-000001",
      orgaoCnpj: "03532661000156",
      orgaoNome: "FUNDO MUNICIPAL DE SAUDE - CATALAO",
      vigenciaInicio: "2026-01-16",
      vigenciaFim: "2027-01-16",
      cancelado: false,
      dataCancelamento: null,
      possibilidadeAdesao: true,
      atualizadoEm: "2026-05-14T10:00:00",
    });
  });

  it("devolve null sem número de controle ou sem ser objeto", () => {
    expect(normalizarAta(ataBruta({ numeroControlePNCPAta: "  " }))).toBeNull();
    expect(normalizarAta(null)).toBeNull();
    expect(normalizarAta("texto")).toBeNull();
    expect(normalizarAta([ataBruta()])).toBeNull();
  });

  it("possibilidadeAdesao só é booleano ou nulo; data inválida vira nula", () => {
    expect(normalizarAta(ataBruta({ possibilidadeAdesao: "false" }))!.possibilidadeAdesao).toBeNull();
    expect(normalizarAta(ataBruta({ possibilidadeAdesao: false }))!.possibilidadeAdesao).toBe(false);
    expect(normalizarAta(ataBruta({ vigenciaFim: "amanhã" }))!.vigenciaFim).toBeNull();
    expect(normalizarAta(ataBruta({ vigenciaFim: 20270116 }))!.vigenciaFim).toBeNull();
  });

  it("pega o CNPJ do órgão do número de controle quando o campo falta; limpa o texto do objeto", () => {
    const a = normalizarAta(
      ataBruta({ cnpjOrgao: null, objetoContratacao: "  Registro \n de   preços\u0000 de pneus  " }),
    )!;
    expect(a.orgaoCnpj).toBe("03532661000156");
    expect(a.objeto).toBe("Registro de preços de pneus");
  });
});

describe("ataMaisRecente", () => {
  it("fica com a de dataAtualizacao mais recente; empate mantém a que já estava", () => {
    const velha = ata({ atualizadoEm: "2026-01-01", objeto: "velha" });
    const nova = ata({ atualizadoEm: "2026-02-01", objeto: "nova" });
    expect(ataMaisRecente(undefined, velha)).toBe(velha);
    expect(ataMaisRecente(velha, nova)).toBe(nova);
    expect(ataMaisRecente(nova, velha)).toBe(nova);
    const igual = ata({ atualizadoEm: "2026-02-01", objeto: "igual" });
    expect(ataMaisRecente(nova, igual)).toBe(nova);
  });
});

describe("vinculoDeContrato", () => {
  it("liga contrato de empresa à ata", () => {
    expect(vinculoDeContrato(contratoBruto())).toEqual({
      ataControle: "03532661000156-1-000075/2024-000001",
      contratoId: "03532661000156-2-000010/2026",
      cnpj: CNPJ_A,
      nome: "Distribuidora exemplo ltda",
    });
  });

  it("aceita CNPJ com máscara", () => {
    expect(vinculoDeContrato(contratoBruto({ niFornecedor: "11.222.333/0001-81" }))?.cnpj).toBe(CNPJ_A);
  });

  it("empresa marcada como PE no PNCP (cadastro comum de empresa brasileira) com CNPJ válido entra", () => {
    expect(vinculoDeContrato(contratoBruto({ tipoPessoa: "PE" }))?.cnpj).toBe(CNPJ_A);
    // Mas PE com número que não é CNPJ válido (estrangeiro, outro documento) não entra.
    expect(vinculoDeContrato(contratoBruto({ tipoPessoa: "PE", niFornecedor: "AB1234567" }))).toBeNull();
  });

  it("ignora pessoa física e CPF", () => {
    expect(vinculoDeContrato(contratoBruto({ tipoPessoa: "PF", niFornecedor: "05269404176" }))).toBeNull();
    // Mesmo marcado como PJ, 11 dígitos é CPF e não entra.
    expect(vinculoDeContrato(contratoBruto({ niFornecedor: "05269404176" }))).toBeNull();
    // PF com número de CNPJ válido (cadastro errado no PNCP) também não entra.
    expect(vinculoDeContrato(contratoBruto({ tipoPessoa: "PF" }))).toBeNull();
  });

  it("ignora CNPJ com dígito errado, contrato sem ata e dado que não é objeto", () => {
    expect(vinculoDeContrato(contratoBruto({ niFornecedor: "11222333000182" }))).toBeNull();
    expect(vinculoDeContrato(contratoBruto({ niFornecedor: null }))).toBeNull();
    expect(vinculoDeContrato(contratoBruto({ numeroControlePncpAta: null }))).toBeNull();
    expect(vinculoDeContrato(contratoBruto({ numeroControlePncpAta: "" }))).toBeNull();
    expect(vinculoDeContrato(undefined)).toBeNull();
  });

  it("retira o CPF do MEI do nome e deixa nome vazio como nulo", () => {
    expect(vinculoDeContrato(contratoBruto({ nomeRazaoSocialFornecedor: "FULANO DE TAL 12345678901" }))?.nome).toBe("Fulano de tal");
    expect(vinculoDeContrato(contratoBruto({ nomeRazaoSocialFornecedor: "123.456.789-01" }))?.nome).toBeNull();
    expect(vinculoDeContrato(contratoBruto({ nomeRazaoSocialFornecedor: null }))?.nome).toBeNull();
  });
});

describe("registrarVinculo e fornecedorDaAta", () => {
  const vinculo = (cnpj: string, nome: string | null = null, contratoId: string | null = null) => ({
    ataControle: "ata-1",
    contratoId,
    cnpj,
    nome,
  });

  it("escolhe o CNPJ que mais aparece nos contratos da ata", () => {
    const l: Ligacoes = new Map();
    registrarVinculo(l, vinculo(CNPJ_A, "A"));
    registrarVinculo(l, vinculo(CNPJ_B, "B"));
    registrarVinculo(l, vinculo(CNPJ_B, "B"));
    expect(fornecedorDaAta(l, "ata-1")).toEqual({ cnpj: CNPJ_B, nome: "B", contratos: 2 });
  });

  it("no empate fica o menor CNPJ, sempre", () => {
    const l1: Ligacoes = new Map();
    registrarVinculo(l1, vinculo(CNPJ_B));
    registrarVinculo(l1, vinculo(CNPJ_A));
    const l2: Ligacoes = new Map();
    registrarVinculo(l2, vinculo(CNPJ_A));
    registrarVinculo(l2, vinculo(CNPJ_B));
    expect(fornecedorDaAta(l1, "ata-1")?.cnpj).toBe(CNPJ_A);
    expect(fornecedorDaAta(l2, "ata-1")?.cnpj).toBe(CNPJ_A);
  });

  it("completa o nome quando o primeiro contrato veio sem nome", () => {
    const l: Ligacoes = new Map();
    registrarVinculo(l, vinculo(CNPJ_A, null));
    registrarVinculo(l, vinculo(CNPJ_A, "Empresa A"));
    expect(fornecedorDaAta(l, "ata-1")?.nome).toBe("Empresa A");
  });

  it("ata sem contrato de empresa não tem fornecedor", () => {
    expect(fornecedorDaAta(new Map(), "ata-1")).toBeNull();
  });

  it("o mesmo contrato lido duas vezes conta uma só (não troca o fornecedor escolhido)", () => {
    const l: Ligacoes = new Map();
    const vistos = new Set<string>();
    // B tem 1 contrato lido três vezes; A tem 2 contratos distintos. Contando linhas, B (3) venceria A (2);
    // contando contratos, A (2) vence B (1).
    expect(registrarVinculo(l, vinculo(CNPJ_B, "B", "c-1"), vistos)).toBe(true);
    expect(registrarVinculo(l, vinculo(CNPJ_B, "B", "c-1"), vistos)).toBe(false);
    expect(registrarVinculo(l, vinculo(CNPJ_B, "B", "c-1"), vistos)).toBe(false);
    expect(registrarVinculo(l, vinculo(CNPJ_A, "A", "c-2"), vistos)).toBe(true);
    expect(registrarVinculo(l, vinculo(CNPJ_A, "A", "c-3"), vistos)).toBe(true);
    expect(fornecedorDaAta(l, "ata-1")).toEqual({ cnpj: CNPJ_A, nome: "A", contratos: 2 });
  });

  it("sem número de contrato (ou sem o conjunto de vistos) cada linha conta", () => {
    const l: Ligacoes = new Map();
    const vistos = new Set<string>();
    registrarVinculo(l, vinculo(CNPJ_A), vistos);
    registrarVinculo(l, vinculo(CNPJ_A), vistos);
    registrarVinculo(l, vinculo(CNPJ_B, null, "c-9"));
    registrarVinculo(l, vinculo(CNPJ_B, null, "c-9"));
    expect(fornecedorDaAta(l, "ata-1")?.contratos).toBe(2);
    expect(l.get("ata-1")?.get(CNPJ_A)?.contratos).toBe(2);
    expect(l.get("ata-1")?.get(CNPJ_B)?.contratos).toBe(2);
  });
});

describe("avaliarAta", () => {
  it("monta a candidata de uma ata vigente, com categoria e dias restantes", () => {
    const av = avaliarAta(ata(), hoje, municipio);
    expect(av.elegivel).toBe(true);
    if (!av.elegivel) return;
    expect(av.candidata).toMatchObject({
      numeroControlePncpAta: "03532661000156-1-000075/2024-000001",
      entidadeAlvoId: "ent-1",
      uf: "GO",
      municipioNome: "Catalão",
      categoria: "material-hospitalar",
      diasRestantes: 86,
      fornecedorCnpj: null,
      fornecedorNome: null,
    });
    expect(av.candidata.vigenciaFim.toISOString()).toBe("2027-01-16T00:00:00.000Z");
    expect(av.candidata.vigenciaInicio?.toISOString()).toBe("2026-01-16T00:00:00.000Z");
  });

  it("o mínimo de vigência é inclusivo: 45 dias entra, 44 não", () => {
    expect(avaliarAta(ata({ vigenciaFim: "2026-12-06" }), hoje, municipio).elegivel).toBe(true);
    const av = avaliarAta(ata({ vigenciaFim: "2026-12-05" }), hoje, municipio);
    expect(av.elegivel).toBe(false);
    if (!av.elegivel) expect(grupoDoMotivo(av.motivo)).toBe("vigência curta demais");
  });

  it("respeita diasMinimos", () => {
    expect(avaliarAta(ata({ vigenciaFim: "2026-12-05" }), hoje, municipio, { diasMinimos: 30 }).elegivel).toBe(true);
  });

  it("recusa cancelada, vencida, fechada à adesão e sem fim de vigência, cada uma com seu grupo", () => {
    const grupo = (a: AtaNormalizada) => {
      const av = avaliarAta(a, hoje, municipio);
      return av.elegivel ? "elegivel" : grupoDoMotivo(av.motivo);
    };
    expect(grupo(ata({ cancelado: true }))).toBe("cancelada");
    expect(grupo(ata({ dataCancelamento: "2026-09-01" }))).toBe("cancelada");
    expect(grupo(ata({ vigenciaFim: "2026-09-01" }))).toBe("vigência vencida");
    expect(grupo(ata({ possibilidadeAdesao: false }))).toBe("fechada à adesão");
    expect(grupo(ata({ vigenciaFim: null }))).toBe("sem data de fim");
    expect(grupo(ata({ possibilidadeAdesao: true }))).toBe("elegivel");
    expect(grupo(ata({ possibilidadeAdesao: null }))).toBe("elegivel");
  });

  it("corta o objeto em 1000 caracteres mas classifica pelo texto inteiro", () => {
    const longo = `${"x ".repeat(600)}material hospitalar`;
    const av = avaliarAta(ata({ objeto: longo }), hoje, municipio);
    expect(av.elegivel).toBe(true);
    if (!av.elegivel) return;
    expect(av.candidata.objeto.length).toBeLessThanOrEqual(1000);
    expect(av.candidata.categoria).toBe("material-hospitalar");
  });

  it("objeto vazio recebe um texto padrão e não tem categoria", () => {
    const av = avaliarAta(ata({ objeto: "" }), hoje, municipio);
    expect(av.elegivel).toBe(true);
    if (!av.elegivel) return;
    expect(av.candidata.objeto).toBe("Objeto não informado");
    expect(av.candidata.categoria).toBeNull();
  });
});

describe("grupoDoMotivo", () => {
  it("agrupa os motivos conhecidos e manda o resto para 'outro motivo'", () => {
    expect(grupoDoMotivo("A ata foi cancelada.")).toBe("cancelada");
    expect(grupoDoMotivo("A ata não aceita adesão de outros órgãos.")).toBe("fechada à adesão");
    expect(grupoDoMotivo("A vigência já terminou.")).toBe("vigência vencida");
    expect(grupoDoMotivo("A vigência acaba em 3 dias (mínimo de 45).")).toBe("vigência curta demais");
    expect(grupoDoMotivo("O fim da vigência não foi informado.")).toBe("sem data de fim");
    expect(grupoDoMotivo("Data de referência inválida.")).toBe("outro motivo");
  });
});

describe("ligarFornecedor", () => {
  it("preenche o fornecedor sem alterar a candidata original", () => {
    const c = candidata();
    const l: Ligacoes = new Map();
    registrarVinculo(l, { ataControle: c.numeroControlePncpAta, contratoId: null, cnpj: CNPJ_A, nome: "Empresa A" });
    const ligada = ligarFornecedor(c, l);
    expect(ligada).toMatchObject({ fornecedorCnpj: CNPJ_A, fornecedorNome: "Empresa A" });
    expect(c.fornecedorCnpj).toBeNull();
    expect(ligarFornecedor(c, new Map())).toBe(c);
  });
});

describe("demanda e pontuação", () => {
  const demanda = new Map([
    ["material-hospitalar", new Set(["ent-1", "ent-2", "ent-3"])],
    ["veiculos", new Set(["ent-2"])],
  ]);

  it("conta os municípios com demanda sem contar o que publicou a ata", () => {
    expect(municipiosComDemanda(demanda, "material-hospitalar", "ent-1")).toBe(2);
    expect(municipiosComDemanda(demanda, "material-hospitalar", "ent-9")).toBe(3);
    expect(municipiosComDemanda(demanda, "veiculos", "ent-2")).toBe(0);
    expect(municipiosComDemanda(demanda, "limpeza", "ent-1")).toBe(0);
    expect(municipiosComDemanda(demanda, null, "ent-1")).toBe(0);
  });

  it("pontua pela demanda, vigência, fornecedor e categoria", () => {
    // 2 municípios = 20; 86 dias = round(86 * 50 / 365) = 12; categoria = 10; sem fornecedor.
    const p = pontuarCandidata(candidata(), demanda);
    expect(p.municipiosComDemanda).toBe(2);
    expect(p.pontuacao).toBe(20 + 12 + 10);
    const comFornecedor = pontuarCandidata(candidata({ fornecedorCnpj: CNPJ_A }), demanda);
    expect(comFornecedor.pontuacao).toBe(p.pontuacao + 20);
  });

  it("sem categoria e sem demanda fica no teto de 30", () => {
    const p = pontuarCandidata(candidata({ categoria: null, fornecedorCnpj: CNPJ_A, diasRestantes: 400 }), demanda);
    expect(p.municipiosComDemanda).toBe(0);
    expect(p.pontuacao).toBe(30);
  });
});

describe("limitarAtas e compararAtas", () => {
  const a = (numero: string, pontuacao: number, diasRestantes = 100) => ({
    numeroControlePncpAta: numero,
    pontuacao,
    diasRestantes,
  });

  it("ordena por pontuação, depois vigência, depois número; e corta no limite", () => {
    const lista = [a("c", 10), a("b", 50, 60), a("a", 50, 90), a("d", 50, 90)];
    const { mantidas, cortadas } = limitarAtas(lista, 3);
    expect(mantidas.map((x) => x.numeroControlePncpAta)).toEqual(["a", "d", "b"]);
    expect(cortadas).toBe(1);
  });

  it("não corta quando cabe, não altera a lista original e é determinístico", () => {
    const lista = [a("b", 1), a("a", 1)];
    const r1 = limitarAtas(lista, 10);
    const r2 = limitarAtas([...lista].reverse(), 10);
    expect(r1.cortadas).toBe(0);
    expect(r1.mantidas.map((x) => x.numeroControlePncpAta)).toEqual(["a", "b"]);
    expect(r2.mantidas).toEqual(r1.mantidas);
    expect(lista[0].numeroControlePncpAta).toBe("b");
    expect(compararAtas(a("a", 1), a("a", 1))).toBe(0);
  });

  it("limite inválido usa o padrão (20.000) e limite zero corta tudo", () => {
    expect(limitarAtas([a("a", 1)], Number.NaN).mantidas).toHaveLength(1);
    expect(limitarAtas([a("a", 1)], 0)).toEqual({ mantidas: [], cortadas: 1 });
  });
});

describe("contarPorCategoria", () => {
  it("conta por categoria, da maior para a menor, com 'sem categoria' no fim em caso de empate", () => {
    const r = contarPorCategoria([
      { categoria: "veiculos" },
      { categoria: null },
      { categoria: "limpeza" },
      { categoria: "veiculos" },
    ]);
    expect(r).toEqual([
      { categoria: "veiculos", quantidade: 2 },
      { categoria: "limpeza", quantidade: 1 },
      { categoria: null, quantidade: 1 },
    ]);
  });
});

describe("linhaRadar e paraAtasDoFornecedor", () => {
  it("leva para a linha do banco só os campos do modelo", () => {
    const agora = new Date("2026-10-22T12:00:00Z");
    const p = pontuarCandidata(candidata({ fornecedorCnpj: CNPJ_A, fornecedorNome: "Empresa A" }), new Map());
    const linha = linhaRadar(p, agora);
    expect(Object.keys(linha).sort()).toEqual(
      [
        "calculadoEm",
        "categoria",
        "fornecedorCnpj",
        "fornecedorNome",
        "municipioNome",
        "municipiosComDemanda",
        "numeroControlePncpAta",
        "objeto",
        "orgaoCnpj",
        "orgaoNome",
        "pontuacao",
        "possibilidadeAdesao",
        "uf",
        "vigenciaFim",
        "vigenciaInicio",
      ].sort(),
    );
    expect(linha.calculadoEm).toBe(agora);
    expect(linha.fornecedorCnpj).toBe(CNPJ_A);
  });

  it("alimenta agregarFornecedores com o CNPJ e ignora ata sem CNPJ", () => {
    const comCnpj = pontuarCandidata(candidata({ fornecedorCnpj: CNPJ_A, fornecedorNome: "Empresa A" }), new Map());
    const semCnpj = pontuarCandidata(candidata({ numeroControlePncpAta: "outra" }), new Map());
    const agregados = agregarFornecedores(paraAtasDoFornecedor([comCnpj, semCnpj]));
    expect(agregados).toHaveLength(1);
    expect(agregados[0]).toMatchObject({ cnpj: CNPJ_A, razaoSocial: "Empresa A", atasVigentes: 1, ufs: ["GO"] });
  });
});

describe("planejarRadar", () => {
  const nova = (numero: string, pontuacao: number, diasRestantes = 100) => ({
    numeroControlePncpAta: numero,
    pontuacao,
    diasRestantes,
  });
  const gravada = (numero: string, uf: string | null, municipio: string | null, pontuacao = 50): RadarExistente => ({
    numeroControlePncpAta: numero,
    uf,
    municipioNome: municipio,
    categoria: null,
    fornecedorCnpj: null,
    fornecedorNome: null,
    pontuacao,
  });

  it("rodada completa: cria as novas, atualiza as que já estão e apaga toda linha que não voltou", () => {
    const plano = planejarRadar(
      [nova("a", 90), nova("b", 80)],
      [gravada("b", "GO", "Catalão"), gravada("vencida", "GO", "Catalão"), gravada("de-outro-municipio", "PA", "Aveiro")],
    );
    expect(plano.criar.map((x) => x.numeroControlePncpAta)).toEqual(["a"]);
    expect(plano.atualizar.map((x) => x.numeroControlePncpAta)).toEqual(["b"]);
    // Rodada completa: nada fica "fora do escopo", então também a linha de outro município sai.
    expect(plano.apagar.sort()).toEqual(["de-outro-municipio", "vencida"]);
    expect(plano.foraDoEscopo).toEqual([]);
    expect(plano.cortadas).toBe(0);
  });

  it("o limite mantém as de maior pontuação e apaga do banco as que foram cortadas", () => {
    const plano = planejarRadar(
      [nova("a", 10), nova("b", 90), nova("c", 50)],
      [gravada("a", "GO", "Catalão"), gravada("b", "GO", "Catalão")],
      { limite: 2 },
    );
    expect(plano.mantidas.map((x) => x.numeroControlePncpAta)).toEqual(["b", "c"]);
    expect(plano.cortadas).toBe(1);
    expect(plano.criar.map((x) => x.numeroControlePncpAta)).toEqual(["c"]);
    expect(plano.atualizar.map((x) => x.numeroControlePncpAta)).toEqual(["b"]);
    expect(plano.apagar).toEqual(["a"]);
  });

  it("rodada parcial: só troca e apaga as linhas dos municípios lidos; as dos outros ficam", () => {
    const escopo = new Set([chaveMunicipio("GO", "Catalão")]);
    const plano = planejarRadar(
      [nova("novo", 70)],
      [gravada("velha-catalao", "GO", "Catalão"), gravada("aveiro", "PA", "Aveiro"), gravada("sem-local", null, null)],
      { escopo },
    );
    expect(plano.criar.map((x) => x.numeroControlePncpAta)).toEqual(["novo"]);
    expect(plano.apagar).toEqual(["velha-catalao"]);
    expect(plano.foraDoEscopo.map((r) => r.numeroControlePncpAta)).toEqual(["aveiro", "sem-local"]);
  });

  it("rodada parcial: o limite vale para o radar inteiro e as linhas de fora contam", () => {
    const escopo = new Set([chaveMunicipio("GO", "Catalão")]);
    const existentes = [gravada("o1", "PA", "Aveiro"), gravada("o2", "PA", "Aveiro"), gravada("o3", "PA", "Aveiro")];
    const plano = planejarRadar([nova("n1", 90), nova("n2", 80)], existentes, { escopo, limite: 4 });
    // 4 de limite - 3 de fora = só 1 vaga para esta rodada: fica a de maior pontuação.
    expect(plano.mantidas.map((x) => x.numeroControlePncpAta)).toEqual(["n1"]);
    expect(plano.cortadas).toBe(1);
    expect(plano.foraDoEscopo).toHaveLength(3);
    expect(plano.apagar).toEqual([]);
    // Nunca passa do limite: gravadas + fora do escopo.
    expect(plano.mantidas.length + plano.foraDoEscopo.length).toBeLessThanOrEqual(4);
  });

  it("rodada parcial: ata lida de novo mas gravada em outro município é trocada, não duplicada", () => {
    const escopo = new Set([chaveMunicipio("GO", "Catalão")]);
    const plano = planejarRadar([nova("x", 70)], [gravada("x", "PA", "Aveiro")], { escopo });
    expect(plano.atualizar.map((a) => a.numeroControlePncpAta)).toEqual(["x"]);
    expect(plano.criar).toEqual([]);
    expect(plano.foraDoEscopo).toEqual([]);
    expect(plano.apagar).toEqual([]);
  });

  it("rodada parcial: ata lida de novo, gravada em outro município e cortada pelo limite sai do banco", () => {
    const escopo = new Set([chaveMunicipio("GO", "Catalão")]);
    const plano = planejarRadar([nova("x", 70)], [gravada("x", "PA", "Aveiro"), gravada("o1", "PA", "Aveiro")], {
      escopo,
      limite: 1,
    });
    expect(plano.mantidas).toEqual([]);
    expect(plano.apagar).toEqual(["x"]);
    expect(plano.foraDoEscopo.map((r) => r.numeroControlePncpAta)).toEqual(["o1"]);
  });

  it("não altera as listas recebidas e limite inválido usa 20.000", () => {
    const pontuadas = [nova("b", 1), nova("a", 2)];
    const existentes = [gravada("z", "GO", "Catalão")];
    const plano = planejarRadar(pontuadas, existentes, { limite: Number.NaN });
    expect(plano.mantidas).toHaveLength(2);
    expect(pontuadas.map((x) => x.numeroControlePncpAta)).toEqual(["b", "a"]);
    expect(existentes).toHaveLength(1);
  });
});

describe("planejarProspeccao", () => {
  const agregado = (cnpj: string, extra: Partial<FornecedorAgregado> = {}): FornecedorAgregado => ({
    cnpj,
    razaoSocial: `Empresa ${cnpj.slice(0, 2)}`,
    atasVigentes: 2,
    pontuacao: 100,
    categorias: ["limpeza", "veiculos"],
    ufs: ["GO", "MG"],
    ...extra,
  });
  const existente = (cnpj: string, extra: Partial<ProspeccaoExistente> = {}): ProspeccaoExistente => ({
    cnpj,
    razaoSocial: `Empresa ${cnpj.slice(0, 2)}`,
    atasVigentes: 2,
    pontuacao: 100,
    categorias: "limpeza,veiculos",
    ufs: "GO,MG",
    ...extra,
  });

  it("cria só os que ainda não existem entre os topN e guarda listas separadas por vírgula", () => {
    const plano = planejarProspeccao([agregado(CNPJ_A), agregado(CNPJ_B), agregado(CNPJ_C)], [existente(CNPJ_A)], { topN: 2 });
    // topN = 2 → A e B; A já existe; C fica de fora.
    expect(plano.criar.map((n) => n.cnpj)).toEqual([CNPJ_B]);
    expect(plano.criar[0]).toMatchObject({ razaoSocial: "Empresa 11", categorias: "limpeza,veiculos", ufs: "GO,MG", atasVigentes: 2 });
    expect(plano.atualizar).toEqual([]);
  });

  it("não cria registro para fornecedor sem categoria nem UF com listas nulas (não vazias)", () => {
    const plano = planejarProspeccao([agregado(CNPJ_A, { categorias: [], ufs: [] })], []);
    expect(plano.criar[0]).toMatchObject({ categorias: null, ufs: null });
  });

  it("repetir a rodada não muda nada (idempotente)", () => {
    const agregados = [agregado(CNPJ_A), agregado(CNPJ_B)];
    const existentes = [existente(CNPJ_A), existente(CNPJ_B)];
    expect(planejarProspeccao(agregados, existentes)).toEqual({ criar: [], atualizar: [], zerados: 0 });
  });

  it("atualiza só os campos que mudaram e nunca estágio, observações nem próximo contato", () => {
    const plano = planejarProspeccao(
      [agregado(CNPJ_A, { atasVigentes: 5, pontuacao: 250, categorias: ["limpeza"], ufs: ["GO"] })],
      [existente(CNPJ_A)],
    );
    expect(plano.atualizar).toHaveLength(1);
    expect(plano.atualizar[0]).toEqual({
      cnpj: CNPJ_A,
      dados: { atasVigentes: 5, pontuacao: 250, categorias: "limpeza", ufs: "GO" },
    });
    for (const u of plano.atualizar) {
      expect(Object.keys(u.dados)).not.toContain("estagio");
      expect(Object.keys(u.dados)).not.toContain("observacoes");
      expect(Object.keys(u.dados)).not.toContain("proximoContatoEm");
    }
  });

  it("atualiza também quem está fora do topN, mas só preenche a razão social se estiver vazia", () => {
    const agregados = [agregado(CNPJ_A), agregado(CNPJ_B, { atasVigentes: 9, razaoSocial: "Nome novo" })];
    const plano = planejarProspeccao(
      agregados,
      [existente(CNPJ_A), existente(CNPJ_B, { razaoSocial: "Nome corrigido pela equipe" })],
      { topN: 1 },
    );
    expect(plano.criar).toEqual([]);
    expect(plano.atualizar).toEqual([{ cnpj: CNPJ_B, dados: { atasVigentes: 9 } }]);

    const vazia = planejarProspeccao([agregado(CNPJ_A, { razaoSocial: "Nome novo" })], [existente(CNPJ_A, { razaoSocial: "  " })]);
    expect(vazia.atualizar).toEqual([{ cnpj: CNPJ_A, dados: { razaoSocial: "Nome novo" } }]);
  });

  it("razão social que é só o CNPJ (nenhum contrato trouxe o nome) recebe o nome quando ele aparece", () => {
    const comNome = planejarProspeccao(
      [agregado(CNPJ_A, { razaoSocial: "Empresa A ltda" })],
      [existente(CNPJ_A, { razaoSocial: CNPJ_A })],
    );
    expect(comNome.atualizar).toEqual([{ cnpj: CNPJ_A, dados: { razaoSocial: "Empresa A ltda" } }]);
    // Ainda sem nome: nada a mudar.
    expect(planejarProspeccao([agregado(CNPJ_A, { razaoSocial: CNPJ_A })], [existente(CNPJ_A, { razaoSocial: CNPJ_A })]).atualizar).toEqual([]);
  });

  it("zera atasVigentes e pontuação de quem saiu do radar, sem mexer no resto", () => {
    const plano = planejarProspeccao([agregado(CNPJ_A)], [existente(CNPJ_A), existente(CNPJ_B), existente(CNPJ_C, { atasVigentes: 0, pontuacao: 0 })]);
    expect(plano.zerados).toBe(1);
    expect(plano.atualizar).toEqual([{ cnpj: CNPJ_B, dados: { atasVigentes: 0, pontuacao: 0 } }]);
  });

  it("topN inválido usa 300", () => {
    const muitos = Array.from({ length: 305 }, (_, i) => agregado(String(i).padStart(14, "0")));
    expect(planejarProspeccao(muitos, [], { topN: 0 }).criar).toHaveLength(300);
    expect(planejarProspeccao(muitos, [], { topN: Number.NaN }).criar).toHaveLength(300);
    expect(planejarProspeccao(muitos, []).criar).toHaveLength(300);
    expect(planejarProspeccao(muitos, [], { topN: 10 }).criar).toHaveLength(10);
  });
});

describe("dataUtc e cortarTexto", () => {
  it("dataUtc lê AAAA-MM-DD (com ou sem hora) e recusa data inexistente", () => {
    expect(dataUtc("2027-01-16")?.toISOString()).toBe("2027-01-16T00:00:00.000Z");
    expect(dataUtc("2027-01-16T23:59:59")?.toISOString()).toBe("2027-01-16T00:00:00.000Z");
    expect(dataUtc("2027-02-31")).toBeNull();
    expect(dataUtc("2027-13-01")).toBeNull();
    expect(dataUtc("amanhã")).toBeNull();
    expect(dataUtc(null)).toBeNull();
  });

  it("cortarTexto não deixa meio emoji na ponta", () => {
    expect(cortarTexto("abc", 10)).toBe("abc");
    expect(cortarTexto("abcdef", 3)).toBe("abc");
    const texto = `${"a".repeat(999)}😀`; // o emoji ocupa as posições 999 e 1000
    expect(cortarTexto(texto, 1000)).toBe("a".repeat(999));
  });
});
