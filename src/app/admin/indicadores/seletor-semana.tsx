import Link from "next/link";
import {
  fotoExata,
  hojeEmBrasilia,
  rotuloSemana,
  semanaAnterior,
  semanaSeguinte,
  type Semana,
} from "@/lib/indicadores-semanais";

const ROTA = "/admin/indicadores";

/**
 * Escolha da semana por ?semana=AAAA-MM-DD (qualquer dia da semana desejada):
 * formulário GET e links, tudo funciona sem JavaScript. A validação da data é
 * feita no servidor (escolherSemana); o `max` do campo é só uma ajuda.
 */
export function SeletorSemana({ semana, agora }: { semana: Semana; agora: Date }) {
  const emAndamento = fotoExata(semana, agora);
  const seguinte = semanaSeguinte(semana);
  const haSeguinte = seguinte.inicio.getTime() <= agora.getTime();

  return (
    <div className="painel flex flex-wrap items-end justify-between gap-x-8 gap-y-4 p-5">
      <div className="min-w-0">
        <p className="eyebrow">Semana</p>
        <p className="marca numero mt-1 text-[20px]" style={{ color: "var(--cor-texto)", fontWeight: 800 }}>
          {rotuloSemana(semana)}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
          Segunda a domingo, horário de Brasília{emAndamento ? " · semana em andamento" : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Link href={`${ROTA}?semana=${semanaAnterior(semana).segunda}`} className="botao-atas secundario">
          ← Semana anterior
        </Link>
        {haSeguinte && (
          <Link href={`${ROTA}?semana=${seguinte.segunda}`} className="botao-atas secundario">
            Semana seguinte →
          </Link>
        )}
        {!emAndamento && (
          <Link href={ROTA} className="botao-atas secundario">
            Semana atual
          </Link>
        )}

        <form method="get" action={ROTA} className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="rotulo-campo">Ir para a semana de</span>
            <input
              type="date"
              name="semana"
              defaultValue={semana.segunda}
              min="2000-01-01"
              max={hojeEmBrasilia(agora)}
              required
              className="campo-atas"
            />
          </label>
          <button type="submit" className="botao-atas">
            Ver semana
          </button>
        </form>
      </div>
    </div>
  );
}
