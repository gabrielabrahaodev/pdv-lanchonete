import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const fonte = readFileSync('src/components/ui/index.tsx', 'utf8')
const arvore = ts.createSourceFile('index.tsx', fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const modal = arvore.statements.find((n) =>
  ts.isFunctionDeclaration(n) && n.name?.text === 'Modal',
)
assert.ok(modal, 'Componente Modal não encontrado')

function efeitosDoModal() {
  const efeitos = []
  function visitar(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useEffect') {
      efeitos.push(n)
    }
    ts.forEachChild(n, visitar)
  }
  visitar(modal)
  return efeitos
}

test('auto-foco do modal depende apenas da abertura, não de callback inline mutável', () => {
  const efeitos = efeitosDoModal()
  assert.equal(efeitos.length, 1, 'Esperado um efeito que gerencia foco/listener do modal')
  const dependencias = efeitos[0].arguments[1]
  assert.ok(ts.isArrayLiteralExpression(dependencias), 'Efeito deve declarar dependências')
  assert.deepEqual(
    dependencias.elements.map((x) => x.getText(arvore)),
    ['open'],
    'Alterar um campo não deve reexecutar o autofocus',
  )
})

test('Escape utiliza callback atualizado sem rearmar o efeito', () => {
  const codigo = modal.getText(arvore)
  assert.match(codigo, /const onCloseRef = useRef\(onClose\)/)
  assert.match(codigo, /onCloseRef\.current = onClose/)
  assert.match(codigo, /onCloseRef\.current\(\)/)
  assert.match(codigo, /document\.addEventListener\('keydown', aoTeclar, true\)/)
  assert.match(codigo, /document\.removeEventListener\('keydown', aoTeclar, true\)/)
})

test('modal preserva foco inicial e ciclo de desmontagem ao fechar', () => {
  const codigo = modal.getText(arvore)
  assert.match(codigo, /if \(!open\) return/)
  assert.match(codigo, /window\.setTimeout\(/)
  assert.match(codigo, /window\.clearTimeout\(t\)/)
  assert.match(codigo, /\.focus\(\)/)
  assert.match(codigo, /onClick=\{onClose\}/)
})
