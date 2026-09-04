"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginOrgao, type EstadoFormularioOrgao } from "../actions";
import { FormularioLogin } from "@/components/ui/formulario-login";

const estadoInicial: EstadoFormularioOrgao = {};

export default function LoginOrgaoPage() {
  const [estado, formAction, pendente] = useActionState(loginOrgao, estadoInicial);

  return (
    <FormularioLogin
      titulo="Painel do órgão comprador"
      subtitulo="Entre para pedir adesão e acompanhar seus pedidos."
      formAction={formAction}
      erro={estado.erro}
      pendente={pendente}
      rodape={
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Ainda não tem conta?{" "}
          <Link href="/orgao/cadastro" className="underline">
            Cadastre seu órgão
          </Link>
        </p>
      }
    />
  );
}
