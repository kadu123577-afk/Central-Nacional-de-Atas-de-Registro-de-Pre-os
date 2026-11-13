import { PERFIS, normalizarPermissoes, permissaoValida, type Permissao } from "@/lib/permissoes";
import { TIPOS_VENDEDOR, type TipoVendedor } from "@/lib/vendedores";

/**
 * Equipe inicial (14/11/2026): a lista das pessoas que recebem acesso na implantação, lida de um
 * arquivo JSON que NÃO fica no repositório (tem os e-mails reais). Regras puras: o script
 * prisma/seed-equipe.ts lê o arquivo e cria as contas. Cada pessoa é da equipe interna (painel,
 * com permissões por atividade) ou consultor de vendas.
 */
export interface ContaDaEquipe {
  tipo: "equipe";
  nome: string;
  email: string;
  cargo: string | null;
  permissoes: Permissao[];
}

export interface ContaDeConsultor {
  tipo: "consultor";
  nome: string;
  email: string;
  tipoVendedor: TipoVendedor;
}

export type ContaInicial = ContaDaEquipe | ContaDeConsultor;

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Valida a lista. Devolve as contas válidas e a lista de problemas (uma linha por problema, com o
 * número da pessoa); quem chama decide se para (o script para se houver qualquer problema, para não
 * criar metade da equipe).
 *
 * Cada pessoa da equipe interna traz `permissoes` (lista de chaves) ou `perfil` (um dos perfis
 * prontos); o consultor traz `tipo: "consultor"` e, opcionalmente, `tipoVendedor`.
 */
export function lerEquipeInicial(json: unknown): { contas: ContaInicial[]; problemas: string[] } {
  const problemas: string[] = [];
  const contas: ContaInicial[] = [];

  if (!Array.isArray(json) || json.length === 0) {
    return { contas, problemas: ["O arquivo precisa ser uma lista com ao menos uma pessoa."] };
  }

  const vistos = new Set<string>();
  json.forEach((bruto, i) => {
    const n = `Pessoa ${i + 1}`;
    if (typeof bruto !== "object" || bruto === null) {
      problemas.push(`${n}: não é um objeto.`);
      return;
    }
    const p = bruto as Record<string, unknown>;
    const nome = texto(p.nome);
    const email = texto(p.email).toLowerCase();

    if (!nome) problemas.push(`${n}: falta o nome.`);
    if (!FORMATO_EMAIL.test(email)) problemas.push(`${n} (${nome || "sem nome"}): e-mail inválido.`);
    if (email && vistos.has(email)) problemas.push(`${n} (${nome || "sem nome"}): e-mail repetido na lista.`);
    vistos.add(email);
    if (!nome || !FORMATO_EMAIL.test(email)) return;

    if (p.tipo === "consultor") {
      const tv = texto(p.tipoVendedor) || "interno";
      if (!(TIPOS_VENDEDOR as readonly string[]).includes(tv)) {
        problemas.push(`${n} (${nome}): tipoVendedor deve ser ${TIPOS_VENDEDOR.join(" ou ")}.`);
        return;
      }
      contas.push({ tipo: "consultor", nome, email, tipoVendedor: tv as TipoVendedor });
      return;
    }

    if (p.tipo !== undefined && p.tipo !== "equipe") {
      problemas.push(`${n} (${nome}): tipo deve ser "equipe" ou "consultor".`);
      return;
    }

    let permissoes: Permissao[] = [];
    if (Array.isArray(p.permissoes)) {
      const desconhecidas = p.permissoes.filter((c) => !permissaoValida(c));
      if (desconhecidas.length > 0) {
        problemas.push(`${n} (${nome}): permissão desconhecida: ${desconhecidas.map(String).join(", ")}.`);
        return;
      }
      permissoes = normalizarPermissoes(p.permissoes);
    } else if (typeof p.perfil === "string") {
      const perfil = PERFIS.find((x) => x.chave === p.perfil);
      if (!perfil) {
        problemas.push(`${n} (${nome}): perfil desconhecido (${p.perfil}).`);
        return;
      }
      permissoes = normalizarPermissoes(perfil.permissoes);
    } else {
      problemas.push(`${n} (${nome}): informe "permissoes" (lista) ou "perfil".`);
      return;
    }
    if (permissoes.length === 0) {
      problemas.push(`${n} (${nome}): sem nenhuma permissão a conta não faria nada.`);
      return;
    }

    contas.push({ tipo: "equipe", nome, email, cargo: texto(p.cargo) || null, permissoes });
  });

  return { contas, problemas };
}
