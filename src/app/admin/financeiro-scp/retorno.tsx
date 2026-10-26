import { Aviso } from "@/components/ui/aviso";
import type { EstadoAcao } from "./actions";

/** Uma resposta curta de uma ação (erro em caixa, aviso neutro em linha). Não mostra o "ok" puro: cada tela decide a sua mensagem. */
export function Retorno({ estado }: { estado: EstadoAcao<unknown> }) {
  if (estado.erro) return <Aviso tom="critico">{estado.erro}</Aviso>;
  if (estado.ok && estado.aviso) {
    return (
      <p role="status" className="text-xs font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
        {estado.aviso}
      </p>
    );
  }
  return null;
}
