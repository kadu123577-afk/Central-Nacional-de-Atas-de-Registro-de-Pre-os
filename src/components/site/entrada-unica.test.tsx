import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tela da entrada única: o que o formulário desenha em cada etapa e o que o
 * cabeçalho oferece. A action de verdade puxa banco e sessão, então aqui ela é
 * trocada por um dublê e o retorno dela (useActionState) é escolhido pelo teste.
 */
const d = vi.hoisted(() => ({
  estado: {} as Record<string, unknown>,
  pendente: false,
}));

vi.mock("@/app/(site)/entrar/actions", () => ({ entrar: vi.fn() }));
vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  return { ...real, useActionState: () => [d.estado, () => {}, d.pendente] };
});

import { Cabecalho } from "./cabecalho";
import { FormEntrar } from "./form-entrar";

const desenhar = () =>
  renderToStaticMarkup(
    createElement(FormEntrar, {
      destinoOrgao: "/catalogo/abcdefghij12345",
      contexto: null,
      hrefCadastroOrgao: "https://wa.me/5500000000000?text=orgao",
      hrefCadastroFornecedor: "https://wa.me/5500000000000?text=fornecedor",
      hrefEsqueci: "https://wa.me/5500000000000?text=senha",
      emailContato: "contato@central.example",
    }),
  );

beforeEach(() => {
  d.estado = {};
  d.pendente = false;
});

describe("formulário de entrada", () => {
  it("título, texto curto e campos com rótulo visível ligado ao campo", () => {
    const html = desenhar();
    expect(html).toContain(">Entrar</h2>");
    expect(html).toContain("Use o e-mail e a senha do seu cadastro. Você será levado à sua área.");
    for (const [id, rotulo] of [
      ["email", "E-mail"],
      ["senha", "Senha"],
      ["codigo", "Código do autenticador (se tiver)"],
    ]) {
      expect(html).toContain(`<label for="${id}">${rotulo}</label>`);
      expect(html).toMatch(new RegExp(`<input[^>]*id="${id}"`));
    }
  });

  it("o destino do órgão vai escondido no formulário; sem seletor de perfil na etapa inicial", () => {
    const html = desenhar();
    expect(html).toMatch(/<input type="hidden" name="destino" value="\/catalogo\/abcdefghij12345"/);
    expect(html).not.toContain("<fieldset");
    expect(html).not.toContain("Escolher perfil");
    expect(html).not.toContain('role="tab"');
  });

  it("não cita nem linka as áreas internas", () => {
    const html = desenhar();
    for (const proibido of ["Administração", "administra", "Consultor", "consultor", "/admin", "/vendedor", "Equipe"]) {
      expect(html).not.toContain(proibido);
    }
  });

  it("mantém os dois links de cadastro, o de senha e o contato", () => {
    const html = desenhar();
    expect(html).toContain("Ainda não tem conta?");
    expect(html).toContain('href="https://wa.me/5500000000000?text=orgao">Solicitar cadastro do órgão</a>');
    expect(html).toContain('href="https://wa.me/5500000000000?text=fornecedor">Cadastrar minha empresa</a>');
    expect(html).toContain("Esqueci minha senha");
    expect(html).toContain("mailto:contato@central.example");
  });

  it("botão Entrar, que desabilita e muda o texto durante o envio", () => {
    expect(desenhar()).toMatch(/<button[^>]*type="submit"[^>]*>Entrar<\/button>/);
    expect(desenhar()).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    d.pendente = true;
    expect(desenhar()).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Entrando\.\.\.<\/button>/);
  });

  it("erro aparece numa região com role=alert; sem erro ela fica escondida", () => {
    expect(desenhar()).toMatch(/<div[^>]*role="alert"[^>]*hidden=""/);
    d.estado = { erro: "E-mail ou senha incorretos." };
    const html = desenhar();
    expect(html).toMatch(/<div class="alerta alerta--critico"[^>]*role="alert"(?![^>]*hidden)/);
    expect(html).toContain("E-mail ou senha incorretos.");
  });

  it("etapa Escolher perfil: radios com os rótulos devolvidos pelo servidor", () => {
    d.estado = {
      escolher: [
        { perfil: "admin", rotulo: "Administração" },
        { perfil: "orgao", rotulo: "Órgão público" },
      ],
    };
    const html = desenhar();
    expect(html).toContain("<fieldset");
    expect(html).toContain("Escolher perfil");
    expect(html).toMatch(/<input[^>]*type="radio"[^>]*id="perfil-admin"[^>]*name="perfil"[^>]*value="admin"/);
    expect(html).toContain('<label for="perfil-admin">Administração</label>');
    expect(html).toMatch(/<input[^>]*type="radio"[^>]*id="perfil-orgao"[^>]*name="perfil"[^>]*value="orgao"/);
    expect(html).toContain('<label for="perfil-orgao">Órgão público</label>');
    expect(html).not.toContain("Consultor");
    expect(html).not.toContain("Fornecedor</label>");
  });
});

describe("cabeçalho do site", () => {
  const html = () => renderToStaticMarkup(createElement(Cabecalho, { contagens: {} }));

  it("Entrar é um link simples para /entrar, sem menu de entradas separadas", () => {
    const pagina = html();
    expect(pagina).toContain('<a href="/entrar">Entrar</a>');
    expect(pagina).not.toContain("menu-entrar");
    expect(pagina).not.toContain("Sou órgão público");
    expect(pagina).not.toContain("Sou fornecedor");
    expect(pagina).not.toContain("perfil=");
  });

  it("nenhum link do cabeçalho aponta para as entradas separadas", () => {
    expect(html()).not.toMatch(/href="\/(admin|vendedor|orgao|fornecedor)\/login/);
  });
});
