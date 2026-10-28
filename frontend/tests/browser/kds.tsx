// Entrada exclusiva do teste com emulador. Não integra o build de produção.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CozinhaPage from '../../src/pages/cozinha/CozinhaPage'
import '../../src/index.css'
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <CozinhaPage />
  </QueryClientProvider>,
)
