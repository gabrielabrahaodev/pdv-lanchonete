import { BookOpen, ExternalLink } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { manifesto, podeLer, telaAtual } from '../navegacao/contexto'

/** Ajuda em nova aba: preserva pedidos, modais e formulários na aba de origem. */
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
  const id = artigo ?? telaAtual(location.pathname)?.artigo
  const meta = manifesto.artigos.find((a) => a.id === id)
  if (!me || !meta || !podeLer(meta, me)) return null

  return (
    <a
      className="mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-brand-300 dark:hover:bg-slate-800"
      href={`/wiki/${encodeURIComponent(id!)}${ancora ? '#' + encodeURIComponent(ancora) : ''}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${rotulo} (abre em nova aba)`}
      title="Abrir ajuda em nova aba"
    >
      <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{rotulo}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
    </a>
  )
}
