/**
 * O QR Code é uma experiência pública sempre escura, independente do
 * tema selecionado por quem administra o PDV.
 *
 * A restauração permite navegar para rotas privadas sem deixar a classe
 * 'dark' forçada na aplicação administrativa.
 */
export function ativarTemaEscuroPublico(raiz: Element): () => void {
  const anteriormenteEscuro = raiz.classList.contains('dark')
  raiz.classList.add('dark')

  return () => {
    raiz.classList.toggle('dark', anteriormenteEscuro)
  }
}
