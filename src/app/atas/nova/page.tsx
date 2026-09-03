"use client";

import { useActionState } from "react";
import { cadastrarAta, type EstadoCadastroAta } from "../actions";

const estadoInicial: EstadoCadastroAta = {};

export default function NovaAtaPage() {
  const [estado, formAction, pendente] = useActionState(cadastrarAta, estadoInicial);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Cadastrar ata</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Cadastro simples do Sprint 1 — ata, fornecedor, órgão gerenciador e um item.
      </p>

      <form action={formAction} className="mt-8 space-y-8">
        <fieldset className="space-y-4">
          <legend className="text-lg font-medium">Fornecedor</legend>
          <Campo label="Razão social" name="fornecedorRazaoSocial" required />
          <Campo label="CNPJ" name="fornecedorCnpj" required />
          <Campo label="E-mail" name="fornecedorEmail" type="email" required />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-medium">Órgão gerenciador</legend>
          <Campo label="Nome" name="orgaoNome" required />
          <Campo label="CNPJ" name="orgaoCnpj" required />
          <div className="grid grid-cols-2 gap-4">
            <Campo label="UF" name="orgaoUf" required />
            <Campo label="Município" name="orgaoMunicipio" required />
          </div>
          <Campo label="Esfera (federal/estadual/municipal)" name="orgaoEsfera" required />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-medium">Ata</legend>
          <Campo label="Número" name="numero" required />
          <Campo label="Objeto" name="objeto" required />
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Data de assinatura" name="dataAssinatura" type="date" required />
            <Campo label="Vigência até" name="dataVigenciaFim" type="date" required />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-medium">Item</legend>
          <Campo label="Descrição" name="itemDescricao" required />
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Categoria" name="itemCategoria" required />
            <Campo label="Unidade" name="itemUnidade" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Campo
              label="Quantidade registrada"
              name="itemQuantidade"
              type="number"
              min="1"
              required
            />
            <Campo
              label="Valor unitário (R$)"
              name="itemValorUnitario"
              type="number"
              step="0.01"
              min="0"
              required
            />
          </div>
        </fieldset>

        {estado.erro && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{estado.erro}</p>
        )}

        <button
          type="submit"
          disabled={pendente}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pendente ? "Salvando..." : "Cadastrar ata"}
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
  min,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-800">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        step={step}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />
    </label>
  );
}
