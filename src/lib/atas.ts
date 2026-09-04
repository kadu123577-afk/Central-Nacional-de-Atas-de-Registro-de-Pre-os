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

/**
 * Dias até o fim da vigência — negativo quando já venceu. Arredonda pra
 * cima (`Math.ceil`) pra "vence daqui a pouco mais de 1 dia" não aparecer
 * como "vence hoje".
 */
export function diasParaVencer(dataVigenciaFim: Date): number {
  return Math.ceil((dataVigenciaFim.getTime() - Date.now()) / 86_400_000);
}
