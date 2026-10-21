import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { useQueryClient } from '@tanstack/react-query'
import { auth } from '../lib/firebase'
import { api } from '../lib/api'
import type { AuthMe } from '../types'

interface AuthState {
  fbUser: FirebaseUser | null
  me: AuthMe | null
  loading: boolean
  login: (email: string, senha: string) => Promise<void>
  registrar: (email: string, senha: string) => Promise<void>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null)
  const [me, setMe] = useState<AuthMe | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      queryClient.clear()
      setMe(null)
      setLoading(true)
      setFbUser(user)
      if (user) {
        try {
          const data = await api<AuthMe>('/auth/me')
          if (auth.currentUser?.uid === user.uid) setMe(data)
        } catch (err) {
          console.error('Falha ao carregar contexto /auth/me', err)
          setMe(null)
        }
      } else {
        setMe(null)
      }
      setLoading(false)
    })
  }, [queryClient])

  async function login(email: string, senha: string) {
    await signInWithEmailAndPassword(auth, email, senha)
  }

  async function registrar(email: string, senha: string) {
    await createUserWithEmailAndPassword(auth, email, senha)
  }

  async function logout() {
    await signOut(auth)
  }

  /** Recarrega /auth/me — usado após criar restaurante (claims novos valem no próximo token). */
  async function refreshMe() {
    const user = auth.currentUser
    if (!user) return
    try {
      setMe(await api<AuthMe>('/auth/me'))
    } catch {
      setMe(null)
    }
  }

  return (
    <AuthContext.Provider value={{ fbUser, me, loading, login, registrar, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
