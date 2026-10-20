"use client";

import { useActionState } from "react";
import { Secao } from "@/components/ui/secao";
import {
  confirmarAtivacaoTotp,
  desativarTotp,
  iniciarAtivacaoTotp,
  type EstadoTotp,
} from "../actions";

const estadoInicial: EstadoTotp = {};

/**
 * Painel do 2FA (app autenticador) no perfil do admin. Sem 2FA: botão
 * "Ativar" mostra o segredo e pede um código para confirmar. Com 2FA:
 * formulário para desativar (senha + código).
 */
export function FormularioTotp({ ativo }: { ativo: boolean }) {
  return (
    <Secao titulo="Verificação em duas etapas (2FA)">
      {ativo ? <Desativar /> : <Ativar />}
    </Secao>
  );
}

function Ativar() {
  const [inicio, iniciar, iniciando] = useActionState(iniciarAtivacaoTotp, estadoInicial);
  const [confirmacao, confirmar, confirmando] = useActionState(
    confirmarAtivacaoTotp,
    estadoInicial,
  );

  if (confirmacao.sucesso) {
    return <Aviso tipo="ok">2FA ativado. No próximo login será pedido o código do app.</Aviso>;
  }

  if (!inicio.segredo) {
    return (
      <form action={iniciar} className="flex flex-col gap-3">
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Protege o painel mesmo que a senha vaze: além da senha, o login passa a pedir um código
          de 6 dígitos de um app autenticador (Google Authenticator, Microsoft Authenticator,
          Authy…). Recomendado para todo administrador.
        </p>
        {inicio.erro && <Aviso tipo="erro">{inicio.erro}</Aviso>}
        <button type="submit" disabled={iniciando} className="botao-atas self-start">
          {iniciando ? "Gerando..." : "Ativar 2FA"}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol
        className="list-decimal space-y-2 pl-5 text-sm"
        style={{ color: "var(--cor-texto-2)" }}
      >
        <li>Abra o app autenticador e escolha “adicionar conta” → “inserir chave de configuração”.</li>
        <li>
          Digite a chave abaixo (tipo “baseado em tempo”). No celular, também dá para tocar em{" "}
          <a href={inicio.uri} className="underline">
            abrir direto no app
          </a>
          .
        </li>
        <li>Digite o código de 6 dígitos que o app mostrar e confirme.</li>
      </ol>

      <p
        className="select-all break-all rounded-[var(--raio)] border px-4 py-3 font-mono text-sm"
        style={{ borderColor: "var(--cor-borda)", color: "var(--cor-texto)" }}
      >
        {inicio.segredo}
      </p>

      <form action={confirmar} className="flex flex-col gap-3">
        <Campo label="Código de 6 dígitos" name="codigo" />
        {confirmacao.erro && <Aviso tipo="erro">{confirmacao.erro}</Aviso>}
        <button type="submit" disabled={confirmando} className="botao-atas self-start">
          {confirmando ? "Confirmando..." : "Confirmar e ativar"}
        </button>
      </form>
    </div>
  );
}

function Desativar() {
  const [estado, desativar, pendente] = useActionState(desativarTotp, estadoInicial);

  if (estado.sucesso) {
    return <Aviso tipo="ok">2FA desativado.</Aviso>;
  }

  return (
    <form action={desativar} className="flex flex-col gap-3">
      <Aviso tipo="ok">O 2FA está ativado nesta conta.</Aviso>
      <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
        Para desativar, confirme a senha atual e um código do app.
      </p>
      <Campo label="Senha atual" name="senha" type="password" />
      <Campo label="Código de 6 dígitos" name="codigo" />
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Desativando..." : "Desativar 2FA"}
      </button>
    </form>
  );
}

function Aviso({ tipo, children }: { tipo: "ok" | "erro"; children: React.ReactNode }) {
  const erro = tipo === "erro";
  return (
    <p
      className="rounded-[var(--raio)] border px-4 py-3 text-sm"
      style={{
        borderColor: erro ? "var(--cor-critico)" : "var(--cor-marca)",
        background: erro ? "var(--cor-critico-fundo)" : "var(--cor-marca-fundo)",
        color: erro ? "var(--cor-critico)" : "var(--cor-marca-clara)",
      }}
    >
      {children}
    </p>
  );
}

function Campo({
  label,
  name,
  type = "text",
}: {
  label: string;
  name: string;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
        {label}
      </span>
      <input
        name={name}
        type={type}
        required
        autoComplete={name === "codigo" ? "one-time-code" : undefined}
        inputMode={name === "codigo" ? "numeric" : undefined}
        className="campo-atas"
      />
    </label>
  );
}
