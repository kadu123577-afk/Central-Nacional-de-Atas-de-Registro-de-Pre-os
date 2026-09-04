"use client";

import { useActionState, useState } from "react";
import { cadastrarAtaComoFornecedor, type EstadoCadastroAtaFornecedor } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { logoutFornecedor } from "@/app/fornecedor/actions";
import { CATEGORIAS_ATAS } from "@/lib/categorias";
import { ESFERAS_ORGAO } from "@/lib/esferas";

const estadoInicial: EstadoCadastroAtaFornecedor = {};

export function FormularioNovaAta() {
  const [estado, formAction, pendente] = useActionState(cadastrarAtaComoFornecedor, estadoInicial);
  const [itens, setItens] = useState(() => [criarChaveItem()]);

  function adicionarItem() {
    setItens((atual) => [...atual, criarChaveItem()]);
  }

  function removerItem(chave: string) {
    setItens((atual) => (atual.length > 1 ? atual.filter((c) => c !== chave) : atual));
  }

  return (
    <AppShell
      area="Fornecedor"
      itens={[
        { rotulo: "Minhas atas", href: "/fornecedor" },
        { rotulo: "Nova ata", href: "/fornecedor/atas/nova" },
        { rotulo: "Pedidos recebidos", href: "/fornecedor/adesoes" },
        { rotulo: "Perfil", href: "/fornecedor/perfil" },
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
          Órgão gerenciador, dados da ata e ao menos um item — a ata entra como PENDENTE até
          um administrador aprovar.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-5" encType="multipart/form-data">
        <Secao titulo="Órgão gerenciador">
          <div className="flex flex-col gap-4">
            <Campo label="Nome" name="orgaoNome" required />
            <Campo label="CNPJ" name="orgaoCnpj" required />
            <div className="grid grid-cols-2 gap-4">
              <Campo label="UF" name="orgaoUf" required />
              <Campo label="Município" name="orgaoMunicipio" required />
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
                Esfera
              </span>
              <select name="orgaoEsfera" required className="campo-atas" defaultValue="">
                <option value="" disabled>
                  Selecione...
                </option>
                {ESFERAS_ORGAO.map((e) => (
                  <option key={e} value={e}>
                    {e[0].toUpperCase() + e.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Secao>

        <Secao titulo="Ata">
          <div className="flex flex-col gap-4">
            <Campo label="Número" name="numero" required />
            <Campo label="Objeto" name="objeto" required />
            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
                Tema da ata
              </span>
              <select name="ataCategoria" required className="campo-atas" defaultValue="">
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
            <div className="grid grid-cols-2 gap-4 items-start">
              <Campo label="Data de assinatura" name="dataAssinatura" type="date" required />
              <Campo label="Vigência até" name="dataVigenciaFim" type="date" required />
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
                Documento (edital, ofício ou ata digitalizada) — opcional
              </span>
              <input
                name="documento"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="campo-atas"
              />
              <span className="mt-1 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                PDF ou imagem, até 10MB.
              </span>
            </label>
          </div>
        </Secao>

        <Secao
          titulo={`Itens (${itens.length})`}
          acao={
            <button type="button" onClick={adicionarItem} className="botao-atas secundario">
              + Adicionar item
            </button>
          }
        >
          <div className="flex flex-col gap-4">
            {itens.map((chave, indice) => (
              <div
                key={chave}
                className="flex flex-col gap-4 rounded-[var(--raio)] border p-4"
                style={{ borderColor: "var(--cor-borda)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Item {indice + 1}</span>
                  {itens.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removerItem(chave)}
                      className="botao-atas link"
                      style={{ color: "var(--cor-critico)" }}
                    >
                      Remover
                    </button>
                  )}
                </div>
                <Campo label="Descrição" name="itemDescricao[]" required />
                <div className="grid grid-cols-2 gap-4 items-start">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
                      Categoria
                    </span>
                    <select name="itemCategoria[]" required className="campo-atas" defaultValue="">
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
                  <Campo label="Unidade" name="itemUnidade[]" required />
                </div>
                <div className="grid grid-cols-2 gap-4 items-start">
                  <Campo
                    label="Quantidade registrada"
                    name="itemQuantidade[]"
                    type="number"
                    min="1"
                    required
                  />
                  <Campo
                    label="Valor unitário (R$)"
                    name="itemValorUnitario[]"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
            ))}
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

let contadorChaveItem = 0;
function criarChaveItem(): string {
  contadorChaveItem += 1;
  return `item-${contadorChaveItem}`;
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
