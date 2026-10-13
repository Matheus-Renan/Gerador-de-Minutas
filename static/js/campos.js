/* Definição dos campos do formulário e das variáveis calculadas que vão para os modelos.
 *
 * Um campo só aparece no formulário quando o modelo selecionado usa a sua chave
 * (ou uma variável calculada que depende dele) — assim cada tipo de documento
 * mostra apenas o que precisa.
 */
(function (global) {
  'use strict';
  const U = global.U;
  const CFG = global.CONFIG;
  const A = CFG.autoridade;

  const SECOES = [
    {
      id: 'processo', titulo: 'Processo e documento', icone: 'doc',
      campos: [
        { key: 'CONTRATO_NUMERO', label: 'Nº/ano do contrato', placeholder: 'Ex.: 012/2026', meia: true,
          dicaDe: v => { const n = numeroContrato(v); return n ? 'No documento: <b>' + escHtml(n) + '</b>' : 'O sufixo do órgão (' + sufixo(v) + ') é incluído automaticamente.'; } },
        { key: 'NUM_TERMO', label: 'Nº do termo', tipo: 'inteiro', placeholder: 'Ex.: 1', sufixo: 'º', meia: true,
          dica: 'Número de ordem: 1º, 2º, 3º termo...' },
        { key: 'NUM_PAE', label: 'Nº do PAE / Processo', placeholder: 'Ex.: 2026/123456', meia: true },
        { key: 'PARECER_JURIDICO', label: 'Parecer jurídico nº', placeholder: 'Ex.: 123/2026', meia: true },
        { key: 'FORMA_CONTRATACAO', label: 'Forma de contratação', tipo: 'select', padrao: 'licitacao',
          opcoes: [['licitacao', 'Licitação (Pregão / Ata de Registro de Preços)'],
            ['direta', 'Contratação direta (Dispensa / Inexigibilidade)']] },
        { key: 'FUNDAMENTO', label: 'Licitação / fundamento', tipo: 'textarea', linhas: 2,
          placeholder: 'Ex.: Pregão Eletrônico nº 010/2026 SRP / Ata de Registro de Preço nº 015/2026 CBMPA',
          dica: 'Na contratação direta, informe também o artigo e o inciso (ex.: Dispensa de Licitação nº 05/2026, com fundamento no art. 75, II, da Lei nº 14.133/21).' },
        { key: 'DATA_ASSINATURA', label: 'Data da assinatura', tipo: 'data', opcional: true, meia: true,
          dica: 'Em branco, sai "___ de ________ de ' + new Date().getFullYear() + '" para preencher à mão.' },
      ],
    },
    {
      id: 'contratante', titulo: 'Contratante', icone: 'predio',
      campos: [
        { key: 'ORGAO', label: 'Órgão contratante', tipo: 'select', padrao: 'CBMPA',
          opcoes: Object.entries(CFG.orgaos).map(([k, o]) => [k, o.rotulo]),
          dicaDe: v => { const o = CFG.orgaos[v.ORGAO] || {}; return 'CNPJ <b>' + escHtml(o.cnpj || '—') + '</b> · UASG <b>' + escHtml(o.uasg || '—') + '</b> · Contrato nº …/<b>' + escHtml(o.sufixo || '') + '</b>'; } },
        { key: 'AUTORIDADE_INFO', label: 'Representante do contratante', tipo: 'info', sempre: true,
          texto: A.nome + ' – ' + A.posto + ' · ' + A.cargo },
      ],
    },
    {
      id: 'contratado', titulo: 'Contratado', icone: 'pessoa',
      campos: [
        { key: 'NOME_CONTRATADA', label: p => p === 'pf' ? 'Nome completo' : 'Razão social' },
        { key: 'CNPJ_CONTRATADA', label: 'CNPJ', tipo: 'cnpj', meia: true },
        { key: 'CPF_CONTRATADA', label: 'CPF', tipo: 'cpf', meia: true },
        { key: 'RG_CONTRATADA', label: 'RG e órgão emissor', placeholder: 'Ex.: 1234567 PC/PA', meia: true },
        { key: 'ENDERECO_CONTRATADA', label: p => p === 'pf' ? 'Endereço (domicílio)' : 'Endereço da sede' },
        { key: 'EMAIL_CONTRATADA', label: 'E-mail', meia: true, placeholder: 'contato@empresa.com.br' },
        { key: 'TELEFONE_CONTRATADA', label: 'Telefone', tipo: 'telefone', meia: true },
        { key: 'NOME_REPRESENTANTE', label: 'Nome do representante legal', grupo: 'Representante legal' },
        { key: 'RG_REPRESENTANTE', label: 'RG do representante', meia: true, grupo: 'Representante legal' },
        { key: 'CPF_REPRESENTANTE', label: 'CPF do representante', tipo: 'cpf', meia: true, grupo: 'Representante legal' },
        { key: 'ENDERECO_REPRESENTANTE', label: 'Endereço do representante', grupo: 'Representante legal' },
      ],
    },
    {
      id: 'objeto', titulo: 'Objeto, itens e valores', icone: 'caixa',
      campos: [
        { key: 'OBJETO', label: 'Descrição do objeto', tipo: 'textarea', linhas: 2,
          placeholder: o => o === 'servicos' ? 'Ex.: serviço de manutenção preventiva e corretiva de viaturas'
            : 'Ex.: aquisição de equipamentos de proteção individual',
          dica: o => o === 'servicos' ? 'O texto entra após "O objeto da contratação é a prestação de...".'
            : 'O texto entra após "O objeto da contratação é a..." — comece em minúsculas (ex.: aquisição de...).' },
        { key: 'ITENS', label: 'Itens do contrato', tipo: 'itens',
          colunas: [
            { key: 'numero', label: 'Item', largura: 0.55 },
            { key: 'descricao', label: 'Descrição', largura: 3 },
            { key: 'marca', label: 'Marca/Modelo/Fabricante', largura: 1.6, so: 'bens' },
            { key: 'unidade', label: 'Unid.', largura: 0.8 },
            { key: 'quantidade', label: 'Qtd.', largura: 0.8, tipo: 'decimal' },
            { key: 'valor_unitario', label: 'Valor unit. (R$)', largura: 1.3, tipo: 'moeda' },
          ],
          calculado: { key: 'subtotal', label: 'Subtotal', fn: it => U.parseMoeda(it.quantidade) * U.parseMoeda(it.valor_unitario) } },
        { key: 'VALOR_GLOBAL', label: 'Valor global (R$)', tipo: 'moeda', meia: true,
          somaDe: { lista: 'ITENS', campo: 'subtotal' } },
        { key: 'PRAZO_PAGAMENTO', label: 'Prazo de pagamento (dias)', tipo: 'inteiro', padrao: '30', meia: true },
        { key: 'FORMA_ENTREGA', label: o => o === 'servicos' ? 'Forma de prestação' : 'Forma de entrega',
          padrao: o => o === 'servicos' ? 'Em parcela única.' : 'O bem deve ser entregue de uma só vez.' },
        { key: 'PRAZO_ENTREGA', label: o => o === 'servicos' ? 'Prazo de início (dias)' : 'Prazo de entrega (dias)',
          tipo: 'inteiro', meia: true },
        { key: 'LOCAL_ENTREGA', label: o => o === 'servicos' ? 'Local da prestação' : 'Local de entrega', meia: true },
      ],
    },
    {
      id: 'alteracoes', titulo: 'Alterações do termo aditivo', icone: 'editar',
      campos: [
        { key: 'ADITIVO_PRORROGACAO', label: 'Prorrogação de vigência', tipo: 'toggle', padrao: true },
        { key: 'PRORROGACAO_MESES', label: 'Prorrogação (meses)', tipo: 'inteiro', meia: true, mostrarSe: v => v.ADITIVO_PRORROGACAO },
        { key: 'NOVA_VIGENCIA_INICIO', label: 'Nova vigência — início', tipo: 'data', meia: true, mostrarSe: v => v.ADITIVO_PRORROGACAO },
        { key: 'NOVA_VIGENCIA_FIM', label: 'Nova vigência — fim', tipo: 'data', meia: true, mostrarSe: v => v.ADITIVO_PRORROGACAO,
          sugestao: v => U.fimVigencia(v.NOVA_VIGENCIA_INICIO, v.PRORROGACAO_MESES) },
        { key: 'ADITIVO_ACRESCIMO', label: 'Acréscimo', tipo: 'toggle', padrao: false },
        { key: 'ACRESCIMO_TIPO', label: 'Tipo de acréscimo', tipo: 'select', padrao: 'quantitativo', meia: true, mostrarSe: v => v.ADITIVO_ACRESCIMO,
          opcoes: [['quantitativo', 'Quantitativo'], ['qualitativo', 'Qualitativo'], ['quantitativo e qualitativo', 'Quantitativo e qualitativo']] },
        { key: 'ACRESCIMO_PERCENTUAL', label: 'Percentual (%)', tipo: 'percentual', meia: true, mostrarSe: v => v.ADITIVO_ACRESCIMO },
        { key: 'ACRESCIMO_DESCRICAO', label: 'Descrição do acréscimo', tipo: 'textarea', linhas: 2, mostrarSe: v => v.ADITIVO_ACRESCIMO },
        { key: 'ACRESCIMO_FUNDAMENTO', label: 'Fundamento (artigo)', placeholder: 'Ex.: 125', meia: true, mostrarSe: v => v.ADITIVO_ACRESCIMO },
        { key: 'ADITIVO_SUPRESSAO', label: 'Supressão', tipo: 'toggle', padrao: false },
        { key: 'SUPRESSAO_TIPO', label: 'Tipo de supressão', tipo: 'select', padrao: 'quantitativa', meia: true, mostrarSe: v => v.ADITIVO_SUPRESSAO,
          opcoes: [['quantitativa', 'Quantitativa'], ['qualitativa', 'Qualitativa'], ['quantitativa e qualitativa', 'Quantitativa e qualitativa']] },
        { key: 'SUPRESSAO_PERCENTUAL', label: 'Percentual (%)', tipo: 'percentual', meia: true, mostrarSe: v => v.ADITIVO_SUPRESSAO },
        { key: 'SUPRESSAO_DESCRICAO', label: 'Descrição da supressão', tipo: 'textarea', linhas: 2, mostrarSe: v => v.ADITIVO_SUPRESSAO },
        { key: 'SUPRESSAO_FUNDAMENTO', label: 'Fundamento (artigo)', placeholder: 'Ex.: 125', meia: true, mostrarSe: v => v.ADITIVO_SUPRESSAO },
      ],
    },
    {
      id: 'apostila', titulo: 'Objeto do apostilamento', icone: 'editar',
      campos: [
        { key: 'APOSTILA_TIPO', label: 'Tipo de apostilamento', tipo: 'select', padrao: 'reajuste',
          opcoes: [['reajuste', 'Reajuste de preços'], ['outro', 'Outra alteração (descrever)']] },
        { key: 'PERCENTUAL_REAJUSTE', label: 'Percentual do reajuste (%)', tipo: 'percentual', meia: true,
          mostrarSe: v => v.APOSTILA_TIPO === 'reajuste' },
        { key: 'APOSTILA_DESCRICAO', label: 'Descrição da alteração', tipo: 'textarea', linhas: 3,
          mostrarSe: v => v.APOSTILA_TIPO !== 'reajuste' },
      ],
    },
    {
      id: 'preco', titulo: 'Novo preço', icone: 'dinheiro',
      campos: [
        { key: 'PRECO_MODALIDADE', label: 'Forma de apresentar o valor', tipo: 'select', padrao: 'total',
          opcoes: [['total', 'Valor total da contratação'], ['mensal', 'Valor mensal e anual']] },
        { key: 'ITENS_TERMO', label: 'Tabela de itens', tipo: 'itens',
          colunas: [
            { key: 'numero', label: 'Item/Grupo', largura: 0.7 },
            { key: 'descricao', label: 'Descrição', largura: 2.6 },
            { key: 'unidade', label: 'Unid.', largura: 0.8 },
            { key: 'quantidade', label: 'Qtd.', largura: 0.7, tipo: 'decimal' },
            { key: 'valor_atual', label: 'Unit. atual (R$)', largura: 1.2, tipo: 'moeda' },
            { key: 'valor_novo', label: 'Unit. novo (R$)', largura: 1.2, tipo: 'moeda' },
          ],
          calculado: { key: 'valor_total', label: 'Total', fn: it => U.parseMoeda(it.quantidade) * U.parseMoeda(it.valor_novo) } },
        { key: 'NOVO_VALOR', label: 'Novo valor total (R$)', tipo: 'moeda', meia: true,
          somaDe: { lista: 'ITENS_TERMO', campo: 'valor_total' }, mostrarSe: v => v.PRECO_MODALIDADE !== 'mensal' },
        { key: 'VALOR_MENSAL', label: 'Valor mensal (R$)', tipo: 'moeda', meia: true, mostrarSe: v => v.PRECO_MODALIDADE === 'mensal' },
        { key: 'VALOR_ANUAL', label: 'Valor anual (R$)', tipo: 'moeda', meia: true, mostrarSe: v => v.PRECO_MODALIDADE === 'mensal',
          sugestao: v => { const m = U.parseMoeda(v.VALOR_MENSAL); return isFinite(m) ? U.formatMoeda(m * 12) : ''; } },
      ],
    },
    {
      id: 'vigencia', titulo: 'Vigência e reajuste', icone: 'calendario',
      campos: [
        { key: 'PRAZO_VIGENCIA', label: 'Vigência (meses)', tipo: 'inteiro', meia: true },
        { key: 'DATA_INICIO', label: 'Início da vigência', tipo: 'data', meia: true },
        { key: 'DATA_FIM', label: 'Fim da vigência', tipo: 'data', meia: true,
          sugestao: v => U.fimVigencia(v.DATA_INICIO, v.PRAZO_VIGENCIA) },
        { key: 'VIGENCIA_COMPLEMENTO', label: 'Complemento sobre prorrogação', opcional: true,
          placeholder: 'Ex.: prorrogável na forma dos arts. 106 e 107 da Lei nº 14.133/2021',
          dica: 'Opcional. Entra logo após a data de término na cláusula de vigência.' },
        { key: 'INDICE_REAJUSTE', label: 'Índice de reajuste', tipo: 'select', padrao: 'IPCA', meia: true,
          opcoes: [['IPCA', 'IPCA'], ['INPC', 'INPC'], ['INCC', 'INCC'], ['IGPM', 'IGP-M']] },
        { key: 'DATA_ORCAMENTO', label: 'Data do orçamento estimado', tipo: 'data', meia: true },
        { key: 'PRAZO_ATRASO_RESCISAO', label: 'Atraso que autoriza rescisão (dias)', tipo: 'inteiro', meia: true },
        { key: 'EFEITOS_MODO', label: 'Produção de efeitos', tipo: 'select', padrao: 'assinatura', meia: true,
          opcoes: [['assinatura', 'A partir da assinatura'], ['data', 'A partir de uma data']] },
        { key: 'EFEITOS_DATA', label: 'Data de início dos efeitos', tipo: 'data', meia: true, mostrarSe: v => v.EFEITOS_MODO === 'data' },
      ],
    },
    {
      id: 'fiscal', titulo: 'Fiscalização', icone: 'escudo',
      campos: [
        { key: 'FISCAL_TITULAR', label: 'Fiscal titular', meia: true },
        { key: 'MATRICULA_TITULAR', label: 'Matrícula do titular', meia: true },
        { key: 'FISCAL_SUPLENTE', label: 'Fiscal suplente', meia: true },
        { key: 'MATRICULA_SUPLENTE', label: 'Matrícula do suplente', meia: true },
        { key: 'SETOR_FISCAL', label: 'Setor / lotação dos fiscais', placeholder: 'Ex.: Diretoria de Apoio Logístico (DAL)' },
      ],
    },
    {
      id: 'pagamento', titulo: 'Conta bancária e garantia', icone: 'banco',
      campos: [
        { key: 'BANCO', label: 'Banco do contratado', meia: true, grupo: 'Conta para pagamento' },
        { key: 'AGENCIA', label: 'Agência', meia: true, grupo: 'Conta para pagamento' },
        { key: 'CONTA', label: 'Conta corrente', meia: true, grupo: 'Conta para pagamento' },
        { key: 'GARANTIA_EXIGIDA', label: 'Exige garantia de cumprimento contratual', tipo: 'toggle', padrao: false, grupo: 'Garantia' },
        { key: 'GARANTIA_PERCENTUAL', label: 'Garantia (%)', tipo: 'percentual', meia: true, grupo: 'Garantia',
          mostrarSe: (v, vars) => v.GARANTIA_EXIGIDA || !vars.has('GARANTIA_EXIGIDA') },
        { key: 'GARANTIA_PRAZO_ADEQUACAO', label: 'Prazo para adequar a garantia (dias)', tipo: 'inteiro', meia: true, grupo: 'Garantia' },
        { key: 'GARANTIA_PRAZO_RECOMPOSICAO', label: 'Prazo de recomposição (dias úteis)', tipo: 'inteiro', meia: true,
          grupo: 'Garantia', mostrarSe: v => v.GARANTIA_EXIGIDA },
        { key: 'GARANTIA_BENS_DIAS', label: 'Garantia dos bens (dias úteis)', tipo: 'inteiro', meia: true,
          grupo: 'Garantia', mostrarSe: v => v.GARANTIA_EXIGIDA },
        { key: 'GARANTIA_BANCO', label: 'Banco (conta do contratante)', meia: true, grupo: 'Garantia', mostrarSe: v => v.GARANTIA_EXIGIDA },
        { key: 'GARANTIA_AGENCIA', label: 'Agência', meia: true, grupo: 'Garantia', mostrarSe: v => v.GARANTIA_EXIGIDA },
        { key: 'GARANTIA_CONTA', label: 'Conta', meia: true, grupo: 'Garantia', mostrarSe: v => v.GARANTIA_EXIGIDA },
      ],
    },
    {
      id: 'dotacao', titulo: 'Dotação orçamentária', icone: 'grafico', tabela: true,
      campos: [
        { key: 'EXERCICIO', label: 'Exercício', par: 'DESC_EXERCICIO' },
        { key: 'GESTAO_UNIDADE', label: 'Gestão / Unidade', par: 'DESC_GESTAO' },
        { key: 'FONTE', label: 'Fonte', par: 'DESC_FONTE' },
        { key: 'PROG_TRABALHO', label: 'Programa de trabalho', par: 'DESC_PROG_TRABALHO' },
        { key: 'NAT_DESPESA', label: 'Natureza de despesa', par: 'DESC_NAT_DESPESA' },
        { key: 'PLANO_INTERNO', label: 'Plano interno', par: 'DESC_PLANO_INTERNO' },
        { key: 'DESC_EXERCICIO', label: 'Descrição do exercício', oculto: true },
        { key: 'DESC_GESTAO', label: 'Descrição da gestão', oculto: true },
        { key: 'DESC_FONTE', label: 'Descrição da fonte', oculto: true },
        { key: 'DESC_PROG_TRABALHO', label: 'Descrição do programa', oculto: true },
        { key: 'DESC_NAT_DESPESA', label: 'Descrição da natureza', oculto: true },
        { key: 'DESC_PLANO_INTERNO', label: 'Descrição do plano interno', oculto: true },
        { key: 'DOTACAO_VALOR', label: 'Valor (R$)', tipo: 'moeda' },
      ],
    },
  ];

  const INDICES = {
    IPCA: 'Índice Nacional de Preços ao Consumidor Amplo (IPCA)/IBGE',
    INPC: 'Índice Nacional de Preços ao Consumidor (INPC)/IBGE',
    INCC: 'Índice Nacional de Custo da Construção (INCC)/FGV',
    IGPM: 'Índice Geral de Preços – Mercado (IGP-M)/FGV',
  };

  const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const orgao = v => CFG.orgaos[v.ORGAO] || CFG.orgaos.CBMPA || {};
  const sufixo = v => orgao(v).sufixo || '';
  const SUFIXOS = Object.values(CFG.orgaos).map(o => o.sufixo).filter(Boolean).sort((x, y) => y.length - x.length);
  function numeroContrato(v) {
    let n = String(v.CONTRATO_NUMERO || '').trim();
    if (!n || n === U.SI) return n;
    // se o usuário já digitou o sufixo de algum órgão, troca pelo do órgão escolhido
    for (const suf of SUFIXOS) {
      if (n.toUpperCase().endsWith('/' + suf)) { n = n.slice(0, -(suf.length + 1)); break; }
    }
    return n.replace(/\/+$/, '') + '/' + sufixo(v);
  }

  const vazio = v => v === undefined || v === null || v === '';
  const si = v => v === U.SI;
  const moedaExt = v => (si(v) ? U.SI : (vazio(v) ? '' : U.moedaExtenso(v)));

  /* Variáveis calculadas: label (para a prévia), deps (campos de origem) e fn(valores, contexto). */
  const DERIVADAS = {
    NUM_CONTRATO: { label: 'Nº do contrato', deps: ['CONTRATO_NUMERO', 'ORGAO'], fn: v => numeroContrato(v) },
    ORGAO_NOME: { label: 'Órgão', deps: ['ORGAO'], fn: v => orgao(v).nome || '' },
    ORGAO_INTERMEDIO: { label: 'Órgão', deps: ['ORGAO'], fn: v => orgao(v).intermedio || '' },
    ORGAO_ORCAMENTO: { label: 'Órgão', deps: ['ORGAO'], fn: v => orgao(v).orcamento || '' },
    ORGAO_CNPJ: { label: 'CNPJ do órgão', deps: ['ORGAO'], fn: v => orgao(v).cnpj || '' },
    ORGAO_UASG: { label: 'UASG', deps: ['ORGAO'], fn: v => orgao(v).uasg || '' },
    AUTORIDADE_NOME: { label: 'Autoridade', deps: ['ORGAO'], fn: () => A.nome },
    AUTORIDADE_POSTO: { label: 'Posto', deps: ['ORGAO'], fn: () => A.posto },
    AUTORIDADE_CARGO: { label: 'Cargo', deps: ['ORGAO'], fn: () => A.cargo },
    AUTORIDADE_ASSINATURA: { label: 'Autoridade', deps: ['ORGAO'],
      fn: () => A.nome.toLocaleUpperCase('pt-BR') + ' - ' + A.posto },
    OBJETO_CAP: { label: 'Objeto', deps: ['OBJETO'], fn: v => vazio(v.OBJETO) ? '' : v.OBJETO.charAt(0).toLocaleUpperCase('pt-BR') + v.OBJETO.slice(1) },
    FUNDAMENTO_ORIGEM: { label: 'Licitação / fundamento', deps: ['FUNDAMENTO', 'FORMA_CONTRATACAO'],
      fn: v => vazio(v.FUNDAMENTO) ? '' : (v.FORMA_CONTRATACAO === 'direta' ? 'de contratação direta por ' : 'do ') + v.FUNDAMENTO },
    VINCULO_INSTRUMENTO: { label: 'Vínculo', deps: ['FORMA_CONTRATACAO'],
      fn: v => v.FORMA_CONTRATACAO === 'direta' ? 'ao ato que tiver autorizado a contratação direta e à respectiva proposta'
        : 'ao edital licitatório citado na Cláusula 2, à proposta do licitante vencedor' },
    PRAZO_ENTREGA_EXTENSO: { label: 'Prazo (dias)', deps: ['PRAZO_ENTREGA'], fn: v => U.quantidadeExtenso(v.PRAZO_ENTREGA) },
    PRAZO_VIGENCIA_EXTENSO: { label: 'Vigência (meses)', deps: ['PRAZO_VIGENCIA'], fn: v => U.quantidadeExtenso(v.PRAZO_VIGENCIA) },
    PRORROGACAO_MESES_EXTENSO: { label: 'Prorrogação (meses)', deps: ['PRORROGACAO_MESES'], fn: v => U.quantidadeExtenso(v.PRORROGACAO_MESES) },
    VALOR_GLOBAL_EXTENSO: { label: 'Valor global por extenso', deps: ['VALOR_GLOBAL'], fn: (v, c) => moedaExt(c.VALOR_GLOBAL) },
    NOVO_VALOR_EXTENSO: { label: 'Novo valor por extenso', deps: ['NOVO_VALOR'], fn: (v, c) => moedaExt(c.NOVO_VALOR) },
    VALOR_MENSAL_EXTENSO: { label: 'Valor mensal por extenso', deps: ['VALOR_MENSAL'], fn: (v, c) => moedaExt(c.VALOR_MENSAL) },
    VALOR_ANUAL_EXTENSO: { label: 'Valor anual por extenso', deps: ['VALOR_ANUAL', 'VALOR_MENSAL'], fn: (v, c) => moedaExt(c.VALOR_ANUAL) },
    DOTACAO_VALOR_RS: { label: 'Valor', deps: ['DOTACAO_VALOR'], fn: v => vazio(v.DOTACAO_VALOR) || si(v.DOTACAO_VALOR) ? v.DOTACAO_VALOR : 'R$ ' + v.DOTACAO_VALOR },
    DOTACAO_VALOR_EXTENSO: { label: 'Valor por extenso', deps: ['DOTACAO_VALOR'], fn: v => moedaExt(v.DOTACAO_VALOR) },
    TOTAL_ITENS_TERMO: { label: 'Total', deps: ['ITENS_TERMO'], fn: (v, c) => {
      const t = (c.ITENS_TERMO || []).reduce((s, it) => s + (U.parseMoeda(it.valor_total) || 0), 0);
      return t ? U.formatMoeda(t) : ''; } },
    GARANTIA_PERCENTUAL_EXTENSO: { label: 'Garantia (%)', deps: ['GARANTIA_PERCENTUAL'], fn: v => U.percentualExtenso(v.GARANTIA_PERCENTUAL) },
    ACRESCIMO_PERCENTUAL_EXTENSO: { label: 'Percentual', deps: ['ACRESCIMO_PERCENTUAL'], fn: v => U.percentualExtenso(v.ACRESCIMO_PERCENTUAL) },
    SUPRESSAO_PERCENTUAL_EXTENSO: { label: 'Percentual', deps: ['SUPRESSAO_PERCENTUAL'], fn: v => U.percentualExtenso(v.SUPRESSAO_PERCENTUAL) },
    INDICE_REAJUSTE_EXTENSO: { label: 'Índice de reajuste', deps: ['INDICE_REAJUSTE'], fn: v => INDICES[v.INDICE_REAJUSTE] || '' },
    CHK_IPCA: { label: '☐', deps: ['INDICE_REAJUSTE'], fn: v => v.INDICE_REAJUSTE === 'IPCA' ? '☒' : '☐' },
    CHK_INPC: { label: '☐', deps: ['INDICE_REAJUSTE'], fn: v => v.INDICE_REAJUSTE === 'INPC' ? '☒' : '☐' },
    CHK_INCC: { label: '☐', deps: ['INDICE_REAJUSTE'], fn: v => v.INDICE_REAJUSTE === 'INCC' ? '☒' : '☐' },
    CHK_IGPM: { label: '☐', deps: ['INDICE_REAJUSTE'], fn: v => v.INDICE_REAJUSTE === 'IGPM' ? '☒' : '☐' },
    VIGENCIA_COMPLEMENTO: { label: 'Complemento', deps: ['VIGENCIA_COMPLEMENTO'], opcional: true,
      fn: v => vazio(v.VIGENCIA_COMPLEMENTO) ? '' : ', ' + v.VIGENCIA_COMPLEMENTO.replace(/^[,\s]+|[.\s]+$/g, '') },
    DATA_ASSINATURA_EXTENSO: { label: 'Data da assinatura', deps: ['DATA_ASSINATURA'], opcional: true,
      fn: v => vazio(v.DATA_ASSINATURA) ? '____ de ______________ de ' + new Date().getFullYear()
        : (si(v.DATA_ASSINATURA) ? U.SI : U.dataExtenso(v.DATA_ASSINATURA)) },
    EFEITOS_TEXTO: { label: 'Início dos efeitos', deps: ['EFEITOS_MODO', 'EFEITOS_DATA'],
      fn: v => v.EFEITOS_MODO === 'data' ? (vazio(v.EFEITOS_DATA) ? '' : 'de ' + (si(v.EFEITOS_DATA) ? U.SI : U.formatData(v.EFEITOS_DATA)))
        : 'da data de sua assinatura' },
  };

  // campos de data viram dd/mm/aaaa no contexto
  const DATAS = new Set();
  SECOES.forEach(s => s.campos.forEach(c => { if (c.tipo === 'data') DATAS.add(c.key); }));

  global.CAMPOS = { SECOES, DERIVADAS, DATAS, INDICES };
})(window);
