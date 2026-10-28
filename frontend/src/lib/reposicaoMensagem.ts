/** Composição de texto para o WhatsApp, sem API externa ou cobrança. */
export type ItemMensagem = { nome: string; quantidade: number; unidade: string }

export const ABERTURAS_REPOSICAO = [
  'Olá! Tudo bem? Gostaríamos de solicitar a reposição dos seguintes insumos:',
  'Bom dia! Por gentileza, podem separar e entregar os itens abaixo?',
  'Olá, equipe! Precisamos reabastecer nosso estoque com os seguintes produtos:',
] as const

export function normalizarTelefoneWhatsApp(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, '')
  // Brasil: DDD + número (10/11 dígitos) ou +55 já informado.
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return digitos
  return null
}

export function criarMensagemReposicao(
  restaurante: string,
  endereco: string,
  itens: ItemMensagem[],
  variante = Math.floor(Math.random() * ABERTURAS_REPOSICAO.length),
): string {
  if (!endereco.trim() || itens.length === 0 || itens.some(i => !i.nome || !(i.quantidade > 0))) {
    throw new Error('Confira endereço e quantidades antes de solicitar reposição')
  }
  const abertura = ABERTURAS_REPOSICAO[((variante % ABERTURAS_REPOSICAO.length) + ABERTURAS_REPOSICAO.length) % ABERTURAS_REPOSICAO.length]
  const textoItens = itens.map(i =>
    `• ${i.nome}: ${i.quantidade.toLocaleString('pt-BR', {maximumFractionDigits: 3})} ${i.unidade}`,
  ).join('\n')
  return `${abertura}\n\n${textoItens}\n\nEndereço de entrega: ${endereco.trim()}\n\nRestaurante: ${restaurante.trim() || 'Nosso restaurante'}\nAgradecemos a atenção!`
}

export function urlWhatsApp(telefone: string, mensagem: string): string | null {
  const numero = normalizarTelefoneWhatsApp(telefone)
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}` : null
}
