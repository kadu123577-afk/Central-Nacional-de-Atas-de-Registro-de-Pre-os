"use client";

import { useActionState } from "react";
import { cadastrarAtaComoFornecedor, type EstadoCadastroAtaFornecedor } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { logoutFornecedor } from "@/app/fornecedor/actions";
import { CATEGORIAS_ATAS } from "@/lib/categorias";

const estadoInicial: EstadoCadastroAtaFornecedor = {};

export function FormularioNovaAta() {
  const [estado, formAction, pendente] = useActionState(cadastrarAtaComoFornecedor, estadoInicial);

  return (
    <AppShell
      area="Fornecedor"
      itens={[
        { rotulo: "Minhas atas", href: "/fornecedor" },
        { rotulo: "Nova ata", href: "/fornecedor/atas/nova" },
        { rotulo: "Pedidos recebidos", href: "/fornecedor/adesoes" },
      ]}
      rodape={
        <form action={logoutFornecedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <div>
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          Cadastrar nova ata
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Órgão gerenciador, dados da ata e um item — a ata entra como PENDENTE até um
          administrador aprovar.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-5">
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
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
                  Categoria
                </span>
                <select name="itemCategoria" required className="campo-atas" defaultValue="">
                  <option value="" disabled>
                    Selecione...
                  </option>
                  {CATEGORIAS_ATAS.map((c) => (
                    <option key={c.slug} value={c.rotulo}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </label>
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
    </AppShell>
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
