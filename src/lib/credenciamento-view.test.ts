import { describe, expect, it } from "vitest";
import { STATUS_CREDENCIAMENTO, acoesDisponiveis, mensagemBloqueio, proximoStatus } from "./credenciamento";
import {
  CAMINHO_CREDENCIAMENTO,
  ESTAGIOS_QUE_EXIGEM_CREDENCIAMENTO,
  LIMITE_MOTIVO_SUSPENSAO,
  comLinkDeCredenciamento,
  dataBr,
  erroDeTransicao,
  estagioExigeCredenciamento,
  fecharFrase,
  normalizarMotivo,
  resumoParaAdmin,
  tituloAvisoCredenciamento,
} from "./credenciamento-view";

describe("estágios que exigem credenciamento", () => {
  it("só 'em_negociacao' e 'aderiu' tomam trabalho novo", () => {
    expect([...ESTAGIOS_QUE_EXIGEM_CREDENCIAMENTO].sort()).toEqual(["aderiu", "em_negociacao"]);
    expect(estagioExigeCredenciamento("em_negociacao")).toBe(true);
    expect(estagioExigeCredenciamento("aderiu")).toBe(true);
  });

  it.each(["a_contatar", "recusado", "", "ganhou", "ADERIU"])("%j fica livre", (estagio) => {
    expect(estagioExigeCredenciamento(estagio)).toBe(false);
  });
});

describe("normalizarMotivo", () => {
  it("junta tudo em uma linha, sem espaços repetidos nem nas pontas", () => {
    expect(normalizarMotivo("  um   dois\n\n tres\t quatro  ")).toBe("um dois tres quatro");
  });

  it("troca caracteres de controle e de inversão de texto por espaço", () => {
    const sujo = "a" + String.fromCharCode(0) + "b" + String.fromCharCode(0x202e) + "c" + String.fromCharCode(0x2066) + "d" + String.fromCharCode(0x7f) + "e";
    expect(normalizarMotivo(sujo)).toBe("a b c d e");
  });

  it("texto vazio ou só de espaços vira vazio", () => {
    expect(normalizarMotivo("")).toBe("");
    expect(normalizarMotivo(" \n\t ")).toBe("");
  });

  it("mantém acentos", () => {
    expect(normalizarMotivo("Declaração não feita")).toBe("Declaração não feita");
  });

  it("o limite é um número inteiro positivo", () => {
    expect(Number.isInteger(LIMITE_MOTIVO_SUSPENSAO)).toBe(true);
    expect(LIMITE_MOTIVO_SUSPENSAO).toBeGreaterThan(0);
  });
});

describe("comLinkDeCredenciamento", () => {
  it("mantém a mensagem e acrescenta o caminho da tela", () => {
    const texto = comLinkDeCredenciamento(mensagemBloqueio("pendente"));

    expect(texto.startsWith(mensagemBloqueio("pendente"))).toBe(true);
    expect(texto).toContain(CAMINHO_CREDENCIAMENTO);
    expect(CAMINHO_CREDENCIAMENTO).toBe("/vendedor/credenciamento");
  });
});

describe("tituloAvisoCredenciamento", () => {
  it("tem um título por status, sem vazio, e trata o desconhecido como pendente", () => {
    for (const s of STATUS_CREDENCIAMENTO) expect(tituloAvisoCredenciamento(s).length).toBeGreaterThan(0);
    expect(tituloAvisoCredenciamento(null)).toBe(tituloAvisoCredenciamento("pendente"));
    expect(tituloAvisoCredenciamento("qualquer")).toBe(tituloAvisoCredenciamento("pendente"));
  });
});

describe("erroDeTransicao", () => {
  it("explica cada recusa possível da tabela de transições", () => {
    expect(erroDeTransicao("aceitar", "aceito")).toMatch(/aceite já foi registrado/);
    expect(erroDeTransicao("aceitar", "credenciado")).toMatch(/já está credenciado/);
    expect(erroDeTransicao("credenciar", "pendente")).toMatch(/ainda não aceitou/);
    expect(erroDeTransicao("credenciar", null)).toMatch(/ainda não aceitou/);
    expect(erroDeTransicao("credenciar", "credenciado")).toMatch(/já está credenciado/);
    expect(erroDeTransicao("credenciar", "suspenso")).toMatch(/aceitar o compromisso de novo/);
    expect(erroDeTransicao("suspender", "pendente")).toMatch(/Só dá para suspender/);
    expect(erroDeTransicao("suspender", "suspenso")).toMatch(/já está suspenso/);
  });

  it("toda combinação que a regra recusa tem uma frase, e nenhuma que ela aceita é usada", () => {
    for (const status of STATUS_CREDENCIAMENTO) {
      for (const acao of ["aceitar", "credenciar", "suspender"] as const) {
        const recusada = proximoStatus(status, acao) === null;
        if (recusada) expect(erroDeTransicao(acao, status).length).toBeGreaterThan(0);
      }
    }
  });

  it("combinação fora da tabela cai na frase genérica", () => {
    expect(erroDeTransicao("aceitar", "pendente")).toBe("Essa mudança de status não é permitida.");
  });
});

describe("fecharFrase", () => {
  it("acrescenta o ponto que falta e mantém a pontuação que já existe", () => {
    expect(fecharFrase("Conflito de interesse")).toBe("Conflito de interesse.");
    expect(fecharFrase("Conflito de interesse.")).toBe("Conflito de interesse.");
    expect(fecharFrase("Por quê?")).toBe("Por quê?");
    expect(fecharFrase("Atenção!")).toBe("Atenção!");
    expect(fecharFrase("Veja o registro…")).toBe("Veja o registro…");
  });

  it("apara espaços e devolve vazio para texto vazio", () => {
    expect(fecharFrase("  motivo  ")).toBe("motivo.");
    expect(fecharFrase("")).toBe("");
    expect(fecharFrase("   ")).toBe("");
  });
});

