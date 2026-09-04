"use client";

import { useActionState } from "react";
import { loginFornecedor, type EstadoLoginFornecedor } from "../actions";
import { FormularioLogin } from "@/components/ui/formulario-login";

const estadoInicial: EstadoLoginFornecedor = {};

export default function LoginFornecedorPage() {
  const [estado, formAction, pendente] = useActionState(loginFornecedor, estadoInicial);

  return (
    <FormularioLogin
      titulo="Painel do fornecedor"
      subtitulo="Entre com o e-mail e a senha cadastrados na sua ata."
      formAction={formAction}
      erro={estado.erro}
      pendente={pendente}
    />
  );
}
