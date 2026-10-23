import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import {
  COMPROMISSOS_INTEGRIDADE,
  TITULO_INTEGRIDADE,
  VERSAO_INTEGRIDADE,
  acoesDisponiveis,
  rotuloStatusCredenciamento,
  tomStatusCredenciamento,
} from "@/lib/credenciamento";
import { lerCredenciamentoDoVendedor } from "@/lib/credenciamento-db";
import { dataBr, fecharFrase } from "@/lib/credenciamento-view";
import { logoutVendedor } from "../actions";
import { NAV_VENDEDOR } from "../nav";
import { FormularioAceite } from "./formulario-aceite";

export const dynamic = "force-dynamic";

/**
 * Credenciamento do consultor (Projeto RNA, etapa 6, 2026-10-23): o consultor
 * lê o compromisso de integridade, aceita, e a equipe da plataforma libera.
 * Enquanto não estiver credenciado, ele não pede municípios nem leva uma
 * negociação adiante; o resto do trabalho (registrar contato, recusar) segue
 * livre. A tela mostra o status, o texto e, quando o status permite, o aceite.
 */
export default async function CredenciamentoVendedorPage() {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) {
    redirect("/vendedor/login");
  }

  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor) {
    redirect("/vendedor/login");
  }

  const registro = await lerCredenciamentoDoVendedor(vendedorId);
  const status = registro?.status ?? "pendente";
  const podeAceitar = acoesDisponiveis(status, "consultor").includes("aceitar");

  return (
    <AppShell
      area={`Vendedor — ${vendedor.nome}`}
      itens={NAV_VENDEDOR}
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Conta"
        titulo="Credenciamento"
        descricao="Para pedir municípios e levar uma negociação adiante, aceite o compromisso de integridade e aguarde a liberação da equipe da plataforma."
      />

      <Secao
        titulo="Seu status"
        acao={<Badge tom={tomStatusCredenciamento(status)}>{rotuloStatusCredenciamento(status)}</Badge>}
        destaque
      >
        {status === "pendente" && (
          <Aviso tom="atencao" titulo="Falta o seu aceite.">
            Leia o compromisso abaixo e confirme no fim da página. Depois do aceite, a equipe da plataforma analisa e
            libera.
          </Aviso>
        )}
        {status === "aceito" && (
          <Aviso tom="info" titulo="Aguardando aprovação da equipe.">
            {registro?.integridadeAceitaEm
              ? `Você aceitou o compromisso em ${dataBr(registro.integridadeAceitaEm)}. `
              : "Seu aceite foi registrado. "}
            Quando a equipe liberar, você poderá pedir municípios e levar as negociações adiante. A liberação depende da
            decisão da equipe.
          </Aviso>
        )}
        {status === "credenciado" && (
          <Aviso tom="sucesso" titulo="Você está credenciado.">
            {registro?.credenciadoEm
              ? `Liberado pela equipe da plataforma em ${dataBr(registro.credenciadoEm)}. `
              : "Liberado pela equipe da plataforma. "}
            Você pode pedir municípios e levar as negociações adiante.
          </Aviso>
        )}
        {status === "suspenso" && (
          <Aviso tom="alerta" titulo="Sua atuação está suspensa.">
            {registro?.suspensoEm ? `Suspensa em ${dataBr(registro.suspensoEm)}. ` : ""}
            {registro?.motivo ? `Motivo informado pela equipe: ${fecharFrase(registro.motivo)} ` : ""}
            Para voltar, aceite o compromisso de integridade de novo e aguarde a liberação da equipe da plataforma. Seus
            contatos e negociações já registrados continuam salvos.
          </Aviso>
        )}
      </Secao>

      <Secao
        titulo={TITULO_INTEGRIDADE}
        descricao={`Leia com calma. São ${COMPROMISSOS_INTEGRIDADE.length} compromissos (texto versão ${VERSAO_INTEGRIDADE}).`}
      >
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-[14.5px] leading-relaxed marker:font-bold" style={{ color: "var(--cor-texto-2)" }}>
          {COMPROMISSOS_INTEGRIDADE.map((compromisso) => (
            <li key={compromisso} className="pl-1">
              {compromisso}
            </li>
          ))}
        </ol>

        {podeAceitar && (
          <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--cor-borda)" }}>
            <FormularioAceite versao={VERSAO_INTEGRIDADE} />
          </div>
        )}
      </Secao>
    </AppShell>
  );
}
