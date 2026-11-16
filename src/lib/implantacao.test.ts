import { describe, expect, it } from "vitest";
import { lerJsonDaEquipe, planejarImplantacao, type Ambiente } from "./implantacao";

const EQUIPE = [{ nome: "Fulana", email: "fulana@exemplo.com.br", perfil: "estagiario" }];
const BASE: Ambiente = {
  DATABASE_URL: "postgresql://x",
  SESSION_SECRET: "s".repeat(40),
  TOTP_ENCRYPTION_KEY: "t".repeat(40),
  CRON_SECRET: "c".repeat(40),
};

describe("lerJsonDaEquipe", () => {
  it("aceita JSON direto ou em base64", () => {
    expect(lerJsonDaEquipe(JSON.stringify(EQUIPE))).toEqual(EQUIPE);
    expect(lerJsonDaEquipe(Buffer.from(JSON.stringify(EQUIPE)).toString("base64"))).toEqual(EQUIPE);
  });

  it("texto que não é nenhum dos dois lança", () => {
    expect(() => lerJsonDaEquipe("isto não é json")).toThrow();
  });
});

describe("planejarImplantacao", () => {
  it("administrador e equipe completos: os dois passos, sem erro nem aviso", () => {
    const p = planejarImplantacao({
      ...BASE,
      ADMIN_EMAIL: "gestor@exemplo.com.br",
      ADMIN_SENHA: "Uma-senha-bem-forte-2026!",
      EQUIPE_JSON: JSON.stringify(EQUIPE),
      SENHA_PROVISORIA: "Senha123",
    });
    expect(p).toEqual({ passos: ["administrador", "equipe"], pessoasDaEquipe: 1, erros: [], avisos: [] });
  });

  it("só o administrador, ou só a equipe, também vale", () => {
    expect(planejarImplantacao({ ...BASE, ADMIN_EMAIL: "gestor@exemplo.com.br", ADMIN_SENHA: "Uma-senha-bem-forte-2026!" }).passos).toEqual(["administrador"]);
    expect(planejarImplantacao({ ...BASE, EQUIPE_JSON: JSON.stringify(EQUIPE), SENHA_PROVISORIA: "Senha123" }).passos).toEqual(["equipe"]);
  });

  it("sem banco, nada roda", () => {
    const p = planejarImplantacao({ ADMIN_EMAIL: "gestor@exemplo.com.br", ADMIN_SENHA: "Uma-senha-bem-forte-2026!" });
    expect(p.erros.join(" ")).toContain("DATABASE_URL");
  });

  it("nunca com o ambiente de demonstração ligado", () => {
    const p = planejarImplantacao({ ...BASE, AMBIENTE_DEMONSTRACAO: "true", ADMIN_EMAIL: "gestor@exemplo.com.br", ADMIN_SENHA: "Uma-senha-bem-forte-2026!" });
    expect(p.erros.join(" ")).toContain("demonstração");
  });

  it("e-mail e senha do administrador vêm juntos, e a senha segue a política", () => {
    expect(planejarImplantacao({ ...BASE, ADMIN_EMAIL: "gestor@exemplo.com.br" }).erros.join(" ")).toContain("juntos");
    expect(planejarImplantacao({ ...BASE, ADMIN_SENHA: "Uma-senha-bem-forte-2026!" }).erros.join(" ")).toContain("juntos");
    expect(planejarImplantacao({ ...BASE, ADMIN_EMAIL: "ruim", ADMIN_SENHA: "Uma-senha-bem-forte-2026!" }).erros.join(" ")).toContain("e-mail válido");
    expect(planejarImplantacao({ ...BASE, ADMIN_EMAIL: "gestor@exemplo.com.br", ADMIN_SENHA: "curta" }).erros.join(" ")).toContain("ADMIN_SENHA não vale");
  });

  it("equipe sem a senha provisória, ou com JSON ruim, é erro", () => {
    expect(planejarImplantacao({ ...BASE, EQUIPE_JSON: JSON.stringify(EQUIPE) }).erros.join(" ")).toContain("SENHA_PROVISORIA");
    expect(planejarImplantacao({ ...BASE, EQUIPE_JSON: "lixo", SENHA_PROVISORIA: "Senha123" }).erros.join(" ")).toContain("JSON válido");
    expect(
      planejarImplantacao({ ...BASE, EQUIPE_JSON: JSON.stringify([{ nome: "X", email: "ruim" }]), SENHA_PROVISORIA: "Senha123" }).erros.join(" "),
    ).toContain("EQUIPE_JSON tem problemas");
  });

  it("equipe por arquivo entra como passo; quem valida é o script da equipe", () => {
    expect(planejarImplantacao({ ...BASE, EQUIPE_ARQUIVO: "/x/equipe.json", SENHA_PROVISORIA: "Senha123" }).passos).toEqual(["equipe"]);
  });

  it("sem nada a implantar, avisa", () => {
    expect(planejarImplantacao(BASE).erros.join(" ")).toContain("Nada a implantar");
  });

  it("segredos que faltam viram aviso, não erro", () => {
    const p = planejarImplantacao({ DATABASE_URL: "postgresql://x", ADMIN_EMAIL: "gestor@exemplo.com.br", ADMIN_SENHA: "Uma-senha-bem-forte-2026!" });
    expect(p.erros).toEqual([]);
    expect(p.avisos.map((a) => a.split(" ")[0])).toEqual(["SESSION_SECRET", "TOTP_ENCRYPTION_KEY", "CRON_SECRET"]);
  });
});
