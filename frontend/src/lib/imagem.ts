import { API_PUBLICA_BASE } from './apiPublico'

/** URL pública dos bytes da foto (funciona em <img> sem Authorization). */
export function urlImagemProduto(restaurantId: string, produtoId: string): string {
  return `${API_PUBLICA_BASE}/api/publico/${restaurantId}/imagens/${produtoId}`
}

const LADO_MAX = 900
const MAX_BASE64 = 140 * 1024 * (4 / 3) // ~140 KB reais ≈ 187 mil chars

export type ImagemComprimida = { imagemBase64: string; mime: 'image/jpeg' }

/** Comprime a imagem escolhida para JPEG (redimensiona p/ ≤900px e reduz qualidade até caber). */
export async function comprimirImagem(file: File): Promise<ImagemComprimida> {
  const bitmap = await createImageBitmap(file)
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * escala))
  canvas.height = Math.max(1, Math.round(bitmap.height * escala))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível neste navegador')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const qualidade of [0.85, 0.7, 0.55, 0.4]) {
    const base64 = canvas.toDataURL('image/jpeg', qualidade).split(',')[1] ?? ''
    if (base64.length <= MAX_BASE64 || qualidade === 0.4) {
      return { imagemBase64: base64, mime: 'image/jpeg' }
    }
  }
  throw new Error('Não foi possível comprimir a imagem')
}
