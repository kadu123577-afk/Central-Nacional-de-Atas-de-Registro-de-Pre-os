import { describe, expect, it } from "vitest";
import {
  agregarFornecedores,
  type AtaDoFornecedor,
  ataElegivel,
  cnpjValido,
  COR_ESTAGIO_PROSPECCAO,
  demandaPorCategoria,
  diasRestantesAte,
  ESTAGIOS_PROSPECCAO,
  estagioProspeccaoValido,
  estagiosPermitidos,
  normalizarCnpj,
  podeMoverEstagio,
  pontuarAta,
  resumirFunil,
  ROTULO_ESTAGIO_PROSPECCAO,
  rotuloEstagioProspeccao,
  TOM_ESTAGIO_PROSPECCAO,
} from "./radar-atas";

// 22/10/2026 + 45 dias = 06/12/2026 (9 dias de outubro + 30 de novembro + 6).
const hoje = new Date("2026-10-22T00:00:00Z");

describe("estágios do funil", () => {
  it("tem os cinco estágios, em ordem, cada um com rótulo, tom e cor", () => {
    expect([...ESTAGIOS_PROSPECCAO]).toEqual(["identificado", "contatado", "interessado", "credenciado", "recusou"]);
    for (const e of ESTAGIOS_PROSPECCAO) {
      expect(ROTULO_ESTAGIO_PROSPECCAO[e]).toBeTruthy();
      expect(["neutro", "atencao", "alerta", "critico", "marca"]).toContain(TOM_ESTAGIO_PROSPECCAO[e]);
      expect(COR_ESTAGIO_PROSPECCAO[e]).toMatch(/^var\(--cor-[a-z0-9-]+\)$/);
    }
  });
  it("reconhece só estágio conhecido", () => {
    expect(estagioProspeccaoValido("contatado")).toBe(true);
    expect(estagioProspeccaoValido("Contatado")).toBe(false);
    expect(estagioProspeccaoValido("")).toBe(false);
    expect(estagioProspeccaoValido(null)).toBe(false);
    expect(estagioProspeccaoValido(3)).toBe(false);
  });
  it("rótulo desconhecido volta como veio", () => {
    expect(rotuloEstagioProspeccao("credenciado")).toBe("Credenciado");
    expect(rotuloEstagioProspeccao("outro")).toBe("outro");
  });
});

describe("normalizarCnpj", () => {
  it("tira a máscara e devolve os 14 dígitos", () => {
    expect(normalizarCnpj("12.345.678/0001-95")).toBe("12345678000195");
    expect(normalizarCnpj("12345678000195")).toBe("12345678000195");
    expect(normalizarCnpj("  12 345 678 0001 95 ")).toBe("12345678000195");
  });
  it("recusa CPF de 11 dígitos", () => {
    expect(normalizarCnpj("123.456.789-09")).toBeNull();
    expect(normalizarCnpj("12345678909")).toBeNull();
  });
  it("recusa tamanho errado, letras e lixo", () => {
    expect(normalizarCnpj("1234567800019")).toBeNull();
    expect(normalizarCnpj("123456780001955")).toBeNull();
    expect(normalizarCnpj("12.345.678/0001-9X")).toBeNull();
    expect(normalizarCnpj("abc")).toBeNull();
    expect(normalizarCnpj("")).toBeNull();
    expect(normalizarCnpj("   ")).toBeNull();
    expect(normalizarCnpj(null)).toBeNull();
    expect(normalizarCnpj(undefined)).toBeNull();
    expect(normalizarCnpj(12345678000195)).toBeNull();
  });
});

describe("cnpjValido", () => {
  it("aceita CNPJ com dígito verificador correto, com ou sem máscara", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("12345678000195")).toBe(true);
    expect(cnpjValido("00000000000191")).toBe(true);
    expect(cnpjValido("14147490000168")).toBe(true);
  });
  it("recusa dígito verificador errado", () => {
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("11222333000191")).toBe(false);
  });
  it("recusa repetição de um dígito, CPF e lixo", () => {
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(cnpjValido("123.456.789-09")).toBe(false);
    expect(cnpjValido("lixo")).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });
  it("sem conferir o dígito, só olha o formato", () => {
    expect(cnpjValido("11222333000182", { verificarDigitos: false })).toBe(true);
    expect(cnpjValido("12345678909", { verificarDigitos: false })).toBe(false);
  });
});

