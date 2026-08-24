import { useState } from 'react'
import { Button, Modal } from './ui'
import { brl } from '../lib/format'

export type ProdutoCustomizavel = {
  id: string
  nome: string
  preco: number
  variacoes?: { id: string; nome: string; precoAdicional: number; ativo?: boolean }[]
}

export type SelecaoItem = {
  variacaoId: string | null
  qtd: number
  observacoes: string | null
}

const SUGESTOES = ['sem cebola', 'sem tomate', 'sem alface', 'sem maionese', 'sem picles', 'bem passado']

/** Modal de customização do produto no momento do pedido:
 *  escolhe variação, quantidade e o que retirar/adicionar (observações). */
export default function ProdutoCustomModal({
  produto,
  variacaoInicial,
  onClose,
  onConfirm,
}: {
  produto: ProdutoCustomizavel | null
  /** Id da variação já selecionada ao abrir (quando o atalho veio de um chip de variação). */
  variacaoInicial?: string
  onClose: () => void
  onConfirm: (sel: SelecaoItem) => void
}) {
  const [variacaoId, setVariacaoId] = useState(variacaoInicial ?? '')
  const [qtd, setQtd] = useState(1)
  const [obs, setObs] = useState('')

  if (!produto) return null

  const variacoesAtivas = (produto.variacoes ?? []).filter((v) => v.ativo !== false)
  const temVariacoes = variacoesAtivas.length > 0
  const variacaoSel = variacoesAtivas.find((v) => v.id === variacaoId)
  const unitario = produto.preco + (variacaoSel?.precoAdicional ?? 0)

  const partesObs = obs.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

  function toggleSugestao(s: string) {
    setObs((o) => {
      const partes = o.split(',').map((x) => x.trim()).filter(Boolean)
      const existe = partes.some((p) => p.toLowerCase() === s)
      const novas = existe ? partes.filter((p) => p.toLowerCase() !== s) : [...partes, s]
      return novas.join(', ')
    })
  }

  function confirmar() {
    onConfirm({
      variacaoId: variacaoId || null,
      qtd,
      observacoes: obs.trim() || null,
    })
  }

  return (
    <Modal title={produto.nome} open onClose={onClose}>
      <div className="space-y-4">
        {temVariacoes && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Variação</p>
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <input type="radio" name="variacao" checked={!variacaoId} onChange={() => setVariacaoId('')} className="accent-brand-600" />
                <span className="flex-1 font-medium text-slate-700 dark:text-slate-200">Padrão</span>
                <span className="font-semibold text-brand-600">{brl(produto.preco)}</span>
              </label>
              {variacoesAtivas.map((v) => (
                <label key={v.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  <input type="radio" name="variacao" checked={variacaoId === v.id} onChange={() => setVariacaoId(v.id)} className="accent-brand-600" />
                  <span className="flex-1 font-medium text-slate-700 dark:text-slate-200">{v.nome}</span>
                  <span className="font-semibold text-brand-600">{brl(produto.preco + v.precoAdicional)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Retirar / adicionar</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSugestao(s)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
                  partesObs.includes(s)
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
                }`}
              >
                {partesObs.includes(s) ? '✓ ' : '+ '}
                {s}
              </button>
            ))}
          </div>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Ex.: sem cebola, adicionar bacon…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
            <button type="button" onClick={() => setQtd((q) => Math.max(1, q - 1))} className="px-2.5 text-lg font-bold text-slate-500 hover:text-rose-600">−</button>
            <span className="min-w-6 text-center text-sm font-bold">{qtd}</span>
            <button type="button" onClick={() => setQtd((q) => Math.min(30, q + 1))} className="px-2.5 text-lg font-bold text-slate-500 hover:text-emerald-600">+</button>
          </div>
          <span className="text-lg font-extrabold text-brand-600">{brl(unitario * qtd)}</span>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-[2]" onClick={confirmar}>
            Adicionar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
