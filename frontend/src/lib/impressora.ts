/** Impressão térmica ESC/POS via Web Bluetooth + fallback janela print(). */

export type LinhaImpressao = {
  texto: string
  alinhamento?: 'esq' | 'centro' | 'dir'
  negrito?: boolean
  grande?: boolean
}

const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb'
const CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb'

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function montarPayload(linhas: LinhaImpressao[]): Uint8Array {
  let out = '\x1b@' // init
  for (const l of linhas) {
    const align = l.alinhamento === 'centro' ? 1 : l.alinhamento === 'dir' ? 2 : 0
    out += `\x1ba${String.fromCharCode(align)}`
    out += l.negrito ? '\x1bE\x01' : '\x1bE\x00'
    out += l.grande ? '\x1b!\x30' : '\x1b!\x00'
    out += semAcento(l.texto) + '\n'
  }
  out += '\n\n\n' + '\x1dV\x42\x00' // feed + corte
  return new TextEncoder().encode(out)
}

/** Conecta via Web Bluetooth e imprime. Lança erro com mensagem amigável. */
export async function imprimirBluetooth(_nome: string | null, linhas: LinhaImpressao[]): Promise<void> {
  const bt = (navigator as unknown as { bluetooth?: { requestDevice: (o: object) => Promise<any> } }).bluetooth
  if (!bt) throw new Error('Este navegador não suporta Web Bluetooth (use Chrome ou Edge).')

  let device: any
  try {
    device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID],
    })
  } catch {
    throw new Error('Nenhuma impressora selecionada.')
  }

  const gatt = await device.gatt.connect()
  try {
    let characteristic: any = null
    try {
      const service = await gatt.getPrimaryService(SERVICE_UUID)
      characteristic = await service.getCharacteristic(CHAR_UUID)
    } catch {
      // fallback: procura qualquer característica com write em todos os serviços
      const services = await gatt.getPrimaryServices()
      for (const s of services) {
        const chars: any[] = await s.getCharacteristics()
        characteristic = chars.find((c) => c.properties?.write || c.properties?.writeWithoutResponse)
        if (characteristic) break
      }
    }
    if (!characteristic) throw new Error('Impressora sem característica de escrita.')

    const payload = montarPayload(linhas)
    const CHUNCK = 180
    const escrever =
      characteristic.writeValue?.bind(characteristic) ??
      characteristic.write?.bind(characteristic) ??
      characteristic.writeValueWithoutResponse?.bind(characteristic)
    if (!escrever) throw new Error('Impressora sem suporte a escrita.')
    for (let i = 0; i < payload.length; i += CHUNCK) {
      await escrever(payload.subarray(i, i + CHUNCK))
    }
  } finally {
    gatt.disconnect()
  }
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Fallback universal: abre janela do navegador com layout de cupom e chama print(). */
export function imprimirJanela(titulo: string, linhas: LinhaImpressao[]): void {
  const corpo = linhas
    .map((l) => {
      const style =
        [
          `text-align:${({ esq: 'left', centro: 'center', dir: 'right' })[l.alinhamento ?? 'esq']}`,
          l.negrito ? 'font-weight:bold' : '',
          l.grande ? 'font-size:16pt' : 'font-size:11pt',
        ]
          .filter(Boolean)
          .join(';') + ';margin:0'
      return `<div style="${style}">${escaparHtml(semAcento(l.texto))}</div>`
    })
    .join('')
  const w = window.open('', '_blank', 'width=380,height=600')
  if (!w) return
  w.document.write(
    `<html><head><title>${escaparHtml(titulo)}</title></head><body style="font-family:'Courier New',monospace;padding:8px">${corpo}<script>window.onload=()=>{setTimeout(()=>window.print(),150)}</script></body></html>`,
  )
  w.document.close()
}

/** Tenta Bluetooth; se indisponível/falha, usa a janela de impressão. */
export async function imprimir(titulo: string, linhas: LinhaImpressao[]): Promise<'bluetooth' | 'janela' | 'cancelado'> {
  try {
    await imprimirBluetooth(null, linhas)
    return 'bluetooth'
  } catch (e) {
    if (e instanceof Error && e.message === 'Nenhuma impressora selecionada.') return 'cancelado'
    imprimirJanela(titulo, linhas)
    return 'janela'
  }
}

// ------------------------------------------------------------------ builders
type PedidoBasico = { id?: string; tipo?: string; mesaId?: string | null; criadoEm: string; total?: number }

export function identificacaoPedido(pedido: PedidoBasico): string {
  return pedido.tipo === 'balcao' ? `Balcão #${pedido.id?.slice(-6) ?? '-'}` : pedido.tipo === 'delivery' ? `Delivery #${pedido.id?.slice(-6) ?? '-'}` : `Mesa ${pedido.mesaId?.replace('mesa_', '') ?? '-'}`
}

export function linhasComanda(
  pedido: PedidoBasico,
  itens: { qtd: number; nomeProduto: string; nomeVariacao?: string | null; observacoes?: string | null }[],
): LinhaImpressao[] {
  const ls: LinhaImpressao[] = [
    { texto: '*** COMANDA ***', alinhamento: 'centro', negrito: true, grande: true },
    { texto: `${identificacaoPedido(pedido)}  ${horaCurta(pedido.criadoEm)}`, negrito: true },
    { texto: '--------------------------------' },
  ]
  for (const i of itens) {
    ls.push({ texto: `${i.qtd}x ${i.nomeProduto}${i.nomeVariacao ? ` (${i.nomeVariacao})` : ''}`, negrito: true })
    if (i.observacoes) ls.push({ texto: `   >> ${i.observacoes}` })
  }
  return ls
}

export function linhasRecibo(
  restaurante: string,
  pedido: PedidoBasico,
  itens: { produtoId: string; qtd: number; precoUnitario: number; status: string }[],
  nomeProdutoFn: (produtoId: string) => string,
): LinhaImpressao[] {
  const ls: LinhaImpressao[] = [
    { texto: restaurante || 'PDV LANCHONETE', alinhamento: 'centro', negrito: true, grande: true },
    { texto: identificacaoPedido(pedido), alinhamento: 'centro' },
    { texto: dataCurta(pedido.criadoEm), alinhamento: 'centro' },
    { texto: '--------------------------------' },
  ]
  for (const i of itens.filter((x) => x.status !== 'cancelado')) {
    const sub = i.qtd * i.precoUnitario
    ls.push({ texto: `${i.qtd}x ${nomeProdutoFn(i.produtoId)}`, negrito: true })
    ls.push({ texto: `R$ ${sub.toFixed(2).replace('.', ',')}`, alinhamento: 'dir' })
  }
  if (pedido.total != null) {
    ls.push({ texto: '--------------------------------' })
    ls.push({ texto: `TOTAL R$ ${pedido.total.toFixed(2).replace('.', ',')}`, negrito: true, grande: true, alinhamento: 'dir' })
  }
  ls.push({ texto: 'Obrigado pela preferencia!', alinhamento: 'centro' })
  return ls
}

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function dataCurta(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
