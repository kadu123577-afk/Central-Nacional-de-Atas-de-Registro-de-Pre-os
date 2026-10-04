import { describe, expect, it } from "vitest";
import { linkEmail, linkTelefone, linkWhatsapp } from "./contato-links";

describe("linkWhatsapp", () => {
  it("celular com DDD vira wa.me com 55", () => {
    expect(linkWhatsapp("(62) 99123-4567")).toBe("https://wa.me/5562991234567");
    expect(linkWhatsapp("062 9 9123 4567")).toBe("https://wa.me/5562991234567");
  });

  it("já com 55", () => {
    expect(linkWhatsapp("+55 62 99123-4567")).toBe("https://wa.me/5562991234567");
  });

  it("fixo não gera WhatsApp", () => {
    expect(linkWhatsapp("(62) 3123-4567")).toBeNull();
  });

  it("vazio ou inválido", () => {
    expect(linkWhatsapp(null)).toBeNull();
    expect(linkWhatsapp("123")).toBeNull();
  });
});

describe("linkTelefone", () => {
  it("fixo e celular viram tel:", () => {
    expect(linkTelefone("(62) 3123-4567")).toBe("tel:+556231234567");
    expect(linkTelefone("62991234567")).toBe("tel:+5562991234567");
  });

  it("inválido é nulo", () => {
    expect(linkTelefone("abc")).toBeNull();
  });
});

describe("linkEmail", () => {
  it("valida formato", () => {
    expect(linkEmail(" a@b.gov.br ")).toBe("mailto:a@b.gov.br");
    expect(linkEmail("sem-arroba")).toBeNull();
    expect(linkEmail(null)).toBeNull();
  });
});