describe("dataBr", () => {
  it("formata no fuso de Brasília: 01:00 UTC ainda é o dia anterior", () => {
    expect(dataBr(new Date("2026-10-23T01:00:00Z"))).toBe("22/10/2026");
    expect(dataBr(new Date("2026-10-23T15:00:00Z"))).toBe("23/10/2026");
  });

  it("aceita texto ISO", () => {
    expect(dataBr("2026-10-23T15:00:00.000Z")).toBe("23/10/2026");
  });

  it("sem data ou data inválida devolve vazio", () => {
    expect(dataBr(null)).toBe("");
    expect(dataBr(undefined)).toBe("");
    expect(dataBr("não é data")).toBe("");
    expect(dataBr(new Date("não é data"))).toBe("");
  });
});

describe("resumoParaAdmin", () => {
  const base = {
    integridadeAceitaEm: null,
    integridadeVersao: null,
    credenciadoEm: null,
    suspensoEm: null,
    motivo: null,
  };
  const aceitoEm = new Date("2026-10-20T15:00:00Z");

  it("sem registro conta como pendente", () => {
    expect(resumoParaAdmin(null)).toMatch(/Ainda não aceitou/);
    expect(resumoParaAdmin(undefined)).toMatch(/Ainda não aceitou/);
    expect(resumoParaAdmin({ ...base, status: "pendente" })).toMatch(/Ainda não aceitou/);
    expect(resumoParaAdmin({ ...base, status: "qualquer" })).toMatch(/Ainda não aceitou/);
  });

  it("aceito: data e versão do aceite e quem espera", () => {
    const texto = resumoParaAdmin({ ...base, status: "aceito", integridadeAceitaEm: aceitoEm, integridadeVersao: 1 });

    expect(texto).toBe("Aceitou em 20/10/2026 (texto versão 1). Aguardando a sua liberação.");
  });

  it("aceito sem data guardada ainda diz que aguarda a liberação", () => {
    expect(resumoParaAdmin({ ...base, status: "aceito" })).toBe("Aguardando a sua liberação.");
  });

  it("credenciado: data da liberação e do aceite", () => {
    const texto = resumoParaAdmin({
      ...base,
      status: "credenciado",
      integridadeAceitaEm: aceitoEm,
      integridadeVersao: 2,
      credenciadoEm: new Date("2026-10-22T15:00:00Z"),
    });

    expect(texto).toBe("Credenciado em 22/10/2026. Aceitou em 20/10/2026 (texto versão 2).");
  });

  it("suspenso: data, motivo e o caminho de volta", () => {
    const texto = resumoParaAdmin({
      ...base,
      status: "suspenso",
      suspensoEm: new Date("2026-10-23T15:00:00Z"),
      motivo: "Conflito de interesse",
    });

    expect(texto).toContain("Suspenso em 23/10/2026.");
    expect(texto).toContain("Motivo: Conflito de interesse.");
    expect(texto).toMatch(/aceita o compromisso de novo e você credencia/);
  });

  it("suspenso: motivo que já termina em ponto não ganha um segundo", () => {
    const texto = resumoParaAdmin({
      ...base,
      status: "suspenso",
      suspensoEm: new Date("2026-10-23T15:00:00Z"),
      motivo: "Conflito de interesse não declarado.",
    });

    expect(texto).toContain("Motivo: Conflito de interesse não declarado. Para voltar");
    expect(texto).not.toContain("..");
  });

  it("aceito de novo depois de uma suspensão: mostra a suspensão anterior e o motivo para quem vai decidir", () => {
    const texto = resumoParaAdmin({
      ...base,
      status: "aceito",
      integridadeAceitaEm: new Date("2026-10-25T15:00:00Z"),
      integridadeVersao: 1,
      suspensoEm: new Date("2026-10-23T15:00:00Z"),
      motivo: "Conflito de interesse",
    });

    expect(texto).toBe(
      "Aceitou em 25/10/2026 (texto versão 1). Foi suspenso em 23/10/2026. Motivo: Conflito de interesse. Aguardando a sua liberação.",
    );
  });

  it("aceito de novo, suspensão anterior sem motivo guardado: só a data", () => {
    const texto = resumoParaAdmin({ ...base, status: "aceito", suspensoEm: new Date("2026-10-23T15:00:00Z") });

    expect(texto).toBe("Foi suspenso em 23/10/2026. Aguardando a sua liberação.");
  });

  it("suspenso sem data nem motivo guardados ainda explica o caminho de volta", () => {
    const texto = resumoParaAdmin({ ...base, status: "suspenso" });

    expect(texto.startsWith("Suspenso.")).toBe(true);
    expect(texto).not.toContain("Motivo:");
  });
});

describe("coerência com as ações que cada lado tem", () => {
  it("a recusa de cada ação do administrador é a do status em que ela não vale", () => {
    for (const status of STATUS_CREDENCIAMENTO) {
      const admin = acoesDisponiveis(status, "admin");
      expect(admin.includes("credenciar")).toBe(proximoStatus(status, "credenciar") !== null);
      expect(admin.includes("suspender")).toBe(proximoStatus(status, "suspender") !== null);
    }
  });
});
