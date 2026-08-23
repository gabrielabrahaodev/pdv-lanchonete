export const brl = (v: number | null | undefined): string =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const hora = (d: string | Date | null | undefined): string => {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export const dataHora = (d: string | Date | null | undefined): string => {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const hojeISO = (): string => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export const diasAtrasISO = (dias: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
