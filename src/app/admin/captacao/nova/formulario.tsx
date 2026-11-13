"use client";

import { useActionState } from "react";
import { criarCaptacaoManual, type EstadoCaptacao } from "../actions";
import { Aviso } from "@/components/ui/aviso";
import { Secao } from "@/components/ui/secao";
import { AVISO_LGPD_CONTATO } from "@/lib/captacao";
import { CATEGORIAS_ATAS } from "@/lib/categorias";
import { LIMITE_OBSERVACOES } from "@/lib/radar-atas-view";

const estadoInicial: EstadoCaptacao = {};

function Campo({
  label,
  name,
  valores,
  type = "text",
  required,
  opcional,
  maxLength,
  placeholder,
  inputMode,
}: {
  label: string;
  name: string;
  valores?: Record<string, string>;
  type?: string;
  required?: boolean;
  opcional?: boolean;
  maxLength?: number;
  placeholder?: string;
  inputMode?: "numeric" | "tel";
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
        maxLength={maxLength}
        placeholder={placeholder}
        inputMode={inputMode}
        defaultValue={valores?.[name] ?? ""}
        className="campo-atas"
      />
    </label>
  );
}

/** Cadastro de uma ata que o captador achou por um contato seu, fora do PNCP e do radar. */
export function FormularioNovaCaptacao() {
  const [estado, formAction, pendente] = useActionState(criarCaptacaoManual, estadoInicial);
  const v = estado.valores;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Secao titulo="Empresa" descricao="Quem detém a ata. O CNPJ é conferido (empresa, não CPF)." destaque>
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <Campo label="Razão social" name="fornecedorNome" valores={v} required maxLength={150} />
          <Campo
            label="CNPJ"
            name="fornecedorCnpj"
            valores={v}
            required
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
          />
        </div>
      </Secao>

      <Secao titulo="A ata" descricao="O que você já sabe. O que faltar, complete depois no cartão.">
        <div className="flex flex-col gap-4">
          <Campo label="Do que é a ata (objeto)" name="objeto" valores={v} required maxLength={1000} placeholder="Ex.: registro de preços de material de limpeza" />
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="rotulo-campo">
                Tema <small>(opcional)</small>
              </span>
              <select name="categoria" defaultValue={v?.categoria ?? ""} className="campo-atas">
                <option value="">Ainda não sei</option>
                {CATEGORIAS_ATAS.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <Campo label="Número da ata" name="numeroAta" valores={v} opcional maxLength={60} placeholder="Ex.: 12/2026" />
          </div>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <Campo label="Vigência até" name="vigenciaFim" valores={v} type="date" opcional />
            <Campo label="Próximo contato" name="proximoContatoEm" valores={v} type="date" opcional />
          </div>
        </div>
      </Secao>

      <Secao titulo="Órgão gerenciador" descricao="O órgão que publicou a ata, se você souber.">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[1fr_100px_1fr]">
          <Campo label="Nome do órgão" name="orgaoNome" valores={v} opcional maxLength={150} />
          <Campo label="UF" name="uf" valores={v} opcional maxLength={2} />
          <Campo label="Município" name="municipioNome" valores={v} opcional maxLength={100} />
        </div>
      </Secao>

      <Secao titulo="Contato na empresa" descricao="Quem atende na empresa. Dá para deixar para depois.">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <Campo label="Nome" name="contatoNome" valores={v} opcional maxLength={120} />
            <Campo label="Cargo" name="contatoCargo" valores={v} opcional maxLength={80} />
            <Campo label="Telefone" name="contatoTelefone" valores={v} opcional inputMode="tel" placeholder="(62) 99999-0000" />
            <Campo label="E-mail" name="contatoEmail" valores={v} opcional type="email" maxLength={160} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="contatoWhatsapp" defaultChecked={v?.contatoWhatsapp === "on"} />
            <span>Este telefone tem WhatsApp</span>
          </label>
          <Campo
            label="De onde veio este contato"
            name="contatoComoObteve"
            valores={v}
            opcional
            maxLength={200}
            placeholder="Ex.: indicação do dono, evento do setor, site da empresa"
          />
          <p className="text-xs leading-snug" style={{ color: "var(--cor-texto-3)" }}>
            {AVISO_LGPD_CONTATO} Se você preencher qualquer campo do contato, “de onde veio” passa a ser obrigatório.
          </p>
        </div>
      </Secao>

      <Secao titulo="Anotações" descricao="Como você soube dessa ata e o que já foi conversado.">
        <label className="block text-sm">
          <span className="rotulo-campo">
            Anotações <small>(até {LIMITE_OBSERVACOES} caracteres, opcional)</small>
          </span>
          <textarea
            name="observacoes"
            rows={4}
            maxLength={LIMITE_OBSERVACOES}
            defaultValue={v?.observacoes ?? ""}
            className="campo-atas"
            placeholder="Ex.: o dono contou, em conversa, que tem uma ata de limpeza vigente com a prefeitura"
          />
        </label>
      </Secao>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendente} className="botao-atas">
          {pendente ? "Salvando..." : "Criar o cartão"}
        </button>
      </div>
    </form>
  );
}
