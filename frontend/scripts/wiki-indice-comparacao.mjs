/**
 * Comparacao de arquivos gerados em Git com checkout CRLF no Windows.
 * Apenas normaliza a sequencia CRLF para LF; qualquer mudanca real
 * (including spaces, data and EOF newline) continua sendo erro.
 */
export function conteudoIgual(atual, esperado) {
  return atual.replace(/\r\n/g, '\n') === esperado.replace(/\r\n/g, '\n')
}
