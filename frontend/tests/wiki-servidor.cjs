const { spawn } = require('node:child_process')
const { setTimeout: aguardar } = require('node:timers/promises')
/** CI pode suprimir banner/cores: disponibilidade e medida por HTTP, nao por console. */
async function iniciarServidor(preview = false) {
  const porta = preview ? 4173 : 5173
  const servidor = spawn(process.execPath, [
    'node_modules/vite/bin/vite.js', ...(preview ? ['preview'] : []),
    '--host', '127.0.0.1', '--port', String(porta), '--strictPort',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = '', falha
  servidor.stdout.on('data', d => { logs += d })
  servidor.stderr.on('data', d => { logs += d })
  servidor.on('error', e => { falha = e })
  try {
    const limite = Date.now() + 30000
    while (Date.now() < limite) {
      if (falha || servidor.exitCode !== null) throw falha ?? Error('Vite encerrou: ' + servidor.exitCode)
      try {
        const r = await fetch(`http://127.0.0.1:${porta}/`, { signal: AbortSignal.timeout(1500) })
        if (r.ok) return servidor
      } catch { /* o processo ainda esta iniciando */ }
      await aguardar(250)
    }
    throw Error('Vite nao respondeu ao HTTP em 30 segundos')
  } catch (e) {
    servidor.kill()
    throw Error(e.message + '\n' + logs)
  }
}
module.exports = { iniciarServidor }
