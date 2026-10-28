import React from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import Reposicao from '../../src/pages/estoque/ReposicaoPage'
import Historico from '../../src/pages/estoque/ReposicaoHistoricoPage'
import '../../src/index.css'
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/reposicao']}><Routes><Route path="/reposicao" element={<Reposicao/>}/><Route path="/reposicao/recebidos" element={<Historico key="recebidos"/>}/><Route path="/reposicao/cancelados" element={<Historico key="cancelados" cancelados/>}/></Routes></MemoryRouter></QueryClientProvider>)