describe("diasRestantesAte", () => {
  it("conta dias de calendário, ignorando a hora", () => {
    expect(diasRestantesAte("2026-12-06", hoje)).toBe(45);
    expect(diasRestantesAte("2026-12-06", new Date("2026-10-22T18:40:00Z"))).toBe(45);
    expect(diasRestantesAte(new Date("2026-12-06T00:00:00Z"), hoje)).toBe(45);
    expect(diasRestantesAte("2026-12-06T00:00:00", hoje)).toBe(45);
    expect(diasRestantesAte("2026-10-22", hoje)).toBe(0);
    expect(diasRestantesAte("2026-10-01", hoje)).toBe(-21);
  });
  it("devolve null sem data válida", () => {
    expect(diasRestantesAte(null, hoje)).toBeNull();
    expect(diasRestantesAte(undefined, hoje)).toBeNull();
    expect(diasRestantesAte("", hoje)).toBeNull();
    expect(diasRestantesAte("15/03/2027", hoje)).toBeNull();
    expect(diasRestantesAte("2026-02-31", hoje)).toBeNull();
    expect(diasRestantesAte(new Date("lixo"), hoje)).toBeNull();
    expect(diasRestantesAte("2026-12-06", new Date("lixo"))).toBeNull();
    // Dado solto de JSON (número, objeto) não é data: não pode estourar.
    expect(diasRestantesAte(20261206 as unknown as string, hoje)).toBeNull();
    expect(diasRestantesAte({} as unknown as string, hoje)).toBeNull();
  });
});

describe("ataElegivel", () => {
  it("exatamente 45 dias de vigência ainda é elegível (mínimo inclusivo)", () => {
    const r = ataElegivel({ vigenciaFim: "2026-12-06" }, hoje);
    expect(r).toEqual({ elegivel: true, diasRestantes: 45 });
  });
  it("44 dias não é elegível e diz quantos faltam", () => {
    const r = ataElegivel({ vigenciaFim: "2026-12-05" }, hoje);
    expect(r.elegivel).toBe(false);
    expect(r.diasRestantes).toBe(44);
    expect(r.motivo).toContain("44 dias");
    expect(r.motivo).toContain("45");
  });
  it("46 dias é elegível", () => {
    expect(ataElegivel({ vigenciaFim: "2026-12-07" }, hoje)).toEqual({ elegivel: true, diasRestantes: 46 });
  });
  it("a hora de 'hoje' não muda a conta do dia", () => {
    const tarde = new Date("2026-10-22T23:59:00Z");
    expect(ataElegivel({ vigenciaFim: "2026-12-06" }, tarde).elegivel).toBe(true);
    expect(ataElegivel({ vigenciaFim: "2026-12-05" }, tarde).elegivel).toBe(false);
  });
  it("aceita o fim da vigência como Date", () => {
    expect(ataElegivel({ vigenciaFim: new Date("2027-03-15T00:00:00Z") }, hoje).elegivel).toBe(true);
  });
  it("usa o mínimo informado", () => {
    expect(ataElegivel({ vigenciaFim: "2026-10-22" }, hoje, { diasMinimos: 0 })).toEqual({ elegivel: true, diasRestantes: 0 });
    expect(ataElegivel({ vigenciaFim: "2026-12-21" }, hoje, { diasMinimos: 60 }).elegivel).toBe(true); // 60 dias
    expect(ataElegivel({ vigenciaFim: "2026-12-20" }, hoje, { diasMinimos: 60 }).elegivel).toBe(false); // 59 dias
    expect(ataElegivel({ vigenciaFim: "2026-10-23" }, hoje).motivo).toContain("1 dia ");
  });
  it("mínimo inválido volta ao padrão de 45 dias", () => {
    expect(ataElegivel({ vigenciaFim: "2026-12-05" }, hoje, { diasMinimos: Number.NaN }).elegivel).toBe(false);
    expect(ataElegivel({ vigenciaFim: "2026-12-06" }, hoje, { diasMinimos: -5 }).elegivel).toBe(true);
  });
  it("ata cancelada não é elegível, mesmo com vigência longa", () => {
    const r = ataElegivel({ cancelado: true, vigenciaFim: "2027-12-31" }, hoje);
    expect(r.elegivel).toBe(false);
    expect(r.motivo).toMatch(/cancelada/);
    expect(r.diasRestantes).toBeGreaterThan(300);
  });
  it("data de cancelamento que já passou também cancela; a futura não", () => {
    expect(ataElegivel({ cancelado: false, dataCancelamento: "2026-10-22", vigenciaFim: "2027-12-31" }, hoje).elegivel).toBe(false);
    expect(ataElegivel({ cancelado: false, dataCancelamento: "2026-10-23", vigenciaFim: "2027-12-31" }, hoje).elegivel).toBe(true);
    expect(ataElegivel({ cancelado: null, dataCancelamento: null, vigenciaFim: "2027-12-31" }, hoje).elegivel).toBe(true);
  });
  it("sem fim de vigência não é elegível", () => {
    for (const vigenciaFim of [null, undefined, "", "lixo"]) {
      const r = ataElegivel({ vigenciaFim }, hoje);
      expect(r.elegivel).toBe(false);
      expect(r.diasRestantes).toBe(0);
      expect(r.motivo).toMatch(/vigência/);
    }
  });
  it("só possibilidadeAdesao false fecha a adesão; nulo e true passam", () => {
    const base = { vigenciaFim: "2027-06-30" };
    const fechada = ataElegivel({ ...base, possibilidadeAdesao: false }, hoje);
    expect(fechada.elegivel).toBe(false);
    expect(fechada.motivo).toMatch(/adesão/);
    expect(ataElegivel({ ...base, possibilidadeAdesao: null }, hoje).elegivel).toBe(true);
    expect(ataElegivel({ ...base, possibilidadeAdesao: true }, hoje).elegivel).toBe(true);
    expect(ataElegivel(base, hoje).elegivel).toBe(true);
  });
  it("vigência vencida não é elegível e mostra dias negativos", () => {
    const r = ataElegivel({ vigenciaFim: "2026-10-01" }, hoje);
    expect(r.elegivel).toBe(false);
    expect(r.diasRestantes).toBe(-21);
    expect(r.motivo).toMatch(/terminou/);
  });
  it("data de referência inválida não é elegível", () => {
    expect(ataElegivel({ vigenciaFim: "2027-06-30" }, new Date("lixo")).elegivel).toBe(false);
  });
});

