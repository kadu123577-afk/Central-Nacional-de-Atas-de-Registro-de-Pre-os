"use client";

import { useActionState } from "react";
import { cadastrarFornecedor, type EstadoLoginFornecedor } from "../actions";
import { Logo } from "@/components/ui/logo";

const estadoInicial: EstadoLoginFornecedor = {};

export default function CadastroFornecedorPage() {
  const [estado, formAction, pendente] = useActionState(cadastrarFornecedor, estadoInicial);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <div>
        <Logo altura={26} />
        <h1 className="marca mt-4 text-xl" style={{ color: "var(--cor-texto)" }}>
          Cadastro do fornecedor
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Crie uma conta para cadastrar suas atas e acompanhar pedidos de adesão.
        </p>
      </div>

      <form action={formAction} className="painel flex flex-col gap-4 p-5">
        <Campo label="Razão social" name="razaoSocial" required />
        <Campo label="CNPJ" name="cnpj" required />
        <Campo label="Telefone (opcional)" name="telefone" />
        <Campo label="E-mail" name="email" type="email" required />
        <Campo label="Senha (mín. 8 caracteres)" name="senha" type="password" required />

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

        <button type="submit" disabled={pendente} className="botao-atas w-full">
          {pendente ? "Criando..." : "Criar conta"}
        </button>
      </form>
    </main>
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
