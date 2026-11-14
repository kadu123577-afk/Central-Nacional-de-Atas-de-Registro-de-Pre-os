"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import {
  desfazerRegistroDeAdesao,
  registrarAdesaoPeloAdmin,
  type EstadoRegistroAdesao,
} from "./actions";
import { formatarValorUnitario } from "@/lib/valor-unitario";

const estadoInicial: EstadoRegistroAdesao = {};

export interface LinhaDoFormulario {
  itemId: string;
  descricao: string;
  unidade: string;
  valorUnitario: string;
  quantidadeRegistrada: number;
  /** Quanto ainda cabe agora neste item para este município (o menor entre 50% e 200%). */
  maximoAgora: number;
  jaAderidoMunicipio: number;
  jaAderidoTotal: number;
}

const num = (n: number) => n.toLocaleString("pt-BR");

/** Formulário de registro: uma linha por item da ata, com quanto ainda cabe em cada um. */
export function FormularioRegistro({ oportunidadeId, linhas }: { oportunidadeId: string; linhas: LinhaDoFormulario[] }) {
  const [estado, registrar, registrando] = useActionState(registrarAdesaoPeloAdmin.bind(null, oportunidadeId), estadoInicial);

  const digitado = estado.valores;

  return (
    // key: depois de um erro, os campos remontam com o que a pessoa tinha digitado.
    <form action={registrar} key={digitado?.nonce ?? "inicial"} className="flex flex-col gap-4">
      <div className="moldura-tabela">
        <table className="tabela-atas min-w-[860px]">
          <thead>
            <tr>
              <th>Item</th>
              <th>Registrado</th>
              <th>Já aderido (total)</th>
              <th>Cabe agora</th>
              <th>Valor unitário</th>
              <th>Quantidade aderida</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.itemId}>
                <td className="align-top">
                  <span className="titulo-linha">{l.descricao}</span>
                  <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {l.unidade}
                  </span>
                </td>
                <td className="numero align-top">{num(l.quantidadeRegistrada)}</td>
                <td className="numero align-top">{num(l.jaAderidoTotal)}</td>
                <td className="numero align-top">{num(l.maximoAgora)}</td>
                <td className="numero align-top">{formatarValorUnitario(Number(l.valorUnitario))}</td>
                <td className="align-top">
                  <input
                    name={`qtd_${l.itemId}`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    defaultValue={digitado?.quantidades[l.itemId] ?? ""}
                    disabled={l.maximoAgora <= 0}
                    aria-label={`Quantidade aderida de ${l.descricao}`}
                    className="campo-atas w-28 text-right"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="block">
        <span className="rotulo-campo">
          Observação <small>(opcional)</small>
        </span>
        <textarea name="observacoes" rows={2} maxLength={1000} defaultValue={digitado?.observacoes ?? ""} className="campo-atas" />
      </label>

      <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
        Deixe em branco o item que o município não aderiu. O valor aderido é calculado das quantidades: não se digita.
        Depois de registrar, só o jurídico consegue desfazer.
      </p>

      {estado.erros && estado.erros.length > 0 && (
        <Aviso tom="critico" titulo="Nada foi registrado.">
          <ul className="mt-1 list-disc pl-5">
            {estado.erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Aviso>
      )}
      {estado.ok && <Aviso tom="sucesso">Adesão registrada.</Aviso>}

      <button type="submit" disabled={registrando} className="botao-atas self-start">
        {registrando ? "Registrando..." : "Registrar adesão"}
      </button>
    </form>
  );
}

/** Desfazer o registro (jurídico): devolve as quantidades ao saldo da ata. */
export function DesfazerRegistro({ oportunidadeId }: { oportunidadeId: string }) {
  const [estado, desfazer, desfazendo] = useActionState(desfazerRegistroDeAdesao.bind(null, oportunidadeId), estadoInicial);

  return (
    <form
      action={desfazer}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        if (!window.confirm("Desfazer este registro? As quantidades voltam ao saldo da ata e a oportunidade volta para Em negociação.")) {
          e.preventDefault();
        }
      }}
    >
      {estado.erros && estado.erros.length > 0 && <Aviso tom="critico">{estado.erros.join(" ")}</Aviso>}
      <button type="submit" disabled={desfazendo} className="botao-atas secundario self-start">
        {desfazendo ? "Desfazendo..." : "Desfazer este registro"}
      </button>
    </form>
  );
}
