/** Exportação CSV compatível com Excel pt-BR (separador ;, BOM UTF-8). */
export function baixarCsv(
  nomeArquivo: string,
  cabecalho: string[],
  linhas: (string | number | null | undefined)[][],
): void {
  const esc = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v)
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cabecalho.map(esc).join(';'), ...linhas.map((l) => l.map(esc).join(';'))].join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo.endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
