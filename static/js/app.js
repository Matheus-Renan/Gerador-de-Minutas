/* Gerador de Minutas — interface (formulário dinâmico + prévia ao vivo). */
(function () {
  'use strict';
  const { SECOES, DERIVADAS, DATAS } = window.CAMPOS;
  const CFG = window.CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const CHAVE_RASCUNHO = 'gerador-minutas:rascunho';

  const ICONES = {
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    predio: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    caixa: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    dinheiro: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.4 0-2.6-.6-3-1.6M12 6v2m0 8v2"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    escudo: '<path d="M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    banco: '<path d="M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
    grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    seta: '<path d="m6 9 6 6 6-6"/>',
    lixo: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/>',
  };
  const svg = (nome, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${ICONES[nome] || ''}</svg>`;

  // ------------------------------------------------------------------ estado
  const estado = {
    tipo: 'contrato', objeto: 'bens', pessoa: 'pj',
    valores: {}, si: new Set(), abertas: new Set(['processo']),
    modelo: null, vars: new Set(), tpl: null, zoom: null,
    docId: null, docInfo: null, sujo: false,
  };
  const TODOS_CAMPOS = SECOES.flatMap(s => s.campos);
  const CAMPO = Object.fromEntries(TODOS_CAMPOS.map(c => [c.key, c]));

  // os rótulos dinâmicos recebem o objeto (bens/serviços) ou a pessoa (pf), conforme o campo
  function rotulo(c) {
    if (typeof c.label !== 'function') return c.label;
    const porPessoa = ['NOME_CONTRATADA', 'ENDERECO_CONTRATADA'].includes(c.key);
    return c.label(porPessoa ? estado.pessoa : estado.objeto);
  }
  const porObjeto = x => (typeof x === 'function' ? x(estado.objeto) : x);

  function padraoDe(c) { return porObjeto(c.padrao); }

  function valorBruto(key) {
    const c = CAMPO[key];
    if (estado.si.has(key)) return U.SI;
    let v = estado.valores[key];
    if (v === undefined && c && c.padrao !== undefined) v = padraoDe(c);
    return v === undefined ? '' : v;
  }

  // ------------------------------------------------------------------ contexto
  function calcularItens(lista, campoDef) {
    const brutos = Array.isArray(estado.valores[lista]) ? estado.valores[lista] : [];
    return brutos.map((it, i) => {
      const out = {};
      campoDef.colunas.forEach(col => {
        let val = (it[col.key] || '').trim();
        if (col.key === 'numero' && !val) val = String(i + 1);
        out[col.key] = val;
      });
      const total = campoDef.calculado.fn(it);
      out[campoDef.calculado.key] = isFinite(total) && total ? U.formatMoeda(total) : '';
      return out;
    });
  }

  function somaItens(c) {
    if (!c.somaDe) return 0;
    const def = CAMPO[c.somaDe.lista];
    return calcularItens(c.somaDe.lista, def)
      .reduce((s, it) => s + (U.parseMoeda(it[c.somaDe.campo]) || 0), 0);
  }

  /** Monta o dicionário que vai para o modelo (mesmo na prévia e na geração). */
  function contexto() {
    const brutos = {};
    const ctx = {};
    TODOS_CAMPOS.forEach(c => {
      if (c.tipo === 'itens') return;
      let v = valorBruto(c.key);
      if ((v === '' || v === undefined) && c.sugestao) v = c.sugestao(brutos) || '';
      if (c.somaDe) { const s = somaItens(c); if (s) v = U.formatMoeda(s); }
      brutos[c.key] = v;
    });
    // segunda passada para sugestões que dependem de campos declarados depois
    TODOS_CAMPOS.forEach(c => {
      if (c.sugestao && valorBruto(c.key) === '') brutos[c.key] = c.sugestao(brutos) || '';
    });
    Object.entries(brutos).forEach(([k, v]) => {
      ctx[k] = (DATAS.has(k) && v !== U.SI) ? U.formatData(v) : v;
    });
    TODOS_CAMPOS.filter(c => c.tipo === 'itens').forEach(c => { ctx[c.key] = calcularItens(c.key, c); });
    Object.entries(DERIVADAS).forEach(([k, d]) => {
      const algumSI = d.deps.some(dep => brutos[dep] === U.SI);
      ctx[k] = algumSI ? U.SI : d.fn(brutos, ctx);
    });
    return ctx;
  }

  // ------------------------------------------------------------------ visibilidade
  /** Um campo aparece se o modelo usa a chave ou alguma variável calculada que depende dela. */
  function usadoNoModelo(key) {
    if (estado.vars.has(key)) return true;
    return Object.entries(DERIVADAS).some(([k, d]) => d.deps.includes(key) && estado.vars.has(k));
  }

  function campoVisivel(c, brutos) {
    if (c.oculto) return false;
    if (c.sempre) return true;
    if (!usadoNoModelo(c.key)) return false;
    if (c.mostrarSe && !c.mostrarSe(brutos, estado.vars)) return false;
    return true;
  }

  function brutosAtuais() {
    const b = {};
    TODOS_CAMPOS.forEach(c => { b[c.key] = c.tipo === 'itens' ? estado.valores[c.key] : valorBruto(c.key); });
    return b;
  }

  // ------------------------------------------------------------------ formulário
  function criarEntrada(c) {
    const id = 'f_' + c.key;
    const ph = porObjeto(c.placeholder) || '';
    let html;
    switch (c.tipo) {
      case 'textarea':
        html = `<textarea id="${id}" rows="${c.linhas || 2}" placeholder="${esc(ph)}"></textarea>`; break;
      case 'select':
        html = `<select id="${id}">${c.opcoes.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`; break;
      case 'data':
        html = `<input id="${id}" type="date">`; break;
      case 'moeda':
        html = `<div class="com-prefixo"><span>R$</span><input id="${id}" inputmode="numeric" placeholder="0,00"></div>`; break;
      case 'percentual':
        html = `<div class="com-sufixo"><input id="${id}" inputmode="decimal" placeholder="${esc(ph || '0')}"><span>%</span></div>`; break;
      case 'inteiro':
        html = c.sufixo
          ? `<div class="com-sufixo"><input id="${id}" inputmode="numeric" placeholder="${esc(ph)}"><span>${c.sufixo}</span></div>`
          : `<input id="${id}" inputmode="numeric" placeholder="${esc(ph)}">`; break;
      default:
        html = `<input id="${id}" type="text" placeholder="${esc(ph || placeholderMascara(c.tipo))}" ${['cpf', 'cnpj', 'telefone'].includes(c.tipo) ? 'inputmode="numeric"' : ''}>`;
    }
    return html;
  }
  const placeholderMascara = t => ({ cpf: '000.000.000-00', cnpj: '00.000.000/0000-00', telefone: '(91) 90000-0000' }[t] || '');

  function htmlCampo(c) {
    const largura = c.meia ? ' meia' : '';
    if (c.tipo === 'toggle') {
      return `<div class="campo campo-toggle" data-key="${c.key}">
        <label class="interruptor"><input type="checkbox" id="f_${c.key}"><span class="trilho"></span>
        <span class="interruptor-texto">${esc(rotulo(c))}</span></label></div>`;
    }
    if (c.tipo === 'itens') return htmlItens(c);
    if (c.tipo === 'info') {
      return `<div class="campo campo-info" data-key="${c.key}"><span class="info-rotulo">${esc(rotulo(c))}</span>
        <span class="info-texto">${esc(c.texto)}</span></div>`;
    }
    const semSI = ['select'].includes(c.tipo) || c.opcional;
    const dica = porObjeto(c.dica);
    return `<div class="campo${largura}" data-key="${c.key}">
      <div class="campo-topo"><label for="f_${c.key}">${esc(rotulo(c))}${c.opcional ? ' <em>(opcional)</em>' : ''}</label>
      ${semSI ? '' : `<label class="si" title="Marca o campo como sem informação (XXXXXXXX)"><input type="checkbox" data-si="${c.key}">S/I</label>`}</div>
      ${criarEntrada(c)}
      <div class="dica" data-dica="${c.key}">${dica ? esc(dica) : ''}</div>
    </div>`;
  }

  function colunasItens(c) { return c.colunas.filter(col => !col.so || col.so === estado.objeto); }

  function htmlItens(c) {
    return `<div class="campo campo-itens" data-key="${c.key}">
      <div class="campo-topo"><label>${esc(rotulo(c))}</label><span class="total-itens" data-total="${c.key}"></span></div>
      <div class="itens-linhas" data-linhas="${c.key}"></div>
      <button type="button" class="btn btn-tracejado" data-add="${c.key}">+ Adicionar item</button>
    </div>`;
  }

  function entradaItem(col, it, i) {
    const modo = col.tipo === 'moeda' ? 'inputmode="numeric"' : (col.tipo === 'decimal' ? 'inputmode="decimal"' : '');
    return `<input data-col="${col.key}" value="${esc(it[col.key] || '')}" ${modo}
      placeholder="${col.key === 'numero' ? i + 1 : (col.key === 'descricao' ? 'Descrição do item' : '')}" aria-label="${esc(col.label)}">`;
  }

  function linhaItem(c, it, i) {
    const cols = colunasItens(c);
    const tot = c.calculado.fn(it);
    const num = cols.find(col => col.key === 'numero');
    const desc = cols.find(col => col.key === 'descricao');
    const resto = cols.filter(col => col !== num && col !== desc);
    return `<div class="item-linha" data-i="${i}">
      <div class="item-l1">
        <label class="mini mini-num"><span>${esc(num.label)}</span>${entradaItem(num, it, i)}</label>
        <label class="mini mini-desc"><span>${esc(desc.label)}</span>${entradaItem(desc, it, i)}</label>
        <button type="button" class="item-remover" title="Remover item" data-rem="${i}">×</button>
      </div>
      <div class="item-l2" style="--n:${resto.length}">
        ${resto.map(col => `<label class="mini"><span>${esc(col.label)}</span>${entradaItem(col, it, i)}</label>`).join('')}
        <div class="mini mini-total"><span>${esc(c.calculado.label)}</span><output>${isFinite(tot) && tot ? 'R$ ' + U.formatMoeda(tot) : '—'}</output></div>
      </div>
    </div>`;
  }

  function renderItens(key) {
    const c = CAMPO[key];
    const box = $(`[data-linhas="${key}"]`);
    if (!box) return;
    const lista = estado.valores[key] || [];
    box.innerHTML = lista.length ? lista.map((it, i) => linhaItem(c, it, i)).join('')
      : '<div class="itens-vazio">Nenhum item adicionado.</div>';
    atualizarTotalItens(key);
  }

  function atualizarTotalItens(key) {
    const c = CAMPO[key];
    const total = calcularItens(key, c).reduce((s, it) => s + (U.parseMoeda(it[c.calculado.key]) || 0), 0);
    const el = $(`[data-total="${key}"]`);
    if (el) el.textContent = total ? 'Total: R$ ' + U.formatMoeda(total) : '';
    $$(`[data-linhas="${key}"] .item-linha`).forEach(l => {
      const it = (estado.valores[key] || [])[Number(l.dataset.i)] || {};
      const t = c.calculado.fn(it);
      l.querySelector('output').textContent = isFinite(t) && t ? 'R$ ' + U.formatMoeda(t) : '—';
    });
  }

  function htmlDotacao(s) {
    const linhas = s.campos.filter(c => c.par).map(c => `
      <div class="dot-linha campo" data-key="${c.key}">
        <span class="dot-rotulo">${esc(c.label)}</span>
        <input id="f_${c.key}" placeholder="Código">
        <input id="f_${c.par}" placeholder="Descrição">
        <label class="si" title="Sem informação"><input type="checkbox" data-si="${c.key}" data-si-par="${c.par}">S/I</label>
      </div>`).join('');
    const extra = s.campos.filter(c => !c.par && !c.oculto).map(htmlCampo).join('');
    return `<div class="dot-tabela"><div class="dot-cab"><span>Item</span><span>Código contábil</span><span>Descrição</span><span></span></div>${linhas}</div>
      <div class="grade">${extra}</div>`;
  }

  function montarFormulario() {
    const cont = $('#secoes');
    cont.innerHTML = SECOES.map(s => {
      let corpo;
      if (s.tabela) corpo = htmlDotacao(s);
      else {
        // agrupa campos com "grupo" sob um subtítulo
        let grupoAtual = null;
        corpo = '<div class="grade">' + s.campos.map(c => {
          let pre = '';
          if (c.grupo && c.grupo !== grupoAtual) { pre = `<div class="subgrupo" data-subgrupo="${esc(c.grupo)}">${esc(c.grupo)}</div>`; grupoAtual = c.grupo; }
          return pre + htmlCampo(c);
        }).join('') + '</div>';
      }
      const aberta = estado.abertas.has(s.id) ? ' aberta' : '';
      return `<section class="cartao secao${aberta}" data-secao="${s.id}">
        <button type="button" class="secao-cab" aria-expanded="${!!aberta}">
          <span class="secao-icone">${svg(s.icone)}</span>
          <span class="secao-titulo">${esc(s.titulo)}</span>
          <span class="secao-contagem" data-contagem="${s.id}"></span>
          ${svg('seta', 'secao-seta')}
        </button>
        <div class="secao-corpo">${corpo}</div>
      </section>`;
    }).join('');

    // valores atuais nas entradas
    TODOS_CAMPOS.forEach(c => {
      const el = $('#f_' + c.key);
      if (c.tipo === 'itens') { renderItens(c.key); return; }
      if (!el) return;
      const v = estado.si.has(c.key) ? U.SI : valorBruto(c.key);
      if (c.tipo === 'toggle') el.checked = !!v;
      else el.value = v === undefined ? '' : v;
      if (estado.si.has(c.key)) { el.disabled = true; const s = $(`[data-si="${c.key}"]`); if (s) s.checked = true; }
    });
    $$('[data-si-par]').forEach(chk => {
      if (chk.checked) { const p = $('#f_' + chk.dataset.siPar); p.disabled = true; p.value = U.SI; }
    });
    atualizarVisibilidade();
  }

  function atualizarVisibilidade() {
    const brutos = brutosAtuais();
    SECOES.forEach(s => {
      const sec = $(`[data-secao="${s.id}"]`);
      let visiveis = 0;
      s.campos.forEach(c => {
        const el = $(`.campo[data-key="${c.key}"]`, sec);
        if (!el) return;
        const vis = campoVisivel(c, brutos) || (c.par && usadoNoModelo(c.par));
        el.hidden = !vis;
        if (vis) visiveis++;
      });
      $$('.subgrupo', sec).forEach(sg => {
        const nome = sg.dataset.subgrupo;
        sg.hidden = !s.campos.some(c => c.grupo === nome && !$(`.campo[data-key="${c.key}"]`, sec).hidden);
      });
      sec.hidden = visiveis === 0;
    });
    atualizarDicasCalculadas(brutos);
    atualizarProgresso(brutos);
  }

  function atualizarDicasCalculadas(brutos) {
    TODOS_CAMPOS.forEach(c => {
      const dica = $(`[data-dica="${c.key}"]`);
      const el = $('#f_' + c.key);
      if (!dica || !el) return;
      const base = porObjeto(c.dica) || '';
      if (c.somaDe) {
        const s = somaItens(c);
        el.readOnly = !!s;
        el.closest('.campo').classList.toggle('calculado', !!s);
        if (s) { el.value = U.formatMoeda(s); dica.textContent = 'Calculado pela soma dos itens.'; return; }
        if (el.readOnly === false && estado.valores[c.key] === undefined) el.value = '';
      }
      if (c.dicaDe) { dica.innerHTML = c.dicaDe(brutos); return; }
      if (c.sugestao && !valorBruto(c.key)) {
        const sug = c.sugestao(brutos);
        if (sug) { dica.innerHTML = 'Sugestão automática: <b>' + esc(c.tipo === 'data' ? U.formatData(sug) : sug) + '</b> — usada se o campo ficar em branco.'; return; }
      }
      dica.textContent = base;
    });
  }

  function preenchido(c) {
    if (estado.si.has(c.key)) return true;
    if (c.tipo === 'itens') return (estado.valores[c.key] || []).length > 0;
    if (c.tipo === 'toggle' || c.tipo === 'select' || c.tipo === 'info') return true;
    if (c.somaDe && somaItens(c)) return true;
    const v = valorBruto(c.key);
    return v !== '' && v !== undefined;
  }

  function atualizarProgresso(brutos) {
    let total = 0, ok = 0;
    SECOES.forEach(s => {
      let t = 0, o = 0;
      s.campos.forEach(c => {
        if (c.opcional || c.tipo === 'toggle' || c.tipo === 'select' || c.tipo === 'info') return;
        const vis = campoVisivel(c, brutos) || (c.oculto && usadoNoModelo(c.key));
        if (!vis) return;
        t++; if (preenchido(c)) o++;
      });
      total += t; ok += o;
      const el = $(`[data-contagem="${s.id}"]`);
      if (el) { el.textContent = t ? `${o}/${t}` : ''; el.classList.toggle('completo', t > 0 && o === t); }
    });
    const pct = total ? Math.round(ok / total * 100) : 0;
    $('#progresso-preench').style.width = pct + '%';
    $('#progresso-texto').textContent = `${ok} de ${total} campos preenchidos`;
  }

  // ------------------------------------------------------------------ eventos do formulário
  function aoDigitar(e) {
    const el = e.target;
    if (el.dataset.si) return;
    // itens
    const linha = el.closest('.item-linha');
    if (linha) {
      const key = el.closest('[data-linhas]').dataset.linhas;
      const col = CAMPO[key].colunas.find(cc => cc.key === el.dataset.col);
      if (col && col.tipo === 'moeda') mascarar(el, U.MASCARAS.moeda);
      if (col && col.tipo === 'decimal') el.value = el.value.replace(/[^\d,]/g, '');
      estado.valores[key][Number(linha.dataset.i)][el.dataset.col] = el.value;
      atualizarTotalItens(key);
      mudou();
      return;
    }
    if (!el.id || !el.id.startsWith('f_')) return;
    const key = el.id.slice(2);
    const caixa = el.closest('.campo'); if (caixa) caixa.classList.remove('erro');
    const c = CAMPO[key];
    if (!c) return;
    if (c.tipo === 'toggle') estado.valores[key] = el.checked;
    else {
      const masc = { cpf: 'cpf', cnpj: 'cnpj', telefone: 'telefone', moeda: 'moeda', inteiro: 'inteiro', percentual: 'percentual' }[c.tipo];
      if (masc) mascarar(el, U.MASCARAS[masc]);
      estado.valores[key] = el.value;
    }
    mudou();
  }

  function mascarar(el, fn) {
    const antes = el.value;
    const depois = fn(antes);
    if (antes !== depois) {
      const fim = el.selectionStart === antes.length;
      el.value = depois;
      if (fim) el.setSelectionRange(depois.length, depois.length);
    }
  }

  function aoClicar(e) {
    const cab = e.target.closest('.secao-cab');
    if (cab) {
      const sec = cab.parentElement;
      sec.classList.toggle('aberta');
      cab.setAttribute('aria-expanded', sec.classList.contains('aberta'));
      if (sec.classList.contains('aberta')) estado.abertas.add(sec.dataset.secao); else estado.abertas.delete(sec.dataset.secao);
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      const key = add.dataset.add;
      estado.valores[key] = estado.valores[key] || [];
      estado.valores[key].push({});
      renderItens(key);
      const linhas = $$(`[data-linhas="${key}"] .item-linha`);
      const ultima = linhas[linhas.length - 1];
      if (ultima) ultima.querySelector('[data-col="descricao"]').focus();
      mudou();
      return;
    }
    const rem = e.target.closest('[data-rem]');
    if (rem) {
      const key = rem.closest('[data-linhas]').dataset.linhas;
      estado.valores[key].splice(Number(rem.dataset.rem), 1);
      renderItens(key);
      mudou();
    }
  }

  function aoMarcarSI(e) {
    const chk = e.target;
    if (!chk.dataset.si) return;
    const keys = [chk.dataset.si, chk.dataset.siPar].filter(Boolean);
    keys.forEach(k => {
      const inp = $('#f_' + k);
      if (chk.checked) { estado.si.add(k); if (inp) { inp.value = U.SI; inp.disabled = true; } }
      else { estado.si.delete(k); if (inp) { inp.disabled = false; inp.value = estado.valores[k] || ''; } }
    });
    mudou();
  }

  let agendado = false;
  function mudou() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      estado.sujo = true;
      atualizarDocAtual();
      atualizarVisibilidade();
      renderPrevia();
      salvarRascunho();
      if (estado.focado) destacarCampo(estado.focado, false);
    });
  }

  // ------------------------------------------------------------------ prévia
  function rotuloPlaceholder(nome) {
    if (nome.includes('.')) {
      const [, col] = nome.split('.');
      for (const c of TODOS_CAMPOS.filter(x => x.tipo === 'itens')) {
        const cc = c.colunas.find(x => x.key === col);
        if (cc) return cc.label;
        if (c.calculado.key === col) return c.calculado.label;
      }
      return col;
    }
    if (CAMPO[nome]) return rotulo(CAMPO[nome]);
    if (DERIVADAS[nome]) return DERIVADAS[nome].label;
    return nome;
  }

  function avaliar(expr, c) {
    const js = expr.replace(/'[^']*'|"[^"]*"|\b[A-Za-z_]\w*\b/g, t => {
      if (t[0] === "'" || t[0] === '"') return t;
      if (t === 'and') return '&&';
      if (t === 'or') return '||';
      if (t === 'not') return '!';
      if (t === 'True' || t === 'true') return 'true';
      if (t === 'False' || t === 'false') return 'false';
      return 'c[' + JSON.stringify(t) + ']';
    });
    try { return !!(new Function('c', 'return (' + js + ');'))(c); } catch (err) { return false; }
  }

  function preencherPh(ph, valor, nome) {
    ph.classList.remove('vazio', 'si', 'cheio');
    if (valor === undefined || valor === null || valor === '') {
      const d = DERIVADAS[nome];
      if (d && d.opcional) { ph.textContent = ''; return; }
      ph.textContent = rotuloPlaceholder(nome);
      ph.classList.add('vazio');
    } else {
      ph.textContent = String(valor);
      ph.classList.add(valor === U.SI ? 'si' : 'cheio');
    }
  }

  const FORMATOS = {
    decimal: n => String(n),
    decimalZero: n => String(n).padStart(2, '0'),
    lowerLetter: n => letras(n).toLowerCase(),
    upperLetter: n => letras(n),
    lowerRoman: n => romano(n).toLowerCase(),
    upperRoman: n => romano(n),
    ordinal: n => n + 'º',
  };
  function letras(n) { let s = ''; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }
  function romano(n) {
    const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
  }

  function numerar(raiz) {
    const num = estado.modelo.numeracao;
    const contadores = {};
    $$('[data-num]', raiz).forEach(p => {
      const id = p.dataset.num, lvl = Number(p.dataset.lvl);
      if (!num[id]) return;
      const defs = num[id].niveis;
      if (!defs[lvl]) return;
      const chave = num[id].chave;
      const c = contadores[chave] = contadores[chave] || {};
      c[lvl] = c[lvl] === undefined ? defs[lvl].start : c[lvl] + 1;
      Object.keys(c).forEach(k => { if (Number(k) > lvl) delete c[k]; });
      let texto;
      if (defs[lvl].fmt === 'bullet') texto = defs[lvl].text.length === 1 && defs[lvl].text.charCodeAt(0) > 0xF000 ? '•' : (defs[lvl].text || '•');
      else {
        texto = defs[lvl].text.replace(/%(\d)/g, (_, d) => {
          const k = Number(d) - 1;
          const def = defs[k] || { start: 1, fmt: 'decimal' };
          const v = c[k] === undefined ? def.start : c[k];
          return (FORMATOS[def.fmt] || FORMATOS.decimal)(v);
        });
      }
      const span = p.querySelector('.num');
      if (span) span.textContent = texto;
    });
  }

  function renderPrevia() {
    if (!estado.tpl) return;
    const ctx = contexto();
    estado.ultimoContexto = ctx;
    const frag = estado.tpl.content.cloneNode(true);

    $$('.cond-group', frag).forEach(g => {
      const conds = [...g.children].filter(x => x.classList.contains('cond'));
      const escolhido = conds.find(c => c.dataset.cond === '__else__' || avaliar(c.dataset.cond, ctx));
      g.replaceWith(...(escolhido ? [...escolhido.childNodes] : []));
    });

    $$('tbody.loop', frag).forEach(tb => {
      const modeloLinhas = [...tb.children];
      const item = tb.dataset.item;
      const lista = Array.isArray(ctx[tb.dataset.loop]) ? ctx[tb.dataset.loop] : [];
      tb.innerHTML = '';
      const linhas = lista.length ? lista : [null];
      linhas.forEach(obj => {
        modeloLinhas.forEach(tr => {
          const novo = tr.cloneNode(true);
          if (!obj) novo.classList.add('linha-exemplo');
          $$('.ph', novo).forEach(ph => {
            const nome = ph.dataset.ph;
            if (nome.startsWith(item + '.')) {
              preencherPh(ph, obj ? obj[nome.slice(item.length + 1)] : '', nome);
              ph.dataset.loop = tb.dataset.loop;
              ph.dataset.feito = '1';
            }
          });
          tb.appendChild(novo);
        });
      });
    });

    $$('.ph', frag).forEach(ph => {
      if (ph.dataset.feito) return;
      preencherPh(ph, ctx[ph.dataset.ph], ph.dataset.ph);
    });

    numerar(frag);
    $('#previa-doc').replaceChildren(frag);
  }

  async function carregarModelo() {
    const q = new URLSearchParams({ tipo: estado.tipo, objeto: estado.objeto, pessoa: estado.pessoa });
    $('#previa-carregando').hidden = false;
    try {
      const r = await fetch('/api/modelo?' + q);
      if (!r.ok) throw new Error(await r.text());
      const dados = await r.json();
      estado.modelo = dados;
      estado.vars = new Set(dados.vars);
      const t = document.createElement('template');
      t.innerHTML = dados.html;
      estado.tpl = t;
      $('#chip-arquivo').textContent = dados.arquivo;
      montarFormulario();
      renderPrevia();
      ajustarZoom(estado.zoom === null);
    } catch (err) {
      $('#previa-doc').innerHTML = '<div class="erro-previa">Não foi possível carregar o modelo.<br><small>' + esc(String(err.message || err)).slice(0, 400) + '</small></div>';
    } finally {
      $('#previa-carregando').hidden = true;
    }
  }

  // ------------------------------------------------------------------ ligação campo <-> prévia
  function phsDoCampo(key) {
    const nomes = new Set([key]);
    Object.entries(DERIVADAS).forEach(([k, d]) => { if (d.deps.includes(key)) nomes.add(k); });
    if (CAMPO[key] && CAMPO[key].par) nomes.add(CAMPO[key].par);
    return $$('#previa-doc .ph').filter(ph => nomes.has(ph.dataset.ph) || ph.dataset.loop === key);
  }

  function destacarCampo(key, rolar = true) {
    $$('#previa-doc .ph.ativo').forEach(p => p.classList.remove('ativo'));
    if (!key) return;
    const phs = phsDoCampo(key);
    phs.forEach(p => p.classList.add('ativo'));
    if (rolar && phs.length) {
      const box = $('#previa-rolagem');
      const r = phs[0].getBoundingClientRect(), b = box.getBoundingClientRect();
      if (r.top < b.top + 40 || r.bottom > b.bottom - 40) {
        box.scrollTo({ top: box.scrollTop + r.top - b.top - b.height / 3, behavior: 'smooth' });
      }
    }
  }

  function campoDoPh(nome, loop) {
    if (loop) return loop;
    if (CAMPO[nome]) {
      const dono = TODOS_CAMPOS.find(c => c.par === nome);
      return dono ? nome : nome;
    }
    const d = DERIVADAS[nome];
    return d ? d.deps[0] : null;
  }

  function irParaCampo(key) {
    const c = CAMPO[key];
    if (!c) return;
    const secao = SECOES.find(s => s.campos.includes(c));
    const sec = $(`[data-secao="${secao.id}"]`);
    if (!sec.classList.contains('aberta')) { sec.classList.add('aberta'); estado.abertas.add(secao.id); }
    const alvo = c.tipo === 'itens' ? $(`.campo[data-key="${key}"]`) : $('#f_' + key);
    if (!alvo) return;
    if ($('#layout').classList.contains('mostrar-previa')) trocarAba('form');
    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const foco = c.tipo === 'itens' ? (alvo.querySelector('input') || alvo.querySelector('[data-add]')) : alvo;
    setTimeout(() => foco && foco.focus({ preventScroll: true }), 250);
    const caixa = alvo.closest('.campo');
    if (caixa) { caixa.classList.remove('piscar'); void caixa.offsetWidth; caixa.classList.add('piscar'); }
  }

  // ------------------------------------------------------------------ zoom
  function ajustarZoom(ajustarLargura) {
    const pagina = $('#previa-doc .doc-page');
    if (!pagina) return;
    if (ajustarLargura) {
      const disponivel = $('#previa-rolagem').clientWidth - 48;
      estado.zoom = Math.max(0.4, Math.min(1.4, disponivel / pagina.offsetWidth));
    }
    $('#previa-zoom').style.zoom = estado.zoom;
    $('#zoom-valor').textContent = Math.round(estado.zoom * 100) + '%';
  }

  // ------------------------------------------------------------------ rascunho / importar / exportar
  function dadosParaSalvar() {
    return { versao: 1, tipo: estado.tipo, objeto: estado.objeto, pessoa: estado.pessoa,
      valores: estado.valores, si: [...estado.si] };
  }

  function salvarRascunhoLocal() {
    try {
      localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(Object.assign(dadosParaSalvar(),
        { docId: estado.docId, docInfo: estado.docInfo, sujo: estado.sujo })));
    } catch (e) { /* sem armazenamento */ }
  }

  function salvarRascunho() { salvarRascunhoLocal(); }

  function aplicarDados(d) {
    if (!d || typeof d !== 'object') return;
    if (['contrato', 'aditivo', 'apostilamento'].includes(d.tipo)) estado.tipo = d.tipo;
    if (['bens', 'servicos'].includes(d.objeto)) estado.objeto = d.objeto;
    if (['pj', 'pf'].includes(d.pessoa)) estado.pessoa = d.pessoa;
    estado.valores = d.valores && typeof d.valores === 'object' ? d.valores : {};
    estado.si = new Set(Array.isArray(d.si) ? d.si : []);
    $$('.segmentado').forEach(g => $$('button', g).forEach(b => b.classList.toggle('ativo', b.dataset.valor === estado[g.dataset.grupo])));
  }

  function carregarRascunho() {
    try {
      const s = localStorage.getItem(CHAVE_RASCUNHO);
      if (s) {
        const d = JSON.parse(s);
        aplicarDados(d);
        estado.docId = d.docId || null;
        estado.docInfo = d.docInfo || null;
        estado.sujo = !!d.sujo;
      }
    } catch (e) { /* ignora rascunho corrompido */ }
  }

  function exportar() {
    const d = dadosParaSalvar();
    const nome = 'dados_' + (estado.valores.CONTRATO_NUMERO || 'minuta').replace(/[^\w-]+/g, '-') + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Dados exportados para ' + nome);
  }

  function importar(arquivo) {
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        aplicarDados(JSON.parse(leitor.result));
        estado.docId = null; estado.docInfo = null; estado.sujo = true;
        atualizarDocAtual();
        carregarModelo();
        toast('Dados importados com sucesso.');
      } catch (e) { toast('Arquivo inválido.', true); }
    };
    leitor.readAsText(arquivo);
  }

  // ------------------------------------------------------------------ geração
  function camposFaltando(ctx) {
    const faltam = new Map();
    estado.vars.forEach(v => {
      const d = DERIVADAS[v];
      if (d && d.opcional) return;
      const c = CAMPO[v];
      if (c && c.opcional) return;
      const val = ctx[v];
      if (Array.isArray(val) || typeof val === 'boolean') return;
      if (val === '' || val === undefined || val === null) {
        const origem = c ? v : (d ? d.deps.find(k => CAMPO[k] && !preenchido(CAMPO[k])) || d.deps[0] : v);
        faltam.set(origem, CAMPO[origem] ? rotulo(CAMPO[origem]) : rotuloPlaceholder(v));
      }
    });
    // considera apenas campos que estão em trechos que de fato entram no documento
    const ativos = new Set($$('#previa-doc .ph.vazio').map(p => p.dataset.ph));
    return [...faltam.entries()].filter(([k]) => {
      const nomes = [k, ...Object.entries(DERIVADAS).filter(([, d]) => d.deps.includes(k)).map(([n]) => n)];
      if (CAMPO[k] && CAMPO[k].par) nomes.push(CAMPO[k].par);
      return nomes.some(n => ativos.has(n));
    });
  }

  /** Contexto final do documento: campos vazios viram XXXXXXXX (exceto os opcionais). */
  function contextoFinal() {
    const ctx = contexto();
    estado.vars.forEach(v => {
      const d = DERIVADAS[v], c = CAMPO[v];
      if ((d && d.opcional) || (c && c.opcional)) return;
      if (ctx[v] === '' || ctx[v] === undefined) ctx[v] = U.SI;
    });
    return ctx;
  }

  function tituloDocumento(info) {
    const nomes = { contrato: 'Contrato', aditivo: 'Termo Aditivo', apostilamento: 'Termo de Apostilamento' };
    const n = info.numero || 's/ nº';
    if (info.tipo === 'contrato') return 'Contrato nº ' + n;
    return (info.num_termo ? info.num_termo + 'º ' : '') + nomes[info.tipo] + ' ao Contrato nº ' + n;
  }

  function dataHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function atualizarDocAtual() {
    const box = $('#doc-atual');
    if (!box) return;
    const desc = $('#doc-atual-desc');
    box.classList.toggle('salvo', !!estado.docId && !estado.sujo);
    box.classList.toggle('alterado', !!estado.docId && estado.sujo);
    if (!estado.docId) desc.textContent = 'Novo documento — ainda não salvo';
    else if (estado.sujo) desc.innerHTML = '<b>' + esc(tituloDocumento(estado.docInfo)) + '</b> — alterações não salvas';
    else desc.innerHTML = '<b>' + esc(tituloDocumento(estado.docInfo)) + '</b> — salvo em ' + esc(dataHora(estado.docInfo.atualizado_em));
  }

  function exigirNumero() {
    if (String(valorBruto('CONTRATO_NUMERO') || '').trim()) return true;
    toast('Informe o nº do contrato para salvar.', true);
    irParaCampo('CONTRATO_NUMERO');
    const el = $('#f_CONTRATO_NUMERO');
    if (el) el.closest('.campo').classList.add('erro');
    return false;
  }

  async function salvar({ silencioso = false } = {}) {
    if (!exigirNumero()) return false;
    const ctx = contextoFinal();
    const corpo = { tipo: estado.tipo, objeto: estado.objeto, pessoa: estado.pessoa, dados: dadosParaSalvar(),
      contexto: ctx, pendentes: camposFaltando(contexto()).length };
    const btn = $('#btn-salvar');
    btn.disabled = true;
    try {
      let url = estado.docId ? '/api/documentos/' + estado.docId : '/api/documentos';
      let r = await fetch(url, { method: estado.docId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      if (r.status === 404 && estado.docId) { // foi excluído em outra aba: salva como novo
        r = await fetch('/api/documentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      }
      const res = await r.json().catch(() => ({ ok: false, erro: 'Resposta inválida do servidor.' }));
      if (!res.ok) throw new Error(res.erro || 'Não foi possível salvar.');
      estado.docId = res.documento.id;
      estado.docInfo = res.documento;
      estado.sujo = false;
      atualizarDocAtual();
      salvarRascunhoLocal();
      if (!silencioso) toast('Salvo: ' + tituloDocumento(res.documento));
      return true;
    } catch (err) {
      toast(err.message || String(err), true);
      return false;
    } finally {
      btn.disabled = false;
    }
  }

  /** Salva e baixa o documento atual (docx ou pdf). */
  async function baixarAtual(formato, confirmado = false) {
    if (!exigirNumero()) return;
    const faltam = camposFaltando(contexto());
    if (faltam.length && !confirmado) {
      modal({
        tipo: 'aviso', titulo: 'Há campos sem preenchimento',
        corpo: `<p>${faltam.length} campo(s) estão vazios. Eles sairão como <b>XXXXXXXX</b> no documento:</p>
          <ul class="lista-faltam">${faltam.slice(0, 14).map(([k, l]) => `<li><a href="#" data-ir="${k}">${esc(l)}</a></li>`).join('')}
          ${faltam.length > 14 ? `<li>… e mais ${faltam.length - 14}</li>` : ''}</ul>`,
        acoes: [['Voltar e preencher', 'btn-fantasma', fecharModal],
          ['Baixar mesmo assim', 'btn-primario', () => { fecharModal(); baixarAtual(formato, true); }]],
      });
      return;
    }
    if (!(await salvar({ silencioso: true }))) return;
    await baixar(estado.docId, formato, $('#btn-' + formato));
  }

  async function baixar(id, formato, botao) {
    if (botao) { botao.disabled = true; botao.classList.add('girando'); }
    try {
      const r = await fetch(`/api/documentos/${id}/baixar/${formato}`);
      if (!r.ok) {
        const res = await r.json().catch(() => ({}));
        throw new Error(res.erro || 'Não foi possível gerar o arquivo.');
      }
      const disp = r.headers.get('Content-Disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/i.exec(disp) || /filename="?([^";]+)"?/i.exec(disp);
      const nome = m ? decodeURIComponent(m[1]) : 'documento.' + formato;
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: nome });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Download iniciado: ' + nome);
    } catch (err) {
      modal({ tipo: 'erro', titulo: 'Não foi possível baixar', corpo: `<p>${esc(err.message || String(err))}</p>`, acoes: [['Fechar', 'btn-primario', fecharModal]] });
    } finally {
      if (botao) { botao.disabled = false; botao.classList.remove('girando'); }
    }
  }

  // ------------------------------------------------------------------ documentos salvos
  function confirmarDescarte(acao) {
    if (!estado.sujo || !Object.keys(estado.valores).length) { acao(); return; }
    modal({
      tipo: 'aviso', titulo: 'Há alterações não salvas',
      corpo: '<p>As alterações do documento atual ainda não foram salvas. Deseja continuar mesmo assim?</p>',
      acoes: [['Cancelar', 'btn-fantasma', fecharModal],
        ['Salvar antes', 'btn-fantasma', async () => { fecharModal(); if (await salvar()) acao(); }],
        ['Descartar', 'btn-primario', () => { fecharModal(); acao(); }]],
    });
  }

  function novoDocumento() {
    confirmarDescarte(() => {
      estado.valores = {}; estado.si = new Set();
      estado.docId = null; estado.docInfo = null; estado.sujo = false;
      fecharGaveta();
      carregarModelo().then(() => { atualizarDocAtual(); salvarRascunhoLocal(); toast('Novo documento.'); });
    });
  }

  async function abrirDocumento(id) {
    confirmarDescarte(async () => {
      try {
        const r = await fetch('/api/documentos/' + id);
        const doc = await r.json();
        if (!r.ok) throw new Error(doc.erro || 'Documento não encontrado.');
        aplicarDados(Object.assign({ tipo: doc.tipo, objeto: doc.objeto, pessoa: doc.pessoa }, doc.dados));
        estado.docId = doc.id;
        estado.docInfo = doc;
        delete estado.docInfo.dados; delete estado.docInfo.contexto;
        estado.sujo = false;
        fecharGaveta();
        await carregarModelo();
        atualizarDocAtual();
        salvarRascunhoLocal();
        toast('Continuando: ' + tituloDocumento(doc));
      } catch (err) { toast(err.message || String(err), true); }
    });
  }

  function excluirDocumento(id, titulo) {
    modal({
      tipo: 'erro', titulo: 'Excluir documento?',
      corpo: `<p><b>${esc(titulo)}</b> será removido do banco de dados. Esta ação não pode ser desfeita.</p>`,
      acoes: [['Cancelar', 'btn-fantasma', fecharModal], ['Excluir', 'btn-primario', async () => {
        fecharModal();
        await fetch('/api/documentos/' + id, { method: 'DELETE' });
        if (estado.docId === id) { estado.docId = null; estado.docInfo = null; estado.sujo = true; atualizarDocAtual(); salvarRascunhoLocal(); }
        carregarLista();
        toast('Documento excluído.');
      }]],
    });
  }

  const ROTULOS = { bens: 'Bens', servicos: 'Serviços', pj: 'PJ', pf: 'PF' };
  let buscaTimer;
  async function carregarLista() {
    const q = $('#busca-docs').value.trim();
    const lista = $('#lista-docs');
    try {
      const docs = await (await fetch('/api/documentos?q=' + encodeURIComponent(q))).json();
      $('#gaveta-total').textContent = docs.length
        ? docs.length + (docs.length === 1 ? ' documento' : ' documentos') + (q ? ' encontrados' : '')
        : (q ? 'Nada encontrado' : 'Nenhum documento salvo');
      if (!docs.length) {
        lista.innerHTML = `<div class="gaveta-vazia">${svg('doc')}<p>${q ? 'Nenhum documento corresponde à busca.'
          : 'Os documentos aparecem aqui quando você clica em <b>Salvar</b> ou baixa um arquivo. Para salvar, basta informar o nº do contrato.'}</p></div>`;
        return;
      }
      lista.innerHTML = docs.map(d => {
        const titulo = tituloDocumento(d);
        const status = d.pendentes ? `<span class="chip chip-pendente">${d.pendentes} pendente${d.pendentes > 1 ? 's' : ''}</span>`
          : '<span class="chip chip-ok">Completo</span>';
        return `<article class="doc-card${d.id === estado.docId ? ' atual' : ''}" data-id="${d.id}">
          <div class="doc-card-topo">
            <h3>${esc(titulo)}</h3>${status}
          </div>
          <p class="doc-card-sub">${esc(d.contratado || 'Contratado não informado')}</p>
          ${d.objeto_desc ? `<p class="doc-card-obj">${esc(d.objeto_desc)}</p>` : ''}
          <div class="doc-card-meta">
            <span class="chip">${esc(d.orgao || 'CBMPA')}</span><span class="chip">${ROTULOS[d.objeto] || ''}</span><span class="chip">${ROTULOS[d.pessoa] || ''}</span>
            <span class="doc-card-data">Atualizado em ${esc(dataHora(d.atualizado_em))}</span>
          </div>
          <div class="doc-card-acoes">
            <button class="btn btn-fantasma btn-p" data-acao="abrir">${d.id === estado.docId ? 'Em edição' : 'Continuar / editar'}</button>
            <button class="btn btn-fantasma btn-p" data-acao="docx">DOCX</button>
            <button class="btn btn-fantasma btn-p" data-acao="pdf">PDF</button>
            <button class="btn btn-fantasma btn-p btn-perigo" data-acao="excluir" title="Excluir">${svg('lixo')}</button>
          </div>
        </article>`;
      }).join('');
    } catch (e) {
      lista.innerHTML = '<div class="gaveta-vazia"><p>Não foi possível carregar os documentos.</p></div>';
    }
  }

  function abrirGaveta() { $('#gaveta').hidden = false; carregarLista(); setTimeout(() => $('#busca-docs').focus(), 50); }
  function fecharGaveta() { $('#gaveta').hidden = true; }

  // ------------------------------------------------------------------ modal / toast
  function modal({ tipo, titulo, corpo, acoes }) {
    const icones = {
      ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',
      aviso: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20z"/><path d="M12 10v4m0 3v.01"/></svg>',
      erro: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
    };
    const m = $('#modal');
    $('#modal-icone').className = 'modal-icone ' + tipo;
    $('#modal-icone').innerHTML = icones[tipo] || '';
    $('#modal-titulo').textContent = titulo;
    $('#modal-corpo').innerHTML = corpo;
    const box = $('#modal-acoes');
    box.innerHTML = '';
    acoes.forEach(([txt, cls, fn]) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls; b.textContent = txt; b.onclick = fn;
      box.appendChild(b);
    });
    m.hidden = false;
    const ultimo = box.lastElementChild; if (ultimo) ultimo.focus();
  }
  function fecharModal() { $('#modal').hidden = true; }

  let toastTimer;
  function toast(msg, erro = false) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('erro', erro); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function trocarAba(aba) {
    $('#layout').classList.toggle('mostrar-previa', aba === 'previa');
    $$('#abas-mobile button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
    if (aba === 'previa') ajustarZoom(true);
  }

  // ------------------------------------------------------------------ inicialização
  function iniciar() {
    carregarRascunho();
    $$('.segmentado').forEach(g => g.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.classList.contains('ativo')) return;
      $$('button', g).forEach(x => x.classList.toggle('ativo', x === b));
      estado[g.dataset.grupo] = b.dataset.valor;
      estado.sujo = true;
      atualizarDocAtual();
      salvarRascunho();
      carregarModelo();
    }));
    const secoes = $('#secoes');
    secoes.addEventListener('input', aoDigitar);
    secoes.addEventListener('change', e => { if (e.target.dataset.si) aoMarcarSI(e); else aoDigitar(e); });
    secoes.addEventListener('click', aoClicar);
    secoes.addEventListener('focusin', e => {
      const campo = e.target.closest('.campo');
      if (!campo) return;
      const key = e.target.closest('.dot-linha') && e.target.id ? e.target.id.slice(2) : campo.dataset.key;
      estado.focado = key;
      destacarCampo(key);
    });
    secoes.addEventListener('focusout', () => { estado.focado = null; setTimeout(() => { if (!estado.focado) destacarCampo(null); }, 50); });

    $('#previa-doc').addEventListener('click', e => {
      const ph = e.target.closest('.ph');
      if (!ph) return;
      const key = campoDoPh(ph.dataset.ph, ph.dataset.loop);
      if (key) irParaCampo(key);
    });

    $('#btn-salvar').addEventListener('click', () => salvar());
    $('#btn-docx').addEventListener('click', () => baixarAtual('docx'));
    $('#btn-pdf').addEventListener('click', () => baixarAtual('pdf'));
    $('#btn-novo').addEventListener('click', novoDocumento);
    $('#btn-documentos').addEventListener('click', abrirGaveta);
    $('#gaveta-fechar').addEventListener('click', fecharGaveta);
    $('#gaveta').addEventListener('click', e => {
      if (e.target.id === 'gaveta') { fecharGaveta(); return; }
      const b = e.target.closest('[data-acao]');
      if (!b) return;
      const card = b.closest('.doc-card');
      const id = Number(card.dataset.id);
      const acao = b.dataset.acao;
      if (acao === 'abrir') { if (id === estado.docId) fecharGaveta(); else abrirDocumento(id); }
      else if (acao === 'excluir') excluirDocumento(id, card.querySelector('h3').textContent);
      else baixar(id, acao, b);
    });
    $('#busca-docs').addEventListener('input', () => { clearTimeout(buscaTimer); buscaTimer = setTimeout(carregarLista, 200); });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvar(); }
    });
    window.addEventListener('beforeunload', e => {
      if (estado.sujo && estado.docId) { e.preventDefault(); e.returnValue = ''; }
    });
    $('#btn-exportar').addEventListener('click', exportar);
    $('#btn-importar').addEventListener('click', () => $('#arquivo-importar').click());
    $('#arquivo-importar').addEventListener('change', e => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; });
    $('#btn-limpar').addEventListener('click', () => modal({
      tipo: 'aviso', titulo: 'Limpar todos os campos?', corpo: '<p>Os dados preenchidos serão apagados. Se quiser guardá-los, use <b>Exportar</b> antes.</p>',
      acoes: [['Cancelar', 'btn-fantasma', fecharModal], ['Limpar', 'btn-primario', () => {
        estado.valores = {}; estado.si = new Set(); estado.sujo = true; atualizarDocAtual(); fecharModal(); montarFormulario(); renderPrevia(); salvarRascunho(); toast('Campos limpos.');
      }]],
    }));
    $('#modal').addEventListener('click', e => {
      if (e.target.id === 'modal') fecharModal();
      const ir = e.target.closest('[data-ir]');
      if (ir) { e.preventDefault(); fecharModal(); irParaCampo(ir.dataset.ir); }
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('#modal').hidden) fecharModal(); else if (!$('#gaveta').hidden) fecharGaveta();
    });

    $('#chk-destacar').addEventListener('change', e => $('#previa-doc').classList.toggle('destacar', e.target.checked));
    $('#zoom-menos').addEventListener('click', () => { estado.zoom = Math.max(0.3, (estado.zoom || 1) - 0.1); ajustarZoom(false); });
    $('#zoom-mais').addEventListener('click', () => { estado.zoom = Math.min(2, (estado.zoom || 1) + 0.1); ajustarZoom(false); });
    $('#zoom-valor').addEventListener('click', () => ajustarZoom(true));
    $$('#abas-mobile button').forEach(b => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
    let rz;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => ajustarZoom(true), 150); });

    atualizarDocAtual();
    carregarModelo();
  }

  iniciar();
})();
