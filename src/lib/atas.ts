/**
 * Regra de elegibilidade de uma ata pra aparecer no catálogo e aceitar
 * pedido de adesão: precisa estar aprovada E dentro da vigência.
 *
 * Antes só o status era checado — uma ata aprovada cuja vigência já tinha
 * passado continuava aparecendo como disponível, o que não é só estética:
 * um órgão podia aderir a uma ata já vencida, gerando um pedido sem
 * respaldo jurídico algum. Toda consulta que decide o que é "disponível"
 * (catálogo, home, formulário de pedido, e a própria criação da adesão)
 * precisa usar esta mesma checagem.
 */
export function ataDisponivelParaAdesao(ata: {
  status: string;
  dataVigenciaFim: Date;
}): boolean {
  return ata.status === "APROVADA" && ata.dataVigenciaFim.getTime() >= Date.now();
}
