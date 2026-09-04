"use client";

import { useActionState } from "react";
import { Secao } from "@/components/ui/secao";

export interface EstadoTrocarSenha {
  erro?: string;
  sucesso?: boolean;
}

/** Formulário de troca de senha, reaproveitado por fornecedor/órgão/admin
 * — cada perfil passa sua própria server action, o formulário em si é
 * idêntico nos três. */
export function FormularioTrocarSenha({
  action,
}: {
  action: (estado: EstadoTrocarSenha, formData: FormData) => Promise<EstadoTrocarSenha>;
}) {
  const [estado, formAction, pendente] = useActionState(action, {});

  return (
    <Secao titulo="Trocar senha">
      <form action={formAction} className="flex flex-col gap-4">
        <Campo label="Senha atual" name="senhaAtual" type="password" required />
        <Campo label="Nova senha (mín. 8 caracteres)" name="senhaNova" type="password" required />
        <Campo
          label="Confirmar nova senha"
          name="confirmacaoSenhaNova"
          type="password"
          required
        />

        {estado.erro && (
          <p
            className="rounded-[var(--raio)] border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--cor-critico)",
              background: "var(--cor-critico-fundo)",
              color: "var(--cor-critico)",
            }}
          >
            {estado.erro}
          </p>
        )}
        {estado.sucesso && (
          <p
            className="rounded-[var(--raio)] border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--cor-marca)",
              background: "var(--cor-marca-fundo)",
              color: "var(--cor-marca-clara)",
            }}
          >
            Senha atualizada com sucesso.
          </p>
        )}

        <button type="submit" disabled={pendente} className="botao-atas self-start">
          {pendente ? "Salvando..." : "Trocar senha"}
        </button>
      </form>
    </Secao>
  );
}

function Campo({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
        {label}
      </span>
      <input name={name} type={type} required={required} className="campo-atas" />
    </label>
  );
}
