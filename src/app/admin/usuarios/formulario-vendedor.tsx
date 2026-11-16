"use client";

import { useActionState } from "react";
import { criarVendedorAdmin, type EstadoCriarVendedor } from "../actions";
import { Secao } from "@/components/ui/secao";
import { Aviso } from "@/components/ui/aviso";
import { AvisoSenhaProvisoria } from "./redefinir-senha";

const estadoInicial: EstadoCriarVendedor = {};

export function FormularioNovoVendedor() {
  const [estado, formAction, pendente] = useActionState(criarVendedorAdmin, estadoInicial);

  return (
    <Secao titulo="Novo vendedor">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Nome" name="nome" required />
          <Campo label="E-mail" name="email" type="email" required />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Senha provisória (deixe em branco para o sistema gerar)" name="senha" type="password" />
          {/* Só há consultor interno (decisão de 16/11/2026): o tipo não é mais uma escolha. */}
          <input type="hidden" name="tipo" value="interno" />
        </div>

        {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
        {estado.senhaProvisoria && <AvisoSenhaProvisoria senha={estado.senhaProvisoria} />}

        <button type="submit" disabled={pendente} className="botao-atas self-start">
          {pendente ? "Salvando..." : "Cadastrar vendedor"}
        </button>
      </form>
    </Secao>
  );
}

function Campo({
  label,
  name,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="rotulo-campo">{label}</span>
      <input name={name} type={type} required={required} className="campo-atas" />
    </label>
  );
}
