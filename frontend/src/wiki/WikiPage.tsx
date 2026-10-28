import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { BookOpen, Search, ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Card, Input, Select, ErrorState } from '../components/ui'
import {
  manifesto,
  origemValida,
  podeLer,
  consultaDaOrigem,
} from './navegacao/contexto'
import { buscar, destacar, trecho } from './busca/busca'
import indice from './indice/busca.json'
import type { Artigo } from './tipos'
import { secoesArtigo } from './tipos'

const carregar = import.meta.glob<Artigo>('./conteudo/*/*.json', {
  import: 'default',
})
const botao =
  'inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 aria-[current=page]:bg-brand-50 aria-[current=page]:text-brand-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-brand-300 dark:aria-[current=page]:bg-slate-800'
function Destaque({ texto, consulta }: { texto: string; consulta: string }) {
  return (
    <>
      {destacar(texto, consulta).map((p, i) =>
        p.destaque ? (
          <mark key={i} className="rounded bg-amber-200 text-slate-900">
            {p.texto}
          </mark>
        ) : (
          p.texto
        ),
      )}
    </>
  )
}
export default function WikiPage() {
  const { artigoId } = useParams()
  const { me } = useAuth()
  const location = useLocation(),
    navigate = useNavigate()
  const [params] = useSearchParams()
  const [consulta, setConsulta] = useState('')
  const [artigo, setArtigo] = useState<Artigo | null>(null)
  const [erro, setErro] = useState('')
  const origem = origemValida(location.state, me)
  const estado = origem ? { origemWiki: origem } : null
  const autorizados = useMemo(
    () => manifesto.artigos.filter((a) => podeLer(a, me)),
    [me],
  )
  const meta = autorizados.find((a) => a.id === artigoId)
  const categoria = params.get('categoria') ?? ''
  const disponiveis = indice.filter((a) =>
    autorizados.some((m) => m.id === a.id),
  )
  const resultados = buscar(disponiveis, consulta)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    let atual = true
    setArtigo(null)
    setErro('')
    if (meta)
      carregar[`./conteudo/${meta.categoria}/wiki-artigo-${meta.id}.json`]()
        .then((a) => {
          if (atual) setArtigo(a)
        })
        .catch(() => {
          if (atual)
            setErro(
              'Não foi possível abrir o artigo. Tente novamente ou recarregue a página.',
            )
        })
    return () => {
      atual = false
    }
  }, [meta?.id])
  useEffect(() => {
    if (artigoId && !artigo) return
    const alvo = location.hash
      ? document.getElementById(location.hash.slice(1))
      : tituloRef.current
    alvo?.focus()
    alvo?.scrollIntoView({ block: 'start' })
  }, [artigoId, artigo, location.hash])
  useEffect(() => {
    const anterior = document.title
    document.title = meta
      ? `${meta.titulo} · Wiki NexoComanda`
      : 'Wiki NexoComanda'
    return () => {
      document.title = anterior
    }
  }, [meta?.titulo])
  const link = (id: string, label: string) => (
    <Link className={botao} to={`/wiki/${id}`} state={estado}>
      {label}
    </Link>
  )
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-3 text-slate-800 [overflow-wrap:anywhere] sm:p-6 dark:text-slate-100">
      <header className="space-y-2">
        {origem && (
          <button
            className={botao}
            type="button"
            onClick={() =>
              navigate(origem.pathname + consultaDaOrigem(origem), {
                replace: true,
                state: null,
              })
            }
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para {origem.nome}
          </button>
        )}
        <h1
          id="wiki-titulo"
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-2xl font-bold outline-none"
        >
          <BookOpen
            className="h-6 w-6 shrink-0 text-brand-600"
            aria-hidden="true"
          />
          Wiki NexoComanda
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Aprenda a utilizar as ferramentas do NexoComanda e encontre respostas
          para suas dúvidas.
        </p>
      </header>
      <section aria-label="Pesquisar na Wiki" className="space-y-2">
        <label
          htmlFor="wiki-busca"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <Search className="h-4 w-4" aria-hidden="true" />O que você quer
          aprender?
        </label>
        <Input
          id="wiki-busca"
          type="search"
          autoComplete="off"
          placeholder="Ex.: receber mercadoria, margem, fechar caixa…"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
        />
        {consulta.trim() && (
          <div
            role="region"
            aria-label="Resultados da pesquisa"
            className="space-y-2"
          >
            <p role="status" className="text-sm text-slate-500">
              {resultados.length
                ? `${resultados.length} artigo(s) encontrado(s)`
                : 'Nenhum resultado. Tente o nome da tela, uma ação ou outra palavra.'}
            </p>
            {resultados.map((r) => (
              <Card key={r.id} className="p-3">
                <Link
                  className={botao}
                  to={`/wiki/${r.id}`}
                  aria-label={r.titulo}
                  state={estado}
                  onClick={() => setConsulta('')}
                >
                  <Destaque texto={r.titulo} consulta={consulta} />
                </Link>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  <Destaque
                    texto={trecho(r.texto, consulta)}
                    consulta={consulta}
                  />
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Categorias da Wiki" className="min-w-0">
          <div className="lg:hidden">
            <label htmlFor="wiki-categoria" className="text-sm font-semibold">
              Categorias
            </label>
            <Select
              id="wiki-categoria"
              value={categoria}
              onChange={(e) =>
                navigate(
                  '/wiki' +
                    (e.target.value ? '?categoria=' + e.target.value : ''),
                  { state: estado },
                )
              }
            >
              <option value="">Todas as categorias</option>
              {Object.entries(manifesto.categorias)
                .filter(([id]) => autorizados.some((a) => a.categoria === id))
                .map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
            </Select>
          </div>
          <div className="hidden space-y-2 lg:block">
            <Link className={botao + ' w-full'} to="/wiki" state={estado}>
              Todos os assuntos
            </Link>
            {Object.entries(manifesto.categorias)
              .filter(([id]) => autorizados.some((a) => a.categoria === id))
              .map(([id, nome]) => (
                <Link
                  key={id}
                  className={botao + ' w-full'}
                  aria-current={categoria === id ? 'page' : undefined}
                  to={'/wiki?categoria=' + id}
                  state={estado}
                >
                  {nome}
                </Link>
              ))}
          </div>
        </nav>
        <div className="min-w-0">
          {!artigoId ? (
            <div className="space-y-5">
              {Object.entries(manifesto.categorias)
                .filter(([id]) => !categoria || categoria === id)
                .map(([id, nome]) => {
                  const lista = autorizados.filter((a) => a.categoria === id)
                  return lista.length ? (
                    <section key={id}>
                      <h2 className="mb-3 text-lg font-bold">{nome}</h2>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {lista.map((a) => (
                          <Card key={a.id} className="p-3">
                            {link(a.id, a.titulo)}
                          </Card>
                        ))}
                      </div>
                    </section>
                  ) : null
                })}
              {categoria &&
                !Object.keys(manifesto.categorias).includes(categoria) && (
                  <p>
                    Categoria não encontrada. Escolha uma das categorias
                    disponíveis.
                  </p>
                )}
            </div>
          ) : !meta ? (
            <Card className="space-y-3 p-4">
              <h2 className="font-bold">
                Artigo não encontrado ou indisponível para seu perfil
              </h2>
              <p className="text-sm">
                Confira seu acesso ou procure outro assunto na Wiki.
              </p>
              <Link className={botao} to="/wiki" state={estado}>
                Ver assuntos disponíveis
              </Link>
            </Card>
          ) : erro ? (
            <ErrorState error={erro} onRetry={() => navigate(0)} />
          ) : !artigo ? (
            <p role="status">Carregando artigo…</p>
          ) : (
            <article className="min-w-0 space-y-6">
              <h2 tabIndex={-1} className="text-2xl font-bold">
                {artigo.titulo}
              </h2>
              <nav
                aria-label="Sumário do artigo"
                className="flex flex-wrap gap-2"
              >
                {secoesArtigo.map(([id, titulo]) => (
                  <Link
                    key={id}
                    className={botao}
                    state={estado}
                    to={'/wiki/' + artigo.id + '#' + id}
                  >
                    {titulo}
                  </Link>
                ))}
              </nav>
              {secoesArtigo.map(([id, titulo]) => (
                <section key={id} className="space-y-3">
                  <h3
                    id={id}
                    tabIndex={-1}
                    className="scroll-mt-4 text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {titulo}
                  </h3>
                  {id === 'para-que-serve' ? (
                    <p>{artigo.para}</p>
                  ) : id === 'quando-utilizar' ? (
                    <p>{artigo.quando}</p>
                  ) : id === 'como-utilizar' ? (
                    <ol className="list-decimal space-y-3 pl-6">
                      {artigo.passos.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  ) : id === 'campos' ? (
                    <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                      <table className="w-full table-fixed text-left text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            {[
                              'Campo',
                              'Como preencher / significado',
                              'Obrigatório?',
                            ].map((t) => (
                              <th key={t} scope="col" className="p-2">
                                {t}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {artigo.campos.map((c) => (
                            <tr
                              key={c.nome}
                              className="border-t border-slate-200 align-top dark:border-slate-700"
                            >
                              <th scope="row" className="p-2 font-semibold">
                                {c.nome}
                              </th>
                              <td className="p-2">{c.preenchimento}</td>
                              <td className="p-2">{c.obrigatorio}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : id === 'acoes' ? (
                    <dl className="space-y-3">
                      {artigo.acoes.map((a) => (
                        <div key={a.nome}>
                          <dt className="font-semibold">{a.nome}</dt>
                          <dd className="mt-1 text-slate-600 dark:text-slate-300">
                            {a.efeito}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : id === 'depois' ? (
                    <p>{artigo.depois}</p>
                  ) : id === 'atencao' ? (
                    <ul className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                      {artigo.atencao.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  ) : id === 'duvidas' ? (
                    <dl className="space-y-4">
                      {artigo.duvidas.map((d) => (
                        <div key={d.pergunta}>
                          <dt className="font-semibold">{d.pergunta}</dt>
                          <dd className="mt-1">{d.resposta}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {artigo.relacionados
                        .map((id) => autorizados.find((a) => a.id === id))
                        .filter(Boolean)
                        .map((a) => (
                          <span key={a!.id}>{link(a!.id, a!.titulo)}</span>
                        ))}
                    </div>
                  )}
                </section>
              ))}
            </article>
          )}
        </div>
      </div>
    </div>
  )
}
