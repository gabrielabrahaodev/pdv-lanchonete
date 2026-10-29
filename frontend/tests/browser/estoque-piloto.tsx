import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppLayout from '../../src/components/layout/AppLayout'
import EstoquePage from '../../src/pages/estoque/EstoquePage'
import '../../src/index.css'
history.replaceState(null, '', '/estoque')
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })
    }
  >
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/estoque" element={<EstoquePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>,
)
