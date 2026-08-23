// Tipos espelhando os modelos Pydantic/Dart (camelCase na API)

export interface AuthMe {
  uid: string
  email: string | null
  papel: string | null
  restaurantId: string | null
  restaurantNome: string | null
  perfil: AppUser | null
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
  itemId: string
  qtd: number
}

export interface Product {
  id: string
  nome: string
  categoriaId: string
  preco: number
  variacoes: ProductVariation[]
  ingredientes: ProductIngredient[]
  imagemUrl?: string | null
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
  id: string
  produtoId: string
  variacaoId?: string | null
  qtd: number
  precoUnitario: number
  observacoes?: string | null
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
  id: string
  mesaId: string
  tipo: 'local' | 'delivery' | 'balcao'
  status: 'aberto' | 'pago' | 'cancelado'
  itens: OrderItem[]
  total: number
  pagamentos: Payment[]
  criadoEm: string
  fechadoEm?: string | null
}

export interface InventoryItem {
  id: string
  nome: string
  unidade: string
  quantidadeAtual: number
  minimo: number
  custoMedio: number
}

export interface StockMovement {
  id: string
  tipo: 'entrada' | 'saida' | 'ajuste'
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
  abertoEm: string
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
