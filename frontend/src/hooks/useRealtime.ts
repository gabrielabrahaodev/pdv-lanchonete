import { useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { db } from '../lib/firebase'

/** Query keys invalidadas quando a coleção muda no servidor. */
const QUERY_KEYS_POR_COLECAO: Record<string, QueryKey[]> = {
  pedidos: [['cozinha-fila'], ['pedidos'], ['delivery']],
  mesas: [['mesas']],
  estoque: [['estoque'], ['movimentacoes'], ['estoque-alertas']],
  despesas: [['despesas'], ['resumo-financeiro']],
}

/**
 * Tempo real via onSnapshot do Firestore (regras: claim restaurantId == tenant).
 * Se as regras não estiverem publicadas / offline, apenas avisa — o app
 * continua funcionando com o polling padrão das queries.
 */
export function useRealtime(restaurantId: string | null | undefined, colecoes: string[]) {
  const qc = useQueryClient()
  const chave = colecoes.join(',')

  useEffect(() => {
    if (!restaurantId) return
    const unsubs = chave.split(',').map((kind) =>
      onSnapshot(
        collection(db, `restaurantes/${restaurantId}/data/${kind}/items`),
        () => {
          for (const key of QUERY_KEYS_POR_COLECAO[kind] ?? []) {
            qc.invalidateQueries({ queryKey: key })
          }
        },
        (err) => console.warn(`[realtime] ${kind} indisponível:`, err.code),
      ),
    )
    return () => unsubs.forEach((u) => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, chave, qc])
}
