"""Modelos Pydantic — espelho 1:1 dos modelos freezed da versão Flutter.

A API fala camelCase (igual aos modelos Dart). No Firestore os documentos
usam createdAt/updatedAt (ou criadoEm/atualizadoEm em usuarios) — a conversão
fica na camada de serviços.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------------------------------------------------------------- Restaurant
class Restaurant(CamelModel):
    id: str
    nome: str
    configuracoes: Optional[dict[str, Any]] = None
    criado_em: datetime


class RestaurantCreate(CamelModel):
    """Payload de onboarding — cria o primeiro estabelecimento do usuário."""

    nome: str = Field(min_length=2)
    quantidade_mesas: int = Field(default=12, ge=0, le=50)


# -------------------------------------------------------------- Produtos
class ProductVariation(CamelModel):
    id: str
    nome: str
    preco_adicional: float = 0.0
    ativo: bool = True


class ProductIngredient(CamelModel):
    item_id: str
    qtd: float


class Product(CamelModel):
    id: str
    restaurant_id: str
    nome: str
    categoria_id: str
    preco: float
    variacoes: list[ProductVariation] = []
    ingredientes: list[ProductIngredient] = []
    imagem_url: Optional[str] = None
    ativo: bool = True
    estoque_minimo: int = 0
    criado_em: datetime
    atualizado_em: datetime


class ProductCreate(CamelModel):
    nome: str
    categoria_id: str
    preco: float
    variacoes: list[ProductVariation] = []
    ingredientes: list[ProductIngredient] = []
    imagem_url: Optional[str] = None
    ativo: bool = True
    estoque_minimo: int = 0


class ProductUpdate(CamelModel):
    nome: Optional[str] = None
    categoria_id: Optional[str] = None
    preco: Optional[float] = None
    variacoes: Optional[list[ProductVariation]] = None
    ingredientes: Optional[list[ProductIngredient]] = None
    imagem_url: Optional[str] = None
    ativo: Optional[bool] = None
    estoque_minimo: Optional[int] = None


class ImagemCreate(CamelModel):
    """Imagem do produto comprimida no cliente e transportada em base64.

    Gravada em coleção própria (`imagens/items/{produtoId}`) para não pesar
    as listagens; limite de ~150 KB reais (~200 mil chars base64).
    """

    imagem_base64: str = Field(min_length=16, max_length=200_000)
    mime: Literal["image/jpeg", "image/png", "image/webp"]


class Category(CamelModel):
    id: str
    restaurant_id: str
    nome: str
    ordem: int = 0
    ativo: bool = True
    icone: Optional[str] = None
    cor: Optional[str] = None


class CategoryCreate(CamelModel):
    nome: str
    ordem: int = 0
    ativo: bool = True
    icone: Optional[str] = None
    cor: Optional[str] = None


class CategoryUpdate(CamelModel):
    nome: Optional[str] = None
    ordem: Optional[int] = None
    ativo: Optional[bool] = None
    icone: Optional[str] = None
    cor: Optional[str] = None


# ---------------------------------------------------------------- Mesas
class Mesa(CamelModel):
    id: str
    restaurant_id: str
    numero: int
    status: str = "livre"  # livre | ocupada | reservada | inativa
    pedido_ativo_id: Optional[str] = None
    garcom_id: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime


class MesaCreate(CamelModel):
    numero: int


class MesaUpdate(CamelModel):
    status: Optional[str] = None


# ---------------------------------------------------------------- Pedidos
class OrderItem(CamelModel):
    id: str
    produto_id: str
    variacao_id: Optional[str] = None
    qtd: int
    preco_unitario: float
    observacoes: Optional[str] = None
    status: str = "pendente"  # pendente | preparo | pronto | entregue | cancelado


class OrderItemAdd(CamelModel):
    produto_id: str
    variacao_id: Optional[str] = None
    qtd: int = Field(gt=0)
    observacoes: Optional[str] = None


class OrderItemStatusUpdate(CamelModel):
    status: str  # preparo | pronto | entregue | cancelado


class Payment(CamelModel):
    id: str
    tipo: str  # dinheiro | pix | credito | debito
    valor: float
    troco: Optional[float] = None
    referencia: Optional[str] = None
    criado_em: datetime


class PaymentCreate(CamelModel):
    """Payload de criação — id/criadoEm são gerados no servidor."""
    tipo: str  # dinheiro | pix | credito | debito
    valor: float
    troco: Optional[float] = None
    referencia: Optional[str] = None


class Order(CamelModel):
    id: str
    restaurant_id: str
    mesa_id: str
    tipo: str = "local"  # local | delivery | balcao
    status: str = "aberto"  # aberto | pago | cancelado
    itens: list[OrderItem] = []
    total: float = 0.0
    pagamentos: list[Payment] = []
    criado_em: datetime
    fechado_em: Optional[datetime] = None
    usuario_id: Optional[str] = None


# ---------------------------------------------------------------- Estoque
class InventoryItem(CamelModel):
    id: str
    restaurant_id: str
    nome: str
    unidade: str
    quantidade_atual: float = 0.0
    minimo: float = 0.0
    custo_medio: float = 0.0
    criado_em: datetime
    atualizado_em: datetime


class InventoryItemCreate(CamelModel):
    nome: str
    unidade: str
    quantidade_atual: float = 0.0
    minimo: float = 0.0
    custo_medio: float = 0.0


class InventoryItemUpdate(CamelModel):
    nome: Optional[str] = None
    unidade: Optional[str] = None
    minimo: Optional[float] = None
    custo_medio: Optional[float] = None


class StockMovement(CamelModel):
    id: str
    restaurant_id: str
    tipo: str  # entrada | saida | ajuste
    item_id: str
    qtd: float
    pedido_id: Optional[str] = None
    usuario_id: str
    criado_em: datetime


class MovementCreate(CamelModel):
    tipo: str  # entrada | saida | ajuste
    item_id: str
    qtd: float = Field(gt=0)
    observacao: Optional[str] = None


# ---------------------------------------------------------------- Usuários
class AppUser(CamelModel):
    id: str
    restaurant_id: str
    nome: str
    papel: str  # admin | gerente | caixa | garcom | cozinha
    email: Optional[str] = None
    ativo: bool = True
    criado_em: datetime
    atualizado_em: datetime


class UserCreate(CamelModel):
    email: str
    senha: str = Field(min_length=6)
    nome: str
    papel: str  # gerente | caixa | garcom | cozinha (admin só via script/claim manual)


class UserUpdate(CamelModel):
    nome: Optional[str] = None
    papel: Optional[str] = None
    ativo: Optional[bool] = None
    senha: Optional[str] = None
    tema: Optional[Literal["claro", "escuro"]] = None


class PreferenciasUpdate(CamelModel):
    """Preferências do próprio usuário (self-service, qualquer papel)."""

    tema: Literal["claro", "escuro"]


# ---------------------------------------------------------------- Delivery
class DeliveryOrderItem(CamelModel):
    id: str
    produto_id: str
    nome: str
    qtd: int
    preco_unitario: float
    observacoes: Optional[str] = None


class DeliveryOrder(CamelModel):
    id: str
    restaurant_id: str
    external_id: str
    platform: str  # ifood | goomer | whatsapp | proprio
    cliente_nome: str
    cliente_telefone: Optional[str] = None
    cliente_endereco: Optional[str] = None
    itens: list[DeliveryOrderItem] = []
    total: float
    status: str = "pending"  # pending | confirmed | preparing | ready | delivered | cancelled
    criado_em: datetime
    confirmado_em: Optional[datetime] = None
    pronto_em: Optional[datetime] = None
    entregue_em: Optional[datetime] = None
    metadata: Optional[dict[str, Any]] = None


class DeliveryOrderCreate(CamelModel):
    platform: Literal["ifood", "goomer", "whatsapp", "proprio"] = "proprio"
    cliente_nome: str
    cliente_telefone: Optional[str] = None
    cliente_endereco: Optional[str] = None
    itens: list[OrderItemAdd]
    metadata: Optional[dict[str, Any]] = None


class DeliveryStatusUpdate(CamelModel):
    status: str


# ---------------------------------------------------------------- Caixa
class CashRegisterSession(CamelModel):
    id: str
    restaurant_id: str
    usuario_id: str
    aberto_em: datetime
    fechado_em: Optional[datetime] = None
    valor_inicial: float = 0.0
    total_vendas: float = 0.0
    total_recebido: float = 0.0
    sangrias: float = 0.0
    suprimentos: float = 0.0
    status: str = "aberto"  # aberto | fechado
    vendas_por_forma_pagamento: dict[str, float] = {}
    quantidade_por_produto: dict[str, int] = {}
    movimentacoes_caixa: list[dict[str, Any]] = []


class SessionOpen(CamelModel):
    valor_inicial: float = 0.0


class CashMovement(CamelModel):
    valor: float = Field(gt=0)
    observacao: Optional[str] = None


class SessionClose(CamelModel):
    valor_contado: Optional[float] = None


# ---------------------------------------------------------------- Relatórios
class ReportSalesSummary(CamelModel):
    periodo_inicio: datetime
    periodo_fim: datetime
    total_pedidos: int
    faturamento_bruto: float
    faturamento_liquido: float
    ticket_medio: float
    vendas_por_hora: dict[str, float]
    vendas_por_forma_pagamento: dict[str, float]
    top_produtos: dict[str, int]
    top_categorias: dict[str, int]


# ---------------------------------------------------------------- Configurações
class Configuracoes(CamelModel):
    nome: str = ""
    moeda: str = "BRL"
    timezone: str = "America/Sao_Paulo"
    impressora_tipo: str = "bluetooth"
    impressora_endereco: str = ""
    baixa_estoque_automatica: bool = True
    cardapio_digital_ativo: bool = True


# ---------------------------------------------------------------- Financeiro
class Fornecedor(CamelModel):
    id: str
    restaurant_id: str
    nome: str
    documento: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    observacoes: Optional[str] = None
    ativo: bool = True
    criado_em: datetime
    atualizado_em: datetime


class FornecedorCreate(CamelModel):
    nome: str = Field(min_length=2)
    documento: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    observacoes: Optional[str] = None
    ativo: bool = True


class FornecedorUpdate(CamelModel):
    nome: Optional[str] = None
    documento: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    observacoes: Optional[str] = None
    ativo: Optional[bool] = None


class DespesaCreate(CamelModel):
    categoria: Literal["insumo", "folha", "conta_fixa", "outra"]
    descricao: str = Field(min_length=2)
    valor: float = Field(gt=0)
    data: datetime
    vencimento: Optional[datetime] = None
    fornecedor_id: Optional[str] = None
    usuario_id: Optional[str] = None
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None


class DespesaUpdate(CamelModel):
    categoria: Optional[Literal["insumo", "folha", "conta_fixa", "outra"]] = None
    descricao: Optional[str] = None
    valor: Optional[float] = None
    data: Optional[datetime] = None
    vencimento: Optional[datetime] = None
    fornecedor_id: Optional[str] = None
    usuario_id: Optional[str] = None
    forma_pagamento: Optional[str] = None
    observacoes: Optional[str] = None
    ativo_pago: Optional[bool] = None  # true = marca pago agora; false = reabre


class DespesaPagar(CamelModel):
    """Payload opcional de POST /{id}/pagar."""

    forma_pagamento: Optional[str] = None


class AuthMe(CamelModel):
    uid: str
    email: Optional[str] = None
    papel: Optional[str] = None
    restaurant_id: Optional[str] = None
    restaurant_nome: Optional[str] = None
    perfil: Optional[AppUser] = None
