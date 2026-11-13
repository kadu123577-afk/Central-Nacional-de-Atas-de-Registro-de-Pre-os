"use client";

import { useActionState, useState } from "react";
import {
  atualizarCaptacao,
  definirEmpresaCaptacao,
  excluirContatoDaEmpresa,
  moverEstagioCaptacao,
  registrarInteracaoCaptacao,
  salvarContatoDaEmpresa,
  type EstadoCaptacao,
} from "./actions";
import { Aviso } from "@/components/ui/aviso";
import { CANAIS_CONTATO, MOTIVOS_PERDA, AVISO_LGPD_CONTATO } from "@/lib/captacao";
import { LIMITE_OBSERVACOES } from "@/lib/radar-atas-view";

const estadoInicial: EstadoCaptacao = {};

/** Resposta curta da ação, logo abaixo do botão. */
function Retorno({ estado }: { estado: EstadoCaptacao }) {
  if (estado.erro) return <Aviso tom="critico">{estado.erro}</Aviso>;
  if (estado.ok) {
    return (
      <p role="status" className="text-xs font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
        {estado.aviso ?? "Salvo."}
      </p>
    );
  }
  return null;
}

export interface DestinoEstagio {
  valor: string;
  rotulo: string;
}

/** Passa o cartão para outro estágio; “Não deu” pede o motivo. */
export function FormularioMover({ id, destinos }: { id: string; destinos: DestinoEstagio[] }) {
  const [estado, formAction, pendente] = useActionState(moverEstagioCaptacao, estadoInicial);
  const [destino, setDestino] = useState("");

  if (destinos.length === 0) return null;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="rotulo-campo">Mover para</span>
        <select
          name="estagio"
          required
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          className="campo-atas"
        >
          <option value="" disabled>
            Escolha o estágio…
          </option>
          {destinos.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.rotulo}
            </option>
          ))}
        </select>
      </label>
      {destino === "perdida" && (
        <label className="block">
          <span className="rotulo-campo">Por que não deu?</span>
          <select name="motivoPerda" required defaultValue="" className="campo-atas">
            <option value="" disabled>
              Escolha o motivo…
            </option>
            {MOTIVOS_PERDA.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" disabled={pendente} className="botao-atas secundario pequeno self-start">
        {pendente ? "Movendo..." : "Mover"}
      </button>
      <Retorno estado={estado} />
    </form>
  );
}

export interface Captador {
  id: string;
  nome: string;
}

/** Nome do cartão, responsável, próximo contato e anotações. */
export function FormularioDados({
  id,
  nome,
  responsavelId,
  proximoContatoEm,
  observacoes,
  captadores,
}: {
  id: string;
  nome: string;
  responsavelId: string;
  /** AAAA-MM-DD, ou vazio. */
  proximoContatoEm: string;
  observacoes: string;
  captadores: Captador[];
}) {
  const [estado, formAction, pendente] = useActionState(atualizarCaptacao, estadoInicial);
  const v = estado.valores;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="rotulo-campo">Nome da ata</span>
        <input name="nome" required maxLength={140} defaultValue={v?.nome ?? nome} className="campo-atas" />
      </label>
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="rotulo-campo">Responsável</span>
          <select name="responsavelId" defaultValue={v?.responsavelId ?? responsavelId} className="campo-atas">
            <option value="">Ninguém ainda</option>
            {captadores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo-campo">
            Próximo contato <small>(opcional)</small>
          </span>
          <input
            type="date"
            name="proximoContatoEm"
            defaultValue={v?.proximoContatoEm ?? proximoContatoEm}
            className="campo-atas"
          />
        </label>
      </div>
      <label className="block">
        <span className="rotulo-campo">
          Anotações <small>(até {LIMITE_OBSERVACOES} caracteres)</small>
        </span>
        <textarea
          name="observacoes"
          rows={3}
          maxLength={LIMITE_OBSERVACOES}
          defaultValue={v?.observacoes ?? observacoes}
          className="campo-atas"
          placeholder="Ex.: o dono pediu a lista de itens da ata"
        />
      </label>
      <button type="submit" disabled={pendente} className="botao-atas pequeno self-start">
        {pendente ? "Salvando..." : "Salvar"}
      </button>
      <Retorno estado={estado} />
    </form>
  );
}

/** Razão social e CNPJ da empresa, quando o radar não identificou o fornecedor (ou para corrigir). */
export function FormularioEmpresa({ id, nome, cnpj }: { id: string; nome: string; cnpj: string }) {
  const [estado, formAction, pendente] = useActionState(definirEmpresaCaptacao, estadoInicial);
  const v = estado.valores;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="rotulo-campo">Razão social</span>
          <input name="fornecedorNome" required maxLength={150} defaultValue={v?.fornecedorNome ?? nome} className="campo-atas" />
        </label>
        <label className="block">
          <span className="rotulo-campo">CNPJ</span>
          <input
            name="fornecedorCnpj"
            required
            inputMode="numeric"
            defaultValue={v?.fornecedorCnpj ?? cnpj}
            className="campo-atas"
            placeholder="00.000.000/0000-00"
          />
        </label>
      </div>
      <button type="submit" disabled={pendente} className="botao-atas pequeno self-start">
        {pendente ? "Salvando..." : "Salvar empresa"}
      </button>
      <Retorno estado={estado} />
    </form>
  );
}

