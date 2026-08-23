import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { useAuth } from './AuthContext'

export type Tema = 'claro' | 'escuro'
const TEMA_DEFAULT: Tema = 'claro'
const storageKey = (uid: string) => `pdv:tema:${uid}`

interface ThemeState {
  tema: Tema
  setTema: (t: Tema) => void
}

const ThemeContext = createContext<ThemeState | undefined>(undefined)

function aplicar(tema: Tema) {
  document.documentElement.classList.toggle('dark', tema === 'escuro')
}

/** Tema por usuário: aplica cache local instantâneo, confirma com o backend e grava via PATCH /usuarios/me. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>(TEMA_DEFAULT)
  const { fbUser } = useAuth()
  const uid = fbUser?.uid ?? null

  useEffect(() => {
    let cancelado = false
    if (!uid) {
      // deslogado: volta ao padrão até o próximo login aplicar o tema do usuário
      setTemaState(TEMA_DEFAULT)
      aplicar(TEMA_DEFAULT)
      return
    }
    async function carregar() {
      const salvo = localStorage.getItem(storageKey(uid!))
      if (salvo === 'escuro' || salvo === 'claro') {
        setTemaState(salvo)
        aplicar(salvo)
      }
      try {
        const { tema: remoto } = await api<{ tema: string }>('/usuarios/me')
        const t: Tema = remoto === 'escuro' ? 'escuro' : TEMA_DEFAULT
        if (!cancelado) {
          setTemaState(t)
          aplicar(t)
          localStorage.setItem(storageKey(uid!), t)
        }
      } catch {
        // sem backend/sem permissão: fica no que há em cache ou default
      }
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [uid])

  const setTema = useCallback((t: Tema) => {
    setTemaState(t)
    aplicar(t)
    if (uid) localStorage.setItem(storageKey(uid), t)
    api('/usuarios/me', { method: 'PATCH', body: { tema: t } }).catch(() => {})
  }, [uid])

  return <ThemeContext.Provider value={{ tema, setTema }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>')
  return ctx
}

