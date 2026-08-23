import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import AppLayout from './components/layout/AppLayout'
import { LoadingScreen } from './components/ui'

import LoginPage from './pages/LoginPage'
import SelectRestaurantPage from './pages/SelectRestaurantPage'
import CaixaOverviewPage from './pages/caixa/CaixaOverviewPage'
import MesaDetailPage from './pages/caixa/MesaDetailPage'
import NovoPedidoPage from './pages/caixa/NovoPedidoPage'
import PagamentoPage from './pages/caixa/PagamentoPage'
import ProdutosPage from './pages/produtos/ProdutosPage'
import ProdutoFormPage from './pages/produtos/ProdutoFormPage'
import MesasPage from './pages/mesas/MesasPage'
import EstoquePage from './pages/estoque/EstoquePage'
import CozinhaPage from './pages/cozinha/CozinhaPage'
import DeliveryPage from './pages/delivery/DeliveryPage'
import RelatoriosPage from './pages/relatorios/RelatoriosPage'
import FechamentoCaixaPage from './pages/relatorios/FechamentoCaixaPage'
import FinanceiroPage from './pages/financeiro/FinanceiroPage'
import CardapioPage from './pages/cardapio/CardapioPage'
import ConfiguracoesPage from './pages/configuracoes/ConfiguracoesPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { fbUser, me, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!fbUser) return <Navigate to="/login" replace />
  if (!me?.restaurantId) return <Navigate to="/select-restaurant" replace />
  return <>{children}</>
}

function RequireNoAuth({ children }: { children: ReactNode }) {
  const { fbUser, me, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (fbUser && me?.restaurantId) return <Navigate to="/caixa" replace />
  if (fbUser) return <Navigate to="/select-restaurant" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Routes>
        <Route path="/m/:restaurantId/:mesaId" element={<CardapioPage />} />
        <Route
          path="/login"
          element={
            <RequireNoAuth>
              <LoginPage />
            </RequireNoAuth>
          }
        />
        <Route
          path="/select-restaurant"
          element={
            <RequireAuthFallback>
              <SelectRestaurantPage />
            </RequireAuthFallback>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/caixa" replace />} />
          <Route path="caixa" element={<CaixaOverviewPage />} />
          <Route path="caixa/mesa/:mesaId" element={<MesaDetailPage />} />
          <Route path="caixa/novo-pedido/:mesaId" element={<NovoPedidoPage />} />
          <Route path="caixa/pagamento/:pedidoId" element={<PagamentoPage />} />
          <Route path="produtos" element={<ProdutosPage />} />
          <Route path="produtos/novo" element={<ProdutoFormPage />} />
          <Route path="produtos/editar/:produtoId" element={<ProdutoFormPage />} />
          <Route path="mesas" element={<MesasPage />} />
          <Route path="estoque" element={<EstoquePage />} />
          <Route path="cozinha" element={<CozinhaPage />} />
          <Route path="delivery" element={<DeliveryPage />} />
          <Route path="relatorios" element={<RelatoriosPage />} />
          <Route path="relatorios/fechamento-caixa" element={<FechamentoCaixaPage />} />
          <Route path="financeiro" element={<FinanceiroPage />} />
          <Route path="configuracoes" element={<ConfiguracoesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/caixa" replace />} />
        </Routes>
      </ThemeProvider>
    </AuthProvider>
  )
}

/** Tela de seleção exige login mas NÃO exige claim restaurantId. */
function RequireAuthFallback({ children }: { children: ReactNode }) {
  const { fbUser, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!fbUser) return <Navigate to="/login" replace />
  return <>{children}</>
}
