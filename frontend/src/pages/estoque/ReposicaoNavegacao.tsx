import {Link} from 'react-router-dom'
export function ReposicaoNavegacao({atual}:{atual:'gerado'|'recebido'|'cancelado'}){
 return <nav aria-label="Telas de reposição" className="flex flex-wrap gap-2">{[['/reposicao','Aguardando recebimento','gerado'],['/reposicao/recebidos','Pedidos recebidos','recebido'],['/reposicao/cancelados','Cancelados','cancelado']].map(([to,label,status])=><Link key={to} to={to} aria-current={status===atual?'page':undefined} className={`inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-semibold ${status===atual?'bg-brand-600 text-white':'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{label}</Link>)}</nav>
}
