import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { contagem } from "@/lib/acompanhamento-view";
import { COMISSAO_MAXIMA_PERCENTUAL, COMISSAO_MINIMA_PERCENTUAL } from "@/lib/comissao";
import {
  faixasValidas,
  formatarPercentual,
  formatarPercentualCampo,
  formatarValorFaixa,
} from "@/lib/comissao-sugerida";
import { FormularioNovaFaixa } from "./formulario-nova-faixa";
import { percentualForaDoContrato } from "./leitura";
import { LinhaFaixa, type DadosFaixa } from "./linha-faixa";

export const dynamic = "force-dynamic";

/** Limite de segurança da consulta: uma tabela de configuração não chega perto disso. */
const LIMITE_FAIXAS = 500;

/**
 * Faixas de comissão sugerida (Projeto RNA, etapa 6, 2026-10-23): o
 * administrador define a partir de que valor total de ata vale cada
 * percentual. Ao cadastrar o contrato de intermediação de uma ata, a tela do
 * contrato mostra a sugestão para o valor total dela e deixa o administrador
 * copiá-la para o campo; quem decide o percentual é o administrador. A
 * plataforma não traz nenhum número pronto: sem faixas, não há sugestão.
 */
export default async function ComissaoPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const linhas = await prisma.faixaComissao.findMany({
    orderBy: { valorMinimo: "asc" },
    take: LIMITE_FAIXAS,
    select: { id: true, valorMinimo: true, percentual: true, descricao: true, ativo: true },
  });

  const faixas: DadosFaixa[] = linhas.map((l) => {
    const percentual = Number(l.percentual);
    return {
      id: l.id,
      valorTexto: formatarValorFaixa(Number(l.valorMinimo)),
      percentualTexto: formatarPercentual(percentual),
      percentualCampo: formatarPercentualCampo(percentual),
      descricao: l.descricao,
      ativo: l.ativo,
      foraDoContrato: percentualForaDoContrato(percentual),
    };
  });

  // Só as ativas e utilizáveis entram na sugestão (a mesma peneira da regra).
  const emUso = faixasValidas(
    linhas.filter((l) => l.ativo).map((l) => ({ valorMinimo: Number(l.valorMinimo), percentual: Number(l.percentual) })),
  );
  const ativas = linhas.filter((l) => l.ativo).length;
  const percentuais = emUso.map((f) => f.percentual);
  const menor = percentuais.length > 0 ? Math.min(...percentuais) : null;
  const maior = percentuais.length > 0 ? Math.max(...percentuais) : null;
  const primeiraFaixaEmUso = emUso[0] ?? null;
  const ativasForaDoContrato = linhas.some((l) => l.ativo && percentualForaDoContrato(Number(l.percentual)));

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-6xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Financeiro"
        titulo="Comissão"
        destaque="sugerida"
        descricao="Faixas de comissão por valor total da ata: a sugestão aparece ao cadastrar o contrato de intermediação; a decisão do percentual é do administrador."
      />

      <FaixaNumeros
        itens={[
          {
            valor: ativas,
            rotulo: ativas === 1 ? "Faixa ativa" : "Faixas ativas",
            nota: contagem(linhas.length, "cadastrada", "cadastradas"),
            tom: ativas > 0 ? "marca" : undefined,
          },
          {
            valor: menor === null ? "—" : formatarPercentual(menor),
            rotulo: "Menor percentual",
            nota: "entre as faixas ativas",
          },
          {
            valor: maior === null ? "—" : formatarPercentual(maior),
            rotulo: "Maior percentual",
            nota: "entre as faixas ativas",
          },
        ]}
      />

      <Secao
        titulo="Faixas"
        destaque
        descricao="A sugestão usa a faixa de maior valor inicial que não passe do valor total da ata. Faixa inativa não entra no cálculo. A comissão é paga pelo fornecedor, sobre o que o ente liquidou e pagou."
      >
        {faixas.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma faixa cadastrada"
            descricao="Enquanto não houver faixas, nenhuma sugestão de comissão aparece no contrato de intermediação das atas, e o percentual é digitado à mão. Cadastre a primeira faixa no formulário abaixo."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {primeiraFaixaEmUso && primeiraFaixaEmUso.valorMinimo > 0 && (
              <Aviso tom="info">
                Atas com valor total abaixo de {formatarValorFaixa(primeiraFaixaEmUso.valorMinimo)} (onde começa a
                primeira faixa ativa) ficam sem sugestão. Para toda ata ter uma, cadastre uma faixa a partir de R$ 0,00.
              </Aviso>
            )}
            {ativas > 0 && emUso.length === 0 && (
              <Aviso tom="atencao">
                Nenhuma faixa ativa está em condição de uso (percentual fora do que a plataforma aceita para faixas).
                Corrija os percentuais para a sugestão voltar a aparecer.
              </Aviso>
            )}
            {ativasForaDoContrato && (
              <Aviso tom="atencao">
                Há faixa ativa com percentual fora do intervalo que o contrato de intermediação aceita (de{" "}
                {COMISSAO_MINIMA_PERCENTUAL}% a {COMISSAO_MAXIMA_PERCENTUAL}%). A sugestão dela aparece na tela do
                contrato, mas sem o botão &quot;Usar sugestão&quot;, porque o contrato não grava esse percentual.
              </Aviso>
            )}
            <div className="moldura-tabela">
              <table className="tabela-atas min-w-[780px]">
                <thead>
                  <tr>
                    <th>Valor da ata a partir de</th>
                    <th>Percentual</th>
                    <th>Descrição</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {faixas.map((f) => (
                    <LinhaFaixa key={f.id} faixa={f} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Secao>

      <Secao
        titulo="Nova faixa"
        descricao="Cada valor inicial só pode ter uma faixa (ativa ou não). Para mudar o percentual de um valor que já tem faixa, edite a faixa na tabela. O percentual aceita até 2 casas decimais."
      >
        <FormularioNovaFaixa />
      </Secao>
    </AppShell>
  );
}
