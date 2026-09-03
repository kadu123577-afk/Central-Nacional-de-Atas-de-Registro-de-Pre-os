/**
 * Motor de cálculo de saldo e trava de adesão — art. 86 da Lei 14.133/2021.
 *
 * Duas regras se aplicam a um item de ata, independentes uma da outra:
 * 1. Nenhum órgão participante não originário pode aderir a mais de 50% da
 *    quantidade originalmente registrada para o item.
 * 2. A soma de todas as adesões de participantes não originários não pode
 *    ultrapassar o dobro da quantidade originalmente registrada.
 */

export const PERCENTUAL_LIMITE_POR_ORGAO = 0.5;
export const MULTIPLICADOR_LIMITE_AGREGADO = 2;

export type MotivoRecusa = "LIMITE_POR_ORGAO_EXCEDIDO" | "LIMITE_AGREGADO_EXCEDIDO";

export interface ResultadoVerificacaoAdesao {
  permitido: boolean;
  motivo?: MotivoRecusa;
  limitePorOrgao: number;
  limiteAgregado: number;
  saldoAgregadoDisponivel: number;
}

export function limitePorOrgao(quantidadeRegistrada: number): number {
  return quantidadeRegistrada * PERCENTUAL_LIMITE_POR_ORGAO;
}

export function limiteAgregado(quantidadeRegistrada: number): number {
  return quantidadeRegistrada * MULTIPLICADOR_LIMITE_AGREGADO;
}

export function saldoAgregadoDisponivel(
  quantidadeRegistrada: number,
  quantidadeJaConsumida: number,
): number {
  return limiteAgregado(quantidadeRegistrada) - quantidadeJaConsumida;
}

/**
 * Verifica se um novo pedido de adesão pode ser aceito.
 *
 * @param quantidadeRegistrada quantidade original do item na ata
 * @param quantidadeJaConsumida soma das adesões já aceitas para o item (todos os órgãos)
 * @param quantidadeJaAderidaPeloOrgao soma das adesões já aceitas para o item, feitas pelo mesmo órgão solicitante
 * @param quantidadeSolicitada quantidade do novo pedido
 */
export function verificarAdesao(
  quantidadeRegistrada: number,
  quantidadeJaConsumida: number,
  quantidadeJaAderidaPeloOrgao: number,
  quantidadeSolicitada: number,
): ResultadoVerificacaoAdesao {
  const limitePorOrgaoCalculado = limitePorOrgao(quantidadeRegistrada);
  const limiteAgregadoCalculado = limiteAgregado(quantidadeRegistrada);
  const saldoDisponivel = saldoAgregadoDisponivel(quantidadeRegistrada, quantidadeJaConsumida);

  const totalDoOrgaoAposPedido = quantidadeJaAderidaPeloOrgao + quantidadeSolicitada;
  if (totalDoOrgaoAposPedido > limitePorOrgaoCalculado) {
    return {
      permitido: false,
      motivo: "LIMITE_POR_ORGAO_EXCEDIDO",
      limitePorOrgao: limitePorOrgaoCalculado,
      limiteAgregado: limiteAgregadoCalculado,
      saldoAgregadoDisponivel: saldoDisponivel,
    };
  }

  if (quantidadeSolicitada > saldoDisponivel) {
    return {
      permitido: false,
      motivo: "LIMITE_AGREGADO_EXCEDIDO",
      limitePorOrgao: limitePorOrgaoCalculado,
      limiteAgregado: limiteAgregadoCalculado,
      saldoAgregadoDisponivel: saldoDisponivel,
    };
  }

  return {
    permitido: true,
    limitePorOrgao: limitePorOrgaoCalculado,
    limiteAgregado: limiteAgregadoCalculado,
    saldoAgregadoDisponivel: saldoDisponivel,
  };
}
