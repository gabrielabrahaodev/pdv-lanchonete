export interface Artigo {
  id: string
  titulo: string
  para: string
  quando: string
  passos: string[]
  campos: {
    nome: string
    preenchimento: string
    obrigatorio: string
    calculo?: string
    exemplo?: string
    indisponivel?: string
  }[]
  exemplos: {
    titulo: string
    cenario: string
    resultado: string
    interpretacao: string
  }[]
  acoes: { nome: string; efeito: string }[]
  depois: string
  atencao: string[]
  duvidas: { pergunta: string; resposta: string }[]
  relacionados: string[]
}
export const secoesArtigo = [
  ['para-que-serve', 'Para que serve?'],
  ['quando-utilizar', 'Quando utilizar?'],
  ['como-utilizar', 'Como utilizar?'],
  ['campos', 'Campos da tela'],
  ['acoes', 'Botões e ações'],
  ['depois', 'O que acontece depois?'],
  ['exemplos', 'Exemplos práticos'],
  ['atencao', 'Atenção'],
  ['duvidas', 'Dúvidas frequentes'],
  ['veja-tambem', 'Veja também'],
] as const
