import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type CollectionReference,
  type Query,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { normDoc } from '../lib/firestoreData'
import type {
  CashSession,
  LoteProducao,
  MovimentoProducao,
  Category,
  DeliveryOrder,
  InventoryItem,
  Mesa,
  Order,
  Product,
  StockMovement,
} from '../types'

/**
 * Leitura tempo-real como FONTE dos dados (substitui o polling REST).
 * Cada hook escuta só o que a tela exibe, com filtro de campo único
 * (índice automático). Sem `refetchInterval`: a novidade chega por evento.
 *
 * Timestamps do Firestore são normalizados para ISO (formato da API),
 * então as páginas não distinguem origem REST de snapshot.
 */

export interface SnapshotResult<T> {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
}

// ---------------------------------------------------------- status da escuta
let realtimeOk = true
const statusSubs = new Set<(ok: boolean) => void>()

function setStatus(ok: boolean) {
  if (realtimeOk === ok) return
  realtimeOk = ok
  statusSubs.forEach((fn) => fn(ok))
}

/** `false` quando algum listener falha (banner deve aparecer). */
export function useRealtimeStatus(): boolean {
  const [ok, setOk] = useState(realtimeOk)
  useEffect(() => {
    const fn = (v: boolean) => setOk(v)
    statusSubs.add(fn)
    return () => {
      statusSubs.delete(fn)
    }
  }, [])
  return ok
}

// ---------------------------------------------------------- núcleo
function useDocs<T>(
  rid: string | null | undefined,
  kind: string,
  depsKey: string,
  build: (col: CollectionReference) => Query,
): SnapshotResult<T[]> {
  const [data, setData] = useState<T[] | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!rid) {
      setData(undefined)
      return
    }
    setData(undefined)
    setError(null)
    const q = build(collection(db, `restaurantes/${rid}/data/${kind}/items`))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setStatus(true)
        setData(snap.docs.map((d) => normDoc<T>(d.id, d.data())))
      },
      (err) => {
        console.warn(`[realtime] ${kind} indisponível:`, err.code)
        setStatus(false)
        setError(err as Error)
      },
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid, kind, depsKey])

  return { data, isLoading: data === undefined && error === null, isError: error !== null, error }
}

function useDoc<T>(rid: string | null | undefined, kind: string, id: string): SnapshotResult<T | null> {
  const [data, setData] = useState<T | null | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!rid || !id) {
      setData(undefined)
      return
    }
    setData(undefined)
    setError(null)
    const ref = doc(db, `restaurantes/${rid}/data/${kind}/items`, id)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setStatus(true)
        setData(snap.exists() ? normDoc<T>(snap.id, snap.data()) : null)
      },
      (err) => {
        console.warn(`[realtime] ${kind}/${id} indisponível:`, err.code)
        setStatus(false)
        setError(err as Error)
      },
    )
    return unsub
  }, [rid, kind, id])

  return { data: data ?? null, isLoading: data === undefined && error === null, isError: error !== null, error }
}

// ---------------------------------------------------------- hooks por tela
const ABERTO = 'aberto'
const STATUS_ATIVOS_DELIVERY = ['pending', 'confirmed', 'preparing', 'ready']
const STATUS_RELEVANTES_KDS = ['pendente', 'preparo', 'pronto']

export const useMesas = (rid: string | null | undefined) => useDocs<Mesa>(rid, 'mesas', '', (c) => query(c))

export const useMesa = (rid: string | null | undefined, mesaId: string) => useDoc<Mesa>(rid, 'mesas', mesaId)

/** Pedidos em aberto (KDS, contadores) — nunca o histórico. */
export const usePedidosAbertos = (rid: string | null | undefined) =>
  useDocs<Order>(rid, 'pedidos', ABERTO, (c) => query(c, where('status', '==', ABERTO)))

export const usePedido = (rid: string | null | undefined, pedidoId: string) => useDoc<Order>(rid, 'pedidos', pedidoId)

/** Pedido aberto de UMA mesa (detalhe, novo pedido). */
export function usePedidoAbertoDaMesa(
  rid: string | null | undefined,
  mesaId: string,
): SnapshotResult<Order | null> {
  const q = usePedidosAbertos(rid)
  const data = useMemo(
    () => (q.data === undefined ? undefined : (q.data.find((p) => p.mesaId === mesaId) ?? null)),
    [q.data, mesaId],
  )
  return { data, isLoading: q.isLoading, isError: q.isError, error: q.error }
}

