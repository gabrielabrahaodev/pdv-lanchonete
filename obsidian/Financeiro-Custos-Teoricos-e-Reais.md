# Financeiro — custos teóricos e reais

Sob pedido/revenda: no consumo efetivo, reaproveita as leituras transacionais dos insumos, sem consultas analíticas extras, e congela custo por item (`custoDiretoSnapshot`, estado conhecido, data de referência). Só considera todos os ingredientes com custo positivo disponível; ausência, zero sem comprovação ou baixa desabilitada deixam custo desconhecido. Snapshot teórico usa a receita normalizada e referência no instante do consumo; nesse fluxo direto não estima perdas adicionais, portanto pode coincidir com realizado.

Antecipado: lote guarda custo e referência teórica por rendimento previsto. Reserva FEFO congela custo proporcional dos lotes das unidades do pedido; quitação reconhece somente essas unidades, nunca a fornada inteira. Ex.: 40 produzidas/25 vendidas reconhece 25; 15 permanecem no lote. Perdas não criam receita. Conversão preserva proveniência de confiabilidade, mas não inventa referência teórica inexistente.

Custos desconhecidos não viram zero na apresentação. `quantidadeConhecida/quantidade`, receita coberta e custos conhecidos delimitam a margem realizada. Snapshots ausentes em vendas quitadas antes do preparo continuam desconhecidos no agregado: não há reavaliação retroativa de receita/custo por preparo posterior nesta versão. Reservas pendentes de conferência são custo atribuído à venda, não confirmação de entrega física. Histórico sem BI conserva relatórios antigos, mas não afirma margem.

Markup desejado cadastrado é convertido a margem sobre venda: 100×markup/(100+markup). Taxas, impostos, encargos e despesas indiretas não alocados não compõem margem bruta. Resultado gerencial não é lucro líquido contábil.
