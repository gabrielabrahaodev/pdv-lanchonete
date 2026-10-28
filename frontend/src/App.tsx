import { lazy, Suspense, useLayoutEffect } from 'react'
import { Route, Routes, useMatch } from 'react-router-dom'
import { LoadingScreen } from './components/ui'
import { ativarTemaEscuroPublico } from './lib/temaPublico'

// O cardápio deve permanecer independente do Firebase Auth, tema do usuário e
// limpeza dos dados privados do PDV. Os chunks autenticados não são carregados
// enquanto um cliente consulta o QR Code.
const CardapioPage = lazy(() => import('./pages/cardapio/CardapioPage'))
const AppAutenticado = lazy(() => import('./AppAutenticado'))

export default function App() {
  const estaNoCardapio = Boolean(useMatch('/m/:restaurantId/:mesaId'))

  // O cardápio QR tem visual escuro próprio, inclusive durante o carregamento
  // de seu chunk. Ao sair dele, restauramos o tema anterior do PDV sem
  // carregar Firebase Auth ou preferências do operador no acesso público.
  useLayoutEffect(() => {
    if (!estaNoCardapio) return
    return ativarTemaEscuroPublico(document.documentElement)
  }, [estaNoCardapio])

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/m/:restaurantId/:mesaId" element={<CardapioPage />} />
        <Route path="/*" element={<AppAutenticado />} />
      </Routes>
    </Suspense>
  )
}
