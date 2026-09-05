"use client";

import { useActionState } from "react";
import { criarPontoFocal, type EstadoPontoFocal } from "../../actions";
import { Secao } from "@/components/ui/secao";

const estadoInicial: EstadoPontoFocal = {};

export function FormularioNovoContato({ entidadeAlvoId }: { entidadeAlvoId: string }) {
  const [estado, formAction, pendente] = useActionState(criarPontoFocal, estadoInicial);

  return (
    <Secao titulo="Novo contato">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="entidadeAlvoId" value={entidadeAlvoId} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Campo label="Nome do contato" name="nomeContato" required />
          <Campo label="Cargo" name="cargo" required placeholder="Prefeito, Secretário..." />
          <Campo label="Área/pasta" name="area" placeholder="Saúde, Educação, Gabinete..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Telefone" name="telefone" />
          <Campo label="E-mail" name="email" type="email" />
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
            Particularidades
          </span>
          <textarea name="particularidades" rows={3} className="campo-atas" />
        </label>

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

        <button type="submit" disabled={pendente} className="botao-atas self-start">
          {pendente ? "Salvando..." : "Cadastrar contato"}
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
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
        {label}
      </span>
      <input name={name} type={type} required={required} placeholder={placeholder} className="campo-atas" />
    </label>
  );
}