describe("demandaPorCategoria", () => {
  it("agrupa os municípios por categoria, sem repetir", () => {
    const mapa = demandaPorCategoria([
      { entidadeAlvoId: "m1", categoria: "limpeza" },
      { entidadeAlvoId: "m2", categoria: "limpeza" },
      { entidadeAlvoId: "m1", categoria: "limpeza" },
      { entidadeAlvoId: "m1", categoria: "veiculos" },
      { entidadeAlvoId: "m3", categoria: " veiculos " },
    ]);
    expect([...mapa.keys()].sort()).toEqual(["limpeza", "veiculos"]);
    expect([...(mapa.get("limpeza") ?? [])].sort()).toEqual(["m1", "m2"]);
    expect([...(mapa.get("veiculos") ?? [])].sort()).toEqual(["m1", "m3"]);
  });
  it("ignora categoria nula, vazia ou só espaços", () => {
    const mapa = demandaPorCategoria([
      { entidadeAlvoId: "m1", categoria: null },
      { entidadeAlvoId: "m2", categoria: "" },
      { entidadeAlvoId: "m3", categoria: "   " },
      { entidadeAlvoId: "", categoria: "limpeza" },
    ]);
    expect(mapa.size).toBe(0);
  });
  it("lista vazia dá mapa vazio", () => {
    expect(demandaPorCategoria([]).size).toBe(0);
  });
});

