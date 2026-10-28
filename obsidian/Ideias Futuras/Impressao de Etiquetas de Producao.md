---
status: ideia
area: producao
prioridade: futura
criado_em: 2026-10-28
tags:
  - nexocomanda
  - ideias-futuras
  - producao
  - impressao
  - etiquetas
---

# Impressão de etiquetas para lotes de produção (ideia futura)

> [!info] Estado
> **Backlog / não implementar agora.** Ainda não foi adquirida impressora. A solução depende da marca, do modelo, do protocolo e das características das etiquetas escolhidas. Este documento registra uma possibilidade, **não uma funcionalidade existente**.

## Problema e objetivo

Permitir ao funcionário da cozinha imprimir uma ou várias etiquetas para identificar embalagens produzidas no módulo **Produção e Estufa** do NexoComanda, sem precisar digitar novamente os dados do lote.

A solução deve buscar **custo de software zero** (sem contratação obrigatória de API ou mensalidade). Impressora, etiquetas, ribbon (quando aplicável) e manutenção são custos à parte.

## Informações sugeridas na etiqueta

- Nome do restaurante (se definido).
- Nome do produto.
- Identificador do lote.
- Data e hora de fabricação/produção.
- Data e hora de validade.
- Quantidade e unidade, conforme a embalagem.
- Local de armazenamento (ex.: estufa/refrigerador).
- Responsável pela produção (quando apropriado).
- Código QR ou código de barras do lote (opcional, numa fase posterior).

**Não imprimir custos ou informações financeiras para o consumidor.** A informação de validade deve partir das regras e dos dados efetivamente definidos na produção; não calcular prazo sanitário arbitrário. Conferir com o responsável técnico as exigências sanitárias/rotulagem aplicáveis.

## Fluxo proposto

1. Usuário conclui o lançamento de produção e o backend confirma o lote.
2. A tela de sucesso oferece **Imprimir etiquetas**.
3. Usuário escolhe **quantidade de etiquetas** e, quando existir, um modelo salvo de impressão.
4. Sistema gera um layout a partir do lote persistido, não de um formulário em edição.
5. Impressão é solicitada para o equipamento configurado.
6. Se a impressão falhar, mostrar erro e oferecer **Reimprimir** na Estufa ou no histórico, sem recriar lote nem movimentar ingredientes/estoque.

Em um futuro fluxo de embalagens individuais, distinguir a **quantidade produzida** da **quantidade por embalagem** para que a soma das etiquetas não induza a contagens incorretas.

## Possíveis tecnologias — escolher após comprar a impressora

| Alternativa | Custo de licença | Quando usar | Limitações |
| --- | --- | --- | --- |
| Impressão pelo navegador (HTML/CSS com `@media print`) | Sem licença | MVP com driver instalado em PC/tablet compatível | Diálogo de impressão e ajustes de tamanho/margem |
| ESC/POS por Web Bluetooth | Sem licença | Apenas se o modelo **suportar ESC/POS** e o navegador oferecer Web Bluetooth | Implementação atual é para cupons; não pressupor compatibilidade com etiquetas |
| ZPL/TSPL ou SDK do fabricante | Pode ser gratuito, depende do modelo | Impressora de etiquetas com linguagem/SDK documentado | Integração específica por marca; pode exigir aplicativo/serviço local |
| Serviço local de impressão (Python/Node) | Código próprio, sem licença | Impressão recorrente e melhor controle em computador na cozinha | Precisa de instalação local, rede confiável e manutenção |

**Atenção:** PWA em Android/iOS e navegadores desktop têm capacidades diferentes para USB, Bluetooth e impressão. Não prometer impressão silenciosa/automática em qualquer aparelho. Recursos do fabricante e eventuais certificados podem ter custos adicionais.

## Escolha do equipamento e material

Avaliar depois:
- Etiqueta térmica direta ou **transferência térmica** com ribbon para materiais sintéticos, como BOPP, quando houver exigência de resistência à umidade e refrigeração.
- Etiquetas laminadas em fita são outra categoria de equipamento, com dimensões e protocolos próprios.
- Largura/altura sugeridas para teste: **50 × 30 mm** ou **60 × 40 mm**, conforme quantidade de informação e material.
- Conexão: USB, rede ou Bluetooth; drivers e compatibilidade com Windows e dispositivos da cozinha.
- Durabilidade da impressão, adesivo e material adequados para o ambiente e contato indireto com alimentos.
- Custo por etiqueta, bobina/ribbon, velocidade e disponibilidade de insumos.

## Integração com o NexoComanda

Código existente para estudar ao retomar:
- `frontend/src/lib/impressora.ts`: impressão ESC/POS Bluetooth e fallback por janela, **atualmente focada em comandas/recibos**.
- `frontend/src/pages/producao/ProducaoPage.tsx`: fluxo de registro/visualização de lotes.
- `backend/app/services/producao_service.py`: identificação do lote, quantidade, validade, local e autoria.
- `frontend/src/types/index.ts`: tipo `LoteProducao`.

Preferir módulo independente `Etiquetas de Produção`, com:
- Templates de etiqueta por restaurante.
- Configuração da impressora por estação de trabalho, se aplicável.
- Validação de permissões para reimpressão, sem exposição de dados de outros restaurantes.
- Reimpressão e registro de tentativa, sem alteração dos dados produtivos.
- Tratamento de falhas: **imprimir nunca deve reexecutar o POST de produção**.
- Possível QR de rastreabilidade interna em etapa futura; evitar expor dados privados em uma URL pública.

## Etapas quando esta ideia for priorizada

- [ ] Definir modelo/marca e obter manual/SDK/protocolo.
- [ ] Definir etiqueta, material, tamanho, quantidade por embalagem e campos obrigatórios.
- [ ] Confirmar computadores/tablets e navegadores da operação.
- [ ] Fazer protótipo de **impressão manual** pelo navegador.
- [ ] Avaliar impressão direta via SDK ou agente local somente se necessário.
- [ ] Adicionar botão **Imprimir etiquetas** após sucesso da produção e na Estufa.
- [ ] Testar reimpressão, falha/desconexão, várias cópias e preservação da idempotência.
- [ ] Validar impressão real, legibilidade, resistência e adequação sanitária antes de liberar.

## Decisão atual

**Manter como futura ideia, sem comprar impressora agora, sem adicionar dependências, sem alterar UI/API e sem configurar impressão.** Revisitar quando houver equipamento e requisitos de etiqueta definidos.

Relacionados: [[Producao-e-Estufa]] · [[Evolucao-Operacional]]
