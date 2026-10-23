import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Entrada única (/entrar). O Prisma, a sessão e a auditoria são trocados por
 * dublês; as actions de login de cada perfil, o limite de tentativas (com um
 * banco de tentativas em memória), o 2FA e a validação do destino são os de
 * verdade, porque é exatamente a combinação deles que a entrada única não pode
 * enfraquecer.
 */
const d = vi.hoisted(() => {
  process.env.SESSION_SECRET = "segredo-de-teste-com-mais-de-32-caracteres-xx";

  interface Conta {
    id: string;
    email: string | null;
    senhaHash: string | null;
    ativo?: boolean;
    totpAtivo?: boolean;
    totpSegredo?: string | null;
    totpUltimoPasso?: number | null;
  }
  interface Tentativa {
    chave: string;
    tentativas: number;
    janelaInicio: Date;
    bloqueadoAte: Date | null;
  }
  type Filtro = {
    email?: string | { equals: string };
    ativo?: boolean;
    senhaHash?: { not: null };
  };

  const contas: Record<"admin" | "vendedor" | "fornecedor" | "orgao", Conta[]> = {
    admin: [],
    vendedor: [],
    fornecedor: [],
    orgao: [],
  };
  const tentativas = new Map<string, Tentativa>();
  const ip = { valor: "203.0.113.9" };

  function combina(conta: Conta, filtro: Filtro): boolean {
    if (typeof filtro.email === "string" && conta.email !== filtro.email) return false;
    if (typeof filtro.email === "object") {
      if (conta.email?.toLowerCase() !== filtro.email.equals.toLowerCase()) return false;
    }
    if (filtro.ativo !== undefined && conta.ativo !== filtro.ativo) return false;
    if (filtro.senhaHash && conta.senhaHash === null) return false;
    return true;
  }
  function tabela(nome: keyof typeof contas) {
    return {
      findFirst: async ({ where }: { where: Filtro }) =>
        contas[nome].find((c) => combina(c, where)) ?? null,
      findUnique: async ({ where }: { where: Filtro }) =>
        contas[nome].find((c) => combina(c, where)) ?? null,
    };
  }

  return {
    contas,
    tentativas,
    ip,
    tabela,
    redirect: vi.fn(),
    registrarAuditoria: vi.fn(),
    gastarTempoDeHash: vi.fn(),
    verificarSenha: vi.fn(),
    adminUpdate: vi.fn(),
    sessao: { admin: vi.fn(), vendedor: vi.fn(), fornecedor: vi.fn(), orgao: vi.fn() },
  };
});

vi.mock("next/navigation", () => ({ redirect: d.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (nome: string) => (nome === "x-forwarded-for" ? d.ip.valor : null) }),
}));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: d.registrarAuditoria }));
vi.mock("@/lib/auth", () => ({
  verificarSenha: d.verificarSenha,
  gastarTempoDeHash: d.gastarTempoDeHash,
  hashSenha: vi.fn(),
  criarSessaoAdmin: d.sessao.admin,
  criarSessaoVendedor: d.sessao.vendedor,
  criarSessaoFornecedor: d.sessao.fornecedor,
  criarSessaoOrgao: d.sessao.orgao,
  encerrarSessaoAdmin: vi.fn(),
  encerrarSessaoVendedor: vi.fn(),
  encerrarSessaoFornecedor: vi.fn(),
  encerrarSessaoOrgao: vi.fn(),
  adminIdLogado: vi.fn(),
  vendedorIdLogado: vi.fn(),
  fornecedorIdLogado: vi.fn(),
  orgaoIdLogado: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { ...d.tabela("admin"), update: d.adminUpdate },
    vendedor: d.tabela("vendedor"),
    fornecedor: d.tabela("fornecedor"),
    orgao: d.tabela("orgao"),
    tentativaLogin: {
      findUnique: async ({ where }: { where: { chave: string } }) =>
        d.tentativas.get(where.chave) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { chave: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const atual = d.tentativas.get(where.chave);
        d.tentativas.set(where.chave, (atual ? { ...atual, ...update } : create) as never);
      },
      deleteMany: async ({ where }: { where: { chave: string } }) => {
        d.tentativas.delete(where.chave);
        return { count: 1 };
      },
    },
  },
}));