describe("pontuarAta", () => {
  it("soma demanda, vigência, fornecedor e categoria (contas conferidas à mão)", () => {
    // 5×10 + 50 (365 dias) + 20 + 10
    expect(pontuarAta({ diasRestantes: 365, municipiosComDemanda: 5, temFornecedorCnpj: true, temCategoria: true })).toBe(130);
    // 3×10 + round(45/365×50 = 6,16) + 20 + 10
    expect(pontuarAta({ diasRestantes: 45, municipiosComDemanda: 3, temFornecedorCnpj: true, temCategoria: true })).toBe(66);
    // 0 + round(100/365×50 = 13,69) + 20 + 10
    expect(pontuarAta({ diasRestantes: 100, municipiosComDemanda: 0, temFornecedorCnpj: true, temCategoria: true })).toBe(44);
    // 10 + 0 + 0 + 10
    expect(pontuarAta({ diasRestantes: 0, municipiosComDemanda: 1, temFornecedorCnpj: false, temCategoria: true })).toBe(20);
    // 0 + round(180/365×50 = 24,66) + 0 + 10
    expect(pontuarAta({ diasRestantes: 180, municipiosComDemanda: 0, temFornecedorCnpj: false, temCategoria: true })).toBe(35);
  });
  it("a demanda tem teto de 400 e a vigência conta no máximo 365 dias", () => {
    expect(pontuarAta({ diasRestantes: 730, municipiosComDemanda: 50, temFornecedorCnpj: true, temCategoria: true })).toBe(480);
    expect(pontuarAta({ diasRestantes: 730, municipiosComDemanda: 40, temFornecedorCnpj: true, temCategoria: true })).toBe(480);
    expect(pontuarAta({ diasRestantes: 365, municipiosComDemanda: 39, temFornecedorCnpj: false, temCategoria: true })).toBe(450);
  });
  it("sem categoria e sem demanda vale no máximo 30", () => {
    // 50 + 20 = 70, cortado em 30
    expect(pontuarAta({ diasRestantes: 365, municipiosComDemanda: 0, temFornecedorCnpj: true, temCategoria: false })).toBe(30);
    expect(pontuarAta({ diasRestantes: 365, municipiosComDemanda: 0, temFornecedorCnpj: false, temCategoria: false })).toBe(30);
    // abaixo do teto, vale o cálculo: round(200/365×50 = 27,4)
    expect(pontuarAta({ diasRestantes: 200, municipiosComDemanda: 0, temFornecedorCnpj: false, temCategoria: false })).toBe(27);
  });
  it("o teto de 30 não vale quando há demanda ou categoria", () => {
    expect(pontuarAta({ diasRestantes: 365, municipiosComDemanda: 2, temFornecedorCnpj: true, temCategoria: false })).toBe(90);
    expect(pontuarAta({ diasRestantes: 365, municipiosComDemanda: 0, temFornecedorCnpj: true, temCategoria: true })).toBe(80);
  });
  it("devolve sempre um número inteiro", () => {
    for (const dias of [1, 17, 45, 99, 123, 211, 364]) {
      expect(Number.isInteger(pontuarAta({ diasRestantes: dias, municipiosComDemanda: 2, temFornecedorCnpj: true, temCategoria: true }))).toBe(true);
    }
    expect(pontuarAta({ diasRestantes: 45.5, municipiosComDemanda: 2.7, temFornecedorCnpj: false, temCategoria: true })).toBe(
      20 + Math.round((45.5 * 50) / 365) + 10,
    );
  });
  it("entrada inválida vale 0", () => {
    const ok = { diasRestantes: 100, municipiosComDemanda: 3, temFornecedorCnpj: true, temCategoria: true };
    expect(pontuarAta({ ...ok, diasRestantes: Number.NaN })).toBe(0);
    expect(pontuarAta({ ...ok, diasRestantes: Number.POSITIVE_INFINITY })).toBe(0);
    expect(pontuarAta({ ...ok, diasRestantes: -1 })).toBe(0);
    expect(pontuarAta({ ...ok, municipiosComDemanda: Number.NaN })).toBe(0);
    expect(pontuarAta({ ...ok, municipiosComDemanda: -3 })).toBe(0);
  });
});

