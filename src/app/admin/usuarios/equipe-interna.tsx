"use client";

import { useActionState, useState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Secao } from "@/components/ui/secao";
import { PERFIS, PERMISSOES, ROTULO_PERMISSAO, normalizarPermissoes, type Permissao } from "@/lib/permissoes";
import { AvisoSenhaProvisoria, BotaoRedefinirSenha } from "./redefinir-senha";
import {
  alternarAtivoMembro,
  atualizarMembroEquipe,
  criarMembroEquipe,
  excluirMembroEquipe,
  type EstadoEquipe,
} from "./equipe-actions";

const estadoInicial: EstadoEquipe = {};

export interface MembroEquipe {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  ativo: boolean;
  permissoes: string[];
  totpAtivo: boolean;
  acessoFinanceiro: boolean;
}

/** Caixas de seleção das permissões; o conjunto marcado é o que vale para a conta. */
function ListaPermissoes({
  marcadas,
  aoMudar,
}: {
  marcadas: readonly Permissao[];
  aoMudar: (proximas: Permissao[]) => void;
}) {
  return (
    <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <legend className="rotulo-campo">Permissões</legend>
      {PERMISSOES.map((p) => {
        const ligada = marcadas.includes(p.chave);
        return (
          <label key={p.chave} className="flex items-start gap-2 text-[13px] leading-snug">
            <input
              type="checkbox"
              name="permissao"
              value={p.chave}
              checked={ligada}
              onChange={() =>
                aoMudar(ligada ? marcadas.filter((c) => c !== p.chave) : normalizarPermissoes([...marcadas, p.chave]))
              }
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold">{p.rotulo}</span>
              {p.atividades.length > 0 && (
                <span style={{ color: "var(--cor-texto-3)" }}> · atividade {p.atividades.join(", ")}</span>
              )}
              <br />
              <span style={{ color: "var(--cor-texto-2)" }}>{p.descricao}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function FormularioNovoMembro() {
  const [estado, formAction, pendente] = useActionState(criarMembroEquipe, estadoInicial);
  const [perfil, setPerfil] = useState("");
  const [marcadas, setMarcadas] = useState<Permissao[]>([]);

  function escolherPerfil(chave: string) {
    setPerfil(chave);
    const pronto = PERFIS.find((p) => p.chave === chave);
    if (pronto) setMarcadas(normalizarPermissoes(pronto.permissoes));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo label="Nome" name="nome" required />
        <Campo label="E-mail" name="email" type="email" required />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo label="Senha provisória (deixe em branco para o sistema gerar)" name="senha" type="password" />
        <Campo label="Cargo (aparece na tela)" name="cargo" />
      </div>
      <label className="block">
        <span className="rotulo-campo">Perfil pronto (preenche as permissões abaixo)</span>
        <select
          name="perfil"
          className="campo-atas"
          value={perfil}
          onChange={(e) => escolherPerfil(e.target.value)}
        >
          <option value="">Personalizado</option>
          {PERFIS.map((p) => (
            <option key={p.chave} value={p.chave}>
              {p.rotulo}
            </option>
          ))}
        </select>
      </label>
      <ListaPermissoes marcadas={marcadas} aoMudar={setMarcadas} />

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.ok && !estado.senhaProvisoria && <Aviso tom="atencao">Conta criada. A pessoa troca a senha no primeiro acesso.</Aviso>}
      {estado.senhaProvisoria && <AvisoSenhaProvisoria senha={estado.senhaProvisoria} />}

      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Salvando..." : "Criar conta da equipe"}
      </button>
    </form>
  );
}

function EditarMembro({ membro }: { membro: MembroEquipe }) {
  const [estado, formAction, pendente] = useActionState(atualizarMembroEquipe, estadoInicial);
  const [marcadas, setMarcadas] = useState<Permissao[]>(normalizarPermissoes(membro.permissoes));

  return (
    <details>
      <summary className="botao-atas secundario pequeno cursor-pointer list-none">Editar</summary>
      <form action={formAction} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="adminId" value={membro.id} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Nome" name="nome" required defaultValue={membro.nome} />
          <Campo label="E-mail" name="email" type="email" required defaultValue={membro.email} />
        </div>
        <Campo label="Cargo" name="cargo" defaultValue={membro.cargo ?? ""} />
        <ListaPermissoes marcadas={marcadas} aoMudar={setMarcadas} />
        {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
        {estado.ok && <Aviso tom="atencao">Dados salvos.</Aviso>}
        <button type="submit" disabled={pendente} className="botao-atas pequeno self-start">
          {pendente ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </details>
  );
}

function BotaoAtivo({ membro, ehVoce }: { membro: MembroEquipe; ehVoce: boolean }) {
  const [estado, formAction, pendente] = useActionState(alternarAtivoMembro, estadoInicial);
  if (ehVoce) return null;
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="adminId" value={membro.id} />
      <button type="submit" disabled={pendente} className={`botao-atas pequeno ${membro.ativo ? "critico" : ""}`}>
        {membro.ativo ? "Desativar" : "Reativar"}
      </button>
      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
    </form>
  );
}

/** Excluir a conta da equipe, em definitivo (nunca a própria). Para quem já trabalhou no sistema, desativar costuma ser melhor. */
function BotaoExcluirMembro({ membro, ehVoce }: { membro: MembroEquipe; ehVoce: boolean }) {
  const [estado, formAction, pendente] = useActionState(excluirMembroEquipe, estadoInicial);
  if (ehVoce) return null;
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="adminId" value={membro.id} />
      <button
        type="submit"
        disabled={pendente}
        className="botao-atas critico pequeno"
        onClick={(e) => {
          if (!window.confirm(`Excluir a conta de ${membro.nome} em definitivo? Isso não pode ser desfeito. Para só impedir o acesso, use Desativar.`)) {
            e.preventDefault();
          }
        }}
      >
        {pendente ? "Excluindo..." : "Excluir"}
      </button>
      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
    </form>
  );
}

export function EquipeInterna({ membros, adminLogadoId }: { membros: MembroEquipe[]; adminLogadoId: string }) {
  return (
    <>
      <Secao
        titulo={`Equipe interna (${membros.length})`}
        descricao="Cada pessoa vê e faz só o que as permissões dela permitem. O acesso ao financeiro da SCP é concedido à parte, por script, com 2FA."
      >
        <ul className="lista-linhas">
          {membros.map((m) => {
            const permissoes = normalizarPermissoes(m.permissoes);
            return (
              <li key={m.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="titulo-linha">
                      {m.nome}
                      {m.id === adminLogadoId && <span style={{ color: "var(--cor-texto-3)" }}> (você)</span>}
                    </p>
                    <p className="text-[13px]" style={{ color: "var(--cor-texto-2)" }}>
                      {m.email}
                      {m.cargo ? ` · ${m.cargo}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!m.ativo && <Badge tom="alerta">Desativada</Badge>}
                    {m.totpAtivo && <Badge tom="neutro">2FA</Badge>}
                    {m.acessoFinanceiro && <Badge tom="marca">Financeiro SCP</Badge>}
                    <BotaoAtivo membro={m} ehVoce={m.id === adminLogadoId} />
                    <BotaoExcluirMembro membro={m} ehVoce={m.id === adminLogadoId} />
                  </div>
                </div>
                <p className="text-[13px]" style={{ color: "var(--cor-texto-2)" }}>
                  {permissoes.length === 0
                    ? "Sem permissões: só olha o painel."
                    : permissoes.map((c) => ROTULO_PERMISSAO[c]).join(" · ")}
                </p>
                <EditarMembro key={`${m.id}-${permissoes.join(",")}`} membro={m} />
                {m.id !== adminLogadoId && <BotaoRedefinirSenha tipo="admin" id={m.id} />}
              </li>
            );
          })}
        </ul>
      </Secao>

      <Secao titulo="Nova conta da equipe">
        <FormularioNovoMembro />
      </Secao>
    </>
  );
}

function Campo({
  label,
  name,
  required,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="rotulo-campo">{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue} className="campo-atas" />
    </label>
  );
}
