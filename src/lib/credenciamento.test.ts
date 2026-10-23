import { describe, expect, it } from "vitest";
import {
  AVISO_MINUTA_INTEGRIDADE,
  COMPROMISSOS_INTEGRIDADE,
  DESCRICAO_STATUS_CREDENCIAMENTO,
  ROTULO_STATUS_CREDENCIAMENTO,
  STATUS_CREDENCIAMENTO,
  TEXTO_CONFIRMACAO_ACEITE,
  TITULO_INTEGRIDADE,
  TOM_STATUS_CREDENCIAMENTO,
  VERSAO_INTEGRIDADE,
  acoesDisponiveis,
  atorDaAcao,
  mensagemBloqueio,
  normalizarStatusCredenciamento,
  podeAtuar,
  proximoStatus,
  rotuloStatusCredenciamento,
  statusCredenciamentoValido,
  tomStatusCredenciamento,
  transicaoValida,
  type AcaoCredenciamento,
  type AtorCredenciamento,
  type StatusCredenciamento,
} from "./credenciamento";

const ACOES: AcaoCredenciamento[] = ["aceitar", "credenciar", "suspender"];
const ATORES: AtorCredenciamento[] = ["consultor", "admin"];

describe("status do credenciamento", () => {
  it("tem os quatro status, cada um com rótulo, descrição e tom", () => {
    expect([...STATUS_CREDENCIAMENTO]).toEqual(["pendente", "aceito", "credenciado", "suspenso"]);
    for (const s of STATUS_CREDENCIAMENTO) {
      expect(ROTULO_STATUS_CREDENCIAMENTO[s].length).toBeGreaterThan(0);
      expect(DESCRICAO_STATUS_CREDENCIAMENTO[s].length).toBeGreaterThan(0);
      expect(["neutro", "atencao", "alerta", "critico", "marca"]).toContain(TOM_STATUS_CREDENCIAMENTO[s]);
    }
  });

  it("statusCredenciamentoValido só aceita os quatro textos exatos", () => {
    expect(statusCredenciamentoValido("credenciado")).toBe(true);
    expect(statusCredenciamentoValido("Credenciado")).toBe(false);
    expect(statusCredenciamentoValido("")).toBe(false);
    expect(statusCredenciamentoValido(null)).toBe(false);
    expect(statusCredenciamentoValido(undefined)).toBe(false);
    expect(statusCredenciamentoValido(3)).toBe(false);
  });

  it("sem registro ou valor desconhecido conta como pendente (lado seguro)", () => {
    expect(normalizarStatusCredenciamento(null)).toBe("pendente");
    expect(normalizarStatusCredenciamento(undefined)).toBe("pendente");
    expect(normalizarStatusCredenciamento("qualquer")).toBe("pendente");
    expect(normalizarStatusCredenciamento("suspenso")).toBe("suspenso");
    expect(rotuloStatusCredenciamento(null)).toBe(ROTULO_STATUS_CREDENCIAMENTO.pendente);
    expect(rotuloStatusCredenciamento("credenciado")).toBe("Credenciado");
    expect(tomStatusCredenciamento("xyz")).toBe(TOM_STATUS_CREDENCIAMENTO.pendente);
    expect(tomStatusCredenciamento("suspenso")).toBe("alerta");
  });

  it("'marca' não é usado para risco: suspenso nunca fica com o tom da marca", () => {
    expect(TOM_STATUS_CREDENCIAMENTO.suspenso).not.toBe("marca");
  });
});