/** Registra um contato feito com a empresa (vai para o histórico do cartão). */
export function FormularioInteracao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(registrarInteracaoCaptacao, estadoInicial);
  const v = estado.valores;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="rotulo-campo">Como foi</span>
          <select name="canal" required defaultValue={v?.canal ?? ""} className="campo-atas">
            <option value="" disabled>
              Escolha…
            </option>
            {CANAIS_CONTATO.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo-campo">
            Dia <small>(vazio = agora)</small>
          </span>
          <input type="date" name="quando" defaultValue={v?.quando ?? ""} className="campo-atas" />
        </label>
      </div>
      <label className="block">
        <span className="rotulo-campo">O que foi conversado</span>
        <textarea
          name="resumo"
          required
          rows={3}
          maxLength={500}
          defaultValue={v?.resumo ?? ""}
          className="campo-atas"
          placeholder="Ex.: ligou, o dono pediu proposta e vai retornar na sexta"
        />
      </label>
      <label className="block">
        <span className="rotulo-campo">
          Próximo contato <small>(opcional)</small>
        </span>
        <input type="date" name="proximoContatoEm" defaultValue={v?.proximoContatoEm ?? ""} className="campo-atas" />
      </label>
      <button type="submit" disabled={pendente} className="botao-atas pequeno self-start">
        {pendente ? "Registrando..." : "Registrar contato"}
      </button>
      <Retorno estado={estado} />
    </form>
  );
}

export interface DadosContato {
  id: string;
  nome: string;
  cargo: string;
  telefone: string;
  whatsapp: boolean;
  email: string;
  comoObteve: string;
}

/** Cartão de contato da empresa: novo (sem `contato`) ou correção de um existente. */
export function FormularioContato({ captacaoId, contato }: { captacaoId: string; contato?: DadosContato }) {
  const [estado, formAction, pendente] = useActionState(salvarContatoDaEmpresa, estadoInicial);
  const v = estado.valores;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="captacaoId" value={captacaoId} />
      {contato && <input type="hidden" name="contatoId" value={contato.id} />}
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="rotulo-campo">Nome</span>
          <input name="nome" required maxLength={120} defaultValue={v?.nome ?? contato?.nome ?? ""} className="campo-atas" />
        </label>
        <label className="block">
          <span className="rotulo-campo">
            Cargo <small>(opcional)</small>
          </span>
          <input name="cargo" maxLength={80} defaultValue={v?.cargo ?? contato?.cargo ?? ""} className="campo-atas" />
        </label>
        <label className="block">
          <span className="rotulo-campo">Telefone</span>
          <input
            name="telefone"
            inputMode="tel"
            defaultValue={v?.telefone ?? contato?.telefone ?? ""}
            className="campo-atas"
            placeholder="(62) 99999-0000"
          />
        </label>
        <label className="block">
          <span className="rotulo-campo">E-mail</span>
          <input name="email" type="email" maxLength={160} defaultValue={v?.email ?? contato?.email ?? ""} className="campo-atas" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="whatsapp" defaultChecked={contato?.whatsapp ?? false} />
        <span>Este telefone tem WhatsApp</span>
      </label>
      <label className="block">
        <span className="rotulo-campo">De onde veio este contato</span>
        <input
          name="comoObteve"
          required
          maxLength={200}
          defaultValue={v?.comoObteve ?? contato?.comoObteve ?? ""}
          className="campo-atas"
          placeholder="Ex.: site da empresa; indicação do Dr. Marcelo; ligação para o comercial"
        />
      </label>
      <p className="text-[11.5px] leading-snug" style={{ color: "var(--cor-texto-3)" }}>
        {AVISO_LGPD_CONTATO}
      </p>
      <button type="submit" disabled={pendente} className="botao-atas pequeno self-start">
        {pendente ? "Salvando..." : contato ? "Salvar correção" : "Guardar contato"}
      </button>
      <Retorno estado={estado} />
    </form>
  );
}

/** Apaga o contato por completo, depois de confirmar. */
export function BotaoApagarContato({ captacaoId, contatoId }: { captacaoId: string; contatoId: string }) {
  return (
    <form
      action={excluirContatoDaEmpresa}
      onSubmit={(e) => {
        if (!window.confirm("Apagar este contato por completo? Isso não pode ser desfeito.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="captacaoId" value={captacaoId} />
      <input type="hidden" name="contatoId" value={contatoId} />
      <button type="submit" className="botao-atas link text-[12.5px]" style={{ color: "var(--cor-critico)" }}>
        Apagar contato
      </button>
    </form>
  );
}
