"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginFornecedor, type EstadoLoginFornecedor } from "../actions";
import { FormularioLogin } from "@/components/ui/formulario-login";

const estadoInicial: EstadoLoginFornecedor = {};

export function FormularioLoginFornecedor() {
  const [estado, formAction, pendente] = useActionState(loginFornecedor, estadoInicial);
  const searchParams = useSearchParams();
  const motivo = searchParams.get("motivo");

  return (
    <FormularioLogin
      titulo="Painel do fornecedor"
      subtitulo={
        motivo === "cadastro-exige-login"
          ? "O cadastro de atas agora fica dentro do painel do fornecedor — entre ou crie sua conta pra continuar."
          : "Entre com o e-mail e a senha cadastrados na sua ata."
      }
      formAction={formAction}
      erro={estado.erro}
      pendente={pendente}
      rodape={
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Ainda não tem conta?{" "}
          <Link href="/fornecedor/cadastro" className="underline">
            Cadastre sua empresa
          </Link>
        </p>
      }
    />
  );
}
