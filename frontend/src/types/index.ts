// Tipos espelhando os modelos Pydantic/Dart (camelCase na API)

export interface AuthMe {
  uid: string
  email: string | null
  papel: string | null
  restaurantId: string | null
  restaurantNome: string | null
  perfil: AppUser | null
  /** dono da PLATAFORMA (sistema/global.donoUids) — acesso ao console /plataforma */
  souDono?: boolean
}

export type ConviteStatus = 'ativa' | 'usada' | 'expirada' | 'revogada'

export interface Convite {
  id: string
  status: ConviteStatus
  criadoEm: string
  expiraEm: string
  usadoEm?: string | null
  usadoPorUid?: string | null
  criadoPor?: string
  ativo?: boolean
}

export interface AppUser {
  id: string
  nome: string
  papel: string
  email?: string | null
  ativo: boolean
}

export interface Category {
  id: string
  nome: string
  ordem: number
  ativo: boolean
  icone?: string | null
  cor?: string | null
}

export interface ProductVariation {
  id: string
  nome: string
  precoAdicional: number
  ativo: boolean
}

export interface ProductIngredient {
  qtdInformada?: number
  unidadeInformada?: string
  itemId: string
  qtd: number
}

export interface Product {
  id: string
  nome: string
  categoriaId: string
  preco: number
  modoEstoque?: 'sob_pedido' | 'antecipado' | 'revenda'
  rendimentoReceita?: number
  unidadeVenda?: string
  itemRevendaId?: string | null
  acrescimoLucroPercentual?: number
  precisaPreparar: boolean
  variacoes: ProductVariation[]
  ingredientes: ProductIngredient[]
  imagemUrl?: string | null
  temImagem?: boolean
  ativo: boolean
  estoqueMinimo: number
}

export type ProductDraft = Omit<Product, 'id'> & { id?: string }

export interface Mesa {
  id: string
  numero: number
  status: 'livre' | 'ocupada' | 'reservada' | 'inativa'
  pedidoAtivoId?: string | null
  garcomId?: string | null
}

export interface OrderItem {
  encerramentoOperacional?: {motivo: string; em: string; usuarioId: string}
  reservaConferenciaPendente?: boolean
  conferenciaReserva?: {acao: string; motivo: string; em: string; usuarioId: string}
  produtoNome?: string
  id: string
  produtoId: string
  variacaoId?: string | null
  qtd: number
  precoUnitario: number
  observacoes?: string | null
  modoEstoque?: 'sob_pedido' | 'antecipado' | 'revenda'
  lotesReservados?: { loteId: string; qtd: number; custoUnitario: number }[]
  custoProducao?: number
  estoqueEntregueEm?: string
  status: 'pendente' | 'preparo' | 'pronto' | 'entregue' | 'cancelado'
}

export interface Payment {
  id: string
  tipo: 'dinheiro' | 'pix' | 'credito' | 'debito'
  valor: number
  troco?: number | null
  referencia?: string | null
  criadoEm: string
}

export interface Order {
  encerramentoOperacional?: {motivo: string; em: string; usuarioId: string}
  reservaConferenciaPendente?: boolean
  id: string
  mesaId: string | null
  tipo: 'local' | 'delivery' | 'balcao'
  status: 'aberto' | 'pago' | 'cancelado'
  itens: OrderItem[]
  total: number
  pagamentos: Payment[]
  criadoEm: string
  fechadoEm?: string | null
}

export interface InventoryItem {
  fornecedorId?: string | null
  ativo?: boolean
  unidadeCompra?: string
  fatorCompra?: number
  id: string
  nome: string
  unidade: string
  quantidadeAtual: number
  minimo: number
  custoMedio: number
}

export interface StockMovement {
  custoAnterior?: number
  custoUnitario?: number
  id: string
  tipo: 'entrada' | 'saida' | 'ajuste' | 'custo'
  itemId: string
  qtd: number
  saldoApos?: number
  observacao?: string | null
  usuarioId: string
  criadoEm: string
}

