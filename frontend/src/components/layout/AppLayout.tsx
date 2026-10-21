import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Bike,
  ChefHat,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Menu,
  Package,
  Sandwich,
  Satellite,
  Settings,
  ShoppingCart,
  User,
  UtensilsCrossed,
  Wallet,
  X,
  ChartColumn,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useEstoque, useRealtimeStatus } from '../../hooks/useFirestore'
import { Badge } from '../ui'
import type { ReactNode } from 'react'

const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/caixa', label: 'Caixa', icon: <ShoppingCart className="h-5 w-5" aria-hidden="true" /> },
  { to: '/mesas', label: 'Mesas', icon: <UtensilsCrossed className="h-5 w-5" aria-hidden="true" /> },
  { to: '/produtos', label: 'Produtos', icon: <Sandwich className="h-5 w-5" aria-hidden="true" /> },
  { to: '/categorias', label: 'Categorias', icon: <FolderOpen className="h-5 w-5" aria-hidden="true" /> },
  { to: '/estoque', label: 'Estoque', icon: <Package className="h-5 w-5" aria-hidden="true" /> },
  { to: '/cozinha', label: 'Cozinha (KDS)', icon: <ChefHat className="h-5 w-5" aria-hidden="true" /> },
  { to: '/delivery', label: 'Delivery', icon: <Bike className="h-5 w-5" aria-hidden="true" /> },
  { to: '/relatorios', label: 'Relatórios', icon: <ChartColumn className="h-5 w-5" aria-hidden="true" /> },
  { to: '/financeiro', label: 'Financeiro', icon: <Wallet className="h-5 w-5" aria-hidden="true" /> },
  { to: '/configuracoes', label: 'Configurações', icon: <Settings className="h-5 w-5" aria-hidden="true" /> },
]

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const { me, logout } = useAuth()
  const navigate = useNavigate()
  const estoque = useEstoque(me?.restaurantId)
  const alertasCount = (estoque.data ?? []).filter((i) => (i.quantidadeAtual ?? 0) <= (i.minimo ?? 0)).length
  const realtimeOk = useRealtimeStatus()
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    const noEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerAberto(false)
    }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener('keydown', noEscape)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener('keydown', noEscape)
    }
  }, [])

  async function handleLogout() {
    setDrawerAberto(false)
    await logout()
    navigate('/login')
  }

  return (
    <div className="relative flex h-full min-h-0">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      {/* aviso de queda de conexão (leituras caem no cache do SW; escritas falham) */}
      {!online && (
        <div className="fixed inset-x-0 top-0 z-[60] bg-amber-500 py-1 text-center text-sm font-medium text-white">
          Sem conexão — dados podem estar desatualizados. Aguarde para lançar pedidos/pagamentos.
        </div>
      )}
      {/* tempo real instável: listeners falhando — dados podem atrasar */}
      {online && !realtimeOk && (
        <div className="fixed inset-x-0 top-0 z-[60] bg-rose-500 py-1 text-center text-sm font-medium text-white">
          Tempo real instável — os dados podem atrasar.{' '}
          <button onClick={() => window.location.reload()} className="font-bold underline">
            Recarregar
          </button>
        </div>
      )}

      {/* backdrop do drawer no mobile */}
      {drawerAberto && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setDrawerAberto(false)}
          aria-hidden
        />
      )}

      <aside
        aria-label="Menu principal"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 md:relative md:z-auto md:translate-x-0 md:border-r md:bg-white md:shadow-none dark:border-slate-800 dark:bg-slate-900 ${
          drawerAberto ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'md:w-[72px]' : 'md:w-64'}`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
            <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className={`truncate font-bold text-slate-800 dark:text-slate-100 ${collapsed ? 'hidden md:inline' : ''}`}>
            PDV Lanchonete
          </span>
          <button
            onClick={() => setDrawerAberto(false)}
            className="ml-auto grid h-11 w-11 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-600 md:hidden dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Fechar menu"
            title="Fechar menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto hidden h-11 w-11 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-600 md:grid dark:hover:bg-slate-800 dark:hover:text-slate-300"
            title={collapsed ? 'Expandir' : 'Recolher'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronsRight className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ChevronsLeft className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>

        <nav aria-label="Navegação principal" className="flex-1 space-y-1 overflow-y-auto p-2">
          {NAV.filter((item) => !['/financeiro', '/relatorios'].includes(item.to) || ['admin', 'gerente', 'caixa'].includes(me?.papel ?? '')).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setDrawerAberto(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`
              }
              title={item.label}
            >
              <span className="relative grid h-6 w-6 shrink-0 place-items-center">
                {item.icon}
                {item.to === '/estoque' && alertasCount > 0 && (
                  <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {alertasCount}
                  </span>
                )}
              </span>
              <span className={`truncate ${collapsed ? 'hidden md:inline' : ''}`}>{item.label}</span>
            </NavLink>
          ))}

          {/* Plano da PLATAFORMA: visível só para donos (sistema/global.donoUids) */}
          {me?.souDono && (
            <>
              <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
              <NavLink
                to="/plataforma"
                onClick={() => setDrawerAberto(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`
                }
                title="Plataforma"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center">
                  <Satellite className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className={`truncate ${collapsed ? 'hidden md:inline' : ''}`}>Plataforma</span>
              </NavLink>
            </>
          )}
        </nav>

        {me && (
          <div className={`border-t border-slate-100 p-4 dark:border-slate-800 ${collapsed ? 'hidden md:block' : ''}`}>
            <div className="mb-2 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                <User className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{me.perfil?.nome ?? me.email}</p>
                {me.papel && <Badge value={me.papel} />}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-400"
            >
              Sair
            </button>
          </div>
        )}
      </aside>

      <button
        onClick={() => setDrawerAberto(true)}
        className="fixed left-3 top-3 z-30 grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-md transition hover:text-brand-600 md:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <main id="conteudo" className="h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex min-w-0 flex-col gap-3 sm:mb-6 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 pl-14 md:pl-0">
        <h1 className="break-words text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto md:shrink-0">{actions}</div>}
    </div>
  )
}
