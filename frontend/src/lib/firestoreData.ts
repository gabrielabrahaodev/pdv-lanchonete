function normValor(v: unknown): unknown {
  if (v === null || v === undefined) return v
  if (typeof v === 'object') {
    const maybe = v as { toDate?: unknown }
    if (typeof maybe.toDate === 'function') {
      try {
        return (maybe as { toDate: () => Date }).toDate().toISOString()
      } catch {
        return v
      }
    }
    if (Array.isArray(v)) return v.map(normValor)
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = normValor(x)
    return out
  }
  return v
}

export function normDoc<T>(id: string, data: Record<string, unknown>): T {
  const out = normValor(data) as Record<string, unknown>
  const criado = out.createdAt ?? out.criadoEm
  const atualizado = out.updatedAt ?? out.atualizadoEm
  delete out.createdAt
  delete out.updatedAt
  return { ...out, criadoEm: criado ?? atualizado, atualizadoEm: atualizado ?? criado, id } as T
}
