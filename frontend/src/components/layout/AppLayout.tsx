import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useAlertasEstoque } from '../../hooks/useAlertasEstoque'
import { useRealtime } from '../../hooks/useRealtime'
import { Badge } from '../ui'

const NAV = [
  { to: '/caixa', label: 'Caixa', icon: '🧾' },
  { to: '/mesas', label: 'Mesas', icon: '🍽️' },
  { to: '/produtos', label: 'Produtos', icon: '🍔' },
  { to: '/categorias', label: 'Categorias', icon: '🗂️' },
  { to: '/estoque', label: 'Estoque', icon: '📦' },
  { to: '/cozinha', label: 'Cozinha (KDS)', icon: '👨‍🍳' },
  { to: '/delivery', label: 'Delivery', icon: '🛵' },
  { to: '/relatorios', label: 'Relatórios', icon: '📊' },
  { to: '/financeiro', label: 'Financeiro', icon: '💰' },
  { to: '/configuracoes', label: 'Configurações', icon: '⚙️' },
]

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const { me, logout } = useAuth()
  const navigate = useNavigate()
  const alertas = useAlertasEstoque()
  const [online, setOnline] = useState(navigator.onLine)
  useRealtime(me?.restaurantId, ['pedidos', 'mesas', 'estoque', 'despesas'])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  async function handleLogout() {
    setDrawerAberto(false)
    await logout()
    navigate('/login')
  }

  return (
    <div className="relative flex h-full">
      {/* aviso de queda de conexão (leituras caem no cache do SW; escritas falham) */}
      {!online && (
        <div className="fixed inset-x-0 top-0 z-[60] bg-amber-500 py-1 text-center text-sm font-medium text-white">
          Sem conexão — dados podem estar desatualizados. Aguarde para lançar pedidos/pagamentos.
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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 md:relative md:z-auto md:translate-x-0 md:border-r md:bg-white md:shadow-none dark:border-slate-800 dark:bg-slate-900 ${
          drawerAberto ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'md:w-[72px]' : 'md:w-64'}`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-lg text-white">🍔</div>
          <span className={`truncate font-bold text-slate-800 dark:text-slate-100 ${collapsed ? 'hidden md:inline' : ''}`}>
            PDV Lanchonete
          </span>
          <button
            onClick={() => setDrawerAberto(false)}
            className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:hidden dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Fechar menu"
            title="Fechar menu"
          >
            ✕
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`ml-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 ${
              collapsed ? 'hidden md:block' : ''
            }`}
            title={collapsed ? 'Expandir' : 'Recolher'}
          >
            «
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {NAV.map((item) => (
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
              <span className="relative text-lg">
                {item.icon}
                {item.to === '/estoque' && alertas.count > 0 && (
                  <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {alertas.count}
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
                <span className="text-lg">🛰️</span>
                <span className={`truncate ${collapsed ? 'hidden md:inline' : ''}`}>Plataforma</span>
              </NavLink>
            </>
          )}
        </nav>

        {me && (
          <div className={`border-t border-slate-100 p-4 dark:border-slate-800 ${collapsed ? 'hidden md:block' : ''}`}>
            <div className="mb-2 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">👤</div>
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
        className="fixed left-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-lg text-slate-600 shadow-md transition hover:text-brand-600 md:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        aria-label="Abrir menu"
      >
        ☰
      </button>

      <main className="h-full min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}
