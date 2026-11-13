import { describe, expect, it } from "vitest";
import { TAMANHO_MINIMO_DO_SEGREDO, descreverProblemas, verificarAmbiente } from "./ambiente";

const SEGREDO = "s".repeat(TAMANHO_MINIMO_DO_SEGREDO);
const BOM = {
  DATABASE_URL: "postgresql://usuario:senha@banco.interno:5432/central_atas",
  SESSION_SECRET: SEGREDO,
  CRON_SECRET: "c".repeat(32),
  TOTP_ENCRYPTION_KEY: "t".repeat(32),
  NEXT_PUBLIC_SITE_URL: "https://atas.exemplo.com.br",
};

const erros = (env: Record<string, string | undefined>) => verificarAmbiente(env).filter((p) => p.gravidade === "erro").map((p) => p.variavel);
const avisos = (env: Record<string, string | undefined>) => verificarAmbiente(env).filter((p) => p.gravidade === "aviso").map((p) => p.variavel);

describe("verificarAmbiente", () => {
  it("ambiente completo: nenhum problema", () => {
    expect(verificarAmbiente(BOM)).toEqual([]);
  });

  it("sem banco ou sem segredo da sessão: erro (a partida deve parar)", () => {
    expect(erros({})).toEqual(["DATABASE_URL", "SESSION_SECRET"]);
    expect(erros({ ...BOM, DATABASE_URL: undefined })).toEqual(["DATABASE_URL"]);
    expect(erros({ ...BOM, SESSION_SECRET: undefined })).toEqual(["SESSION_SECRET"]);
  });

  it("segredo curto e string de conexão que não é de PostgreSQL também são erro", () => {
    expect(erros({ ...BOM, SESSION_SECRET: "curto" })).toEqual(["SESSION_SECRET"]);
    expect(erros({ ...BOM, SESSION_SECRET: "s".repeat(TAMANHO_MINIMO_DO_SEGREDO - 1) })).toEqual(["SESSION_SECRET"]);
    expect(erros({ ...BOM, DATABASE_URL: "mysql://x" })).toEqual(["DATABASE_URL"]);
    expect(erros({ ...BOM, DATABASE_URL: "postgres://u:p@h/db" })).toEqual([]);
  });

  it("o que falta mas não impede de funcionar é só aviso", () => {
    const so = { DATABASE_URL: BOM.DATABASE_URL, SESSION_SECRET: SEGREDO };
    expect(erros(so)).toEqual([]);
    expect(avisos(so)).toEqual(["CRON_SECRET", "TOTP_ENCRYPTION_KEY", "NEXT_PUBLIC_SITE_URL"]);
  });

  it("endereço público sem https é aviso", () => {
    expect(avisos({ ...BOM, NEXT_PUBLIC_SITE_URL: "http://atas.exemplo.com.br" })).toEqual(["NEXT_PUBLIC_SITE_URL"]);
  });

  it("modo de demonstração e Renata ligada pedem atenção", () => {
    expect(avisos({ ...BOM, AMBIENTE_DEMONSTRACAO: "true" })).toEqual(["AMBIENTE_DEMONSTRACAO"]);
    expect(avisos({ ...BOM, RENATA_API_ATIVA: "sim" })).toEqual(["RENATA_API_ATIVA"]);
    expect(avisos({ ...BOM, AMBIENTE_DEMONSTRACAO: "false", RENATA_API_ATIVA: "" })).toEqual([]);
  });

  it("o texto do log traz um problema por linha, com a gravidade e a variável, e nunca o valor", () => {
    const texto = descreverProblemas(verificarAmbiente({ SESSION_SECRET: "segredo-que-nao-pode-vazar" }));
    expect(texto).toContain("[erro] DATABASE_URL");
    expect(texto).toContain("[erro] SESSION_SECRET");
    expect(texto.split("\n").length).toBeGreaterThanOrEqual(2);
    expect(texto).not.toContain("segredo-que-nao-pode-vazar");
  });
});
