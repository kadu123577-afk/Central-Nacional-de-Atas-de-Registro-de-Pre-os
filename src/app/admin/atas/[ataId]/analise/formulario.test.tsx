import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Formulário da conformidade (14/11/2026): rascunho e conclusão. Não há mais aprovar nem rejeitar a
 * ata: concluir a conformidade é o que a libera para a equipe de vendas.
 */
vi.mock("../../../actions", () => ({ analisarAta: vi.fn() }));

import { FormularioAnalise } from "./formulario";

const RESPOSTAS = {
  fornecedorRegular: true,
  editalPermiteAdesao: false,
  limitesRespeitados: false,
  pesquisaPrecos: false,
  anuenciaGerenciador: false,
  estimativaQuantidades: false,
};

function html(extra: Partial<Parameters<typeof FormularioAnalise>[0]> = {}): string {
  return renderToStaticMarkup(
    <FormularioAnalise ataId="ata1" respostasAtuais={RESPOSTAS} parecerAtual="" podeConferir {...extra} />,
  );
}

describe("FormularioAnalise", () => {
  it("quem confere tem dois botões: salvar o rascunho e concluir (que libera a ata)", () => {
    const saida = html();
    expect(saida).toContain('value="rascunho"');
    expect(saida).toContain("Salvar rascunho");
    expect(saida).toContain('value="concluir"');
    expect(saida).toContain("Concluir e liberar a ata");
  });

  it("não oferece aprovar nem rejeitar", () => {
    const saida = html();
    expect(saida).not.toContain("Aprovar ata");
    expect(saida).not.toContain("Rejeitar");
    expect(saida).not.toContain('value="aprovar"');
    expect(saida).not.toContain('value="salvar"');
  });

  it("o parecer é pedido para concluir com item não confirmado", () => {
    expect(html()).toContain("obrigatório para concluir com itens não confirmados");
  });

  it("ata já liberada: só salvar alterações, sem concluir de novo", () => {
    const saida = html({ liberada: true });
    expect(saida).toContain("Salvar alterações");
    expect(saida).not.toContain('value="concluir"');
    expect(saida).not.toContain("Concluir e liberar a ata");
  });

  it("etapa anterior pendente: os botões ficam desativados e mostram o motivo", () => {
    const saida = html({ bloqueio: "Ainda não dá: falta a etapa 4." });
    expect(saida.match(/disabled=""/g)?.length).toBe(2);
    expect(saida).toContain('title="Ainda não dá: falta a etapa 4."');
  });

  it("quem não pode conferir vê o checklist travado e nenhum botão", () => {
    const saida = html({ podeConferir: false });
    expect(saida).not.toContain('name="decisao"');
    expect(saida).toContain("disabled");
  });

  it("repõe o checklist marcado", () => {
    const saida = html();
    expect(saida).toMatch(/name="fornecedorRegular"[^>]*checked/);
    expect(saida).not.toMatch(/name="editalPermiteAdesao"[^>]*checked/);
  });
});
