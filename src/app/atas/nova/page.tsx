"use client";

import { useActionState } from "react";
import { cadastrarAta, type EstadoCadastroAta } from "../actions";
import { Secao } from "@/components/ui/secao";

const estadoInicial: EstadoCadastroAta = {};

export default function NovaAtaPage() {
  const [estado, formAction, pendente] = useActionState(cadastrarAta, estadoInicial);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-10">
      <div>
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          Cadastrar ata
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Ata, fornecedor, órgão gerenciador e um item.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-5">
        <Secao titulo="Fornecedor">
          <div className="flex flex-col gap-4">
            <Campo label="Razão social" name="fornecedorRazaoSocial" required />
            <Campo label="CNPJ" name="fornecedorCnpj" required />
            <Campo label="E-mail" name="fornecedorEmail" type="email" required />
            <Campo
              label="Senha de acesso ao painel do fornecedor (mín. 8 caracteres)"
              name="fornecedorSenha"
              type="password"
              required
            />
          </div>
        </Secao>

        <Secao titulo="Órgão gerenciador">
          <div className="flex flex-col gap-4">
            <Campo label="Nome" name="orgaoNome" required />
            <Campo label="CNPJ" name="orgaoCnpj" required />
            <div className="grid grid-cols-2 gap-4">
              <Campo label="UF" name="orgaoUf" required />
              <Campo label="Município" name="orgaoMunicipio" required />
            </div>
            <Campo label="Esfera (federal/estadual/municipal)" name="orgaoEsfera" required />
          </div>
        </Secao>

        <Secao titulo="Ata">
          <div className="flex flex-col gap-4">
            <Campo label="Número" name="numero" required />
            <Campo label="Objeto" name="objeto" required />
            <div className="grid grid-cols-2 gap-4 items-start">
              <Campo label="Data de assinatura" name="dataAssinatura" type="date" required />
              <Campo label="Vigência até" name="dataVigenciaFim" type="date" required />
            </div>
          </div>
        </Secao>

        <Secao titulo="Item">
          <div className="flex flex-col gap-4">
            <Campo label="Descrição" name="itemDescricao" required />
            <div className="grid grid-cols-2 gap-4 items-start">
              <Campo label="Categoria" name="itemCategoria" required />
              <Campo label="Unidade" name="itemUnidade" required />
            </div>
            <div className="grid grid-cols-2 gap-4 items-start">
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
          </div>
        </Secao>

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
      <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        step={step}
        className="campo-atas"
      />
    </label>
  );
}