import { cifrarSegredo, codigoTotp, gerarSegredoTotp, passoAtual } from "@/lib/totp";
import { mensagemBloqueio } from "@/lib/limite-tentativas";
import { ehMensagemDeBloqueio, MENSAGEM_ENTRADA_INVALIDA } from "@/lib/login-unico";
import { entrar, type EstadoEntrar } from "./actions";

const MENSAGEM_BLOQUEIO = "Muitas tentativas. Tente novamente em 15 minuto(s).";
const MENSAGEM_CODIGO_PEDIDO = "Informe o código de verificação do aplicativo autenticador.";
const MENSAGEM_CODIGO_INVALIDO = "Código de verificação inválido ou já utilizado.";
const IP_CHAVE = "login-ip:203.0.113.9";
const ATA = "/catalogo/abcdefghij12345";

const hash = (senha: string) => `hash:${senha}`;

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

/** Roda a action e devolve para onde ela redirecionou, ou o estado devolvido. */
async function tentar(
  campos: Record<string, string>,
): Promise<{ destino: string | null; estado: EstadoEntrar | null }> {
  try {
    return { destino: null, estado: await entrar({}, formulario(campos)) };
  } catch (erro) {
    const m = /^NEXT_REDIRECT:(.*)$/.exec(erro instanceof Error ? erro.message : "");
    if (!m) throw erro;
    return { destino: m[1], estado: null };
  }
}

function totalDeSessoes(): number {
  return Object.values(d.sessao).reduce((soma, f) => soma + f.mock.calls.length, 0);
}

const SENHA = {
  admin: "SenhaAdmin#2026",
  vendedor: "SenhaConsultor#2026",
  fornecedor: "SenhaFornecedor#2026",
  orgao: "SenhaOrgao#2026",
};

beforeEach(() => {
  vi.clearAllMocks();
  d.tentativas.clear();
  d.ip.valor = "203.0.113.9";
  for (const lista of Object.values(d.contas)) lista.length = 0;

  d.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  d.verificarSenha.mockImplementation(async (senha: string, h: string) => h === hash(senha));
  d.gastarTempoDeHash.mockResolvedValue(undefined);
  d.adminUpdate.mockResolvedValue({});

  d.contas.admin.push({
    id: "adm1",
    email: "equipe@arca.example",
    senhaHash: hash(SENHA.admin),
    totpAtivo: false,
    totpSegredo: null,
    totpUltimoPasso: null,
  });
  d.contas.vendedor.push({
    id: "ven1",
    email: "consultor@arca.example",
    senhaHash: hash(SENHA.vendedor),
    ativo: true,
  });
  d.contas.fornecedor.push({
    id: "for1",
    email: "vendas@fornecedor.example",
    senhaHash: hash(SENHA.fornecedor),
    ativo: true,
  });
  d.contas.orgao.push({
    id: "org1",
    // Gravado com maiúsculas, como o cadastro de órgão grava o que a pessoa digitou.
    email: "Compras@Prefeitura.gov.br",
    senhaHash: hash(SENHA.orgao),
    ativo: true,
  });
});

describe("cada perfil vai para a área certa", () => {
  it.each([
    ["admin", "equipe@arca.example", "/admin", "adm1"],
    ["vendedor", "consultor@arca.example", "/vendedor", "ven1"],
    ["fornecedor", "vendas@fornecedor.example", "/fornecedor", "for1"],
    ["orgao", "compras@prefeitura.gov.br", "/orgao", "org1"],
  ] as const)("%s entra e vai para %s", async (perfil, email, destino, id) => {
    const r = await tentar({ email, senha: SENHA[perfil] });
    expect(r.destino).toBe(destino);
    expect(d.sessao[perfil]).toHaveBeenCalledTimes(1);
    expect(d.sessao[perfil]).toHaveBeenCalledWith(id);
    expect(totalDeSessoes()).toBe(1);
    expect(d.registrarAuditoria).toHaveBeenCalledWith({ ator: `${perfil}:${id}`, acao: `${perfil}.login` });
  });

  it("acha o e-mail sem diferença de maiúsculas e com espaços nas pontas", async () => {
    const r = await tentar({ email: "  COMPRAS@prefeitura.GOV.br ", senha: SENHA.orgao });
    expect(r.destino).toBe("/orgao");
    expect(d.sessao.orgao).toHaveBeenCalledWith("org1");
  });

  it("e-mail ou senha em branco: pede os dois, sem consultar nada", async () => {
    const casos: Record<string, string>[] = [{ email: "", senha: "x" }, { email: "a@b.co", senha: "" }, {}];
    for (const campos of casos) {
      const r = await tentar(campos);
      expect(r.estado).toStrictEqual({ erro: "Informe e-mail e senha." });
    }
    expect(d.verificarSenha).not.toHaveBeenCalled();
    expect(d.tentativas.size).toBe(0);
  });
});

