import { beforeEach, describe, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { captacao: { findUnique: d.findUnique, update: d.update, create: d.create } } }));

import { vincularAtaACaptacao, type AtaCadastradaParaCaptacao } from "./captacao-db";

const ATA: AtaCadastradaParaCaptacao = {
  ataId: "ata1",
  adminId: "admin1",
  fornecedorCnpj: "12345678000195",
  fornecedorNome: "Limpa Tudo Ltda",
  orgaoNome: "Prefeitura de Jataí",
  uf: "GO",
  municipioNome: "Jataí",
  numeroAta: "10/2026",
  objeto: "Limpeza",
  categoria: "limpeza",
  vigenciaFim: new Date("2027-05-10T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  d.create.mockResolvedValue({ id: "novo" });
  d.update.mockResolvedValue({});
});

describe("vincularAtaACaptacao", () => {
  it("fecha o cartão de onde o cadastro partiu, com os dados da ata, e mantém o responsável", async () => {
    d.findUnique.mockResolvedValue({ id: "cap1", ataId: null, responsavelId: "marcelo" });
    expect(await vincularAtaACaptacao({ ...ATA, captacaoId: "cap1" })).toBe("cap1");
    expect(d.create).not.toHaveBeenCalled();
    expect(d.update).toHaveBeenCalledWith({
      where: { id: "cap1" },
      data: expect.objectContaining({
        ataId: "ata1",
        estagio: "fechada",
        motivoPerda: null,
        proximoContatoEm: null,
        responsavelId: "marcelo",
        fornecedorCnpj: "12345678000195",
        numeroAta: "10/2026",
      }),
    });
  });

  it("cartão sem responsável passa a ser de quem cadastrou a ata", async () => {
    d.findUnique.mockResolvedValue({ id: "cap1", ataId: null, responsavelId: null });
    await vincularAtaACaptacao({ ...ATA, captacaoId: "cap1" });
    expect(d.update.mock.calls[0][0].data.responsavelId).toBe("admin1");
  });

  it("cadastro direto (sem cartão): nasce um cartão já fechado, em nome de quem cadastrou", async () => {
    expect(await vincularAtaACaptacao(ATA)).toBe("novo");
    expect(d.findUnique).not.toHaveBeenCalled();
    expect(d.create.mock.calls[0][0].data).toMatchObject({
      origem: "indicacao",
      estagio: "fechada",
      ataId: "ata1",
      responsavelId: "admin1",
      criadoPorId: "admin1",
      fornecedorNome: "Limpa Tudo Ltda",
    });
    expect(d.create.mock.calls[0][0].data.nome).toBe("Ata de Limpeza e conservação · Prefeitura de Jataí/GO · vence 05/2027");
  });

  it("cartão que já tem ata, ou que não existe mais: não é reaproveitado (nasce outro)", async () => {
    d.findUnique.mockResolvedValue({ id: "cap1", ataId: "outra", responsavelId: null });
    expect(await vincularAtaACaptacao({ ...ATA, captacaoId: "cap1" })).toBe("novo");
    d.findUnique.mockResolvedValue(null);
    expect(await vincularAtaACaptacao({ ...ATA, captacaoId: "cap1" })).toBe("novo");
    expect(d.update).not.toHaveBeenCalled();
  });
});
