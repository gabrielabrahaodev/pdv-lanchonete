# Cardápio digital público — isolamento e cache curto

> Status: implementação proposta em PR (sem merge). A descrição abaixo explica o comportamento pretendido após homologação.

## Objetivo
Evitar que inicialização do Firebase Auth, consulta de tema e limpeza global de cache do PDV concorram com o carregamento de produtos por QR Code.

## Arquitetura
- `frontend/src/App.tsx` identifica a rota `/m/:restaurantId/:mesaId` e a renderiza sem `AuthProvider` ou `ThemeProvider`.
- `frontend/src/AppAutenticado.tsx` abriga o código já existente da aplicação administrativa, carregado sob demanda apenas em rotas privadas.
- O cardápio público não depende de sessão Firebase nem faz chamadas `/auth/me` ou `/usuarios/me`; o tema do funcionário não é aplicado ao cliente.
- A proteção de rotas e a limpeza de dados privados no `AuthContext` permanecem intactas.

## Cache público
- Apenas categorias, nomes, preços e variações já expostos no endpoint público; nada de perfil, token, pedidos, financeiro ou estoque privado.
- `sessionStorage`, chave por `restaurantId`, com TTL estrito de **30 segundos**.
- React Query usa o cache apenas enquanto não estiver vencido. Após o prazo, precisa consultar novamente a API.
- Falha de armazenamento não pode impedir o carregamento.
- Cada aba ou navegador novo consulta o backend; sem necessidade de novo serviço ou custo adicional.
- Um preço alterado pode permanecer visível na aba por até 30 segundos. O servidor continua sendo a fonte de verdade; pedidos pelo QR seguem proibidos (410).

## Limites e homologação
A mudança **não resolve** cold start de hospedagem gratuita nem garante abertura instantânea em primeiro acesso ou aba nova. Não introduz CDN ou cache persistente além do TTL.

Antes de publicação:
- Testar QR em navegador anônimo com Firebase Auth deslogado e em sessão já autenticada.
- No DevTools, confirmar ausência das chamadas `/auth/me` e `/usuarios/me` no QR.
- Medir acesso inicial, segundo F5 em até 30s e acesso após 30s.
- Confirmar que uma mudança de preço feita pelo administrador aparece após o vencimento do cache.
- Verificar que o PDV continua isolando dados de usuários no logout/troca de restaurante.
- Validar imagens, filtros, temas e ambos os layouts do cardápio.

Referências: [[Producao-e-Estufa]] (módulo separado) e a rota `/m/:restaurantId/:mesaId`.