describe("anti-enumeração: a mesma resposta para tudo que não deixa entrar", () => {
  const generica = { erro: MENSAGEM_ENTRADA_INVALIDA };

  it("a mensagem pedida", () => {
    expect(MENSAGEM_ENTRADA_INVALIDA).toBe("E-mail ou senha incorretos.");
  });

  it.each([
    ["e-mail inexistente", () => ({ email: "ninguem@nada.example", senha: "qualquer-coisa-1" })],
    ["administrador com senha errada", () => ({ email: "equipe@arca.example", senha: "errada-1234" })],
    ["consultor com senha errada", () => ({ email: "consultor@arca.example", senha: "errada-1234" })],
    ["fornecedor com senha errada", () => ({ email: "vendas@fornecedor.example", senha: "errada-1234" })],
    ["órgão com senha errada", () => ({ email: "compras@prefeitura.gov.br", senha: "errada-1234" })],
    [
      "consultor inativo, com a senha certa",
      () => {
        d.contas.vendedor[0].ativo = false;
        return { email: "consultor@arca.example", senha: SENHA.vendedor };
      },
    ],
    [
      "fornecedor inativo, com a senha certa",
      () => {
        d.contas.fornecedor[0].ativo = false;
        return { email: "vendas@fornecedor.example", senha: SENHA.fornecedor };
      },
    ],
    [
      "órgão inativo, com a senha certa",
      () => {
        d.contas.orgao[0].ativo = false;
        return { email: "compras@prefeitura.gov.br", senha: SENHA.orgao };
      },
    ],
    [
      "fornecedor sem senha cadastrada",
      () => {
        d.contas.fornecedor[0].senhaHash = null;
        return { email: "vendas@fornecedor.example", senha: "alguma-senha-1" };
      },
    ],
    [
      "órgão sem senha cadastrada",
      () => {
        d.contas.orgao[0].senhaHash = null;
        return { email: "compras@prefeitura.gov.br", senha: "alguma-senha-1" };
      },
    ],
  ])("%s: exatamente a mesma resposta, sem sessão", async (_caso, preparar) => {
    const r = await tentar(preparar());
    expect(r.destino).toBeNull();
    expect(r.estado).toStrictEqual(generica);
    expect(totalDeSessoes()).toBe(0);
  });

  it("senha certa de conta inativa não revela nada, nem lista perfis", async () => {
    d.contas.orgao[0].ativo = false;
    const inativa = await tentar({ email: "compras@prefeitura.gov.br", senha: SENHA.orgao });
    const inexistente = await tentar({ email: "outro@prefeitura.gov.br", senha: SENHA.orgao });
    expect(inativa).toStrictEqual(inexistente);
  });

  it("e-mail existente com senha errada e e-mail inexistente: respostas idênticas, e o mesmo gasto de hash", async () => {
    const existente = await tentar({ email: "vendas@fornecedor.example", senha: "errada-1234" });
    const gastoExistente = d.verificarSenha.mock.calls.length + d.gastarTempoDeHash.mock.calls.length;
    vi.clearAllMocks();
    d.verificarSenha.mockImplementation(async (senha: string, h: string) => h === hash(senha));

    const inexistente = await tentar({ email: "nao-existe@fornecedor.example", senha: "errada-1234" });
    const gastoInexistente = d.verificarSenha.mock.calls.length + d.gastarTempoDeHash.mock.calls.length;

    expect(existente).toStrictEqual(inexistente);
    expect(Object.keys(existente.estado ?? {})).toStrictEqual(["erro"]);
    expect(gastoExistente).toBe(1);
    expect(gastoInexistente).toBe(1);
  });

  it("sem nenhuma conta: faz a comparação de hash falsa com a senha enviada", async () => {
    await tentar({ email: "ninguem@nada.example", senha: "senha-enviada-1" });
    expect(d.gastarTempoDeHash).toHaveBeenCalledTimes(1);
    expect(d.gastarTempoDeHash).toHaveBeenCalledWith("senha-enviada-1");
    expect(d.verificarSenha).not.toHaveBeenCalled();
  });

  it("e-mail em mais de um perfil com senha errada: a resposta também é a mesma, sem lista de perfis", async () => {
    d.contas.orgao[0].email = "equipe@arca.example";
    d.contas.orgao[0].senhaHash = hash(SENHA.admin);
    const multi = await tentar({ email: "equipe@arca.example", senha: "errada-1234" });
    const inexistente = await tentar({ email: "ninguem@nada.example", senha: "errada-1234" });
    expect(multi).toStrictEqual(inexistente);
    expect(multi.estado).toStrictEqual(generica);
  });

  it("o pedido do código do autenticador não aparece para senha errada nem para e-mail inexistente", async () => {
    d.contas.admin[0].totpAtivo = true;
    d.contas.admin[0].totpSegredo = cifrarSegredo(gerarSegredoTotp());

    const casos: Record<string, string>[] = [
      { email: "equipe@arca.example", senha: "errada-1234" },
      { email: "equipe@arca.example", senha: "errada-1234", codigo: "123456" },
      { email: "ninguem@nada.example", senha: "errada-1234", codigo: "123456" },
    ];
    for (const campos of casos) {
      const r = await tentar(campos);
      expect(r.estado).toStrictEqual(generica);
    }
  });

  it("e-mail gigante: a chave do limite não cresce junto", async () => {
    await tentar({ email: `${"a".repeat(5000)}@x.example`, senha: "qualquer-1" });
    const chaves = [...d.tentativas.keys()];
    expect(chaves.length).toBeGreaterThan(0);
    expect(Math.max(...chaves.map((c) => c.length))).toBeLessThan(300);
  });
});

