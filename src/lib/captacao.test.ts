import { describe, expect, it } from "vitest";
import {
  captacaoComContatoVencido,
  dadosDaCaptacaoDoRadar,
  ESTAGIOS_CAPTACAO,
  estagiosPermitidosCaptacao,
  formatarTelefone,
  lerContatoEmpresa,
  lerInteracao,
  lerNovaCaptacao,
  motivoPerdaValido,
  nomeDaCaptacao,
  normalizarTelefone,
  podeMoverEstagioCaptacao,
  rotuloEstagioCaptacao,
  textoCurto,
  type CamposNovaCaptacao,
  type LinhaDoRadar,
} from "./captacao";

// 12345678000195 é um CNPJ com dígitos verificadores corretos.
const CNPJ_OK = "12.345.678/0001-95";

describe("estágios", () => {
  it("a fila anda um passo por vez, nos dois sentidos", () => {
    expect(podeMoverEstagioCaptacao("identificada", "em_contato").ok).toBe(true);
    expect(podeMoverEstagioCaptacao("em_contato", "interessada").ok).toBe(true);
    expect(podeMoverEstagioCaptacao("interessada", "em_contato").ok).toBe(true);
    expect(podeMoverEstagioCaptacao("em_contato", "identificada").ok).toBe(true);
    expect(podeMoverEstagioCaptacao("identificada", "interessada").ok).toBe(false);
  });

  it("fechada só nasce do cadastro da ata: nem se entra nela nem se sai dela à mão", () => {
    for (const de of ["identificada", "em_contato", "interessada", "perdida"]) {
      const r = podeMoverEstagioCaptacao(de, "fechada");
      expect(r.ok, de).toBe(false);
      expect(r.erro).toContain("cadastrada");
    }
    for (const para of ["identificada", "em_contato", "interessada", "perdida"]) {
      expect(podeMoverEstagioCaptacao("fechada", para).ok, para).toBe(false);
    }
  });

  it("qualquer estágio aberto pode ir para “Não deu”, que só volta para Identificada", () => {
    for (const de of ["identificada", "em_contato", "interessada"]) {
      expect(podeMoverEstagioCaptacao(de, "perdida").ok, de).toBe(true);
    }
    expect(podeMoverEstagioCaptacao("perdida", "identificada").ok).toBe(true);
    expect(podeMoverEstagioCaptacao("perdida", "em_contato").ok).toBe(false);
    expect(podeMoverEstagioCaptacao("perdida", "interessada").ok).toBe(false);
  });

  it("estágio desconhecido é recusado e o mesmo estágio não é mudança", () => {
    expect(podeMoverEstagioCaptacao("xis", "identificada").ok).toBe(false);
    expect(podeMoverEstagioCaptacao("identificada", "xis").ok).toBe(false);
    expect(podeMoverEstagioCaptacao("em_contato", "em_contato").ok).toBe(true);
  });

  it("os destinos oferecidos nunca incluem “fechada”", () => {
    for (const e of ESTAGIOS_CAPTACAO) expect(estagiosPermitidosCaptacao(e)).not.toContain("fechada");
    expect(estagiosPermitidosCaptacao("em_contato")).toEqual(["identificada", "interessada", "perdida"]);
    expect(estagiosPermitidosCaptacao("fechada")).toEqual([]);
  });

  it("rótulo desconhecido volta como veio; motivo de perda só aceita os da lista", () => {
    expect(rotuloEstagioCaptacao("perdida")).toBe("Não deu");
    expect(rotuloEstagioCaptacao("zzz")).toBe("zzz");
    expect(motivoPerdaValido("recusou")).toBe(true);
    expect(motivoPerdaValido("qualquer")).toBe(false);
    expect(motivoPerdaValido(undefined)).toBe(false);
  });

  it("contato vencido só conta para cartão ainda em trabalho", () => {
    const agora = new Date("2026-11-14T15:00:00Z");
    const ontem = new Date("2026-11-13T00:00:00Z");
    const hoje = new Date("2026-11-14T00:00:00Z");
    expect(captacaoComContatoVencido("identificada", ontem, agora)).toBe(true);
    expect(captacaoComContatoVencido("em_contato", ontem, agora)).toBe(true);
    expect(captacaoComContatoVencido("interessada", ontem, agora)).toBe(true);
    expect(captacaoComContatoVencido("em_contato", hoje, agora)).toBe(false);
    expect(captacaoComContatoVencido("em_contato", null, agora)).toBe(false);
    expect(captacaoComContatoVencido("fechada", ontem, agora)).toBe(false);
    expect(captacaoComContatoVencido("perdida", ontem, agora)).toBe(false);
  });
});

