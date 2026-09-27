import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  erro: Error | null
}

/** Última linha de defesa da SPA: qualquer exceção de render (inclusive
 *  falha de chunk lazy após deploy) vira tela amigável com recuperação,
 *  em vez de tela branca sem mensagem. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('ErrorBoundary capturou:', erro, info.componentStack)
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="grid min-h-full place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-slate-900">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 dark:bg-rose-500/15">
              <span aria-hidden="true" className="text-2xl">
                ⚠️
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Algo saiu do trilho</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Pode ser atualização do sistema ou falha momentânea. Recarregar a página resolve na maioria dos casos.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 w-full cursor-pointer rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition outline-none hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Recarregar
            </button>
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-500">detalhes técnicos</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {this.state.erro.message}
              </pre>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
