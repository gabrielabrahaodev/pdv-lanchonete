import { BookOpen } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  manifesto,
  podeLer,
  telaAtual,
  memorizarConsulta,
} from '../navegacao/contexto'
export function AjudaContextual({
  artigo,
  ancora,
  rotulo = 'Como usar esta tela?',
}: {
  artigo?: string
  ancora?: string
  rotulo?: string
}) {
  const location = useLocation()
  const { me } = useAuth()
  if (location.pathname.startsWith('/wiki')) return null
  const tela = telaAtual(location.pathname)
  const id = artigo ?? tela?.artigo
  const meta = manifesto.artigos.find((a) => a.id === id)
  if (!me || !meta || !podeLer(meta, me)) return null
  return (
    <Link
      className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-brand-300 dark:hover:bg-slate-800"
      onClick={() =>
        memorizarConsulta(
          location.key,
          me.uid,
          me.restaurantId ?? null,
          location.pathname,
          location.search,
        )
      }
      to={`/wiki/${id}${ancora ? '#' + ancora : ''}`}
      state={{
        origemWiki: {
          pathname: location.pathname,
          search: location.search === '?add=1' ? '?add=1' : '',
          hash: '',
          key: location.key,
          state: null,
          uid: me.uid,
          rid: me.restaurantId ?? null,
          nome: tela?.nome ?? 'tela de origem',
        },
      }}
    >
      <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
      {rotulo}
    </Link>
  )
}
