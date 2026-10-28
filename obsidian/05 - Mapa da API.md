---
title: Mapa da API
tags: [api, backend]
---

# Mapa da API

Todos os routers de negócio são montados com prefixo `/api`. O corpo/JSON usa camelCase via Pydantic `CamelModel`; caminhos de consulta costumam usar snake_case em query params. Erros de regra usam status HTTP apropriado; falha não tratada vira `500` com `{ "detail": "Erro interno: <Tipo>" }`.

| Recurso | Endpoints principais | Autorização de escrita |
|---|---|---|
| Auth | `GET /api/auth/me` | token válido |
| Onboarding | `POST /api/restaurantes/primeiro` | fluxo especial; exige convite, salvo bootstrap/dono |
| Categorias | `GET/POST /api/categorias`, `PATCH/DELETE /api/categorias/{id}` | admin/gerente/caixa |
| Produtos | `GET /api/produtos`, `GET /{id}`, `POST`, `PATCH/DELETE /{id}`; `PUT/DELETE /{id}/imagem` | admin/gerente/caixa |
| Mesas | `GET`, `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}` | CRUD admin/gerente/caixa; status também garçom |
| Pedidos | `GET /api/pedidos` (filtros status/mesa), `GET /{id}`, `POST`, `POST /{id}/itens`, `DELETE /{id}/itens/{item}`, `PATCH /{id}/itens/{item}/status`, `POST /{id}/cancelar` | criar/itens admin/gerente/caixa/garçom; status inclui cozinha; cancelar admin/gerente/caixa |
| Pagamentos | `POST /api/pagamentos/{pedido_id}` | admin/gerente/caixa |
| Cozinha | `GET /api/cozinha/fila`; PATCH status individual e bulk `/pedidos/{id}/itens/status` | admin/gerente/caixa/cozinha |
| Estoque | `GET/POST /api/estoque/itens`, `GET/PATCH/DELETE /itens/{id}`, `POST/GET /movimentacoes` | escrever admin/gerente |
| Fornecedores | `GET/POST`, `GET/PATCH/DELETE /{id}` | admin/gerente/caixa |
| Despesas | `GET/POST`, `GET/PATCH/DELETE /{id}`, `POST /{id}/pagar` | admin/gerente/caixa |
| Caixa | `GET /api/caixa/sessoes`, `GET /sessao-atual`, `POST /abrir`, `/suprimento`, `/sangria`, `/fechar` | admin/gerente/caixa |
| Delivery | `GET/POST /api/delivery/pedidos`, `GET /pedidos/{id}`, `PATCH /pedidos/{id}/status` | criar admin/gerente/caixa/garçom; status inclui cozinha |
| Público | `GET /api/publico/{rid}/cardapio`, `GET /imagens/{produto_id}`; `POST /mesas/{mesa_id}/pedido` retorna 410 | sem token nos endpoints públicos; gate/rate limit no cardápio |
| Relatórios | `GET /api/relatorios/resumo?inicio&fim`; `GET /api/relatorios/agregado?tipo=dia\|mes&ref=` | admin/gerente/caixa |
| Configurações | `GET/PUT /api/configuracoes` | PUT admin/gerente |
| Usuários | `GET/PATCH /api/usuarios/me`, CRUD `/api/usuarios` | self-service para nome/tema e credenciais verificadas; gestão admin/gerente |
| Plataforma | `POST/GET /api/sistema/convites`, `DELETE /api/sistema/convites/{token}` | dono da plataforma |
| Saúde | `/health`, `/ready` (fora do prefixo `/api`) | públicos |

## Contrato de pagamento

`POST /api/pagamentos/{pedido_id}` recebe corpo minimalista, por exemplo `{ "tipo": "pix", "valor": 42.90 }`. O servidor cria ID e timestamp; chave opcional `X-Idempotency-Key` protege contra replay. Ver [[Regras de Negócio/Pagamentos e Caixa]].

## Semântica de status

- 401: token ausente/inválido/expirado.
- 403: sem tenant, papel insuficiente ou convite inválido.
- 404: recurso não existe no tenant.
- 409: conflito de estado (mesa ocupada, transição inválida, duplicate/replay, etc.).
- 410: endpoint público de pedido via QR está desativado.
- 422: payload/regra de valor inválido.
- 429: limite de requisição do cardápio público atingido.
- 500: exceção não tratada; consultar logs do backend, não adivinhar pela mensagem de browser.

## Contratos da evolução operacional

- Conferência de reserva: `POST /api/pedidos/{pid}/itens/{iid}/conferir-reserva`.
- Compras: `POST /api/estoque/movimentacoes` aceita unidade/valor total e Idempotency-Key.
- Login verificado: `POST /api/usuarios/me/sincronizar-login`.
- Auditoria de solicitação própria: `POST /api/usuarios/me/seguranca`.
- Recuperação administrativa autorizada: `POST /api/usuarios/{id}/recuperacao`.

Ver [[Evolucao-Operacional]] para campos, permissões e compatibilidade.