describe("nomeDaCaptacao", () => {
  it("monta tema, órgão com UF e mês de vencimento", () => {
    expect(
      nomeDaCaptacao({
        categoria: "limpeza",
        objeto: "qualquer",
        orgaoNome: "MUNICIPIO DE RIO VERDE",
        uf: "GO",
        vigenciaFim: new Date("2027-03-20T00:00:00Z"),
      }),
    ).toBe("Ata de Limpeza e conservação · Municipio de Rio Verde/GO · vence 03/2027");
  });

  it("sem categoria usa o começo do objeto; sem órgão e vigência, só o que existe", () => {
    expect(nomeDaCaptacao({ objeto: "AQUISICAO DE PNEUS PARA A FROTA MUNICIPAL" })).toBe(
      "Ata de Aquisicao de pneus para a frota municipal",
    );
    expect(nomeDaCaptacao({ categoria: "limpeza", objeto: "x", uf: "GO" })).toBe("Ata de Limpeza e conservação · GO");
  });

  it("não repete a UF quando o órgão já termina nela e corta nomes enormes", () => {
    expect(nomeDaCaptacao({ categoria: "limpeza", objeto: "x", orgaoNome: "Prefeitura de Jataí/GO", uf: "GO" })).toBe(
      "Ata de Limpeza e conservação · Prefeitura de Jataí/GO",
    );
    const longo = nomeDaCaptacao({ objeto: "a".repeat(400), orgaoNome: "b".repeat(400), uf: "GO" });
    expect(longo.length).toBeLessThanOrEqual(140);
  });

  it("objeto vazio não deixa o nome vazio", () => {
    expect(nomeDaCaptacao({ objeto: "   " })).toBe("Ata de objeto não informado");
  });
});

const RADAR: LinhaDoRadar = {
  numeroControlePncpAta: "03532661000156-1-000075/2024-000001",
  orgaoNome: "PREFEITURA MUNICIPAL DE JATAI",
  uf: "GO",
  municipioNome: "Jataí",
  objeto: "  Registro de   preços para limpeza  ",
  categoria: "limpeza",
  vigenciaFim: new Date("2027-05-10T00:00:00Z"),
  fornecedorCnpj: "12.345.678/0001-95",
  fornecedorNome: "Limpa Tudo Ltda",
};

describe("dadosDaCaptacaoDoRadar", () => {
  it("copia a ata do radar, com o CNPJ só de dígitos e o nome gerado", () => {
    const d = dadosDaCaptacaoDoRadar(RADAR);
    expect(d).toMatchObject({
      origem: "radar",
      numeroControlePncpAta: RADAR.numeroControlePncpAta,
      fornecedorCnpj: "12345678000195",
      fornecedorNome: "Limpa Tudo Ltda",
      uf: "GO",
      municipioNome: "Jataí",
      objeto: "Registro de preços para limpeza",
      categoria: "limpeza",
      numeroAta: null,
    });
    expect(d.nome).toBe("Ata de Limpeza e conservação · Prefeitura Municipal de Jatai/GO · vence 05/2027");
  });

  it("fornecedor ainda não identificado entra sem nome nem CNPJ (a equipe preenche)", () => {
    const d = dadosDaCaptacaoDoRadar({ ...RADAR, fornecedorCnpj: null, fornecedorNome: null });
    expect(d.fornecedorCnpj).toBeNull();
    expect(d.fornecedorNome).toBeNull();
  });

  it("pessoa física não vira cartão de empresa e CPF nunca passa", () => {
    const pf = dadosDaCaptacaoDoRadar({ ...RADAR, fornecedorNome: "Pessoa física", fornecedorCnpj: "12345678000195" });
    expect(pf.fornecedorCnpj).toBeNull();
    expect(pf.fornecedorNome).toBeNull();
    const cpf = dadosDaCaptacaoDoRadar({ ...RADAR, fornecedorNome: "João 123.456.789-09", fornecedorCnpj: "12345678909" });
    expect(cpf.fornecedorCnpj).toBeNull();
    expect(cpf.fornecedorNome).toBe("João");
  });

  it("corta o objeto em 1000 caracteres e não aceita objeto vazio", () => {
    expect(dadosDaCaptacaoDoRadar({ ...RADAR, objeto: "x".repeat(2000) }).objeto.length).toBe(1000);
    expect(dadosDaCaptacaoDoRadar({ ...RADAR, objeto: "   " }).objeto).toBe("Objeto não informado");
  });
});

