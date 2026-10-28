import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import AppLayout from './components/layout/AppLayout'
import { AtualizacaoPwa } from './components/AtualizacaoPwa'
import { LoadingScreen } from './components/ui'

// Code-splitting por rota: cada página vira um chunk carregado sob demanda.
const MinhaContaPage = lazy(() => import('./pages/conta/MinhaContaPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SelectRestaurantPage = lazy(() => import('./pages/SelectRestaurantPage'))
const PlataformaPage = lazy(() => import('./pages/plataforma/PlataformaPage'))
const CaixaOverviewPage = lazy(() => import('./pages/caixa/CaixaOverviewPage'))
const MesaDetailPage = lazy(() => import('./pages/caixa/MesaDetailPage'))
const NovoPedidoPage = lazy(() => import('./pages/caixa/NovoPedidoPage'))
const PagamentoPage = lazy(() => import('./pages/caixa/PagamentoPage'))
const ProdutosPage = lazy(() => import('./pages/produtos/ProdutosPage'))
const ProdutoFormPage = lazy(() => import('./pages/produtos/ProdutoFormPage'))
const CategoriasPage = lazy(() => import('./pages/produtos/CategoriasPage'))
const MesasPage = lazy(() => import('./pages/mesas/MesasPage'))
const ProducaoPage = lazy(() => import('./pages/producao/ProducaoPage'))
const EstoquePage = lazy(() => import('./pages/estoque/EstoquePage'))
const ReposicaoPage = lazy(() => import('./pages/estoque/ReposicaoPage'))
const CozinhaPage = lazy(() => import('./pages/cozinha/CozinhaPage'))
const DeliveryPage = lazy(() => import('./pages/delivery/DeliveryPage'))
const RelatoriosPage = lazy(() => import('./pages/relatorios/RelatoriosPage'))
const FechamentoCaixaPage = lazy(() => import('./pages/relatorios/FechamentoCaixaPage'))
const FornecedoresPage = lazy(() => import('./pages/fornecedores/FornecedoresPage'))
const FinanceiroPage = lazy(() => import('./pages/financeiro/FinanceiroPage'))
const ConfiguracoesPage = lazy(() => import('./pages/configuracoes/ConfiguracoesPage'))

function RequireAuth({ children }: { children: ReactNode }) {
  const { fbUser, me, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!fbUser) return <Navigate to="/login" replace />
  if (!me?.restaurantId) return <Navigate to="/select-restaurant" replace />
  return <>{children}</>
}

function RequireFinanceiro({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  return ['admin', 'gerente', 'caixa'].includes(me?.papel ?? '')
    ? <>{children}</> : <Navigate to="/caixa" replace />
}

function RequireGestao({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  return ['admin', 'gerente'].includes(me?.papel ?? '')
    ? <>{children}</> : <Navigate to="/estoque" replace />
}

function RequireNoAuth({ children }: { children: ReactNode }) {
  const { fbUser, me, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  // ATENÇÃO: NUNCA redirecionar para /login DENTRO do wrapper de /login —
  // Navigate para a própria rota entra em loop silencioso (tela branca sem
  // erro no console). Deslogado aqui = cair no children (a própria LoginPage).
  if (me?.souDono && !me?.restaurantId) return <Navigate to="/plataforma" replace />
  if (fbUser && me?.restaurantId) return <Navigate to="/caixa" replace />
  // Preserva query string (ex.: ?t=CÓDIGO do convite) na ida à tela de seleção
  if (fbUser) return <Navigate to={`/select-restaurant${location.search}`} replace />
  return <>{children}</>
}

/** Guard do plano da PLATAFORMA: só donos (sistema/global.donoUids). */
function RequireOwner({ children }: { children: ReactNode }) {
  const { fbUser, me, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!fbUser) return <Navigate to="/login" replace />
  if (!me) return <LoadingScreen />
  if (!me.souDono) return <Navigate to={me.restaurantId ? '/caixa' : '/select-restaurant'} replace />
  return <>{children}</>
}

export default function AppAutenticado() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Suspense fallback={<LoadingScreen />}>
          <AtualizacaoPwa />
        <Routes>
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
          path="/plataforma"
          element={
            <RequireOwner>
              <PlataformaPage />
            </RequireOwner>
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
          <Route path="caixa/venda-direta" element={<RequireFinanceiro><NovoPedidoPage balcao /></RequireFinanceiro>} />
          <Route path="caixa/mesa/:mesaId" element={<MesaDetailPage />} />
          <Route path="caixa/novo-pedido/:mesaId" element={<NovoPedidoPage />} />
          <Route path="caixa/pagamento/:pedidoId" element={<RequireFinanceiro><PagamentoPage /></RequireFinanceiro>} />
          <Route path="produtos" element={<ProdutosPage />} />
          <Route path="produtos/novo" element={<ProdutoFormPage />} />
          <Route path="produtos/editar/:produtoId" element={<ProdutoFormPage />} />
          <Route path="categorias" element={<CategoriasPage />} />
          <Route path="mesas" element={<MesasPage />} />
          <Route path="estoque" element={<EstoquePage />} />
          <Route path="reposicao" element={<RequireGestao><ReposicaoPage /></RequireGestao>} />
          <Route path="producao" element={<ProducaoPage />} />
          <Route path="cozinha" element={<CozinhaPage />} />
          <Route path="delivery" element={<DeliveryPage />} />
          <Route path="relatorios" element={<RequireFinanceiro><RelatoriosPage /></RequireFinanceiro>} />
          <Route path="relatorios/fechamento-caixa" element={<RequireFinanceiro><FechamentoCaixaPage /></RequireFinanceiro>} />
          <Route path="fornecedores" element={<RequireFinanceiro><FornecedoresPage /></RequireFinanceiro>} />
          <Route path="financeiro" element={<RequireFinanceiro><FinanceiroPage /></RequireFinanceiro>} />
          <Route path="configuracoes" element={<ConfiguracoesPage />} />
          <Route path="minha-conta" element={<MinhaContaPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/caixa" replace />} />
        </Routes>
        </Suspense>
      </ThemeProvider>
    </AuthProvider>
  )
}

/** Tela de seleção exige login mas NÃO exige claim restaurantId.
 *  O ?t= do convite precisa sobreviver ao redirect: sem isso o convidado
 *  cria a conta e chega no formulário SEM o convite (bloqueado pelo backend). */
function RequireAuthFallback({ children }: { children: ReactNode }) {
  const { fbUser, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!fbUser) return <Navigate to={`/login${location.search}`} replace />
  return <>{children}</>
}
