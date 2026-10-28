"""Contrato monetário BI: receita em centavos; custos em 10^-8 BRL.

Funções puras. Rateio por maiores restos, desempate pela posição do item.
Não consulta cadastros atuais para reconstruir margens históricas.
"""
from decimal import Decimal, ROUND_HALF_UP, ROUND_FLOOR
from hashlib import sha256

ESCALA = 100_000_000


def decimal(v):
    d = Decimal(str(v))
    if not d.is_finite():
        raise ValueError('Valor financeiro não finito')
    return d


def inteiro(v, escala=100):
    return int((decimal(v) * escala).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def chave(v):
    return sha256(str(v).encode()).hexdigest()[:32]


def ratear(total, pesos):
    if not pesos:
        return []
    soma = sum(pesos)
    if soma <= 0:
        return [total] + [0] * (len(pesos)-1)
    exatos = [Decimal(total) * p / soma for p in pesos]
    partes = [int(v.to_integral_value(rounding=ROUND_FLOOR)) for v in exatos]
    for i in sorted(range(len(pesos)), key=lambda i: (-(exatos[i]-partes[i]), i))[:total-sum(partes)]:
        partes[i] += 1
    return partes


def metricas_venda(pedido):
    if pedido.get('status') == 'cancelado':
        return []
    itens = [i for i in pedido.get('itens', []) if i.get('status') != 'cancelado' and i.get('produtoId') and decimal(i.get('qtd', 0)) > 0]
    brutos = [max(0, inteiro(decimal(i.get('precoUnitario', 0))*decimal(i['qtd']))) for i in itens]
    receitas = ratear(inteiro(pedido.get('total', 0)), brutos)
    rows = []
    for i, bruto, receita in zip(itens, brutos, receitas):
        qtd = float(i['qtd'])
        custo = i.get('custoDiretoSnapshot')
        conhecido = custo is not None and i.get('custoDiretoEstado') == 'conhecido'
        teorico = i.get('custoTeoricoSnapshot')
        rows.append({'produtoId':i['produtoId'], 'variacaoId':i.get('variacaoId') or '',
            'variacaoNome':i.get('variacaoNome', 'Padrão'), 'nome':i.get('produtoNome', i['produtoId']), 'categoriaId':i.get('categoriaId') or '',
            'metaMargem':i.get('metaMargem'), 'quantidade':qtd,
            'brutaCentavos':bruto, 'liquidaCentavos':receita, 'descontoCentavos':max(0, bruto-receita),
            'ajusteCentavos':max(0, receita-bruto), 'custoEscalado':inteiro(custo, ESCALA) if conhecido else 0,
            'receitaCobertaCentavos':receita if conhecido else 0,
            'quantidadeConhecida':qtd if conhecido else 0, 'quantidadeDesconhecida':0 if conhecido else qtd,
            'teoricoEscalado':inteiro(teorico, ESCALA) if teorico is not None else 0,
            'quantidadeTeorica':qtd if teorico is not None else 0})
    return rows


def incrementos(pedido):
    from google.cloud.firestore_v1.transforms import Increment
    inc = {'biVersao': 1, 'biVendas': Increment(1)}
    somaveis = ('quantidade','brutaCentavos','liquidaCentavos','descontoCentavos','ajusteCentavos',
                'custoEscalado','receitaCobertaCentavos','quantidadeConhecida','quantidadeDesconhecida','teoricoEscalado','quantidadeTeorica')
    for row in metricas_venda(pedido):
        for prefix in (f"produtosVendidos.{chave(row['produtoId'])}", f"variacoesVendidas.{chave(row['produtoId']+'|'+row['variacaoId'])}"):
            for k in ('produtoId','variacaoId','variacaoNome','nome','categoriaId'):
                inc[f'{prefix}.{k}'] = row[k]
            if row.get('metaMargem') is not None:
                inc[f'{prefix}.metaMargem'] = row['metaMargem']
            for k in somaveis:
                path = f'{prefix}.{k}'
                inc[path] = Increment(inc[path].value + row[k] if path in inc else row[k])
    return inc
