import { Aviso } from "@/components/ui/aviso";
import { Secao } from "@/components/ui/secao";

const NOTAS: { titulo: string; texto: string }[] = [
  {
    titulo: "Semana",
    texto:
      "De segunda-feira, 00:00, a domingo, 23:59, no horário de Brasília. Cada número é comparado com o da semana anterior. Não há metas cadastradas: nenhum número aqui é um objetivo.",
  },
  {
    titulo: "Contatos registrados",
    texto:
      "Registros de contato (o histórico dos contatos de cada município) feitos na semana, nas atas e nos municípios que cada consultor negocia. Mover um cartão no Kanban também grava um registro, e essas movimentações entram na conta. O sistema ainda não guarda quem fez cada registro: ele vai para o consultor que negocia aquele município naquela ata.",
  },
  {
    titulo: "Municípios em negociação",
    texto:
      "Negociações que estão hoje no estágio “Em negociação”, com o prazo em dia e sem alteração depois do fim da semana escolhida. Só a semana em andamento mostra o número exato. Nas semanas passadas (inclusive a anterior, usada na comparação) o número é um mínimo, marcado com ≥, porque negociações que mudaram de estágio depois não aparecem. Por isso a variação deste indicador sai como “no máximo” (semana atual contra um mínimo) ou “não comparável” (duas semanas passadas): não é uma alta ou queda confirmada.",
  },
  {
    titulo: "Avançaram na semana",
    texto:
      "Negociações que estão hoje em “Em negociação” ou “Aderiu” e cuja última alteração caiu na semana. Sem histórico de estágio, qualquer alteração recente conta (uma anotação, um novo registro de contato), então o número pode ser maior que o de municípios que de fato mudaram de estágio.",
  },
  {
    titulo: "Adesões fechadas",
    texto:
      "Negociações que estão hoje em “Aderiu” e cuja última alteração caiu na semana, com a soma do valor aderido informado no cartão. É o valor que o consultor registrou como aderido, não o que será liquidado. Se o cartão for alterado depois (inclusive por um novo registro de contato), a adesão e o valor aderido passam para a semana da última alteração.",
  },
  {
    titulo: "Comissão sobre o liquidado",
    texto:
      "Para as liquidações com data na semana, o valor liquidado multiplicado pelo percentual de comissão da negociação. É a comissão que nasce da liquidação, não um valor a receber na semana: ela só pode ser cobrada depois que o órgão pagar o fornecedor.",
  },
  {
    titulo: "Recebida",
    texto:
      "O mesmo cálculo, para as liquidações marcadas como “Recebida” cuja data de recebimento caiu na semana. Pode vir de liquidações de semanas anteriores.",
  },
];

/** Como cada indicador é contado e o que o sistema ainda não consegue medir. */
export function NotasIndicadores() {
  return (
    <Secao titulo="Como cada indicador é contado" descricao="Leia antes de comparar semanas: algumas contas dependem de dados que o sistema ainda não guarda.">
      <div className="flex flex-col gap-5">
        <Aviso tom="atencao" titulo="Limitações.">
          O sistema ainda não guarda o histórico de estágio de cada negociação nem quem fez cada registro de contato.
          Por isso os números de avanços, adesões e contatos são estimativas pela data da última alteração do cartão e
          pelo dono da negociação. Quando esse histórico passar a ser gravado, as contas podem ficar exatas.
        </Aviso>
        <ul className="lista-linhas">
          {NOTAS.map((nota) => (
            <li key={nota.titulo}>
              <b className="text-[13.5px]" style={{ color: "var(--cor-texto)" }}>
                {nota.titulo}
              </b>
              <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
                {nota.texto}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Secao>
  );
}
