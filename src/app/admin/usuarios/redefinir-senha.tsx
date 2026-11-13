"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { redefinirSenha, type EstadoEquipe } from "./equipe-actions";

const estadoInicial: EstadoEquipe = {};

/** A senha provisória aparece uma vez, para quem criou ou redefiniu a conta passar à pessoa. */
export function AvisoSenhaProvisoria({ senha }: { senha: string }) {
  return (
    <Aviso tom="atencao" titulo="Senha provisória">
      <span className="font-mono text-[15px] font-bold tracking-wide select-all">{senha}</span>
      <br />
      Ela aparece só agora. Passe à pessoa: no primeiro acesso, o sistema pede para ela definir a senha dela.
    </Aviso>
  );
}

/** "Redefinir senha": gera uma senha provisória nova e encerra as sessões abertas da conta. */
export function BotaoRedefinirSenha({ tipo, id }: { tipo: "admin" | "vendedor"; id: string }) {
  const [estado, formAction, pendente] = useActionState(redefinirSenha, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pendente}
        className="botao-atas secundario pequeno self-start"
        onClick={(e) => {
          if (!window.confirm("Redefinir a senha? As sessões abertas dessa pessoa serão encerradas.")) e.preventDefault();
        }}
      >
        {pendente ? "Gerando..." : "Redefinir senha"}
      </button>
      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.senhaProvisoria && <AvisoSenhaProvisoria senha={estado.senhaProvisoria} />}
    </form>
  );
}
