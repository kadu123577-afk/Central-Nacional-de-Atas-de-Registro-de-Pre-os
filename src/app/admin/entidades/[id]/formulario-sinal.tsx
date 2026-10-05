"use client";

import { useActionState } from "react";
import { criarSinalMunicipio, type EstadoSinalMunicipio } from "../../actions";
import { CATEGORIAS_ATAS } from "@/lib/categorias";
import { ROTULO_TIPO_SINAL, TIPOS_SINAL } from "@/lib/sinais";

const estadoInicial: EstadoSinalMunicipio = {};

/** Cadastro manual de sinal de compra do município (o importador em lote é
 * prisma/importar-sinais.ts). Fonte e data são obrigatórias. */
export function FormularioSinal({ entidadeAlvoId }: { entidadeAlvoId: string }) {
  const acao = criarSinalMunicipio.bind(null, entidadeAlvoId);
  const [estado, formAction, pendente] = useActionState(acao, estadoInicial);
  const v = estado.valores ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo rotulo="Tipo">
          <select name="tipo" className="campo-atas" defaultValue={v.tipo || "licitacao_aberta"}>
            {TIPOS_SINAL.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_SINAL[t]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Título (vira a linha “por que agora”)">
          <input name="titulo" required defaultValue={v.titulo} className="campo-atas" placeholder="Pregão de veículos aberto — abre 12/10" />
        </Campo>
        <Campo rotulo="Categoria da ata (opcional)">
          <select name="categoria" className="campo-atas" defaultValue={v.categoria ?? ""}>
            <option value="">Qualquer categoria</option>
            {CATEGORIAS_ATAS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo rotulo="Fonte (obrigatória)">
          <input name="fonte" required defaultValue={v.fonte} className="campo-atas" placeholder="PNCP, Diário Oficial, site oficial…" />
        </Campo>
        <Campo rotulo="Link da fonte (opcional)">
          <input name="fonteUrl" defaultValue={v.fonteUrl} className="campo-atas" placeholder="https://" />
        </Campo>
        <Campo rotulo="Valor estimado R$ (opcional)">
          <input name="valorEstimado" inputMode="decimal" defaultValue={v.valorEstimado} className="campo-atas" />
        </Campo>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo rotulo="Data do sinal">
          <input name="dataSinal" type="date" required defaultValue={v.dataSinal} className="campo-atas" />
        </Campo>
        <Campo rotulo="Vale até (opcional)">
          <input name="expiraEm" type="date" defaultValue={v.expiraEm} className="campo-atas" />
        </Campo>
        <Campo rotulo="Detalhe (opcional)">
          <input name="detalhe" defaultValue={v.detalhe} className="campo-atas" />
        </Campo>
      </div>

      {estado.erro && (
        <p
          className="rounded-[var(--raio)] border px-4 py-3 text-sm"
          style={{ borderColor: "var(--cor-critico)", background: "var(--cor-critico-fundo)", color: "var(--cor-critico)" }}
        >
          {estado.erro}
        </p>
      )}
      {estado.ok && (
        <p className="text-sm" style={{ color: "var(--cor-marca-clara)" }}>
          Sinal cadastrado.
        </p>
      )}
      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Salvando..." : "Cadastrar sinal"}
      </button>
    </form>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
        {rotulo}
      </span>
      {children}
    </label>
  );
}
