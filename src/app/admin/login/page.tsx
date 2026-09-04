"use client";

import { useActionState } from "react";
import { loginAdmin, type EstadoLoginAdmin } from "../actions";
import { FormularioLogin } from "@/components/ui/formulario-login";

const estadoInicial: EstadoLoginAdmin = {};

export default function LoginAdminPage() {
  const [estado, formAction, pendente] = useActionState(loginAdmin, estadoInicial);

  return (
    <FormularioLogin
      titulo="Painel administrativo"
      subtitulo="Acesso restrito à equipe da Tech 10."
      formAction={formAction}
      erro={estado.erro}
      pendente={pendente}
    />
  );
}
