import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// As actions de verdade puxam sessão e banco: aqui só interessa o que a aba desenha.
vi.mock("@/app/vendedor/instrucao-actions", () => ({
  marcarItemInstrucao: vi.fn(),
  declararConformidade: vi.fn(),
  revogarDeclaracao: vi.fn(),
}));

import { ITENS_INSTRUCAO, TEXTO_DECLARACAO, VERSAO_DECLARACAO } from "@/lib/instrucao-adesao";
import { montarCartao, type CartaoView, type EntradaInstrucao } from "@/lib/kanban-view";
import { Instrucao } from "./instrucao";

const agora = new Date("2026-10-21T12:00:00Z");

function cartao(opcoes: { estagio?: string; instrucao?: Partial<EntradaInstrucao> | null } = {}): CartaoView {
  return montarCartao(
    {
      id: "cm1oportunidade0000000001",
      ataId: "ata1",
      ataNumero: "10/2026",
      vendedorNome: "Maria Souza",
      entidadeAlvoId: "e1",
      nomeMunicipio: "Prefeitura de Teste",
      uf: "GO",
      estagio: opcoes.estagio ?? "em_negociacao",
      observacoes: null,
      prazoEm: null,
      proximoContatoEm: null,
      valorAderido: null,
      percentualComissao: null,
      contatos: [],
      necessidades: [],
      interacoes: [],
      liquidacoes: [],
      sinais: [],
      instrucao:
        opcoes.instrucao === null || opcoes.instrucao === undefined
          ? null
          : {
              itens: {},
              declaracaoEm: null,
              declaracaoPorTipo: null,
              declaracaoVersao: null,
              declaracaoExcecao: null,
              ...opcoes.instrucao,
            },
    },
    { categoriaAta: null, percentualContrato: null },
    agora,
  );
}

function obrigatoriosFeitos() {
  return Object.fromEntries(
    ITENS_INSTRUCAO.filter((i) => i.obrigatorio).map((i) => [i.chave, { feito: true, em: "2026-10-10" }]),
  );
}

const desenhar = (c: CartaoView, somenteLeitura = false) =>
  renderToStaticMarkup(createElement(Instrucao, { cartao: c, somenteLeitura }));

const contar = (html: string, trecho: string) => html.split(trecho).length - 1;

