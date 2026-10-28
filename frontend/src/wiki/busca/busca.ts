export type EntradaBusca = {
  id: string
  titulo: string
  palavras: string
  texto: string
}
export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
const ignorar = new Set(
  'a o e de da do das dos em no na nos nas um uma os as como para por que meu minha esta estar fazer qual quando utilizar usar tela'.split(
    ' ',
  ),
)
const grupos = [
  ['mercadoria', 'mercadorias', 'recebimento', 'receber'],
  ['quilo', 'quilos', 'quilograma', 'kg'],
  ['grama', 'gramas', 'g'],
  ['comanda', 'pedido'],
  ['balcao', 'direta'],
  ['despesa', 'despesas', 'conta'],
  ['lucro', 'lucratividade', 'resultado'],
  ['cadastrar', 'cadastro', 'novo'],
  ['preco', 'precificacao'],
  ['instalar', 'instalacao', 'pwa'],
]
export function termos(s: string) {
  return normalizar(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !ignorar.has(t))
}
export function buscar(entradas: EntradaBusca[], consulta: string) {
  const ts = termos(consulta)
  if (!ts.length) return []
  return entradas
    .map((e) => {
      const titulo = normalizar(e.titulo),
        palavras = normalizar(e.palavras),
        texto = normalizar(e.texto)
      let score =
        titulo === normalizar(consulta.trim())
          ? 500
          : titulo.includes(normalizar(consulta.trim()))
            ? 100
            : 0
      let encontrados = 0
      for (const t of ts) {
        const alternativas = grupos.find((g) => g.includes(t)) ?? [t]
        const valor = Math.max(
          ...alternativas.map((a) =>
            titulo.includes(a)
              ? 20
              : palavras.includes(a)
                ? 10
                : texto.includes(a)
                  ? 1
                  : 0,
          ),
        )
        if (valor) encontrados++
        score += valor
      }
      return { ...e, score: encontrados === ts.length ? score + 50 : 0 }
    })
    .filter((e) => e.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.titulo.localeCompare(b.titulo, 'pt-BR'),
    )
}
export function destacar(
  texto: string,
  consulta: string,
): { texto: string; destaque: boolean }[] {
  const ts = termos(consulta)
  const base = normalizar(texto)
  const marcas = Array.from(texto, () => false)
  for (const t of ts) {
    let i = base.indexOf(t)
    while (i !== -1) {
      for (let k = i; k < i + t.length; k++) marcas[k] = true
      i = base.indexOf(t, i + t.length)
    }
  }
  const partes: { texto: string; destaque: boolean }[] = []
  for (let i = 0; i < texto.length; i++) {
    const ultima = partes[partes.length - 1]
    if (ultima?.destaque === !!marcas[i]) ultima.texto += texto[i]
    else partes.push({ texto: texto[i], destaque: !!marcas[i] })
  }
  return partes
}

export function trecho(texto: string, consulta: string): string {
  const base = normalizar(texto)
  const posicoes = termos(consulta).map(t => base.indexOf(t)).filter(i => i >= 0)
  const inicio = Math.max(0, (posicoes.length ? Math.min(...posicoes) : 0) - 50)
  return (inicio ? '…' : '') + texto.slice(inicio, inicio + 260) + (inicio + 260 < texto.length ? '…' : '')
}
