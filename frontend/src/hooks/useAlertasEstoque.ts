import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { InventoryItem } from '../types'

/** Itens de estoque no ou abaixo do mínimo — alimenta o badge global do menu. */
export function useAlertasEstoque() {
  const q = useQuery({
    queryKey: ['estoque-alertas'],
    queryFn: () => api<InventoryItem[]>('/estoque/itens?apenas_alertas=true'),
    refetchInterval: 60_000,
  })
  return { ...q, count: q.data?.length ?? 0 }
}
