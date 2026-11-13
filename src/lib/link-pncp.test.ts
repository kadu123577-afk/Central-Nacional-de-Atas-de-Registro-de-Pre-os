import { describe, expect, it } from "vitest";
import { lerLinkPncp, linkPncpDaAta } from "./link-pncp";

const ATA = "https://pncp.gov.br/app/atas/03532661000156/2024/75/1";

describe("lerLinkPncp", () => {
  it("vazio é permitido (o link é opcional)", () => {
    expect(lerLinkPncp("")).toEqual({ ok: true, url: null });
    expect(lerLinkPncp("   ")).toEqual({ ok: true, url: null });
    expect(lerLinkPncp(null)).toEqual({ ok: true, url: null });
  });

  it("aceita o endereço do PNCP, com ou sem https, e tira o fragmento", () => {
    expect(lerLinkPncp(ATA)).toEqual({ ok: true, url: ATA });
    expect(lerLinkPncp("pncp.gov.br/app/atas/03532661000156/2024/75/1")).toEqual({ ok: true, url: ATA });
    expect(lerLinkPncp(`  ${ATA}#topo `)).toEqual({ ok: true, url: ATA });
    expect(lerLinkPncp("https://www.pncp.gov.br/app/atas/1/2/3/4")).toMatchObject({ ok: true });
  });

  it("o número de controle da ata vira o endereço", () => {
    expect(lerLinkPncp("03532661000156-1-000075/2024-000001")).toEqual({ ok: true, url: ATA });
  });

  it.each([
    ["outro site", "https://exemplo.com/app/atas/1"],
    ["domínio que só termina parecido", "https://pncp.gov.br.malicioso.com/x"],
    ["domínio que só contém o nome", "https://meupncp.gov.br/x"],
    ["http sem segurança", "http://pncp.gov.br/app/atas/1/2/3/4"],
    ["com usuário e senha", "https://usuario:senha@pncp.gov.br/x"],
    ["com porta", "https://pncp.gov.br:8443/x"],
    ["esquema perigoso", "javascript:alert(1)"],
    ["texto qualquer", "a ata está no portal"],
    ["grande demais", `https://pncp.gov.br/${"a".repeat(400)}`],
  ])("recusa %s", (_nome, texto) => {
    expect(lerLinkPncp(texto)).toMatchObject({ ok: false });
  });
});

describe("linkPncpDaAta", () => {
  it("usa o link guardado; sem ele, o do número de controle; sem nenhum, nada", () => {
    expect(linkPncpDaAta({ linkPncp: ATA })).toBe(ATA);
    expect(linkPncpDaAta({ numeroControlePncp: "03532661000156-1-000075/2024-000001" })).toBe(ATA);
    expect(linkPncpDaAta({})).toBeNull();
  });

  it("link guardado que não vale (dado antigo ou mexido no banco) não é entregue à tela", () => {
    expect(linkPncpDaAta({ linkPncp: "https://golpe.example/x" })).toBeNull();
    expect(linkPncpDaAta({ linkPncp: "https://golpe.example/x", numeroControlePncp: "03532661000156-1-000075/2024-000001" })).toBe(ATA);
  });
});
