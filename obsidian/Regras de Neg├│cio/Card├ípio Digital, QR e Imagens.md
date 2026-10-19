---
title: Cardápio Digital, QR e Imagens
tags: [regras, publico, qr, imagens]
---

# Cardápio Digital, QR e Imagens

## QR por mesa

Frontend gera QR Code com URL `/m/{restaurantId}/{mesaId}` e oferece download PNG. O objetivo é abrir cardápio público daquele restaurante/mesa.

## Leitura pública

- `GET /api/publico/{restaurant_id}/cardapio` verifica configuração `cardapioDigitalAtivo`; desativado → 403.
- Rate limit é implementado em memória por IP: 12 requisições por 60 segundos; excedente → 429. O limite é local à instância do processo, não um contador distribuído entre instâncias.
- Payload público deve omitir dados internos de custo/ingrediente, segundo o design técnico.

## Pedido por QR: divergência explícita

A regra antiga RN-21 descreve criação/adicionamento de pedido via QR. Porém o código de `routers/publico.py` atual tem `POST /{rid}/mesas/{mesa_id}/pedido` com status 410 e a documentação do README/manual diz “somente leitura — pedidos só pelo atendente”. **Comportamento de implementação a considerar: leitura-only; pedido via QR desativado.** Não anunciar autoatendimento antes de reativar e testar o fluxo.

## Imagem de produto

- Guardada em `restaurantes/{rid}/data/imagens/items/{produtoId}`.
- Payload base64 com até 200.000 caracteres e MIME `image/jpeg`, `image/png` ou `image/webp`.
- Imagens são lidas por rota pública dedicada para funcionar em `<img>` sem Authorization; documentação indica cache de 1 hora e rota fora do gate/rate-limit do cardápio.
- Produto guarda flag `temImagem` e pode ter `imagemUrl` externo; excluir produto deve excluir imagem vinculada.

Fontes: `backend/app/routers/publico.py`, `produtos_service.py`, `models/models.py`, `frontend/src/pages/mesas/MesasPage.tsx`, `frontend/src/pages/cardapio/CardapioPage.tsx`.
