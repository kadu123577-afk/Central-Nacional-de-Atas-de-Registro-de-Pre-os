"use client";

import { useActionState } from "react";
import { loginVendedor, type EstadoLoginVendedor } from "../actions";
import { FormularioLogin } from "@/components/ui/formulario-login";

const estadoInicial: EstadoLoginVendedor = {};

export default function LoginVendedorPage() {
  const [estado, formAction, pendente] = useActionState(loginVendedor, estadoInicial);

  return (
    <FormularioLogin
      titulo="Painel do vendedor"
      subtitulo="Acesso restrito ao time comercial da Tech 10."
      formAction={formAction}
      erro={estado.erro}
      pendente={pendente}
    />
  );
}
