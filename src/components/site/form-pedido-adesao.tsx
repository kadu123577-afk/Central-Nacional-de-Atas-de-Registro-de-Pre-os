"use client";

import { useActionState, useEffect, useRef } from "react";
import { pedirAdesaoNaAta, type EstadoDemanda } from "@/app/(site)/actions";
import { PRAZOS_DEMANDA, type DadosDemanda } from "@/lib/demandas";
import { IconeInfo } from "./icones";

const ESTADO_INICIAL: EstadoDemanda = {};

function Erro({ campo, mensagem }: { campo: string; mensagem?: string }) {
  return (
    <span className="campo__erro" id={`p-${campo}-erro`} role="alert" hidden={!mensagem}>
      {mensagem}
    </span>
  );
}

/**
 * Pedido de adesão a uma ata, para órgão logado. O órgão NÃO escolhe item: diz o
 * que precisa e a equipe confere itens e saldo (ver pedirAdesaoNaAta).
 */
export function FormPedidoAdesao({
  ataId,
  nomeOrgao,
  codigoAta,
}: {
  ataId: string;
  nomeOrgao: string;
  codigoAta: string;
}) {
  const [estado, acao, pendente] = useActionState(pedirAdesaoNaAta.bind(null, ataId), ESTADO_INICIAL);
  const retorno = useRef<HTMLDivElement>(null);
  const erros = estado.erros ?? {};
  const v: Partial<DadosDemanda> = estado.valores ?? {};

  useEffect(() => {
    if (estado.ok || estado.erro) retorno.current?.focus();
  }, [estado]);

  if (estado.ok) {
    return (
      <div className="alerta alerta--info" role="status" tabIndex={-1} ref={retorno}>
        <IconeInfo />
        <span>
          <strong>Pedido recebido.</strong> A equipe da Central vai conferir os itens e o saldo da ata{" "}
          {codigoAta}, montar o pedido de adesão e responder pelo contato que você informou.
        </span>
      </div>
    );
  }

  const invalido = (campo: keyof DadosDemanda) => (erros[campo] ? true : undefined);

  return (
    <form className="demanda__form" action={acao} noValidate style={{ padding: 0, background: "none", border: 0 }}>
      <p className="campo campo--largo" style={{ margin: 0 }}>
        Pedido em nome de <strong>{nomeOrgao}</strong>.
      </p>
      <div className="campo campo--largo">
        <label htmlFor="p-objeto">O que o seu órgão precisa desta ata</label>
        <textarea
          className="entrada entrada--area"
          id="p-objeto"
          name="objeto"
          rows={4}
          maxLength={1500}
          placeholder="Descreva os itens e as quantidades que interessam. A equipe confere o saldo."
          defaultValue={v.objeto}
          aria-describedby="p-objeto-erro"
          aria-invalid={invalido("objeto")}
          required
        />
        <Erro campo="objeto" mensagem={erros.objeto} />
      </div>
      <div className="campo">
        <label htmlFor="p-quantidade">
          Quantidade estimada <span className="opcional">(opcional)</span>
        </label>
        <input
          className="entrada"
          id="p-quantidade"
          name="quantidade"
          type="text"
          maxLength={100}
          defaultValue={v.quantidade}
        />
      </div>
      <div className="campo">
        <label htmlFor="p-prazo">Prazo desejado</label>
        <select className="selecao" id="p-prazo" name="prazo" defaultValue={v.prazo ?? ""}>
          <option value="">Sem prazo definido</option>
          {PRAZOS_DEMANDA.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="p-nome">Seu nome</label>
        <input
          className="entrada"
          id="p-nome"
          name="nome"
          type="text"
          maxLength={120}
          autoComplete="name"
          defaultValue={v.nome}
          aria-describedby="p-nome-erro"
          aria-invalid={invalido("nome")}
          required
        />
        <Erro campo="nome" mensagem={erros.nome} />
      </div>
      <div className="campo">
        <label htmlFor="p-cargo">
          Cargo <span className="opcional">(opcional)</span>
        </label>
        <input
          className="entrada"
          id="p-cargo"
          name="cargo"
          type="text"
          maxLength={100}
          autoComplete="organization-title"
          defaultValue={v.cargo}
        />
      </div>
      <div className="campo campo--largo">
        <label htmlFor="p-contato">E-mail ou telefone para retorno</label>
        <input
          className="entrada"
          id="p-contato"
          name="contato"
          type="text"
          maxLength={160}
          autoComplete="email"
          defaultValue={v.contato}
          aria-describedby="p-contato-erro"
          aria-invalid={invalido("contato")}
          required
        />
        <Erro campo="contato" mensagem={erros.contato} />
      </div>
      <div className="campo campo--largo">
        <label htmlFor="p-obs">
          Observações <span className="opcional">(opcional)</span>
        </label>
        <textarea
          className="entrada entrada--area"
          id="p-obs"
          name="obs"
          rows={3}
          maxLength={2000}
          placeholder="Justificativa de vantagem, local de entrega, prazo do processo..."
          defaultValue={v.observacoes}
        />
      </div>

      <div className="alerta alerta--critico campo--largo" ref={retorno} role="alert" tabIndex={-1} hidden={!estado.erro}>
        <IconeInfo />
        <span>{estado.erro}</span>
      </div>
      <div className="demanda__envio campo--largo">
        <button className="botao botao--primario botao--grande" type="submit" disabled={pendente}>
          {pendente ? "Enviando..." : "Enviar pedido de adesão"}
        </button>
        <p>A adesão não é automática: depende do aceite do órgão gerenciador e do fornecedor.</p>
      </div>
    </form>
  );
}
