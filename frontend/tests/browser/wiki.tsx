import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppAutenticado from '../../src/AppAutenticado'
import '../../src/index.css'
const params = new URLSearchParams(location.search)
if (params.has('rota'))
  sessionStorage.setItem(
    'wiki-sem',
    params.get('rota') === '/select-restaurant' ? '1' : '',
  )
if (params.has('rota')) history.replaceState(null, '', params.get('rota')!)
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <BrowserRouter>
      <AppAutenticado />
    </BrowserRouter>
  </QueryClientProvider>,
)
