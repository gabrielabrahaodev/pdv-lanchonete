"""BI gerencial: apenas agregados, sem varrer pedidos, produtos ou insumos."""
from datetime import date, datetime, timedelta
from copy import deepcopy
from collections import OrderedDict
from threading import RLock
from time import monotonic
from fastapi import HTTPException
from app.services.base import get_db, items_col, doc_to_dict
from app.services.lucratividade import decimal, ESCALA

_CACHE = OrderedDict()
_LOCK = RLock()


def periodo(inicio, fim):
    if fim < inicio or (fim-inicio).days > 365:
        raise HTTPException(422, 'Período deve ter entre 1 e 366 dias')
    return (fim-inicio).days+1


def carregar(rid, inicio, fim, papel="financeiro"):
    periodo(inicio, fim)
    with _LOCK:
        for k, (quando, dados) in list(_CACHE.items()):
            if len(k)==5 and k[0]=='fonte' and k[1:3]==(rid,papel) and k[3]<=inicio and k[4]>=fim and monotonic()-quando<30:
                return {dia:deepcopy(d) for dia,d in dados.items() if inicio.isoformat()<=dia<=fim.isoformat()}
    refs=[]
    dia=inicio
    while dia<=fim:
        refs.append(items_col(rid,'agregados_diarios').document(dia.isoformat()))
        dia+=timedelta(days=1)
    docs={s.id: s.to_dict() or {} for s in get_db().get_all(refs) if s.exists}
    with _LOCK:
        _CACHE[('fonte',rid,papel,inicio,fim)]=(monotonic(),deepcopy(docs))
        while len(_CACHE)>64:_CACHE.popitem(last=False)
    return docs


def somar(docs):
    total={'receita':0,'vendas':0,'despesas':0,'compras':0,'operacionais':0,'formas':{},'categorias':{},'fornecedores':{},'fornecedorNomes':{},'biVendas':0}
    for d in docs:
        for campo, origem in [('receita','faturamento'),('vendas','totalPedidos'),('despesas','totalDespesas'),('biVendas','biVendas')]:
            total[campo]+=decimal(d.get(origem,0))
        total['fornecedorNomes'].update(d.get('fornecedorNomes',{}))
        for dest,orig in [('formas','vendasPorFormaPagamento'),('categorias','despesasPorCategoria'),('fornecedores','comprasPorFornecedor')]:
            for k,v in d.get(orig,{}).items():total[dest][k]=total[dest].get(k,0)+decimal(v)
    total['compras']=total['categorias'].get('insumo',0)
    total['operacionais']=total['despesas']-total['compras']
    total['ticketMedio']=total['receita']/total['vendas'] if total['vendas'] else None
    return total


def produtos(docs, produto_id=None, categoria=None, variacao=None):
    resultado={}
    mapa='variacoesVendidas' if variacao is not None else 'produtosVendidos'
    for d in docs:
        for key,row in d.get(mapa,{}).items():
            if produto_id and row['produtoId']!=produto_id:continue
            if categoria and row.get('categoriaId')!=categoria:continue
            if variacao not in (None, '*') and row.get('variacaoId')!=variacao:continue
            r=resultado.setdefault(key, {k:row.get(k) for k in ('produtoId','nome','categoriaId','variacaoId','variacaoNome','metaMargem')})
            for k,v in row.items():
                if k not in ('produtoId','nome','categoriaId','variacaoId','variacaoNome','metaMargem') and isinstance(v,(int,float)):
                    r[k]=r.get(k,0)+decimal(v)
    for r in resultado.values():
        qtd=r.get('quantidade',0); receita=r.get('liquidaCentavos',0)/100
        conhecida=r.get('quantidadeConhecida',0); coberta=r.get('receitaCobertaCentavos',0)/100
        custo=r.get('custoEscalado',0)/ESCALA; teorico=r.get('teoricoEscalado',0)/ESCALA
        completa=conhecida==qtd and qtd>0
        teorica=r.get('quantidadeTeorica',0)==qtd and qtd>0
        r.update(receita=receita, precoMedio=receita/qtd if qtd else None,
            custoDireto=custo if conhecida else None, custoTeorico=teorico if teorica else None,
            coberturaPercentual=conhecida/qtd*100 if qtd else None,
            lucroBruto=coberta-custo if conhecida else None,
            margemRealizada=(coberta-custo)/coberta*100 if coberta else None,
            margemTeorica=(receita-teorico)/receita*100 if teorica and receita else None,
            custoMedioUnitario=custo/conhecida if conhecida else None,
            custoTeoricoUnitario=teorico/qtd if teorica else None,
            estadoCusto='conhecido' if completa else 'parcial' if conhecida else 'desconhecido')
        r['diferencaMargemPp']=r['margemRealizada']-r['margemTeorica'] if completa and r['margemTeorica'] is not None and r['margemRealizada'] is not None else None
        r['alertas']=[]
        if not completa:r['alertas'].append('Custo histórico incompleto; margem representa somente a receita coberta.')
        if completa and r.get('metaMargem') is not None and r['margemRealizada'] is not None and r['margemRealizada']<decimal(r['metaMargem']):r['alertas'].append('Margem abaixo da meta cadastrada na venda.')
    return list(resultado.values())