/** Últimos pedidos da mesa (seção "anteriores") — janela curta, sem scan. */
export function usePedidosDaMesa(rid: string | null | undefined, mesaId: string): SnapshotResult<Order[]> {
  const q = useDocs<Order>(rid, 'pedidos', `recentes-${mesaId}`, (c) =>
    query(c, orderBy('createdAt', 'desc'), limit(25)),
  )
  const data = useMemo(() => q.data?.filter((p) => p.mesaId === mesaId), [q.data, mesaId])
  return { data, isLoading: q.isLoading, isError: q.isError, error: q.error }
}

export interface FilaPedido {
  id: string
  mesaId: string
  criadoEm: string
  itens: Order['itens']
}

/** Fila da cozinha: só itens que precisam passar por ela, mais antigo primeiro. */
export function useCozinhaFila(rid: string | null | undefined): SnapshotResult<FilaPedido[]> {
  const q = usePedidosAbertos(rid)
  const pagosPendentes = useDocs<Order>(rid, 'pedidos', 'cozinha-pendente', (c) => query(c, where('cozinhaPendente', '==', true)))
  const data = useMemo(
    () =>
      [...new Map([...(q.data ?? []), ...(pagosPendentes.data ?? [])].map((p) => [p.id, p])).values()]
        .map((p) => ({
          id: p.id,
          mesaId: p.mesaId,
          criadoEm: p.criadoEm,
          itens: (p.itens ?? []).filter((i) => STATUS_RELEVANTES_KDS.includes(i.status)),
        }))
        .filter((p) => p.itens.length > 0)
        .sort((a, b) => +new Date(a.criadoEm) - +new Date(b.criadoEm)),
    [q.data, pagosPendentes.data],
  )
  return { data, isLoading: q.isLoading || pagosPendentes.isLoading, isError: q.isError || pagosPendentes.isError, error: q.error ?? pagosPendentes.error }
}

export const useDeliveryAtivos = (rid: string | null | undefined) =>
  useDocs<DeliveryOrder>(rid, 'delivery_orders', 'ativos', (c) =>
    query(c, where('status', 'in', STATUS_ATIVOS_DELIVERY)),
  )

export const useDeliveryHistorico = (rid: string | null | undefined) => {
  const q = useDocs<DeliveryOrder>(rid, 'delivery_orders', 'hist', (c) =>
    query(c, orderBy('createdAt', 'desc'), limit(10)),
  )
  const data = useMemo(
    () => q.data?.filter((p) => p.status === 'delivered' || p.status === 'cancelled'),
    [q.data],
  )
  return { data, isLoading: q.isLoading, isError: q.isError, error: q.error }
}

export const useEstoque = (rid: string | null | undefined) =>
  useDocs<InventoryItem>(rid, 'estoque', '', (c) => query(c))

export const useMovimentacoes = (rid: string | null | undefined) =>
  useDocs<StockMovement>(rid, 'movimentacoes_estoque', 'recentes', (c) =>
    query(c, orderBy('createdAt', 'desc'), limit(50)),
  )

export const useProdutos = (rid: string | null | undefined, apenasAtivos = false) => {
  const q = useDocs<Product>(rid, 'produtos', apenasAtivos ? 'ativos' : 'todos', (c) => query(c))
  const data = useMemo(
    () => (apenasAtivos ? q.data?.filter((p) => p.ativo !== false) : q.data),
    [q.data, apenasAtivos],
  )
  return { data, isLoading: q.isLoading, isError: q.isError, error: q.error }
}

export const useCategorias = (rid: string | null | undefined) =>
  useDocs<Category>(rid, 'categorias', '', (c) => query(c))

export function useSessaoAtual(rid: string | null | undefined): SnapshotResult<CashSession | null> {
  const q = useDocs<CashSession>(rid, 'sessoes_caixa', 'aberta', (c) =>
    query(c, where('status', '==', ABERTO), limit(1)),
  )
  const data = useMemo(
    () => (q.data === undefined ? undefined : (q.data[0] ?? null)),
    [q.data],
  )
  return { data, isLoading: q.isLoading, isError: q.isError, error: q.error }
}

export const useSessoes = (rid: string | null | undefined) =>
  useDocs<CashSession>(rid, 'sessoes_caixa', 'recentes', (c) =>
    query(c, orderBy('createdAt', 'desc'), limit(30)),
  )


export const useLotesProducao = (rid: string | null | undefined) =>
  useDocs<LoteProducao>(rid, 'lotes_producao', 'abertos', (c) => query(c, where('aberto', '==', true)))

export const useHistoricoProducao = (rid: string | null | undefined) =>
  useDocs<MovimentoProducao>(rid, 'movimentacoes_producao', 'recentes', (c) => query(c, orderBy('createdAt', 'desc'), limit(100)))