describe("auditoria continua como antes", () => {
  it("senha errada de conta que existe é auditada como <perfil>.login_falhou", async () => {
    await tentar({ email: "equipe@arca.example", senha: "errada-1234" });
    await tentar({ email: "consultor@arca.example", senha: "errada-1234" });
    await tentar({ email: "vendas@fornecedor.example", senha: "errada-1234" });
    await tentar({ email: "compras@prefeitura.gov.br", senha: "errada-1234" });
    expect(d.registrarAuditoria.mock.calls.map((c) => c[0])).toStrictEqual([
      { ator: "admin:adm1", acao: "admin.login_falhou" },
      { ator: "vendedor:ven1", acao: "vendedor.login_falhou" },
      { ator: "fornecedor:for1", acao: "fornecedor.login_falhou" },
      { ator: "orgao:org1", acao: "orgao.login_falhou" },
    ]);
  });

  it("e-mail em dois perfis, senha errada em ambos: audita as duas contas", async () => {
    d.contas.orgao[0].email = "equipe@arca.example";
    await tentar({ email: "equipe@arca.example", senha: "errada-1234" });
    expect(d.registrarAuditoria.mock.calls.map((c) => c[0])).toStrictEqual([
      { ator: "admin:adm1", acao: "admin.login_falhou" },
      { ator: "orgao:org1", acao: "orgao.login_falhou" },
    ]);
  });

  it("e-mail inexistente não gera auditoria de conta nenhuma", async () => {
    await tentar({ email: "ninguem@nada.example", senha: "errada-1234" });
    expect(d.registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("limite de tentativas", () => {
  async function errar(email: string, vezes: number) {
    for (let i = 0; i < vezes; i++) await tentar({ email, senha: `errada-${i}` });
  }

  it("5 senhas erradas bloqueiam a conta: a 6ª é recusada mesmo com a senha certa", async () => {
    await errar("vendas@fornecedor.example", 5);
    const r = await tentar({ email: "vendas@fornecedor.example", senha: SENHA.fornecedor });
    expect(r.destino).toBeNull();
    expect(r.estado).toStrictEqual({ erro: MENSAGEM_BLOQUEIO });
    expect(totalDeSessoes()).toBe(0);
  });

  it("e-mail inexistente também é limitado pela chave do e-mail normalizado, com a mesma mensagem", async () => {
    await errar("existe@nada.example", 4);
    expect(await tentar({ email: "  EXISTE@nada.example ", senha: "x-1" })).toStrictEqual({
      destino: null,
      estado: { erro: MENSAGEM_ENTRADA_INVALIDA },
    });
    expect(d.tentativas.has("login:entrar:existe@nada.example")).toBe(true);
    // a 5ª falha bloqueou: agora qualquer envio recebe o bloqueio, igual ao de e-mail com conta
    const bloqueado = await tentar({ email: "existe@nada.example", senha: "x-2" });
    expect(bloqueado.estado).toStrictEqual({ erro: MENSAGEM_BLOQUEIO });
  });

  it("e-mail que existe e e-mail que não existe bloqueiam depois do mesmo número de erros e dizem o mesmo", async () => {
    const respostas: string[] = [];
    for (const email of ["compras@prefeitura.gov.br", "fantasma@prefeitura.gov.br"]) {
      d.ip.valor = email.startsWith("compras") ? "198.51.100.1" : "198.51.100.2";
      const sequencia: (string | undefined)[] = [];
      for (let i = 0; i < 7; i++) sequencia.push((await tentar({ email, senha: `errada-${i}` })).estado?.erro);
      respostas.push(JSON.stringify(sequencia));
    }
    expect(respostas[0]).toBe(respostas[1]);
    expect(JSON.parse(respostas[0]).slice(0, 5)).toStrictEqual(Array(5).fill(MENSAGEM_ENTRADA_INVALIDA));
    expect(JSON.parse(respostas[0]).slice(5)).toStrictEqual([MENSAGEM_BLOQUEIO, MENSAGEM_BLOQUEIO]);
  });

  it("conta inativa conta como e-mail sem conta (mesma chave, mesmo bloqueio)", async () => {
    d.contas.vendedor[0].ativo = false;
    await errar("consultor@arca.example", 5);
    expect(d.tentativas.get("login:entrar:consultor@arca.example")?.tentativas).toBe(5);
    const r = await tentar({ email: "consultor@arca.example", senha: SENHA.vendedor });
    expect(r.estado).toStrictEqual({ erro: MENSAGEM_BLOQUEIO });
    expect(totalDeSessoes()).toBe(0);
  });

  it("IP bloqueado: e-mail que existe e e-mail que não existe recebem o mesmo bloqueio, sem conferir senha", async () => {
    d.tentativas.set(IP_CHAVE, {
      chave: IP_CHAVE,
      tentativas: 30,
      janelaInicio: new Date(),
      bloqueadoAte: new Date(Date.now() + 15 * 60 * 1000),
    });
    const existente = await tentar({ email: "equipe@arca.example", senha: SENHA.admin });
    const inexistente = await tentar({ email: "ninguem@nada.example", senha: SENHA.admin });
    expect(existente).toStrictEqual(inexistente);
    expect(existente.estado).toStrictEqual({ erro: MENSAGEM_BLOQUEIO });
    expect(d.verificarSenha).not.toHaveBeenCalled();
    expect(totalDeSessoes()).toBe(0);
  });

  it("cada envio errado conta uma falha no IP, em qualquer caminho (nunca em dobro)", async () => {
    // e-mail sem conta
    await tentar({ email: "ninguem@nada.example", senha: "errada-1" });
    expect(d.tentativas.get(IP_CHAVE)?.tentativas).toBe(1);
    // conta única
    await tentar({ email: "vendas@fornecedor.example", senha: "errada-1" });
    expect(d.tentativas.get(IP_CHAVE)?.tentativas).toBe(2);
    expect(d.tentativas.get("login:fornecedor:vendas@fornecedor.example")?.tentativas).toBe(1);
    // e-mail em dois perfis: uma falha por conta, uma só no IP
    d.contas.orgao[0].email = "equipe@arca.example";
    await tentar({ email: "equipe@arca.example", senha: "errada-1" });
    expect(d.tentativas.get(IP_CHAVE)?.tentativas).toBe(3);
    expect(d.tentativas.get("login:admin:equipe@arca.example")?.tentativas).toBe(1);
    expect(d.tentativas.get("login:orgao:equipe@arca.example")?.tentativas).toBe(1);
    expect(d.tentativas.has("login:entrar:equipe@arca.example")).toBe(false);
  });

  it("e-mail em dois perfis usa o mesmo contador por conta do login do perfil (5 erros bloqueiam, sem dobrar o limite)", async () => {
    d.contas.orgao[0].email = "equipe@arca.example";
    d.contas.orgao[0].senhaHash = hash(SENHA.admin);
    // 2 erros pelo caminho de conferência de todos os perfis...
    await errar("equipe@arca.example", 2);
    // ...e 3 escolhendo o perfil: o contador da conta é o mesmo, então o 5º erro bloqueia
    for (let i = 0; i < 3; i++) {
      await tentar({ email: "equipe@arca.example", senha: `errada-${i}`, perfil: "admin" });
    }
    const r = await tentar({ email: "equipe@arca.example", senha: SENHA.admin });
    expect(r.estado).toStrictEqual({ erro: MENSAGEM_BLOQUEIO });
    expect(totalDeSessoes()).toBe(0);
  });

  it("entrar com sucesso zera as falhas da conta", async () => {
    await errar("vendas@fornecedor.example", 3);
    expect(d.tentativas.has("login:fornecedor:vendas@fornecedor.example")).toBe(true);
    const r = await tentar({ email: "vendas@fornecedor.example", senha: SENHA.fornecedor });
    expect(r.destino).toBe("/fornecedor");
    expect(d.tentativas.has("login:fornecedor:vendas@fornecedor.example")).toBe(false);
  });

  it("a mensagem de bloqueio é reconhecida pelo prefixo que a entrada única repassa", () => {
    expect(ehMensagemDeBloqueio(mensagemBloqueio(new Date(Date.now() + 14 * 60 * 1000)))).toBe(true);
    expect(ehMensagemDeBloqueio(MENSAGEM_ENTRADA_INVALIDA)).toBe(false);
    expect(ehMensagemDeBloqueio(undefined)).toBe(false);
  });
});

describe("e-mail em mais de um perfil", () => {
  const EMAIL = "pessoa@arca.example";

  beforeEach(() => {
    // a mesma pessoa é administradora, consultora (outra senha) e órgão (mesma senha da administração)
    d.contas.admin[0].email = EMAIL;
    d.contas.vendedor[0].email = EMAIL;
    d.contas.vendedor[0].senhaHash = hash("OutraSenha#2026");
    d.contas.orgao[0].email = EMAIL;
    d.contas.orgao[0].senhaHash = hash(SENHA.admin);
  });

  it("pede a escolha e lista só os perfis em que a senha serviu", async () => {
    const r = await tentar({ email: EMAIL, senha: SENHA.admin });
    expect(r.destino).toBeNull();
    expect(r.estado).toStrictEqual({
      escolher: [
        { perfil: "admin", rotulo: "Administração" },
        { perfil: "orgao", rotulo: "Órgão público" },
      ],
    });
    expect(totalDeSessoes()).toBe(0);
    expect(d.tentativas.size).toBe(0);
  });

  it("se a senha serve em um perfil só, entra direto nele", async () => {
    const r = await tentar({ email: EMAIL, senha: "OutraSenha#2026" });
    expect(r.destino).toBe("/vendedor");
    expect(d.sessao.vendedor).toHaveBeenCalledWith("ven1");
    expect(totalDeSessoes()).toBe(1);
  });

  it("segunda etapa: entra no perfil escolhido", async () => {
    const admin = await tentar({ email: EMAIL, senha: SENHA.admin, perfil: "admin" });
    expect(admin.destino).toBe("/admin");
    expect(d.sessao.admin).toHaveBeenCalledWith("adm1");

    const orgao = await tentar({ email: EMAIL, senha: SENHA.admin, perfil: "orgao" });
    expect(orgao.destino).toBe("/orgao");
    expect(d.sessao.orgao).toHaveBeenCalledWith("org1");
    expect(totalDeSessoes()).toBe(2);
  });

  it("escolher um perfil em que a senha não serve é recusado como senha errada", async () => {
    const r = await tentar({ email: EMAIL, senha: SENHA.admin, perfil: "vendedor" });
    expect(r.estado).toStrictEqual({ erro: MENSAGEM_ENTRADA_INVALIDA });
    expect(totalDeSessoes()).toBe(0);
    expect(d.tentativas.get("login:vendedor:pessoa@arca.example")?.tentativas).toBe(1);
  });

  it("perfil escolhido que o e-mail não tem, ou valor inventado, é ignorado", async () => {
    for (const perfil of ["fornecedor", "root", "", "ADMIN"]) {
      const r = await tentar({ email: EMAIL, senha: SENHA.admin, perfil });
      expect(r.destino).toBeNull();
      expect(r.estado?.escolher?.map((o) => o.perfil)).toStrictEqual(["admin", "orgao"]);
    }
    expect(totalDeSessoes()).toBe(0);
  });

  it("perfil inativo não entra na lista: a senha serve só em um e a entrada é direta", async () => {
    d.contas.orgao[0].ativo = false;
    const r = await tentar({ email: EMAIL, senha: SENHA.admin });
    expect(r.destino).toBe("/admin");
  });

  it("o destino da ata vale para o órgão escolhido", async () => {
    const r = await tentar({ email: EMAIL, senha: SENHA.admin, perfil: "orgao", destino: ATA });
    expect(r.destino).toBe(ATA);
  });

  it("administrador com autenticador: escolher o perfil não dispensa o código", async () => {
    const segredo = gerarSegredoTotp();
    d.contas.admin[0].totpAtivo = true;
    d.contas.admin[0].totpSegredo = cifrarSegredo(segredo);

    const lista = await tentar({ email: EMAIL, senha: SENHA.admin });
    expect(lista.estado?.exigeCodigo).toBeUndefined();
    expect(lista.estado?.erro).toBeUndefined();
    expect(lista.estado?.escolher).toHaveLength(2);

    const semCodigo = await tentar({ email: EMAIL, senha: SENHA.admin, perfil: "admin" });
    expect(semCodigo.estado).toStrictEqual({ erro: MENSAGEM_CODIGO_PEDIDO, exigeCodigo: true });
    expect(totalDeSessoes()).toBe(0);

    const comCodigo = await tentar({
      email: EMAIL,
      senha: SENHA.admin,
      perfil: "admin",
      codigo: codigoTotp(segredo, passoAtual()),
    });
    expect(comCodigo.destino).toBe("/admin");
  });
});

describe("administrador com autenticador (2FA)", () => {
  const EMAIL = "equipe@arca.example";
  let segredo: string;

  beforeEach(() => {
    segredo = gerarSegredoTotp();
    d.contas.admin[0].totpAtivo = true;
    d.contas.admin[0].totpSegredo = cifrarSegredo(segredo);
    d.contas.admin[0].totpUltimoPasso = null;
  });

  it("senha certa sem código: pede o código, sem sessão e sem contar falha", async () => {
    const r = await tentar({ email: EMAIL, senha: SENHA.admin });
    expect(r.destino).toBeNull();
    expect(r.estado).toStrictEqual({ erro: MENSAGEM_CODIGO_PEDIDO, exigeCodigo: true });
    expect(totalDeSessoes()).toBe(0);
    expect(d.tentativas.size).toBe(0);
  });

  it("senha certa e código certo: entra em /admin e grava o passo usado", async () => {
    const passo = passoAtual();
    const r = await tentar({ email: EMAIL, senha: SENHA.admin, codigo: codigoTotp(segredo, passo) });
    expect(r.destino).toBe("/admin");
    expect(d.sessao.admin).toHaveBeenCalledWith("adm1");
    expect(d.adminUpdate).toHaveBeenCalledWith({ where: { id: "adm1" }, data: { totpUltimoPasso: passo } });
  });

  it("código errado: recusa, conta falha no login do administrador e audita", async () => {
    const r = await tentar({ email: EMAIL, senha: SENHA.admin, codigo: "000000" });
    expect(r.estado).toStrictEqual({ erro: MENSAGEM_CODIGO_INVALIDO, exigeCodigo: true });
    expect(totalDeSessoes()).toBe(0);
    expect(d.tentativas.get(`login:admin:${EMAIL}`)?.tentativas).toBe(1);
    expect(d.registrarAuditoria).toHaveBeenCalledWith({ ator: "admin:adm1", acao: "admin.login_2fa_falhou" });
  });

  it("código já usado não vale de novo", async () => {
    const passo = passoAtual();
    d.contas.admin[0].totpUltimoPasso = passo;
    const r = await tentar({ email: EMAIL, senha: SENHA.admin, codigo: codigoTotp(segredo, passo) });
    expect(r.estado).toStrictEqual({ erro: MENSAGEM_CODIGO_INVALIDO, exigeCodigo: true });
    expect(totalDeSessoes()).toBe(0);
  });

  it("errar o código 5 vezes bloqueia, e o bloqueio também é a mensagem comum", async () => {
    for (let i = 0; i < 5; i++) await tentar({ email: EMAIL, senha: SENHA.admin, codigo: "000000" });
    const r = await tentar({ email: EMAIL, senha: SENHA.admin, codigo: codigoTotp(segredo, passoAtual()) });
    expect(r.estado).toStrictEqual({ erro: MENSAGEM_BLOQUEIO });
    expect(totalDeSessoes()).toBe(0);
  });

  it("quem não é administrador pode mandar código sem efeito nenhum", async () => {
    const r = await tentar({ email: "compras@prefeitura.gov.br", senha: SENHA.orgao, codigo: "123456" });
    expect(r.destino).toBe("/orgao");
  });

  it("administrador sem autenticador ativo entra mesmo com o campo do código vazio ou cheio", async () => {
    d.contas.admin[0].totpAtivo = false;
    d.contas.admin[0].totpSegredo = null;
    expect((await tentar({ email: EMAIL, senha: SENHA.admin })).destino).toBe("/admin");
    expect((await tentar({ email: EMAIL, senha: SENHA.admin, codigo: "123456" })).destino).toBe("/admin");
  });
});

describe("destino depois do login", () => {
  const entrarOrgao = (destino: string) =>
    tentar({ email: "compras@prefeitura.gov.br", senha: SENHA.orgao, destino });

  it("órgão que veio de uma ata volta para a ata", async () => {
    expect((await entrarOrgao(ATA)).destino).toBe(ATA);
  });

  it("órgão com caminho da própria área vai para ele", async () => {
    expect((await entrarOrgao("/orgao/pedidos")).destino).toBe("/orgao/pedidos");
  });

  it.each([
    "https://evil.example/phishing",
    "http://evil.example",
    "//evil.example",
    "///evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "/admin",
    "/vendedor",
    "/fornecedor",
    "/orgao/../admin",
    "/orgao//x",
    "/catalogo/curto",
    "/catalogo/abcdefghij12345/../../admin",
    "evil.example",
    "",
  ])("destino %j é ignorado: o órgão vai para /orgao", async (destino) => {
    expect((await entrarOrgao(destino)).destino).toBe("/orgao");
  });

  it.each([
    ["admin", "equipe@arca.example", "/admin"],
    ["vendedor", "consultor@arca.example", "/vendedor"],
    ["fornecedor", "vendas@fornecedor.example", "/fornecedor"],
  ] as const)("o destino só vale para órgão: %s ignora até um destino válido", async (perfil, email, esperado) => {
    for (const destino of [ATA, "/orgao/pedidos", "https://evil.example"]) {
      d.sessao[perfil].mockClear();
      const r = await tentar({ email, senha: SENHA[perfil], destino });
      expect(r.destino).toBe(esperado);
    }
  });
});
