import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { feriadosNacionais } from "@/lib/dias-uteis";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { removerFeriado } from "./actions";
import { FormularioFeriado } from "./formulario-feriado";

export const dynamic = "force-dynamic";

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const diaSemana = (iso: string) =>
  ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(`${iso}T12:00:00Z`).getUTCDay()];

/**
 * Calendário de dias úteis (2026-11-14): os feriados nacionais entram sozinhos; aqui a gestão
 * acrescenta feriado estadual, municipal e ponto facultativo. Vale para prazos novos.
 */
export default async function FeriadosPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "usuarios.gerir");

  const anoAtual = new Date().getFullYear();
  const nacionais = [...feriadosNacionais(anoAtual), ...feriadosNacionais(anoAtual + 1)];
  const extras = await prisma.feriado.findMany({ orderBy: { data: "asc" }, select: { id: true, data: true, nome: true } });

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-4xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Cadastros"
        titulo="Calendário de"
        destaque="dias úteis"
        descricao="Os prazos do workflow contam em dias úteis: o dia do começo não conta e o vencimento nunca cai em fim de semana, feriado, Carnaval ou Corpus Christi."
        voltar={{ href: "/admin", rotulo: "Minhas tarefas" }}
      />

      <Secao
        titulo="Feriados da equipe"
        descricao="Feriado estadual, municipal e outros pontos facultativos. Mudar o calendário vale para prazos novos: os já gravados não são recalculados."
        destaque
      >
        <div className="flex flex-col gap-5">
          <FormularioFeriado />
          {extras.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
              Nenhum feriado da equipe cadastrado. Só valem fins de semana e feriados nacionais.
            </p>
          ) : (
            <div className="moldura-tabela">
              <table className="tabela-atas min-w-[480px]">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Nome</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {extras.map((f) => {
                    const iso = f.data.toISOString().slice(0, 10);
                    return (
                      <tr key={f.id}>
                        <td className="align-top">
                          {dataBr(iso)} <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>({diaSemana(iso)})</span>
                        </td>
                        <td className="align-top">{f.nome}</td>
                        <td className="align-top text-right">
                          <form action={removerFeriado.bind(null, f.id)}>
                            <button type="submit" className="botao-atas link">
                              Remover
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Secao>

      <Secao titulo={`Feriados e pontos facultativos de ${anoAtual} e ${anoAtual + 1}`} descricao="Calculados automaticamente (Sexta-feira Santa, Carnaval e Corpus Christi mudam a cada ano). Não precisam ser cadastrados.">
        <div className="moldura-tabela">
          <table className="tabela-atas min-w-[480px]">
            <thead>
              <tr>
                <th>Data</th>
                <th>Feriado</th>
              </tr>
            </thead>
            <tbody>
              {nacionais.map((f) => (
                <tr key={f.data}>
                  <td className="align-top">
                    {dataBr(f.data)} <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>({diaSemana(f.data)})</span>
                  </td>
                  <td className="align-top">
                    {f.nome}
                    {f.tipo === "ponto_facultativo" && (
                      <span className="ml-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        (ponto facultativo)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>
    </AppShell>
  );
}