describe("compromisso de integridade (minuta)", () => {
  it("tem versão 1, título e de 8 a 10 compromissos", () => {
    expect(VERSAO_INTEGRIDADE).toBe(1);
    expect(TITULO_INTEGRIDADE.length).toBeGreaterThan(0);
    expect(COMPROMISSOS_INTEGRIDADE.length).toBeGreaterThanOrEqual(8);
    expect(COMPROMISSOS_INTEGRIDADE.length).toBeLessThanOrEqual(10);
  });

  it("cada compromisso é uma frase curta e sem repetição", () => {
    for (const c of COMPROMISSOS_INTEGRIDADE) {
      expect(c.trim()).toBe(c);
      expect(c.length).toBeGreaterThan(20);
      expect(c.length).toBeLessThanOrEqual(260);
      expect(c.endsWith(".")).toBe(true);
    }
    expect(new Set(COMPROMISSOS_INTEGRIDADE).size).toBe(COMPROMISSOS_INTEGRIDADE.length);
  });

  it("cobre os temas obrigatórios", () => {
    const texto = COMPROMISSOS_INTEGRIDADE.join("\n").toLowerCase();
    expect(texto).toContain("vantagem indevida"); // honestidade, sem pagamento ou favor a agente público
    expect(texto).toContain("agente público");
    expect(texto).toContain("não vou prometer");
    expect(texto).toContain("preço");
    expect(texto).toContain("economia");
    expect(texto).toContain("plataforma privada"); // não é órgão público nem o PNCP
    expect(texto).toContain("pncp");
    expect(texto).toContain("lgpd");
    expect(texto).toContain("sigilo");
    expect(texto).toContain("conflito de interesse");
    expect(texto).toContain("plataforma de lado"); // não contornar a plataforma
    expect(texto).toContain("pedir algo indevido");
    expect(texto).toContain("auditoria");
  });

  it("não usa a expressão proibida 'sem licitação' em nenhum texto do módulo", () => {
    const tudo = [
      TITULO_INTEGRIDADE,
      AVISO_MINUTA_INTEGRIDADE,
      TEXTO_CONFIRMACAO_ACEITE,
      ...COMPROMISSOS_INTEGRIDADE,
      ...Object.values(ROTULO_STATUS_CREDENCIAMENTO),
      ...Object.values(DESCRICAO_STATUS_CREDENCIAMENTO),
      ...STATUS_CREDENCIAMENTO.map((s) => mensagemBloqueio(s)),
    ]
      .join("\n")
      .toLowerCase();
    expect(tudo).not.toContain("sem licitação");
    expect(tudo).not.toContain("sem licitacao");
  });

  it("não promete resultado nem pressiona: nenhuma frase afirma garantia ou urgência", () => {
    const tudo = [
      TITULO_INTEGRIDADE,
      AVISO_MINUTA_INTEGRIDADE,
      TEXTO_CONFIRMACAO_ACEITE,
      ...COMPROMISSOS_INTEGRIDADE,
      ...Object.values(DESCRICAO_STATUS_CREDENCIAMENTO),
      ...STATUS_CREDENCIAMENTO.map((s) => mensagemBloqueio(s)),
    ]
      .join("\n")
      .toLowerCase();
    for (const proibida of ["garant", "imperd", "última chance", "ultima chance", "urgente", "100%"]) {
      expect(tudo).not.toContain(proibida);
    }
  });

  it("o aviso de minuta diz que precisa de advogado", () => {
    expect(AVISO_MINUTA_INTEGRIDADE.toLowerCase()).toContain("advogado");
  });
});

describe("podeAtuar e mensagemBloqueio", () => {
  it("só 'credenciado' atua", () => {
    expect(podeAtuar("credenciado")).toBe(true);
    for (const s of ["pendente", "aceito", "suspenso", "", "CREDENCIADO", "qualquer"]) {
      expect(podeAtuar(s)).toBe(false);
    }
    expect(podeAtuar(null)).toBe(false);
    expect(podeAtuar(undefined)).toBe(false);
  });

  it("cada status que não atua tem uma mensagem própria em português", () => {
    const m = {
      pendente: mensagemBloqueio("pendente"),
      aceito: mensagemBloqueio("aceito"),
      suspenso: mensagemBloqueio("suspenso"),
    };
    expect(m.pendente).toMatch(/aceit/i);
    expect(m.aceito).toMatch(/libera/i);
    expect(m.suspenso).toMatch(/suspens/i);
    expect(new Set(Object.values(m)).size).toBe(3);
  });

  it("sem registro ou desconhecido usa a mensagem de pendente", () => {
    expect(mensagemBloqueio(null)).toBe(mensagemBloqueio("pendente"));
    expect(mensagemBloqueio(undefined)).toBe(mensagemBloqueio("pendente"));
    expect(mensagemBloqueio("xyz")).toBe(mensagemBloqueio("pendente"));
  });

  it("sempre devolve texto, até para credenciado", () => {
    for (const s of STATUS_CREDENCIAMENTO) expect(mensagemBloqueio(s).length).toBeGreaterThan(0);
  });
});

