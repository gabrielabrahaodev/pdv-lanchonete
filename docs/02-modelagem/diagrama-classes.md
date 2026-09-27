# Diagrama de Classes — PDV Lanchonete v2

Modelo conceitual espelhado nos modelos Pydantic (`backend/app/models/models.py`) e nos tipos TypeScript (`frontend/src/types/index.ts`). Atributos em camelCase como trafegam na API.

```mermaid
classDiagram
    direction LR

    class AuthMe {
        +uid: str
        +email: str?
        +papel: Papel?
        +restaurantId: str?
        +restaurantNome: str?
        +perfil: AppUser?
        +souDono: bool
    }

    class AppUser {
        +id: str
        +restaurantId: str
        +nome: str
        +papel: Papel
        +email: str?
        +ativo: bool
        +tema: Tema
    }

    class Restaurant {
        +id: str
        +nome: str
    }

    class Configuracoes {
        +nome: str
        +moeda: str
        +timezone: str
        +impressoraTipo: str
        +impressoraEndereco: str
        +baixaEstoqueAutomatica: bool
        +cardapioDigitalAtivo: bool
    }

    class Category {
        +id: str
        +nome: str
        +ordem: int
        +ativo: bool
        +icone: str?
    }

    class Product {
        +id: str
        +nome: str
        +preco: float
        +ativo: bool
        +estoqueMinimo: int
        +precisaPreparar: bool = true
        +temImagem: bool
        +imagemUrl: str?
    }

    class ImagemProduto {
        +produtoId: str (id do doc)
        +imagemBase64: str
        +mime: str
    }

    class Convite {
        +token: str (id do doc)
        +criadoPor: str
        +expiraEm: datetime
        +ativo: bool
        +usadoEm: datetime?
        +usadoPorUid: str?
    }

    class SistemaGlobal {
        +donoUids: list~str~
    }

    class ProductVariation {
        +id: str
        +nome: str
        +precoAdicional: float
        +ativo: bool
    }

    class ProductIngredient {
        +itemId: str
        +qtd: float
    }

    class Mesa {
        +id: str
        +numero: int
        +status: MesaStatus
        +pedidoAtivoId: str?
        +garcomId: str?
    }

    class Order {
        +id: str
        +mesaId: str
        +tipo: TipoPedido
        +status: OrderStatus
        +total: float
        +fechadoEm: datetime?
        +usuarioId: str?
    }

    class OrderItem {
        +id: str
        +produtoId: str
        +variacaoId: str?
        +qtd: int
        +precoUnitario: float
        +observacoes: str?
        +status: ItemStatus
        +baixadoEm: datetime?
    }

    class Payment {
        +id: str
        +tipo: FormaPagamento
        +valor: float
        +troco: float?
        +referencia: str?
    }

    class CashRegisterSession {
        +id: str
        +usuarioId: str
        +abertoEm: datetime
        +valorInicial: float
        +totalVendas: float
        +totalRecebido: float
        +sangrias: float
        +suprimentos: float
        +status: SessaoStatus
        +resumoFechamento: dict?
    }

    class InventoryItem {
        +id: str
        +nome: str
        +unidade: str
        +quantidadeAtual: float
        +minimo: float
        +custoMedio: float
    }

    class StockMovement {
        +id: str
        +tipo: MovTipo
        +itemId: str
        +qtd: float
        +saldoApos: float
        +pedidoId: str?
        +usuarioId: str
    }

    class DeliveryOrder {
        +id: str
        +externalId: str
        +platform: Plataforma
        +clienteNome: str
        +total: float
        +status: DeliveryStatus
    }

    class Fornecedor {
        +id: str
        +nome: str
        +documento: str?
        +ativo: bool
    }

    class Despesa {
        +id: str
        +categoria: CategoriaDespesa
        +descricao: str
        +valor: float
        +data: datetime
        +vencimento: datetime?
        +pagoEm: datetime?
    }

    %% Relações
    Restaurant "1" --> "1" Configuracoes : data/configuracoes
    Restaurant "1" o-- "*" AppUser : usuarios
    Restaurant "1" o-- "*" Category : categorias
    Restaurant "1" o-- "*" Product : produtos
    Restaurant "1" o-- "*" Mesa : mesas
    Restaurant "1" o-- "*" Order : pedidos
    Restaurant "1" o-- "*" InventoryItem : estoque
    Restaurant "1" o-- "*" StockMovement : movimentacoes_estoque
    Restaurant "1" o-- "*" DeliveryOrder : delivery_orders
    Restaurant "1" o-- "*" Fornecedor : fornecedores
    Restaurant "1" o-- "*" Despesa : despesas
    Restaurant "1" o-- "*" CashRegisterSession : sessoes_caixa

    Category "1" --> "*" Product : agrupa
    Product "1" *-- "*" ProductVariation : variações
    Product "1" *-- "*" ProductIngredient : receita (por 1 un.)
    ProductIngredient --> InventoryItem : debita

    Mesa "1" --> "0..1" Order : pedidoAtivoId
    Order "1" *-- "*" OrderItem : itens
    OrderItem --> Product : produto_id
    OrderItem --> ProductVariation : variacao_id?
    Order "1" o-- "*" Payment : pagamentos

    StockMovement --> InventoryItem : item_id
    StockMovement --> Order : pedidoId? (baixa automática)

    Despesa --> Fornecedor : fornecedor_id?

    Product "1" --> "0..1" ImagemProduto : imagens/items/{produtoId}
    Convite --> Restaurant : provisiona (consumo transacional)
    AppUser --> Convite : criadoPor / usadoPorUid

    AppUser --> Restaurant : restaurantId (claim)
```

> **Top-level (fora do tenant):** `onboarding/{uid}`, `sistema/global` (`SistemaGlobal`) e `convites/{token}` — acessíveis só via Admin SDK / guard de dono da plataforma.

## Enumerações (domínios de valor)

| Enum | Valores |
|---|---|
| `Papel` | admin · gerente · caixa · garcom · cozinha |
| `Tema` | claro · escuro |
| `MesaStatus` | livre · ocupada · reservada · inativa |
| `TipoPedido` | local · delivery · balcao |
| `OrderStatus` | aberto · pago · cancelado |
| `ItemStatus` | pendente · preparo · pronto · entregue · cancelado |
| `FormaPagamento` | dinheiro · pix · credito · debito |
| `SessaoStatus` | aberto · fechado |
| `MovTipo` | entrada · saida · ajuste |
| `Plataforma` | ifood · goomer · whatsapp · proprio |
| `DeliveryStatus` | pending · confirmed · preparing · ready · delivered · cancelled |
| `CategoriaDespesa` | insumo · folha · conta_fixa · outra |

## Notas

- **Composição** (`*--`) para listas embutidas no documento do pedido (itens, pagamentos) e no produto (variações, ingredientes) — padrão agregado no Firestore.
- **Associação por id** (`-->`) entre coleções distintas — não há FK física; integridade é garantida pelas regras de serviço.
- `AuthMe` é um DTO de sessão (não persistido); `Configuracoes` é documento único (`data/configuracoes`), os demais ficam em `data/{colecao}/items/{id}`.
