"use client";

import { useActionState } from "react";
import { cadastrarOrgao, type EstadoFormularioOrgao } from "../actions";
import { Logo } from "@/components/ui/logo";

const estadoInicial: EstadoFormularioOrgao = {};

export default function CadastroOrgaoPage() {
  const [estado, formAction, pendente] = useActionState(cadastrarOrgao, estadoInicial);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <div>
        <Logo altura={26} />
        <h1 className="marca mt-4 text-xl" style={{ color: "var(--cor-texto)" }}>
          Cadastro do órgão comprador
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Crie uma conta para pedir adesão a itens do catálogo.
        </p>
      </div>

      <form action={formAction} className="painel flex flex-col gap-4 p-5">
        <Campo label="Nome do órgão" name="nome" required />
        <Campo label="CNPJ" name="cnpj" required />
        <div className="grid grid-cols-2 gap-4 items-start">
          <Campo label="UF" name="uf" required />
          <Campo label="Município" name="municipio" required />
        </div>
        <Campo label="Esfera (federal/estadual/municipal)" name="esfera" required />
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
