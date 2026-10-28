/** Allowlist exclusiva desta limpeza. Nunca usar exclusao recursiva do tenant. */
export const PROJECT = 'pdv-lanchonete-1fa79';
export const RID = 'rest_cafe_anis_930abfe0d7a82c4b';
export const APAGAR = [
  'pedidos', 'delivery_orders', 'movimentacoes_estoque', 'despesas',
  'sessoes_caixa', 'pedidos_reposicao', 'agregados_diarios',
  'agregados_mensais', 'eventos_agregados', 'eventos_pagamento', 'eventos_itens',
] as const;
export const PRESERVAR = [
  'estoque', 'produtos', 'categorias', 'mesas', 'lotes_producao',
  'movimentacoes_producao', 'usuarios', 'fornecedores', 'imagens',
] as const;
export type Linha = { id: string; dados: Record<string, any> };
export type Dados = Record<string, Linha[]>;
export function validarDestino(projeto: string, rid: string, nome: string): void {
  if (projeto !== PROJECT || rid !== RID || nome !== 'Café Anis') {
    throw new Error('Destino diferente do projeto/restaurante Café Anis esperado. Nada foi apagado.');
  }
}
export function bloqueios(dados: Dados): string[] {
  const erros: string[] = [];
  const verificar = (colecao: string, teste: (d: Record<string, any>) => boolean, motivo: string) => {
    for (const linha of dados[colecao] || []) {
      if (teste(linha.dados)) erros.push(`${colecao}/${linha.id}: ${motivo}`);
    }
  };
  verificar('pedidos', d => !['pago', 'cancelado'].includes(d.status) ||
    d.cozinhaPendente || d.reservaConferenciaPendente ||
    (d.itens || []).some((i: any) => i.modoEstoque === 'antecipado' &&
      i.lotesReservados?.length && !i.estoqueEntregueEm && !i.reservaLiberadaEm && !i.baixaConferenciaEm),
    'finalize pedido, cozinha e conferencia de reservas antes da limpeza');
  verificar('delivery_orders', d => !['delivered', 'cancelled'].includes(d.status), 'finalize o delivery');
  verificar('sessoes_caixa', d => d.status !== 'fechado', 'feche o caixa');
  verificar('mesas', d => !!d.pedidoAtivoId || !['livre', 'reservada'].includes(d.status), 'libere a mesa pelo sistema');
  verificar('lotes_producao', d => !Number.isFinite(Number(d.reservado ?? 0)) || Number(d.reservado ?? 0) !== 0,
    'resolva reservas na estufa; a limpeza nao altera lotes');
  verificar('pedidos_reposicao', d => !['recebido', 'cancelado'].includes(d.status), 'receba ou cancele a reposicao');
  return erros;
}