describe("agregarFornecedores", () => {
  const ata = (extra: Partial<AtaDoFornecedor>): AtaDoFornecedor => ({
    fornecedorCnpj: "11222333000181",
    fornecedorNome: "Alfa",
    categoria: null,
    uf: null,
    pontuacao: 0,
    ...extra,
  });

  const atas = [
    ata({ fornecedorNome: "Alfa", categoria: "material-hospitalar", uf: "GO", pontuacao: 100 }),
    ata({ fornecedorCnpj: "11.222.333/0001-81", fornecedorNome: "ALFA LTDA", categoria: "limpeza", uf: "mg", pontuacao: 150 }),
    ata({ fornecedorCnpj: "12.345.678/0001-95", fornecedorNome: "Beta", categoria: "limpeza", uf: "GO", pontuacao: 150 }),
    ata({ fornecedorCnpj: null, fornecedorNome: "Sem CNPJ", pontuacao: 999 }),
    ata({ fornecedorCnpj: "12345678909", fornecedorNome: "Pessoa física", pontuacao: 999 }),
    ata({ fornecedorCnpj: "00000000000191", fornecedorNome: "Gama", pontuacao: 150 }),
    ata({ fornecedorCnpj: "14147490000168", fornecedorNome: null, pontuacao: 20 }),
  ];

  it("agrupa por CNPJ, ignora quem não tem CNPJ de 14 dígitos e ordena", () => {
    const r = agregarFornecedores(atas);
    expect(r.map((f) => f.cnpj)).toEqual(["11222333000181", "00000000000191", "12345678000195", "14147490000168"]);
  });
  it("conta as atas, pega a maior pontuação e junta categorias e UFs sem repetir", () => {
    const [alfa] = agregarFornecedores(atas);
    expect(alfa.atasVigentes).toBe(2);
    expect(alfa.pontuacao).toBe(150);
    expect(alfa.categorias).toEqual(["limpeza", "material-hospitalar"]);
    expect(alfa.ufs).toEqual(["GO", "MG"]);
  });
  it("empate em pontuação desempata por mais atas, depois por CNPJ", () => {
    const r = agregarFornecedores(atas);
    // Alfa, Gama e Beta têm 150; Alfa tem 2 atas; Gama (…0191) vem antes de Beta (12…95).
    expect(r.map((f) => f.razaoSocial)).toEqual(["ALFA LTDA", "Gama", "Beta", "14147490000168"]);
    expect(r.map((f) => f.atasVigentes)).toEqual([2, 1, 1, 1]);
  });
  it("a razão social vem da ata de maior pontuação; empate fica com a primeira", () => {
    const r = agregarFornecedores([
      ata({ fornecedorNome: "Nome A", pontuacao: 80 }),
      ata({ fornecedorNome: "Nome B", pontuacao: 80 }),
      ata({ fornecedorNome: "Nome C", pontuacao: 10 }),
    ]);
    expect(r[0].razaoSocial).toBe("Nome A");
  });
  it("ata sem nome não apaga o nome de outra; sem nenhum nome usa o CNPJ", () => {
    const r = agregarFornecedores([
      ata({ fornecedorNome: "  ", pontuacao: 90 }),
      ata({ fornecedorNome: "Com nome", pontuacao: 10 }),
      ata({ fornecedorCnpj: "00000000000191", fornecedorNome: null, pontuacao: 1 }),
    ]);
    expect(r.find((f) => f.cnpj === "11222333000181")?.razaoSocial).toBe("Com nome");
    expect(r.find((f) => f.cnpj === "00000000000191")?.razaoSocial).toBe("00000000000191");
  });
  it("retira o CPF do titular que o MEI carrega na razão social", () => {
    const r = agregarFornecedores([
      ata({ fornecedorNome: "MATEUS SOUZA 12037624611", pontuacao: 50 }),
      ata({ fornecedorCnpj: "00000000000191", fornecedorNome: "JOAO 120.376.246-11 ME", pontuacao: 40 }),
      ata({ fornecedorCnpj: "12345678000195", fornecedorNome: "12037624611", pontuacao: 30 }),
    ]);
    expect(r.find((f) => f.cnpj === "11222333000181")?.razaoSocial).toBe("MATEUS SOUZA");
    expect(r.find((f) => f.cnpj === "00000000000191")?.razaoSocial).toBe("JOAO ME");
    // Nome que era só o CPF fica vazio e cai para o CNPJ.
    expect(r.find((f) => f.cnpj === "12345678000195")?.razaoSocial).toBe("12345678000195");
    for (const f of r) expect(f.razaoSocial).not.toContain("12037624611");
  });
  it("topN corta a lista nos primeiros", () => {
    expect(agregarFornecedores(atas, { topN: 2 }).map((f) => f.razaoSocial)).toEqual(["ALFA LTDA", "Gama"]);
    expect(agregarFornecedores(atas, { topN: 1 })).toHaveLength(1);
    expect(agregarFornecedores(atas, { topN: 99 })).toHaveLength(4);
    expect(agregarFornecedores(atas, {})).toHaveLength(4);
  });
  it("lista vazia e pontuação inválida", () => {
    expect(agregarFornecedores([])).toEqual([]);
    const [f] = agregarFornecedores([ata({ pontuacao: Number.NaN })]);
    expect(f.pontuacao).toBe(0);
  });
});

