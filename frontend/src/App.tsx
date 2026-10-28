import { lazy, Suspense, useLayoutEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { LoadingScreen } from './components/ui'

// O cardápio deve permanecer independente do Firebase Auth, tema do usuário e
// limpeza dos dados privados do PDV. Os chunks autenticados não são carregados
// enquanto um cliente consulta o QR Code.
const CardapioPage = lazy(() => import('./pages/cardapio/CardapioPage'))
const AppAutenticado = lazy(() => import('./AppAutenticado'))

function CardapioPublico() {
  // O modo escuro pertence à conta do operador, não ao consumidor que abre o QR.
  // useLayoutEffect evita mostrar a página com o tema administrativo no 1º frame.
  useLayoutEffect(() => {
    document.documentElement.classList.remove('dark')
  }, [])

  return <CardapioPage />
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/m/:restaurantId/:mesaId" element={<CardapioPublico />} />
        <Route path="/*" element={<AppAutenticado />} />
      </Routes>
    </Suspense>
  )
}
