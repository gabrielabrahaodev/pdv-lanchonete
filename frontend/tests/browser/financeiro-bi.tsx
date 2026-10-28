// Harness local: as fontes externas são substituídas pelo runner de QA.
import React from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import BI from '../../src/pages/financeiro/FinanceiroBI'
import Fornecedores from '../../src/pages/fornecedores/FornecedoresPage'
import '../../src/index.css'
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{location.search.includes('fornecedores')?<Fornecedores/>:<BI/>}</MemoryRouter></QueryClientProvider>)