describe("aba Instrução: o vendedor", () => {
  it("sem instrução iniciada mostra o cabeçalho, os 11 itens em 3 grupos e o progresso zerado", () => {
    const html = desenhar(cartao());
    expect(html).toContain("O que o órgão aderente precisa reunir.");
    expect(html).toContain("Marque conforme os documentos chegarem.");
    expect(html).toContain("0 de 9");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="0"');
    expect(contar(html, 'type="checkbox"')).toBe(ITENS_INSTRUCAO.length);
    for (const grupo of ["Instrução do órgão aderente", "Aceites", "Formalização"]) expect(html).toContain(grupo);
    for (const item of ITENS_INSTRUCAO) {
      expect(html).toContain(item.ajuda);
    }
  });

  it("cada checkbox tem rótulo ligado e fica FORA de formulário (o envio é direto, sem o reinício do form)", () => {
    const html = desenhar(cartao());
    const ids = [...html.matchAll(/<input id="([^"]+)" type="checkbox"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(ITENS_INSTRUCAO.length);
    for (const id of ids) expect(html).toContain(`<label for="${id}"`);
    // Dentro de <form action> o React reinicia a caixa controlada ao terminar a action: nenhuma pode estar lá.
    const formularios = html.match(/<form[\s\S]*?<\/form>/g) ?? [];
    expect(formularios.length).toBeGreaterThan(0);
    for (const formulario of formularios) expect(formulario).not.toContain('type="checkbox"');
    // O formulário da nota repete o estado ATUAL (não feito), para salvar a nota sem marcar o item.
    expect(contar(html, 'name="feito" value="false"')).toBe(ITENS_INSTRUCAO.length);
    expect(contar(html, 'name="feito" value="true"')).toBe(0);
  });

  it("item feito mostra o dia em que foi marcado e a nota; a caixa vem marcada e a nota repete 'true'", () => {
    const html = desenhar(
      cartao({ instrucao: { itens: { dfd: { feito: true, em: "2026-10-05", nota: "Assinada pelo secretário" } } } }),
    );
    expect(html).toContain("Marcado em 05/10/2026");
    expect(html).toContain("Nota: Assinada pelo secretário");
    expect(contar(html, 'checked=""')).toBe(1);
    expect(html).toMatch(/<input id="[^"]+" type="checkbox"[^>]*checked=""/);
    // Só o formulário da nota do item feito repete "true"; os outros dez repetem "false".
    expect(contar(html, 'name="feito" value="true"')).toBe(1);
    expect(contar(html, 'name="feito" value="false"')).toBe(ITENS_INSTRUCAO.length - 1);
    expect(html).toContain("1 de 9");
    expect(html).toContain('aria-valuenow="1"');
  });

  it("itens de formalização aparecem como 'Depois da adesão'", () => {
    const html = desenhar(cartao());
    expect(contar(html, "Depois da adesão")).toBe(ITENS_INSTRUCAO.filter((i) => !i.obrigatorio).length);
  });

  it("não declarada: aviso da trava, texto da declaração e justificativa obrigatória enquanto faltam itens", () => {
    const html = desenhar(cartao({ instrucao: {} }));
    expect(html).toContain("Sem a declaração registrada, o município não pode ser marcado como Aderiu.");
    expect(html).toContain("Registrar declaração");
    expect(html).toContain(TEXTO_DECLARACAO);
    expect(html).toContain("Itens ainda não confirmados:");
    expect(html).toMatch(/<textarea[^>]*name="justificativaExcecao"[^>]*required|<textarea[^>]*required[^>]*name="justificativaExcecao"/);
    expect(html).toMatch(/<textarea[^>]*minLength="20"/);
    expect(html).toContain("Faltam 9 itens obrigatórios");
    expect(html).not.toContain("Revogar declaração");
  });

  it("com todos os obrigatórios feitos não pede justificativa e o texto é o da declaração", () => {
    const html = desenhar(cartao({ instrucao: { itens: obrigatoriosFeitos() } }));
    expect(html).toContain("9 de 9");
    expect(html).toContain("Registrar declaração");
    expect(html).not.toContain('name="justificativaExcecao"');
    expect(html).not.toContain("Itens ainda não confirmados");
    expect(html).toContain(TEXTO_DECLARACAO);
  });

  it("declarada: mostra data, quem, versão, e oferece revogar (sem formulário de nova declaração)", () => {
    const html = desenhar(
      cartao({
        instrucao: {
          itens: obrigatoriosFeitos(),
          declaracaoEm: new Date("2026-10-21T15:30:00Z"),
          declaracaoPorTipo: "vendedor",
          declaracaoVersao: VERSAO_DECLARACAO,
        },
      }),
    );
    expect(html).toContain("Declaração registrada.");
    expect(html).toContain('data-tom="sucesso"');
    expect(html).toContain("21/10/2026");
    expect(html).toContain("12:30"); // Brasília: UTC-3
    expect(html).toContain("Maria Souza");
    expect(html).toContain(`versão ${VERSAO_DECLARACAO} do texto`);
    expect(html).toContain(TEXTO_DECLARACAO);
    expect(html).toContain("Revogar declaração");
    expect(html).not.toContain("Registrar declaração");
    expect(html).not.toContain("Sem a declaração registrada");
  });

  it("declarada por admin aparece como Administrador", () => {
    const html = desenhar(
      cartao({
        instrucao: { itens: obrigatoriosFeitos(), declaracaoEm: new Date("2026-10-21T15:30:00Z"), declaracaoPorTipo: "admin", declaracaoVersao: 1 },
      }),
    );
    expect(html).toContain("por Administrador");
  });

  it("declarada com exceção: mostra a justificativa em aviso de atenção e o que ainda falta", () => {
    const html = desenhar(
      cartao({
        instrucao: {
          itens: { dfd: { feito: true, em: "2026-10-10" } },
          declaracaoEm: new Date("2026-10-21T15:30:00Z"),
          declaracaoPorTipo: "vendedor",
          declaracaoVersao: 1,
          declaracaoExcecao: "O parecer chega na semana que vem.",
        },
      }),
    );
    expect(html).toContain("Registrada com itens obrigatórios pendentes.");
    expect(html).toContain("Justificativa: O parecer chega na semana que vem.");
    expect(html).toContain('data-tom="atencao"');
    expect(html).toContain("Itens obrigatórios ainda sem confirmação:");
    // Com pendência, o aviso do registro só informa (não fica verde, que pareceria "tudo certo").
    expect(html).toMatch(/data-tom="info"[^>]*>(?:(?!<\/div>)[\s\S])*?Declaração registrada\./);
    expect(html).not.toMatch(/data-tom="sucesso"/);
  });

  it("declarada com tudo feito e depois desmarcado: avisa que a declaração foi mantida", () => {
    const itens = obrigatoriosFeitos();
    delete (itens as Record<string, unknown>).parecer_juridico;
    const html = desenhar(
      cartao({
        instrucao: { itens, declaracaoEm: new Date("2026-10-21T15:30:00Z"), declaracaoPorTipo: "vendedor", declaracaoVersao: 1 },
      }),
    );
    expect(html).toContain("O checklist mudou depois da declaração.");
    expect(html).toContain("Parecer jurídico do órgão");
    expect(html).toContain("revogue e registre de novo");
  });

  it("em Aderiu a declaração não pode ser revogada: sem botão, com explicação", () => {
    const html = desenhar(
      cartao({
        estagio: "aderiu",
        instrucao: { itens: obrigatoriosFeitos(), declaracaoEm: new Date("2026-10-21T15:30:00Z"), declaracaoPorTipo: "vendedor", declaracaoVersao: 1 },
      }),
    );
    expect(html).not.toContain("Revogar declaração");
    expect(html).toContain("a declaração não pode mais ser revogada");
  });

  it("o kit de minutas abre em nova aba, sem dar acesso à janela de origem", () => {
    const html = desenhar(cartao());
    expect(html).toContain('href="/minutas/cm1oportunidade0000000001"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Abrir kit de minutas");
    expect(html).toContain("(abre em nova aba)");
  });

  it("o link do kit de minutas fica no começo da aba, antes do checklist, e diz o que são os modelos", () => {
    const html = desenhar(cartao());
    expect(html.indexOf("/minutas/")).toBeGreaterThan(-1);
    expect(html.indexOf("/minutas/")).toBeLessThan(html.indexOf('type="checkbox"'));
    expect(html).toContain("Modelos de texto para o órgão adaptar; não substituem os atos dele.");
  });

  it("o progresso diz 'feitos' e a data da declaração sai por extenso curto, com 'às'", () => {
    expect(desenhar(cartao())).toContain("0 de 9 feitos · 0%");
    const html = desenhar(
      cartao({
        instrucao: { itens: obrigatoriosFeitos(), declaracaoEm: new Date("2026-10-21T15:30:00Z"), declaracaoPorTipo: "vendedor", declaracaoVersao: 1 },
      }),
    );
    expect(html).toContain("9 de 9 feitos · 100%");
    expect(html).toContain("21/10/2026 às 12:30");
  });

  it("a caixa tem dois rótulos ligados (o do texto e o que só aumenta a área de toque) e nunca vem desabilitada", () => {
    const html = desenhar(cartao());
    const ids = [...html.matchAll(/<input id="([^"]+)" type="checkbox"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(ITENS_INSTRUCAO.length);
    for (const id of ids) expect(contar(html, `<label for="${id}"`)).toBe(2);
    // Desabilitar a caixa enquanto grava tira o foco de quem usa o teclado: ela segue ativa.
    expect(html).not.toMatch(/<input id="[^"]+" type="checkbox"[^>]*disabled/);
  });

  it("a região de status avisa 'registrada' ou 'não registrada' e o bloco é nomeado pelo próprio título", () => {
    const sem = desenhar(cartao());
    expect(sem).toMatch(/<p class="sr-only" role="status">Declaração não registrada\.<\/p>/);
    const com = desenhar(
      cartao({
        instrucao: { itens: obrigatoriosFeitos(), declaracaoEm: new Date("2026-10-21T15:30:00Z"), declaracaoPorTipo: "vendedor", declaracaoVersao: 1 },
      }),
    );
    expect(com).toMatch(/<p class="sr-only" role="status">Declaração registrada\.<\/p>/);
    for (const html of [sem, com]) {
      const ligacao = html.match(/<section class="[^"]*" aria-labelledby="([^"]+)"><p id="([^"]+)" class="kb-secao">Declaração de conformidade/);
      expect(ligacao).not.toBeNull();
      expect(ligacao?.[1]).toBe(ligacao?.[2]);
    }
  });

  it("o formulário liga a justificativa ao rótulo e à contagem, e mostra quantos caracteres faltam", () => {
    const html = desenhar(cartao({ instrucao: {} }));
    const id = html.match(/<textarea id="([^"]+)" name="justificativaExcecao"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<label for="${id}" class="rotulo-campo">Justificativa da exceção</label>`);
    expect(html).toContain(`aria-describedby="${id}-contador"`);
    expect(html).toContain(`id="${id}-contador"`);
    expect(html).toContain("0 de 20 caracteres no mínimo");
  });

  it("o texto da declaração aparece no quadro do modelo, com a frase do que o registro grava, antes do botão", () => {
    const html = desenhar(cartao({ instrucao: { itens: obrigatoriosFeitos() } }));
    expect(html).toContain('<p class="titulo">Texto da declaração</p>');
    expect(html).toContain("Ao registrar, você faz esta declaração. Ficam gravados a data, a hora e o seu nome.");
    expect(html.indexOf("Ao registrar, você faz")).toBeLessThan(html.indexOf("Registrar declaração"));
  });

  it("os itens que faltam num registro com exceção saem em lista, um por linha", () => {
    const html = desenhar(
      cartao({
        instrucao: {
          itens: { dfd: { feito: true, em: "2026-10-10" } },
          declaracaoEm: new Date("2026-10-21T15:30:00Z"),
          declaracaoPorTipo: "vendedor",
          declaracaoVersao: 1,
          declaracaoExcecao: "O parecer chega na semana que vem.",
        },
      }),
    );
    expect(html).toContain("<li>Parecer jurídico do órgão, art. 53</li>");
    expect(html).not.toContain("<li>Formalização da demanda assinada</li>");
  });

  it("a confirmação de revogar só aparece depois do clique (não está na primeira tela)", () => {
    const html = desenhar(
      cartao({
        instrucao: { itens: obrigatoriosFeitos(), declaracaoEm: new Date("2026-10-21T15:30:00Z"), declaracaoPorTipo: "vendedor", declaracaoVersao: 1 },
      }),
    );
    expect(html).toContain("Revogar declaração");
    expect(html).not.toContain("Confirmar revogação");
    expect(html).not.toContain("Revogar apaga a declaração registrada");
  });
});