export interface DeliveryOrder {
  id: string
  externalId: string
  platform: string
  clienteNome: string
  clienteTelefone?: string | null
  clienteEndereco?: string | null
  itens: { id: string; nome: string; qtd: number; precoUnitario: number }[]
  total: number
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
  criadoEm: string
}

export interface CashSession {
  id: string
  usuarioId: string
  abertoEm?: string | null
  criadoEm: string
  fechadoEm?: string | null
  valorInicial: number
  totalVendas: number
  totalRecebido: number
  sangrias: number
  suprimentos: number
  status: 'aberto' | 'fechado'
  vendasPorFormaPagamento?: Record<string, number>
  quantidadePorProduto?: Record<string, number>
  movimentacoesCaixa?: {
    id: string
    tipo: 'suprimento' | 'sangria'
    valor: number
    observacao?: string | null
    criadoEm: string
  }[]
  resumoFechamento?: {
    esperadoEmCaixa: number
    valorContado: number | null
    diferenca: number | null
  }
}

export interface ReportSummary {
  periodoInicio: string
  periodoFim: string
  totalPedidos: number
  faturamentoBruto: number
  ticketMedio: number
  vendasPorHora: Record<string, number>
  vendasPorFormaPagamento: Record<string, number>
  topProdutos: Record<string, number>
  topCategorias: Record<string, number>
  financeiro?: ResumoFinanceiro
}

export interface Configuracoes {
  nome: string
  endereco?: string
  moeda: string
  timezone: string
  impressoraTipo: string
  impressoraEndereco: string
  baixaEstoqueAutomatica: boolean
  cardapioDigitalAtivo: boolean
}

export interface Fornecedor {
  id: string
  nome: string
  documento?: string | null
  telefone?: string | null
  email?: string | null
  observacoes?: string | null
  ativo: boolean
}

export type DespesaCategoria = 'insumo' | 'folha' | 'conta_fixa' | 'outra'

export interface Despesa {
  id: string
  categoria: DespesaCategoria
  descricao: string
  valor: number
  data: string
  vencimento?: string | null
  status: 'pendente' | 'pago'
  pagoEm?: string | null
  fornecedorId?: string | null
  usuarioId?: string | null
  formaPagamento?: string | null
  observacoes?: string | null
}

export interface ResumoFinanceiro {
  despesasPorCategoria: Record<DespesaCategoria, number>
  totalDespesas: number
  cmvEstimado: number
  resultadoGerencial: number
}


export interface LoteProducao {
  id: string
  produtoId: string
  produtoNome: string
  unidade: string
  quantidadeProduzida: number
  saldo: number
  reservado: number
  custoTotal: number
  custoUnitario: number
  validade: string
  local: string
  usuarioId: string
  criadoEm: string
  loteOrigemId?: string
}

export interface MovimentoProducao {
  id: string
  tipo: 'consumo_conferencia' | 'producao' | 'reserva' | 'entrega' | 'liberacao' | 'perda' | 'conversao_saida' | 'conversao_entrada'
  loteId: string
  produtoId: string
  quantidade: number
  custoTotal?: number
  motivo?: string
  observacao?: string
  pedidoId?: string
  usuarioId: string
  criadoEm: string
}

export interface ItemReposicao {
  itemId: string
  nome: string
  unidade: string
  quantidade: number
  custoUnitarioPrevisto: number
  saldoNaSolicitacao?: number
}

export interface PedidoReposicao {
  id: string
  fornecedorId: string
  fornecedorNome: string
  telefone?: string
  enderecoEntrega: string
  mensagem: string
  status: 'gerado' | 'recebido' | 'cancelado'
  itens: ItemReposicao[]
  criadoEm: string
  recebidoEm?: string
  recebimento?: Array<{ itemId: string; quantidade: number; custoUnitario: number; valorTotal: number }>
}

export interface GrupoReposicao {
  fornecedorId: string
  fornecedorNome: string
  telefone: string
  itens: Array<{
    itemId: string
    nome: string
    unidade: string
    saldo: number
    minimo: number
    custoMedio: number
  }>
}
