import { describe, expect, it, afterEach, vi } from "vitest";
import {
  cifrarSegredo,
  codificarBase32,
  codigoTotp,
  decifrarSegredo,
  decodificarBase32,
  gerarSegredoTotp,
  passoAtual,
  verificarTotp,
} from "./totp";
import { validarSenhaNova } from "./senha";
import {
  contentDispositionSeguro,
  detectarTipoDocumento,
  nomeArquivoSeguro,
} from "./documentos";
import { cronAutorizado } from "./cron-auth";

describe("totp", () => {
  // Vetor de teste da RFC 6238 (SHA-1, segredo ASCII "12345678901234567890"):
  // em T=59s o código de 8 dígitos é 94287082, logo o de 6 dígitos é 287082.
  const segredoRfc = codificarBase32(Buffer.from("12345678901234567890"));

  it("bate com o vetor oficial da RFC 6238", () => {
    expect(codigoTotp(segredoRfc, Math.floor(59 / 30))).toBe("287082");
    expect(codigoTotp(segredoRfc, Math.floor(1111111109 / 30))).toBe("081804");
    expect(codigoTotp(segredoRfc, Math.floor(20000000000 / 30))).toBe("353130");
  });

  it("base32 faz ida e volta", () => {
    const bytes = Buffer.from("segredo-de-teste-123");
    expect(decodificarBase32(codificarBase32(bytes)).equals(bytes)).toBe(true);
  });

  it("aceita o código do passo atual e recusa reuso e código errado", () => {
    const segredo = gerarSegredoTotp();
    const agora = 1_700_000_000_000;
    const passo = passoAtual(agora);
    const codigo = codigoTotp(segredo, passo);

    expect(verificarTotp(segredo, codigo, null, agora)).toBe(passo);
    // mesmo passo já usado → recusa (anti-reuso)
    expect(verificarTotp(segredo, codigo, passo, agora)).toBeNull();
    expect(verificarTotp(segredo, "000000", null, agora)).toBeNull();
    expect(verificarTotp(segredo, "abc", null, agora)).toBeNull();
  });

  it("tolera um passo de diferença de relógio, mas não dois", () => {
    const segredo = gerarSegredoTotp();
    const agora = 1_700_000_000_000;
    const passo = passoAtual(agora);
    expect(verificarTotp(segredo, codigoTotp(segredo, passo - 1), null, agora)).toBe(passo - 1);
    expect(verificarTotp(segredo, codigoTotp(segredo, passo - 2), null, agora)).toBeNull();
  });

  it("cifra e decifra o segredo, e o texto cifrado não revela o segredo", () => {
    vi.stubEnv("SESSION_SECRET", "x".repeat(40));
    const segredo = gerarSegredoTotp();
    const cifrado = cifrarSegredo(segredo);
    expect(cifrado).not.toContain(segredo);
    expect(decifrarSegredo(cifrado)).toBe(segredo);
    // adulterar o texto cifrado faz a decifragem falhar (GCM autentica)
    const [iv, tag, dados] = cifrado.split(".");
    const adulterado = [iv, tag, Buffer.from("lixo").toString("base64url") + dados].join(".");
    expect(() => decifrarSegredo(adulterado)).toThrow();
    vi.unstubAllEnvs();
  });
});

describe("política de senha", () => {
  it("exige 12 caracteres", () => {
    expect(validarSenhaNova("Curta#12")).not.toBeNull();
    expect(validarSenhaNova("uma-senha-longa-e-boa-7")).toBeNull();
  });

  it("recusa senhas óbvias e repetitivas", () => {
    expect(validarSenhaNova("123456789012")).not.toBeNull();
    expect(validarSenhaNova("aaaaaaaaaaaaaaaa")).not.toBeNull();
    expect(validarSenhaNova("abababababab")).not.toBeNull();
  });

  it("recusa senha que contém o e-mail", () => {
    expect(validarSenhaNova("maria.silva-2026!", "maria.silva@empresa.com.br")).not.toBeNull();
    expect(validarSenhaNova("outra-coisa-bem-longa", "maria.silva@empresa.com.br")).toBeNull();
  });

  it("recusa senha acima de 72 bytes (limite do bcrypt)", () => {
    expect(validarSenhaNova("aB3$".repeat(19))).not.toBeNull();
  });
});

describe("documentos", () => {
  it("identifica PDF, JPEG e PNG pelos bytes e recusa o resto", () => {
    expect(detectarTipoDocumento(Buffer.from("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(detectarTipoDocumento(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("image/jpeg");
    expect(
      detectarTipoDocumento(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
    ).toBe("image/png");
    // HTML e SVG disfarçados de PDF/imagem não passam
    expect(detectarTipoDocumento(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectarTipoDocumento(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(detectarTipoDocumento(Buffer.alloc(0))).toBeNull();
  });

  it("limpa o nome do arquivo", () => {
    expect(nomeArquivoSeguro("..\\..\\etc/passwd")).toBe("passwd");
    expect(nomeArquivoSeguro('ata"; filename="x.exe')).not.toContain('"');
    expect(nomeArquivoSeguro("")).toBe("documento");
    expect(nomeArquivoSeguro("a\r\nSet-Cookie: x=1.pdf")).not.toMatch(/[\r\n]/);
  });

  it("monta Content-Disposition sem quebra de cabeçalho", () => {
    const valor = contentDispositionSeguro('ata "2026"\r\nX-Injetado: 1.pdf');
    expect(valor).not.toMatch(/[\r\n]/);
    expect(valor.startsWith("inline; filename=")).toBe(true);
    expect(contentDispositionSeguro("Edital nº 5.pdf")).toContain("filename*=UTF-8''Edital%20n%C2%BA%205.pdf");
  });
});

describe("autorização do cron", () => {
  afterEach(() => vi.unstubAllEnvs());

  const req = (auth?: string) =>
    new Request("http://localhost/api/rastreador-pncp", {
      headers: auth ? { authorization: auth } : {},
    });

  it("em produção, sem CRON_SECRET configurado, recusa tudo", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");
    expect(cronAutorizado(req())).toBe(false);
    expect(cronAutorizado(req("Bearer "))).toBe(false);
  });

  it("com CRON_SECRET, só aceita o Bearer correto", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");
    expect(cronAutorizado(req("Bearer segredo-do-cron"))).toBe(true);
    expect(cronAutorizado(req("Bearer errado"))).toBe(false);
    expect(cronAutorizado(req())).toBe(false);
  });

  it("em desenvolvimento sem segredo, libera", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRON_SECRET", "");
    expect(cronAutorizado(req())).toBe(true);
  });
});
