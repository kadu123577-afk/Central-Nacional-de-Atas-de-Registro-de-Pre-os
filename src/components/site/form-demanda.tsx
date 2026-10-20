"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { registrarDemanda, type EstadoDemanda } from "@/app/(site)/actions";
import { PRAZOS_DEMANDA, type DadosDemanda } from "@/lib/demandas";
import { UFS } from "@/lib/site/ufs";
import { IconeInfo } from "./icones";

const ESTADO_INICIAL: EstadoDemanda = {};

function Erro({ campo, mensagem }: { campo: keyof DadosDemanda; mensagem?: string }) {
  return (
    <span className="campo__erro" id={`d-${campo}-erro`} role="alert" hidden={!mensagem}>
      {mensagem}
    </span>
  );
}

/**
 * Formulário "Não achei a ata". Grava a demanda no sistema (fila da equipe em
 * /admin/demandas). O campo "website" é uma isca para robôs: fica fora da tela.
 */
export function FormDemanda({ inicial }: { inicial: { objeto: string; uf: string } }) {
  const [estado, acao, pendente] = useActionState(registrarDemanda, ESTADO_INICIAL);
  const retorno = useRef<HTMLDivElement>(null);
  const erros = estado.erros ?? {};
  const v: Partial<DadosDemanda> = estado.valores ?? {};

  useEffect(() => {
    if (estado.ok || estado.erro) retorno.current?.focus();
  }, [estado]);

  const invalido = (campo: keyof DadosDemanda) => (erros[campo] ? true : undefined);

  return (
    <form className="demanda__form" id="form-demanda" action={acao} noValidate>
      <div className="campo campo--largo">
        <label htmlFor="d-objeto">O que precisa comprar</label>
        <input
          className="entrada"
          id="d-objeto"
          name="objeto"
          type="text"
          maxLength={300}
          placeholder="Ex.: luminárias LED de 150 W para vias públicas"
          defaultValue={v.objeto ?? inicial.objeto}
          aria-describedby="d-objeto-erro"
          aria-invalid={invalido("objeto")}
          required
        />
        <Erro campo="objeto" mensagem={erros.objeto} />
      </div>
      <div className="campo">
        <label htmlFor="d-quantidade">
          Quantidade estimada <span className="opcional">(opcional)</span>
        </label>
        <input
          className="entrada"
          id="d-quantidade"
          name="quantidade"
          type="text"
          maxLength={100}
          placeholder="Ex.: 800 unidades"
          defaultValue={v.quantidade}
        />
      </div>
      <div className="campo">
        <label htmlFor="d-uf">Estado de interesse</label>
        <select className="selecao" id="d-uf" name="uf" defaultValue={v.uf ?? inicial.uf}>
          <option value="">Todas as UFs</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="d-prazo">Prazo desejado</label>
        <select className="selecao" id="d-prazo" name="prazo" defaultValue={v.prazo ?? ""}>
          <option value="">Sem prazo definido</option>
          {PRAZOS_DEMANDA.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="d-orgao">Órgão</label>
        <input
          className="entrada"
          id="d-orgao"
          name="orgao"
          type="text"
          maxLength={200}
          placeholder="Ex.: Prefeitura de ..."
          autoComplete="organization"
          defaultValue={v.orgao}
          aria-describedby="d-orgao-erro"
          aria-invalid={invalido("orgao")}
          required
        />
        <Erro campo="orgao" mensagem={erros.orgao} />
      </div>
      <div className="campo">
        <label htmlFor="d-nome">Seu nome</label>
        <input
          className="entrada"
          id="d-nome"
          name="nome"
          type="text"
          maxLength={120}
          autoComplete="name"
          defaultValue={v.nome}
          aria-describedby="d-nome-erro"
          aria-invalid={invalido("nome")}
          required
        />
        <Erro campo="nome" mensagem={erros.nome} />
      </div>
      <div className="campo">
        <label htmlFor="d-cargo">
          Cargo <span className="opcional">(opcional)</span>
        </label>
        <input
          className="entrada"
          id="d-cargo"
          name="cargo"
          type="text"
          maxLength={100}
          autoComplete="organization-title"
          defaultValue={v.cargo}
        />
      </div>
      <div className="campo campo--largo">
        <label htmlFor="d-contato">E-mail ou telefone para retorno</label>
        <input
          className="entrada"
          id="d-contato"
          name="contato"
          type="text"
          maxLength={160}
          autoComplete="email"
          defaultValue={v.contato}
          aria-describedby="d-contato-erro"
          aria-invalid={invalido("contato")}
          required
        />
        <Erro campo="contato" mensagem={erros.contato} />
      </div>
      <div className="campo campo--largo">
        <label htmlFor="d-obs">
          Observações <span className="opcional">(opcional)</span>
        </label>
        <textarea
          className="entrada entrada--area"
          id="d-obs"
          name="obs"
          rows={3}
          maxLength={2000}
          placeholder="Especificação técnica, marca de referência, local de entrega..."
          defaultValue={v.observacoes}
        />
      </div>

      {/* Isca para robôs: invisível e fora da ordem de tabulação. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="d-website">Não preencha este campo</label>
        <input id="d-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div
        className="alerta alerta--info campo--largo"
        ref={retorno}
        role="status"
        tabIndex={-1}
        hidden={!estado.ok && !estado.erro}
      >
        <IconeInfo />
        <span>
          {estado.ok ? (
            <>
              <strong>Demanda recebida.</strong> A equipe vai procurar atas compatíveis e responder
              pelo contato que você informou.
            </>
          ) : (
            estado.erro
          )}
        </span>
      </div>
      <div className="demanda__envio campo--largo">
        <button className="botao botao--primario botao--grande" type="submit" disabled={pendente}>
          {pendente ? "Enviando..." : "Enviar demanda"}
        </button>
        <p>
          Usamos os dados só para responder a esta demanda. Veja a{" "}
          <Link href="/politica-privacidade">política de privacidade</Link>.
        </p>
      </div>
    </form>
  );
}