describe("transições", () => {
  it("pendente → aceito é do consultor", () => {
    expect(proximoStatus("pendente", "aceitar")).toBe("aceito");
    expect(transicaoValida("pendente", "aceito", "consultor")).toBe(true);
    expect(transicaoValida("pendente", "aceito", "admin")).toBe(false);
  });

  it("aceito → credenciado é do administrador", () => {
    expect(proximoStatus("aceito", "credenciar")).toBe("credenciado");
    expect(transicaoValida("aceito", "credenciado", "admin")).toBe(true);
    expect(transicaoValida("aceito", "credenciado", "consultor")).toBe(false);
  });

  it("aceito e credenciado → suspenso é do administrador", () => {
    expect(proximoStatus("aceito", "suspender")).toBe("suspenso");
    expect(proximoStatus("credenciado", "suspender")).toBe("suspenso");
    expect(transicaoValida("aceito", "suspenso", "admin")).toBe(true);
    expect(transicaoValida("credenciado", "suspenso", "admin")).toBe(true);
    expect(transicaoValida("credenciado", "suspenso", "consultor")).toBe(false);
  });

  it("suspenso → aceito só por novo aceite do consultor; nunca direto para credenciado", () => {
    expect(proximoStatus("suspenso", "aceitar")).toBe("aceito");
    expect(transicaoValida("suspenso", "aceito", "consultor")).toBe(true);
    expect(transicaoValida("suspenso", "aceito", "admin")).toBe(false);
    expect(proximoStatus("suspenso", "credenciar")).toBeNull();
    expect(transicaoValida("suspenso", "credenciado", "admin")).toBe(false);
    expect(transicaoValida("suspenso", "credenciado", "consultor")).toBe(false);
  });

  it("não pula etapa: ninguém credencia quem não aceitou", () => {
    expect(proximoStatus("pendente", "credenciar")).toBeNull();
    expect(transicaoValida("pendente", "credenciado", "admin")).toBe(false);
    expect(proximoStatus("pendente", "suspender")).toBeNull();
    expect(transicaoValida("pendente", "suspenso", "admin")).toBe(false);
  });

  it("aceitar de novo quem já aceitou ou já está credenciado não muda nada", () => {
    expect(proximoStatus("aceito", "aceitar")).toBeNull();
    expect(proximoStatus("credenciado", "aceitar")).toBeNull();
    expect(proximoStatus("credenciado", "credenciar")).toBeNull();
    expect(proximoStatus("suspenso", "suspender")).toBeNull();
  });

  it("permanecer no mesmo status nunca é transição", () => {
    for (const s of STATUS_CREDENCIAMENTO) {
      for (const ator of ATORES) expect(transicaoValida(s, s, ator)).toBe(false);
    }
  });

  it("origem nula ou desconhecida conta como pendente; destino desconhecido é inválido", () => {
    expect(proximoStatus(null, "aceitar")).toBe("aceito");
    expect(proximoStatus(undefined, "aceitar")).toBe("aceito");
    expect(proximoStatus("xyz", "credenciar")).toBeNull();
    expect(transicaoValida(null, "aceito", "consultor")).toBe(true);
    expect(transicaoValida("pendente", "inventado", "admin")).toBe(false);
    expect(transicaoValida("pendente", "inventado", "consultor")).toBe(false);
  });

  it("transicaoValida e proximoStatus concordam em todas as combinações", () => {
    for (const de of STATUS_CREDENCIAMENTO) {
      for (const acao of ACOES) {
        const para = proximoStatus(de, acao);
        const ator = atorDaAcao(acao);
        for (const outro of ATORES) {
          const esperado = para !== null && outro === ator;
          // Só vale quando a transição para esse destino é produzida por uma ação do ator.
          if (para !== null) {
            expect(transicaoValida(de, para, outro)).toBe(esperado);
          }
        }
      }
    }
  });

  it("quem aceita é o consultor; credenciar e suspender são do administrador", () => {
    expect(atorDaAcao("aceitar")).toBe("consultor");
    expect(atorDaAcao("credenciar")).toBe("admin");
    expect(atorDaAcao("suspender")).toBe("admin");
  });

  it("acoesDisponiveis lista só o que cada ator pode fazer em cada status", () => {
    const tabela: Record<StatusCredenciamento, { consultor: AcaoCredenciamento[]; admin: AcaoCredenciamento[] }> = {
      pendente: { consultor: ["aceitar"], admin: [] },
      aceito: { consultor: [], admin: ["credenciar", "suspender"] },
      credenciado: { consultor: [], admin: ["suspender"] },
      suspenso: { consultor: ["aceitar"], admin: [] },
    };
    for (const s of STATUS_CREDENCIAMENTO) {
      expect(acoesDisponiveis(s, "consultor")).toEqual(tabela[s].consultor);
      expect(acoesDisponiveis(s, "admin")).toEqual(tabela[s].admin);
    }
    expect(acoesDisponiveis(null, "consultor")).toEqual(["aceitar"]);
  });
});
