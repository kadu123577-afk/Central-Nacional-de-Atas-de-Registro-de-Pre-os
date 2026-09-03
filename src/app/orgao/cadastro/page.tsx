"use client";

import { useActionState } from "react";
import { cadastrarOrgao, type EstadoFormularioOrgao } from "../actions";

const estadoInicial: EstadoFormularioOrgao = {};

export default function CadastroOrgaoPage() {
  const [estado, formAction, pendente] = useActionState(cadastrarOrgao, estadoInicial);

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold">Cadastro do órgão comprador</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Crie uma conta para pedir adesão a itens do catálogo.
      </p>

      <form action={formAction} className="mt-8 space-y-4">
        <Campo label="Nome do órgão" name="nome" required />
        <Campo label="CNPJ" name="cnpj" required />
        <div className="grid grid-cols-2 gap-4">
          <Campo label="UF" name="uf" required />
          <Campo label="Município" name="municipio" required />
        </div>
        <Campo label="Esfera (federal/estadual/municipal)" name="esfera" required />
        <Campo label="E-mail" name="email" type="email" required />
        <Campo label="Senha (mín. 8 caracteres)" name="senha" type="password" required />

        {estado.erro && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{estado.erro}</p>
        )}

        <button
          type="submit"
          disabled={pendente}
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
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
      <span className="mb-1 block font-medium text-neutral-800">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />
    </label>
  );
}
