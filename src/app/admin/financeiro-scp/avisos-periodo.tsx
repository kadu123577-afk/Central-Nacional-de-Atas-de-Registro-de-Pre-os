import { Aviso } from "@/components/ui/aviso";
import { contagem } from "@/lib/acompanhamento-view";
import type { ReceitaDoPeriodo } from "@/lib/financeiro-scp-db";

/**
 * Avisos sobre a receita do período (comissão recebida): o que ficou de fora ou
 * entrou com zero, e o que a deixa incompleta. Sem isso o número da tela pareceria
 * completo sem ser. Usado pela tela principal e pelo demonstrativo.
 */
export function AvisosDaReceita({ receita }: { receita: ReceitaDoPeriodo }) {
  const { invalidas, semDataRecebimento, semPercentual } = receita;
  return (
    <>
      {receita.truncada && (
        <Aviso tom="critico" titulo="Receita incompleta.">
          Há comissões recebidas demais neste período para somar com segurança. Os números abaixo não são confiáveis.
        </Aviso>
      )}
      {invalidas > 0 && (
        <Aviso tom="critico" titulo="Receita incompleta.">
          {invalidas === 1
            ? "1 comissão recebida tem valor ou percentual inválido e ficou de fora da conta."
            : `${invalidas} comissões recebidas têm valor ou percentual inválido e ficaram de fora da conta.`}{" "}
          Corrija a liquidação no controle de recebíveis; enquanto isso a partilha não é calculada.
        </Aviso>
      )}
      {semDataRecebimento > 0 && (
        <Aviso tom="atencao" titulo="Recebimento sem data.">
          {semDataRecebimento === 1
            ? "1 liquidação está marcada como recebida sem a data do recebimento e não entra em nenhum mês."
            : `${semDataRecebimento} liquidações estão marcadas como recebidas sem a data do recebimento e não entram em nenhum mês.`}{" "}
          Preencha a data do recebimento na liquidação.
        </Aviso>
      )}
      {semPercentual > 0 && (
        <Aviso tom="atencao" titulo="Comissão sem percentual.">
          {semPercentual === 1
            ? "1 liquidação recebida neste mês é de uma oportunidade sem percentual de comissão e entrou na conta com R$ 0,00."
            : `${contagem(semPercentual, "liquidação", "liquidações")} recebidas neste mês são de oportunidades sem percentual de comissão e entraram na conta com R$ 0,00.`}
        </Aviso>
      )}
    </>
  );
}
