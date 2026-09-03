"use client";

import { useActionState } from "react";
import { loginFornecedor, type EstadoLoginFornecedor } from "../actions";

const estadoInicial: EstadoLoginFornecedor = {};

export default function LoginFornecedorPage() {
  const [estado, formAction, pendente] = useActionState(loginFornecedor, estadoInicial);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Painel do fornecedor</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Entre com o e-mail e a senha cadastrados na sua ata.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-800">E-mail</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-800">Senha</span>
          <input
            name="senha"
            type="password"
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </label>

        {estado.erro && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{estado.erro}</p>
        )}

        <button
          type="submit"
          disabled={pendente}
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pendente ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