describe("podeMoverEstagio", () => {
  it("avança e volta um passo por vez", () => {
    expect(podeMoverEstagio("identificado", "contatado")).toEqual({ ok: true });
    expect(podeMoverEstagio("contatado", "interessado")).toEqual({ ok: true });
    expect(podeMoverEstagio("interessado", "credenciado")).toEqual({ ok: true });
    expect(podeMoverEstagio("credenciado", "interessado")).toEqual({ ok: true });
    expect(podeMoverEstagio("interessado", "contatado")).toEqual({ ok: true });
    expect(podeMoverEstagio("contatado", "identificado")).toEqual({ ok: true });
  });
  it("qualquer estágio pode ir para 'recusou'", () => {
    for (const de of ["identificado", "contatado", "interessado", "credenciado"]) {
      expect(podeMoverEstagio(de, "recusou")).toEqual({ ok: true });
    }
  });
  it("'recusou' só volta para 'identificado'", () => {
    expect(podeMoverEstagio("recusou", "identificado")).toEqual({ ok: true });
    for (const para of ["contatado", "interessado", "credenciado"]) {
      const r = podeMoverEstagio("recusou", para);
      expect(r.ok).toBe(false);
      expect(r.erro).toBeTruthy();
    }
  });
  it("não pula etapa", () => {
    for (const [de, para] of [
      ["identificado", "interessado"],
      ["identificado", "credenciado"],
      ["contatado", "credenciado"],
      ["credenciado", "identificado"],
      ["credenciado", "contatado"],
      ["interessado", "identificado"],
    ]) {
      const r = podeMoverEstagio(de, para);
      expect(r.ok, `${de} → ${para}`).toBe(false);
      expect(r.erro).toBeTruthy();
    }
  });
  it("'credenciado' só a partir de 'interessado', e o erro explica", () => {
    expect(podeMoverEstagio("contatado", "credenciado").erro).toMatch(/Interessado/);
    expect(podeMoverEstagio("identificado", "credenciado").erro).toMatch(/Interessado/);
  });
  it("ficar no mesmo estágio não é mudança e não dá erro", () => {
    for (const e of ESTAGIOS_PROSPECCAO) expect(podeMoverEstagio(e, e)).toEqual({ ok: true });
  });
  it("estágio desconhecido é recusado", () => {
    expect(podeMoverEstagio("xis", "contatado").ok).toBe(false);
    expect(podeMoverEstagio("identificado", "xis").ok).toBe(false);
    expect(podeMoverEstagio("", "").ok).toBe(false);
  });
  it("lista os destinos permitidos para o seletor", () => {
    expect(estagiosPermitidos("identificado")).toEqual(["contatado", "recusou"]);
    expect(estagiosPermitidos("interessado")).toEqual(["contatado", "credenciado", "recusou"]);
    expect(estagiosPermitidos("credenciado")).toEqual(["interessado", "recusou"]);
    expect(estagiosPermitidos("recusou")).toEqual(["identificado"]);
    expect(estagiosPermitidos("xis")).toEqual([]);
  });
});

describe("resumirFunil", () => {
  it("soma o total e calcula o percentual de credenciados", () => {
    const r = resumirFunil({ identificado: 5, contatado: 3, interessado: 2, credenciado: 1, recusou: 4 });
    expect(r.total).toBe(15);
    expect(r.porEstagio).toEqual({ identificado: 5, contatado: 3, interessado: 2, credenciado: 1, recusou: 4 });
    expect(r.percentualCredenciados).toBe(6.7);
    expect(resumirFunil({ credenciado: 1, identificado: 1 }).percentualCredenciados).toBe(50);
  });
  it("funil vazio não divide por zero", () => {
    const r = resumirFunil({});
    expect(r.total).toBe(0);
    expect(r.percentualCredenciados).toBe(0);
    expect(r.porEstagio.credenciado).toBe(0);
    expect(resumirFunil([]).total).toBe(0);
  });
  it("aceita uma lista de { estagio, quantidade }", () => {
    const r = resumirFunil([
      { estagio: "identificado", quantidade: 8 },
      { estagio: "credenciado", quantidade: 2 },
    ]);
    expect(r.total).toBe(10);
    expect(r.percentualCredenciados).toBe(20);
  });
  it("ignora estágio desconhecido e quantidade inválida", () => {
    const r = resumirFunil({ identificado: 2, xis: 9, contatado: -3, interessado: Number.NaN, credenciado: 2 });
    expect(r.total).toBe(4);
    expect(r.percentualCredenciados).toBe(50);
  });
});
