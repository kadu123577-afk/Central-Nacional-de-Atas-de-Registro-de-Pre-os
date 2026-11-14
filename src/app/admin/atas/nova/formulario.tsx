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

/** O que o cartão da Captação já sabe (botão "Fechou: cadastrar a ata"): vem preenchido, a equipe confere. */
export interface InicialNovaAta {
  captacaoId: string;
  nomeDoCartao: string;
  fornecedorNome?: string;
  fornecedorCnpj?: string;
  fornecedorEmail?: string;
  orgaoNome?: string;
  orgaoUf?: string;
  orgaoMunicipio?: string;
  numero?: string;
  objeto?: string;
  ataCategoria?: string;
  /** AAAA-MM-DD. */
  dataVigenciaFim?: string;
  linkPncp?: string;
}

export function FormularioNovaAtaAdmin({ inicial }: { inicial?: InicialNovaAta }) {
  const [estado, formAction, pendente] = useActionState(cadastrarAtaComoAdmin, estadoInicial);
  // Os itens são opcionais aqui: o estagiário cadastra os itens e os saldos na etapa 3.
  const [itens, setItens] = useState<string[]>([]);

  function adicionarItem() {
    setItens((atual) => [...atual, criarChaveItem()]);
  }

  function removerItem(chave: string) {
    setItens((atual) => atual.filter((c) => c !== chave));
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
        descricao="Fornecedor, órgão gerenciador, dados da ata e ao menos um item — a ata fica em andamento até o jurídico concluir a conformidade; só então ela é liberada para a venda."
        voltar={{ href: "/admin/captacao", rotulo: "Captação" }}
      />

      {inicial && (
        <Aviso tom="info" titulo="Vindo da captação.">
          Os dados do cartão “{inicial.nomeDoCartao}” já estão aqui. Confira, complete o que falta (número, datas e itens) e
          cadastre: o cartão fecha sozinho.
        </Aviso>
      )}

      <form action={formAction} className="flex flex-col gap-6" encType="multipart/form-data">
        {inicial && <input type="hidden" name="captacaoId" value={inicial.captacaoId} />}
        <Secao
          titulo="Fornecedor"
          descricao="Se já existe um fornecedor com esse CNPJ, os dados dele são atualizados — essa ata entra vinculada a ele, sem duplicar cadastro."
        >
          <div className="flex flex-col gap-4">
            <Campo label="Razão social" name="fornecedorNome" required defaultValue={inicial?.fornecedorNome} />
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <Campo label="CNPJ" name="fornecedorCnpj" required defaultValue={inicial?.fornecedorCnpj} />
              <Campo label="E-mail" name="fornecedorEmail" type="email" required defaultValue={inicial?.fornecedorEmail} />
            </div>
          </div>
        </Secao>

        <Secao titulo="Órgão gerenciador">
          <div className="flex flex-col gap-4">
            <Campo label="Nome" name="orgaoNome" required defaultValue={inicial?.orgaoNome} />
            <Campo label="CNPJ" name="orgaoCnpj" required />
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[120px_1fr]">
              <Campo label="UF" name="orgaoUf" required defaultValue={inicial?.orgaoUf} />
              <Campo label="Município" name="orgaoMunicipio" required defaultValue={inicial?.orgaoMunicipio} />
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
              <Campo label="Número" name="numero" required defaultValue={inicial?.numero} />
              <Campo label="Objeto (uso interno, não aparece no site)" name="objeto" required defaultValue={inicial?.objeto} />
            </div>
            <label className="block text-sm">
              <span className="rotulo-campo">Título público (aparece no site)</span>
              <input
                name="tituloPublico"
                type="text"
                maxLength={120}
                placeholder="Ex.: Ata de material de limpeza"
                className="campo-atas"
              />
              <span className="mt-1 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                Genérico de propósito: o objeto original costuma ser o mesmo texto do PNCP e permitiria
                achar a ata lá e contratar direto. Se ficar vazio, o site usa &quot;Ata de &lt;tema&gt;&quot;.
              </span>
            </label>
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
                <select name="ataCategoria" required className="campo-atas" defaultValue={inicial?.ataCategoria ?? ""}>
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
            <Campo
              label="Link da ata no PNCP"
              name="linkPncp"
              opcional
              defaultValue={inicial?.linkPncp}
              ajuda="Endereço da ata em pncp.gov.br (ou o número de controle). Só a equipe vê: serve para conferir a versão oficial da ata. Nunca aparece para o órgão, o fornecedor nem o público."
            />
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              <Campo label="Data de assinatura" name="dataAssinatura" type="date" required />
              <Campo label="Vigência até" name="dataVigenciaFim" type="date" required defaultValue={inicial?.dataVigenciaFim} />
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
                PDF ou imagem, até 10MB. É por ele que o estagiário cadastra os itens e os saldos.
              </span>
            </label>
          </div>
        </Secao>

        <Secao
          titulo={`Itens (${itens.length})`}
          descricao="Opcional. O estagiário cadastra os itens e os saldos na etapa seguinte (item a item ou por planilha), a partir do documento que você anexar acima. Se você já tem a lista, pode adicionar aqui."
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
                  <button
                    type="button"
                    onClick={() => removerItem(chave)}
                    className="botao-atas link"
                    style={{ color: "var(--cor-critico)" }}
                  >
                    Remover
                  </button>
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
                    step="0.0001"
                    min="0"
                    required
                  />
                </div>
                <Campo
                  label="Código do catálogo (CATMAT/CATSER)"
                  name="itemCodigoCatalogo[]"
                  opcional
                  inputMode="numeric"
                  ajuda="Número do item no catálogo do Compras.gov.br. Com ele a plataforma compara o preço da ata com preços de contratações públicas."
                />
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
  opcional,
  inputMode,
  ajuda,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
  opcional?: boolean;
  inputMode?: "numeric";
  ajuda?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="rotulo-campo">
        {label}
        {opcional && (
          <>
            {" "}
            <small>(opcional)</small>
          </>
        )}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        step={step}
        inputMode={inputMode}
        defaultValue={defaultValue}
        className="campo-atas"
      />
      {ajuda && (
        <span className="mt-1 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
          {ajuda}
        </span>
      )}
    </label>
  );
}
