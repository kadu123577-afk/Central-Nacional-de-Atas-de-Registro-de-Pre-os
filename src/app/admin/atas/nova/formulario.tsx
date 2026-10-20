"use client";

import { useActionState, useState } from "react";
import { cadastrarAtaComoAdmin, logoutAdmin, type EstadoCadastroAtaAdmin } from "../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { CATEGORIAS_ATAS } from "@/lib/categorias";
import { ESFERAS_ORGAO } from "@/lib/esferas";
import { NAV_ADMIN } from "@/app/admin/nav";

const estadoInicial: EstadoCadastroAtaAdmin = {};

export function FormularioNovaAtaAdmin() {
  const [estado, formAction, pendente] = useActionState(cadastrarAtaComoAdmin, estadoInicial);
  const [itens, setItens] = useState(() => [criarChaveItem()]);

  function adicionarItem() {
    setItens((atual) => [...atual, criarChaveItem()]);
  }

  function removerItem(chave: string) {
    setItens((atual) => (atual.length > 1 ? atual.filter((c) => c !== chave) : atual));
  }

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Operação"
        titulo="Cadastrar"
        destaque="nova ata"
        descricao="Fornecedor, órgão gerenciador, dados da ata e ao menos um item — a ata entra como PENDENTE até ser aprovada na fila de moderação."
        voltar={{ href: "/atas", rotulo: "Atas" }}
      />

      <form action={formAction} className="flex flex-col gap-6" encType="multipart/form-data">
        <Secao
          titulo="Fornecedor"
          descricao="Se já existe um fornecedor com esse CNPJ, os dados dele são atualizados — essa ata entra vinculada a ele, sem duplicar cadastro."
        >
          <div className="flex flex-col gap-4">
            <Campo label="Razão social" name="fornecedorNome" required />
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <Campo label="CNPJ" name="fornecedorCnpj" required />
              <Campo label="E-mail" name="fornecedorEmail" type="email" required />
            </div>
          </div>
        </Secao>

        <Secao titulo="Órgão gerenciador">
          <div className="flex flex-col gap-4">
            <Campo label="Nome" name="orgaoNome" required />
            <Campo label="CNPJ" name="orgaoCnpj" required />
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[120px_1fr]">
              <Campo label="UF" name="orgaoUf" required />
              <Campo label="Município" name="orgaoMunicipio" required />
            </div>
            <label className="block text-sm">
              <span className="rotulo-campo">Esfera</span>
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

        <Secao titulo="Ata" destaque>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[200px_1fr]">
              <Campo label="Número" name="numero" required />
              <Campo label="Objeto" name="objeto" required />
            </div>
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="rotulo-campo">Origem</span>
                <select name="origem" className="campo-atas" defaultValue="MANUAL">
                  <option value="MANUAL">Cadastro manual</option>
                  <option value="CIABC">CIABC</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="rotulo-campo">Tema da ata</span>
                <select name="ataCategoria" required className="campo-atas" defaultValue="">
                  <option value="" disabled>
                    Selecione...
                  </option>
                  {CATEGORIAS_ATAS.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <Campo label="Data de assinatura" name="dataAssinatura" type="date" required />
              <Campo label="Vigência até" name="dataVigenciaFim" type="date" required />
            </div>
            <label className="block text-sm">
              <span className="rotulo-campo">
                Documento (edital, ofício ou ata digitalizada) <small>(opcional)</small>
              </span>
              <input
                name="documento"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="campo-atas"
              />
              <span className="mt-1.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
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
          <ol className="flex flex-col gap-4">
            {itens.map((chave, indice) => (
              <li
                key={chave}
                className="flex flex-col gap-4 rounded-[var(--raio-grande)] border p-5"
                style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie-2)" }}
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
                <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="rotulo-campo">Categoria</span>
                    <select name="itemCategoria[]" required className="campo-atas" defaultValue="">
                      <option value="" disabled>
                        Selecione...
                      </option>
                      {CATEGORIAS_ATAS.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Campo label="Unidade" name="itemUnidade[]" required />
                </div>
                <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
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
              </li>
            ))}
          </ol>
        </Secao>

        {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pendente} className="botao-atas">
            {pendente ? "Salvando..." : "Cadastrar ata"}
          </button>
        </div>
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
      <span className="rotulo-campo">{label}</span>
      <input name={name} type={type} required={required} min={min} step={step} className="campo-atas" />
    </label>
  );
}