def prever(docs, fim, horizonte):
    serie=[]
    for i in range(56):
        dia=fim-timedelta(days=55-i)
        d=docs.get(dia.isoformat())
        # Ausência de documento não prova operação aberta com zero vendas.
        if d and 'faturamento' in d: serie.append((dia,float(d['faturamento'])))
    minimo=28 if horizonte<=30 else 56
    if len(serie)<minimo:
        return {'disponivel':False,'observacoes':len(serie),'minimo':minimo,'motivo':'Histórico diário observado insuficiente. Dias ausentes não são tratados como zero.'}
    por_dia={i:[v for d,v in serie if d.weekday()==i] for i in range(7)}
    if any(len(v)<3 for v in por_dia.values()):
        return {'disponivel':False,'motivo':'Cobertura insuficiente por dia da semana.','observacoes':len(serie)}
    valores=[v for _,v in serie]
    antigo=sum(valores[:len(valores)//2]); recente=sum(valores[len(valores)//2:])
    tendencia=max(.8,min(1.2,(recente/len(valores[len(valores)//2:]))/(antigo/len(valores[:len(valores)//2])) if antigo else 1))
    previsao=[]
    for n in range(1,horizonte+1):
        dia=fim+timedelta(days=n); vs=por_dia[dia.weekday()]
        base=sum(vs)/len(vs)*tendencia
        previsao.append({'data':dia.isoformat(),'conservador':round(base*.8,2),'base':round(base,2),'otimista':round(base*1.2,2)})
    return {'disponivel':True,'observacoes':len(serie),'dias':previsao,
        'hipoteses':['Média por dia da semana; tendência recente limitada a ±20%.','Cenários ±20% são hipóteses, não intervalos estatísticos de confiança.','Sem feriados, eventos, crescimento garantido ou sazonalidade anual comprovada.']}


def json_num(v):
    from decimal import Decimal
    if isinstance(v,Decimal):return float(v)
    if isinstance(v,dict):return {k:json_num(x) for k,x in v.items()}
    if isinstance(v,list):return [json_num(x) for x in v]
    return v


def painel(rid, papel, inicio, fim, horizonte=7):
    n=periodo(inicio,fim); key=(rid,papel,inicio,fim,horizonte)
    with _LOCK:
        hit=_CACHE.get(key)
        if hit and monotonic()-hit[0]<30:return deepcopy(hit[1])
    # Comparativo anterior e histórico de previsão compartilham o mesmo lote.
    primeiro=min(inicio-timedelta(days=n),fim-timedelta(days=55))
    docs=carregar(rid,primeiro,fim,papel)
    atuais={k:v for k,v in docs.items() if inicio.isoformat()<=k<=fim.isoformat()}
    anteriores=[v for k,v in docs.items() if (inicio-timedelta(days=n)).isoformat()<=k<inicio.isoformat()]
    atual=somar(atuais.values()); anterior=somar(anteriores)
    rows=produtos(atuais.values())
    antes={r['produtoId']:r for r in produtos(anteriores)}
    for row in rows:
        anterior_row=antes.get(row['produtoId'])
        if row['estadoCusto']=='conhecido' and anterior_row and anterior_row['estadoCusto']=='conhecido':
            if row['custoMedioUnitario'] > anterior_row['custoMedioUnitario']:
                row['alertas'].append('Custo unitário realizado superior ao período anterior; comparação de snapshots vendidos, sem inferir causa.')
            if row['margemRealizada'] is not None and anterior_row['margemRealizada'] is not None and row['margemRealizada'] < anterior_row['margemRealizada']:
                row['alertas'].append('Margem realizada inferior ao período anterior com cobertura completa.')
    custo=sum(decimal(r['custoDireto']) for r in rows if r['custoDireto'] is not None)
    coberta=sum(decimal(v.get('receitaCobertaCentavos',0))/100 for d in atuais.values() for v in d.get('produtosVendidos',{}).values())
    atual.update(cmvConhecido=custo if rows else None, lucroBrutoCoberto=coberta-custo if coberta else None,
        resultadoGerencial=atual['receita']-custo-atual['operacionais'] if atual['biVendas']==atual['vendas'] and all(r['estadoCusto']=='conhecido' for r in rows) else None,
        saldoReceitaMenosDespesas=atual['receita']-atual['despesas'],
        variacaoPercentual=(atual['receita']-anterior['receita'])/anterior['receita']*100 if anterior['receita'] else None)
    diario=[]
    for k,d in sorted(atuais.items()):
        rs=produtos([d]); c=sum(decimal(r['custoDireto']) for r in rs if r['custoDireto'] is not None)
        cat=d.get('despesasPorCategoria',{})
        diario.append({'data':k,'receita':d.get('faturamento',0),'despesas':d.get('totalDespesas',0),'custoConhecido':c,
            'resultado':decimal(d.get('faturamento',0))-c-(decimal(d.get('totalDespesas',0))-decimal(cat.get('insumo',0))) if d.get('biVendas',0)==d.get('totalPedidos',0) and all(r['estadoCusto']=='conhecido' for r in rs) else None})
    primeiras=[str(d['biPrimeiraColeta']) for d in atuais.values() if d.get('biPrimeiraColeta')]
    value=json_num({'inicio':inicio.isoformat(),'fim':fim.isoformat(),'atual':atual,'anterior':anterior,'produtos':rows,'evolucao':diario,
        'variacoes':produtos(atuais.values(), variacao='*'),
        'cobertura':{'vendasComBI':atual['biVendas'],'vendasTotais':atual['vendas'],'primeiraColetaNoPeriodo':min(primeiras) if primeiras else None,'diasComAgregado':len(atuais),'diasSolicitados':n},
        'previsao':prever(docs,fim,horizonte),
        'limitacoes':['Resultado gerencial não é lucro contábil. Impostos e taxas não alocados não foram deduzidos.','Compras de insumos são separadas do CMV para evitar dupla dedução.','Histórico anterior sem snapshots não é reconstruído. Dados podem ter até 30 segundos de cache.','Fluxo de caixa completo indisponível: saldo bancário e todas as saídas não são conciliados.'],
        'leiturasEstimadasMaximas':(fim-primeiro).days+1})
    with _LOCK:
        _CACHE[key]=(monotonic(),deepcopy(value)); _CACHE.move_to_end(key)
        while len(_CACHE)>64:_CACHE.popitem(last=False)
    return value


def contas(rid):
    snaps=list(items_col(rid,'despesas').where('status','==','pendente').limit(201).stream())
    docs=[doc_to_dict(s) for s in snaps[:200]]
    return {'items':docs,'incompleto':len(snaps)>200,'limite':200}


def produto_evolucao(rid,inicio,fim,pid,variacao=None,papel="financeiro"):
    return [{'data':dia,'produtos':json_num(produtos([doc],produto_id=pid,variacao=variacao))} for dia,doc in sorted(carregar(rid,inicio,fim,papel).items())]
