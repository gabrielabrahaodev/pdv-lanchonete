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

/** Modal de customização do produto no momento do pedido:
 *  escolhe variação, quantidade e o que retirar/adicionar (observações). */
export default function ProdutoCustomModal({
  produto,
  variacaoInicial,
  imagemUrl,
  onClose,
  onConfirm,
}: {
  produto: ProdutoCustomizavel | null
  /** Id da variação já selecionada ao abrir (quando o atalho veio de um chip de variação). */
  variacaoInicial?: string
  imagemUrl?: string
  onClose: () => void
  onConfirm: (sel: SelecaoItem) => void
}) {
  const [variacaoId, setVariacaoId] = useState<string | null>(variacaoInicial ?? null)
  const [qtd, setQtd] = useState(1)
  const [obs, setObs] = useState('')

  if (!produto) return null

  const variacoesAtivas = (produto.variacoes ?? []).filter((v) => v.ativo !== false)
  const temVariacoes = variacoesAtivas.length > 0
  const variacaoSel = variacoesAtivas.find((v) => v.id === variacaoId)
  const unitario = produto.preco + (variacaoSel?.precoAdicional ?? 0)

  function confirmar() {
    if (temVariacoes && variacaoId === null) return
    onConfirm({
      variacaoId: variacaoId || null,
      qtd,
      observacoes: obs.trim() || null,
    })
  }

  return (
    <Modal title={produto.nome} open onClose={onClose}>
      <div className="space-y-4">
        {imagemUrl && <img src={imagemUrl} alt="" className="h-24 w-24 rounded-xl object-cover" />}
        {temVariacoes && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Variação</p>
            <p className="mb-2 text-sm text-slate-500">Escolha uma opção para adicionar à comanda.</p>
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <input type="radio" name="variacao" checked={variacaoId === ''} onChange={() => setVariacaoId('')} className="accent-brand-600" />
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
          <label htmlFor="observacoes-personalizacao" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Observação do item (opcional)</label>
          <textarea
            id="observacoes-personalizacao"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Ex.: sem molho, ponto da carne, etc."
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
          <Button className="flex-[2]" disabled={temVariacoes && variacaoId === null} onClick={confirmar}>
            Adicionar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