describe("aba Instrução: modo somente leitura (Pipeline do gestor)", () => {
  it("não desenha formulário, botão, caixa de marcar nem campo de texto", () => {
    const html = desenhar(
      cartao({ instrucao: { itens: { dfd: { feito: true, em: "2026-10-05", nota: "ok" } } } }),
      true,
    );
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<details");
  });

  it("mostra o que está feito e o que falta, o progresso, a data, a nota e a trava", () => {
    const html = desenhar(
      cartao({ instrucao: { itens: { dfd: { feito: true, em: "2026-10-05", nota: "ok" } } } }),
      true,
    );
    expect(html).toContain("O vendedor marca conforme os documentos chegam.");
    expect(html).toContain("1 de 9");
    expect(html).toContain("Feito");
    expect(html).toContain("Pendente");
    expect(html).toContain("Marcado em 05/10/2026");
    expect(html).toContain("Nota: ok");
    expect(html).toContain("Sem a declaração registrada, o município não pode ser marcado como Aderiu.");
  });

  it("declaração registrada é mostrada sem botão de revogar", () => {
    const html = desenhar(
      cartao({
        instrucao: { itens: obrigatoriosFeitos(), declaracaoEm: new Date("2026-10-21T15:30:00Z"), declaracaoPorTipo: "vendedor", declaracaoVersao: 1 },
      }),
      true,
    );
    expect(html).toContain("Declaração registrada.");
    expect(html).not.toContain("Revogar declaração");
    expect(html).not.toContain("<button");
  });

  it("mantém o link do kit de minutas (é link, não botão)", () => {
    const html = desenhar(cartao(), true);
    expect(html).toContain('href="/minutas/cm1oportunidade0000000001"');
  });
});