describe("telefone", () => {
  it("aceita máscara e +55 e guarda só dígitos com DDD", () => {
    expect(normalizarTelefone("(62) 99999-0000")).toBe("62999990000");
    expect(normalizarTelefone("+55 62 3333-4444")).toBe("6233334444");
    expect(normalizarTelefone("55 62 99999 0000")).toBe("62999990000");
  });

  it.each(["", "99999-0000", "(62) 89999-0000", "(06) 3333-4444", "abc", "1234567890123456"])(
    "recusa %j",
    (t) => {
      expect(normalizarTelefone(t)).toBeNull();
    },
  );

  it("formata para a tela", () => {
    expect(formatarTelefone("62999990000")).toBe("(62) 99999-0000");
    expect(formatarTelefone("6233334444")).toBe("(62) 3333-4444");
    expect(formatarTelefone(null)).toBe("");
  });
});

describe("lerContatoEmpresa (LGPD)", () => {
  const base = { nome: "Maria Souza", telefone: "(62) 99999-0000", comoObteve: "Site da empresa" };

  it("aceita o cartão completo e limpa os campos", () => {
    const r = lerContatoEmpresa({
      ...base,
      nome: "  Maria   Souza ",
      cargo: " Gerente comercial ",
      email: " MARIA@Empresa.com.br ",
      whatsapp: true,
    });
    expect(r).toEqual({
      ok: true,
      contato: {
        nome: "Maria Souza",
        cargo: "Gerente comercial",
        telefone: "62999990000",
        whatsapp: true,
        email: "maria@empresa.com.br",
        comoObteve: "Site da empresa",
      },
    });
  });

  it("exige nome, telefone ou e-mail, e de onde o contato veio", () => {
    expect(lerContatoEmpresa({ ...base, nome: " " })).toMatchObject({ ok: false });
    expect(lerContatoEmpresa({ nome: "Maria", comoObteve: "Site" })).toEqual({
      ok: false,
      erro: "Informe ao menos o telefone ou o e-mail do contato.",
    });
    const sem = lerContatoEmpresa({ ...base, comoObteve: "  " });
    expect(sem).toMatchObject({ ok: false });
    expect(sem.ok === false && sem.erro).toContain("de onde veio");
  });

  it("só e-mail vale, e WhatsApp sem telefone é ignorado", () => {
    const r = lerContatoEmpresa({ nome: "Maria", email: "m@e.com", whatsapp: true, comoObteve: "Indicação" });
    expect(r.ok && r.contato).toMatchObject({ telefone: null, whatsapp: false, email: "m@e.com" });
  });

  it("recusa telefone, e-mail e textos fora do formato ou grandes demais", () => {
    expect(lerContatoEmpresa({ ...base, telefone: "123" })).toMatchObject({ ok: false });
    expect(lerContatoEmpresa({ ...base, email: "sem-arroba" })).toMatchObject({ ok: false });
    expect(lerContatoEmpresa({ ...base, email: "a b@c.com" })).toMatchObject({ ok: false });
    expect(lerContatoEmpresa({ ...base, nome: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(lerContatoEmpresa({ ...base, cargo: "x".repeat(81) })).toMatchObject({ ok: false });
    expect(lerContatoEmpresa({ ...base, comoObteve: "x".repeat(201) })).toMatchObject({ ok: false });
  });

  it("textoCurto tira caracteres de controle e de direção de texto", () => {
    const rlo = String.fromCharCode(0x202e);
    const entrada = ["  a", rlo, "b", String.fromCharCode(10), String.fromCharCode(9), "c  "].join("");
    expect(textoCurto(entrada)).toBe("a b c");
  });
});

const NOVA: CamposNovaCaptacao = {
  fornecedorNome: "Papelaria Exemplo Ltda",
  fornecedorCnpj: CNPJ_OK,
  objeto: "Material de escritório",
  categoria: "material-escritorio",
};

describe("lerNovaCaptacao (indicação do captador)", () => {
  it("o mínimo é empresa, CNPJ e objeto; o resto é opcional", () => {
    const r = lerNovaCaptacao(NOVA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados).toMatchObject({
      origem: "indicacao",
      numeroControlePncpAta: null,
      fornecedorCnpj: "12345678000195",
      fornecedorNome: "Papelaria Exemplo Ltda",
      orgaoNome: null,
      uf: null,
      vigenciaFim: null,
    });
    expect(r.dados.nome).toBe("Ata de Material de escritório");
    expect(r.contato).toBeNull();
    expect(r.proximoContatoEm).toBeNull();
    expect(r.observacoes).toBeNull();
  });

  it("usa os dados completos: órgão, UF, vigência, observações, próximo contato e contato", () => {
    const r = lerNovaCaptacao({
      ...NOVA,
      orgaoNome: "Prefeitura de Jataí",
      uf: "go",
      municipioNome: "Jataí",
      numeroAta: "12/2026",
      vigenciaFim: "2027-04-30",
      proximoContatoEm: "2026-11-20",
      observacoes: "  Falou com o dono no evento.  ",
      contatoNome: "Maria",
      contatoTelefone: "62 99999-0000",
      contatoWhatsapp: true,
      contatoComoObteve: "Evento do setor",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados).toMatchObject({ uf: "GO", numeroAta: "12/2026", municipioNome: "Jataí" });
    expect(r.dados.vigenciaFim?.toISOString()).toBe("2027-04-30T00:00:00.000Z");
    expect(r.dados.nome).toBe("Ata de Material de escritório · Prefeitura de Jataí/GO · vence 04/2027");
    expect(r.proximoContatoEm?.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(r.observacoes).toBe("Falou com o dono no evento.");
    expect(r.contato).toMatchObject({ nome: "Maria", telefone: "62999990000", whatsapp: true });
  });

  it.each([
    ["sem razão social", { fornecedorNome: " " }],
    ["CNPJ com dígito errado", { fornecedorCnpj: "12.345.678/0001-96" }],
    ["CPF no lugar do CNPJ", { fornecedorCnpj: "123.456.789-09" }],
    ["sem objeto", { objeto: "" }],
    ["tema fora da lista", { categoria: "inventado" }],
    ["UF inválida", { uf: "XX" }],
    ["vigência que não existe", { vigenciaFim: "2027-02-31" }],
    ["próximo contato que não existe", { proximoContatoEm: "2026-13-01" }],
    ["observação grande demais", { observacoes: "x".repeat(501) }],
    ["contato pela metade (sem de onde veio)", { contatoNome: "Maria", contatoTelefone: "62999990000" }],
    ["contato só com cargo", { contatoCargo: "Gerente" }],
  ])("recusa %s", (_nome, extra) => {
    expect(lerNovaCaptacao({ ...NOVA, ...extra })).toMatchObject({ ok: false });
  });
});

describe("lerInteracao", () => {
  const agora = new Date("2026-11-14T15:00:00Z");

  it("sem data vale agora; com data, ao meio-dia daquele dia", () => {
    expect(lerInteracao({ canal: "telefone", resumo: "Ligou, pediu proposta" }, agora)).toEqual({
      ok: true,
      canal: "telefone",
      resumo: "Ligou, pediu proposta",
      quando: agora,
    });
    const r = lerInteracao({ canal: "whatsapp", resumo: "Mandou a lista", quando: "2026-11-12" }, agora);
    expect(r.ok && r.quando.toISOString()).toBe("2026-11-12T12:00:00.000Z");
  });

  it("aceita hoje, recusa amanhã", () => {
    expect(lerInteracao({ canal: "email", resumo: "x", quando: "2026-11-14" }, agora).ok).toBe(true);
    const futuro = lerInteracao({ canal: "email", resumo: "x", quando: "2026-11-15" }, agora);
    expect(futuro.ok).toBe(false);
  });

  it("às 22h em Brasília (01h UTC do dia seguinte), hoje de Brasília ainda vale e amanhã não", () => {
    const noite = new Date("2026-11-15T01:00:00Z");
    expect(lerInteracao({ canal: "email", resumo: "x", quando: "2026-11-14" }, noite).ok).toBe(true);
    expect(lerInteracao({ canal: "email", resumo: "x", quando: "2026-11-15" }, noite).ok).toBe(false);
  });

  it("recusa canal inválido, texto vazio ou grande e data que não existe", () => {
    expect(lerInteracao({ canal: "pombo", resumo: "x" }, agora).ok).toBe(false);
    expect(lerInteracao({ canal: "telefone", resumo: "  " }, agora).ok).toBe(false);
    expect(lerInteracao({ canal: "telefone", resumo: "x".repeat(501) }, agora).ok).toBe(false);
    expect(lerInteracao({ canal: "telefone", resumo: "x", quando: "2026-02-31" }, agora).ok).toBe(false);
  });
});
