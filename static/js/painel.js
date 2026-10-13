/* Painel de contratos: números e gráficos dos documentos salvos. */
(function () {
  'use strict';
  const CFG = window.CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const ORGAOS = Object.keys(CFG.orgaos);                       // ordem fixa: CBMPA, CEDEC, FEBOM
  const COR_ORGAO = Object.fromEntries(ORGAOS.map((k, i) => [k, `var(--org-${i + 1})`]));
  const TIPOS = { contrato: 'Contratos', aditivo: 'Termos aditivos', apostilamento: 'Apostilamentos' };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const filtros = { periodo: '12m', tipo: 'todos' };
  let todos = [];

  const esc = s => String(s === undefined || s === null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const int = n => n.toLocaleString('pt-BR');
  const moeda = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function moedaCurta(v) {
    if (v >= 1e9) return 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi';
    if (v >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (v >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return moeda(v);
  }
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0) + '%';
  const nomeOrgao = k => k;
  const subOrgao = k => 'CNPJ ' + ((CFG.orgaos[k] || {}).cnpj || '—');

  // ------------------------------------------------------------ filtro de período
  function intervaloMeses() {
    const hoje = new Date();
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    let ini;
    if (filtros.periodo === 'ano') ini = new Date(hoje.getFullYear(), 0, 1);
    else if (filtros.periodo === '12m') ini = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
    else {
      const datas = todos.map(d => new Date(d.criado_em)).filter(d => !isNaN(d));
      const menor = datas.length ? new Date(Math.min(...datas)) : fim;
      ini = new Date(menor.getFullYear(), menor.getMonth(), 1);
      // no máximo 24 colunas; períodos maiores começam 23 meses antes do atual
      const limite = new Date(fim.getFullYear(), fim.getMonth() - 23, 1);
      if (ini < limite) ini = limite;
    }
    const meses = [];
    for (let d = new Date(ini); d <= fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) meses.push(d);
    return meses;
  }

  function filtrados() {
    const hoje = new Date();
    return todos.filter(d => {
      if (filtros.tipo !== 'todos' && d.tipo !== filtros.tipo) return false;
      const dt = new Date(d.criado_em);
      if (filtros.periodo === 'ano') return dt.getFullYear() === hoje.getFullYear();
      if (filtros.periodo === '12m') return dt >= new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
      return true;
    });
  }

  // ------------------------------------------------------------ tooltip
  const tip = $('#tooltip');
  function mostrarTip(html, e) {
    tip.innerHTML = html;
    tip.hidden = false;
    moverTip(e);
  }
  function moverTip(e) {
    const m = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + m, y = e.clientY + m;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - m;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - m;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  document.addEventListener('mouseover', e => {
    const alvo = e.target.closest('[data-tip]');
    if (alvo) mostrarTip(alvo.dataset.tip, e);
  });
  document.addEventListener('mousemove', e => { if (!tip.hidden) moverTip(e); });
  document.addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) tip.hidden = true; });

  // ------------------------------------------------------------ componentes
  function kpis(docs) {
    const contratos = docs.filter(d => d.tipo === 'contrato');
    const termos = docs.filter(d => d.tipo !== 'contrato');
    const valor = contratos.reduce((s, d) => s + (d.valor || 0), 0);
    const comValor = contratos.filter(d => d.valor).length;
    const pend = docs.filter(d => d.pendentes > 0).length;
    const tiles = [
      ['Documentos', int(docs.length), `${int(new Set(docs.map(d => d.contratado).filter(Boolean)).size)} contratados diferentes`, true],
      ['Contratos', int(contratos.length), ORGAOS.map(o => `${o} ${contratos.filter(d => (d.orgao || 'CBMPA') === o).length}`).join(' · ')],
      ['Termos', int(termos.length), `${docs.filter(d => d.tipo === 'aditivo').length} aditivos · ${docs.filter(d => d.tipo === 'apostilamento').length} apostilamentos`],
      ['Valor contratado', moedaCurta(valor), comValor ? `soma de ${comValor} contrato(s) com valor` : 'nenhum contrato com valor'],
      ['Com pendências', int(pend), docs.length ? `${pct(pend, docs.length)} dos documentos` : '—'],
    ];
    $('#kpis').innerHTML = tiles.map(([r, v, d, dest]) => `<div class="kpi${dest ? ' destaque' : ''}">
      <span class="kpi-rotulo">${r}</span><span class="kpi-valor" title="${r === 'Valor contratado' ? esc(moeda(valor)) : ''}">${v}</span>
      <span class="kpi-det">${esc(d)}</span></div>`).join('');
  }

  function barrasHorizontais(el, linhas, formatar) {
    const max = Math.max(...linhas.map(l => l.valor), 0);
    if (!max) { el.innerHTML = '<p class="vazio-mini">Sem dados no período.</p>'; return; }
    el.innerHTML = '<div class="hbarras">' + linhas.map(l => `
      <div class="hbarra">
        <div class="hbarra-rotulo"><b>${esc(l.rotulo)}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</div>
        <div class="hbarra-trilho"><span class="hbarra-preench" style="width:${l.valor / max * 100}%;background:${l.cor}"
          data-tip="${esc(l.tip)}"></span></div>
        <span class="hbarra-valor">${formatar(l.valor)}</span>
      </div>`).join('') + '</div>';
  }

  function porOrgao(docs) {
    const qtd = ORGAOS.map(o => {
      const lista = docs.filter(d => (d.orgao || 'CBMPA') === o);
      const porTipo = Object.keys(TIPOS).map(t => `${TIPOS[t]}: ${lista.filter(d => d.tipo === t).length}`).join('<br>');
      return { rotulo: nomeOrgao(o), sub: subOrgao(o), valor: lista.length, cor: COR_ORGAO[o],
        tip: `<b>${esc(o)} · ${lista.length} documento(s)</b>${porTipo}` };
    });
    barrasHorizontais($('#g-orgao-qtd'), qtd, int);

    const val = ORGAOS.map(o => {
      const lista = docs.filter(d => (d.orgao || 'CBMPA') === o && d.valor);
      const soma = lista.reduce((s, d) => s + d.valor, 0);
      return { rotulo: nomeOrgao(o), sub: `${lista.length} com valor informado`, valor: soma, cor: COR_ORGAO[o],
        tip: `<b>${esc(o)}</b>${esc(moeda(soma))}<br>${lista.length} documento(s) com valor` };
    });
    barrasHorizontais($('#g-orgao-valor'), val, moedaCurta);
  }

  function porMes(docs) {
    const el = $('#g-mes');
    const meses = intervaloMeses();
    $('#legenda-mes').innerHTML = ORGAOS.map(o => `<span><i style="background:${COR_ORGAO[o]}"></i>${o}</span>`).join('');
    const chave = d => d.getFullYear() + '-' + d.getMonth();
    const dados = meses.map(m => {
      const k = chave(m);
      const doMes = docs.filter(d => { const dt = new Date(d.criado_em); return chave(dt) === k; });
      return { mes: m, total: doMes.length, por: ORGAOS.map(o => doMes.filter(d => (d.orgao || 'CBMPA') === o).length) };
    });
    const max = Math.max(1, ...dados.map(d => d.total));
    const passo = max <= 5 ? 1 : Math.ceil(max / 4);
    const topo = Math.ceil(max / passo) * passo;

    const W = Math.max(280, Math.floor(el.getBoundingClientRect().width)), H = 240;
    const m = { e: 34, d: 8, t: 18, b: 28 };
    const lw = W - m.e - m.d, lh = H - m.t - m.b;
    const col = lw / dados.length;
    const larg = Math.min(34, col * 0.62);
    const y = v => m.t + lh - v / topo * lh;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Documentos criados por mês, por órgão">`;
    for (let v = 0; v <= topo; v += passo) {
      svg += `<line class="${v ? 'grade-linha' : 'eixo-linha'}" x1="${m.e}" x2="${W - m.d}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text x="${m.e - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    const pularRotulo = dados.length > 14 ? 2 : 1;
    dados.forEach((d, i) => {
      const cx = m.e + col * i + col / 2;
      let base = 0;
      const segs = [];
      d.por.forEach((n, oi) => { if (n) segs.push({ n, oi }); });
      segs.forEach((s, si) => {
        const y0 = y(base), y1 = y(base + s.n);
        const topoSeg = si === segs.length - 1;
        const h = Math.max(1, y0 - y1 - (topoSeg ? 0 : 2));     // 2px de respiro entre segmentos
        const r = topoSeg ? Math.min(4, h / 2, larg / 2) : 0;
        const x = cx - larg / 2, yy = y1 + (topoSeg ? 0 : 2);
        const caminho = r
          ? `M${x},${yy + h} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + larg - r} Q${x + larg},${yy} ${x + larg},${yy + r} V${yy + h} Z`
          : `M${x},${yy + h} V${yy} H${x + larg} V${yy + h} Z`;
        const o = ORGAOS[s.oi];
        const tipHtml = `<b>${MESES[d.mes.getMonth()]}/${d.mes.getFullYear()}</b><span class="tt-linha"><i style="background:${COR_ORGAO[o]}"></i>${o}: ${s.n}</span>Total no mês: ${d.total}`;
        svg += `<path class="seg" d="${caminho}" fill="${COR_ORGAO[o]}" data-tip="${esc(tipHtml)}"/>`;
        base += s.n;
      });
      if (d.total) svg += `<text class="total-col" x="${cx}" y="${y(d.total) - 6}" text-anchor="middle">${d.total}</text>`;
      if (i % pularRotulo === 0 || i === dados.length - 1) {
        const rot = MESES[d.mes.getMonth()] + (d.mes.getMonth() === 0 || i === 0 ? '/' + String(d.mes.getFullYear()).slice(2) : '');
        svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${rot}</text>`;
      }
    });
    svg += '</svg>';
    el.innerHTML = svg;
  }

  function porTipo(docs) {
    const linhas = Object.entries(TIPOS).map(([t, nome]) => {
      const n = docs.filter(d => d.tipo === t).length;
      return { rotulo: nome, valor: n, cor: 'var(--serie)', tip: `<b>${nome}</b>${n} documento(s) · ${pct(n, docs.length)}` };
    });
    barrasHorizontais($('#g-tipo'), linhas, int);
  }

  function divisao(titulo, partes) {
    const total = partes.reduce((s, p) => s + p.n, 0);
    if (!total) return '';
    return `<div><div class="divisao-tit">${titulo}</div>
      <div class="divisao-barra">${partes.filter(p => p.n).map(p => `<span style="width:${p.n / total * 100}%;background:${p.cor}"
        data-tip="${esc(`<b>${p.rotulo}</b>${p.n} documento(s) · ${pct(p.n, total)}`)}"></span>`).join('')}</div>
      <div class="divisao-leg">${partes.map(p => `<span>${p.icone || `<i style="background:${p.cor}"></i>`}${p.rotulo}: <b>${p.n}</b> (${pct(p.n, total)})</span>`).join('')}</div></div>`;
  }

  function perfil(docs) {
    const el = $('#g-perfil');
    if (!docs.length) { el.innerHTML = '<p class="vazio-mini">Sem dados no período.</p>'; return; }
    el.innerHTML = '<div class="divisoes">' +
      divisao('Objeto', [
        { rotulo: 'Aquisição de bens', n: docs.filter(d => d.objeto === 'bens').length, cor: 'var(--org-1)' },
        { rotulo: 'Serviços', n: docs.filter(d => d.objeto === 'servicos').length, cor: 'var(--org-2)' }]) +
      divisao('Contratado', [
        { rotulo: 'Pessoa jurídica', n: docs.filter(d => d.pessoa === 'pj').length, cor: 'var(--org-1)' },
        { rotulo: 'Pessoa física', n: docs.filter(d => d.pessoa === 'pf').length, cor: 'var(--org-2)' }]) +
      '</div>';
  }

  function situacao(docs) {
    const el = $('#g-situacao');
    if (!docs.length) { el.innerHTML = '<p class="vazio-mini">Sem dados no período.</p>'; return; }
    const ok = docs.filter(d => !d.pendentes).length;
    const pend = docs.length - ok;
    const lista = docs.filter(d => d.pendentes).sort((a, b) => b.pendentes - a.pendentes).slice(0, 5);
    el.innerHTML = '<div class="divisoes">' + divisao('Preenchimento', [
      { rotulo: 'Completos', n: ok, cor: 'var(--status-ok)', icone: '<span class="status-ic" style="background:var(--status-ok)">✓</span>' },
      { rotulo: 'Com pendências', n: pend, cor: 'var(--status-aviso)', icone: '<span class="status-ic" style="background:var(--status-aviso);color:#3d2a00">!</span>' },
    ]) + '</div>' + (lista.length ? `<ul class="lista-pend">${lista.map(d => `<li><a href="/?doc=${d.id}" title="Abrir no gerador">${esc(d.titulo)}</a>
      <span>${d.pendentes} pendente${d.pendentes > 1 ? 's' : ''}</span></li>`).join('')}</ul>` : '');
  }

  function contratados(docs) {
    const el = $('#t-contratados');
    const mapa = new Map();
    docs.forEach(d => {
      if (!d.contratado) return;
      const k = d.contratado.trim().toLocaleUpperCase('pt-BR');
      const e = mapa.get(k) || { nome: d.contratado.trim(), n: 0, valor: 0 };
      e.n++; e.valor += d.valor || 0; mapa.set(k, e);
    });
    const top = [...mapa.values()].sort((a, b) => b.n - a.n || b.valor - a.valor).slice(0, 6);
    el.innerHTML = top.length ? `<table class="tabela"><thead><tr><th>Contratado</th><th class="num">Docs</th><th class="num">Valor</th></tr></thead>
      <tbody>${top.map(c => `<tr><td>${esc(c.nome)}</td><td class="num">${c.n}</td><td class="num">${c.valor ? moedaCurta(c.valor) : '—'}</td></tr>`).join('')}</tbody></table>`
      : '<p class="vazio-mini">Nenhum contratado informado no período.</p>';
  }

  function maiores(docs) {
    const el = $('#t-maiores');
    const top = docs.filter(d => d.valor).sort((a, b) => b.valor - a.valor).slice(0, 8);
    el.innerHTML = top.length ? `<table class="tabela"><thead><tr><th>Documento</th><th>Órgão</th><th>Contratado</th><th class="num">Valor</th></tr></thead>
      <tbody>${top.map(d => `<tr><td><a href="/?doc=${d.id}" title="Abrir no gerador">${esc(d.titulo)}</a></td>
        <td><span class="org-chip"><i style="background:${COR_ORGAO[d.orgao || 'CBMPA']}"></i>${esc(d.orgao || 'CBMPA')}</span></td>
        <td>${esc(d.contratado || '—')}</td><td class="num">${moeda(d.valor)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="vazio-mini">Nenhum documento com valor informado no período.</p>';
  }

  // ------------------------------------------------------------ montagem
  function render() {
    const docs = filtrados();
    const periodo = { '12m': 'nos últimos 12 meses', ano: 'em ' + new Date().getFullYear(), todos: 'no total' }[filtros.periodo];
    $('#painel-sub').textContent = todos.length
      ? `${int(docs.length)} documento(s) ${periodo} · ${int(todos.length)} salvos no banco`
      : 'Nenhum documento salvo ainda';
    const vazio = !docs.length;
    $('#painel-vazio').hidden = !vazio;
    $('#painel-conteudo').hidden = vazio;
    if (vazio) return;
    kpis(docs); porOrgao(docs); requestAnimationFrame(() => porMes(docs)); porTipo(docs); perfil(docs); situacao(docs); contratados(docs); maiores(docs);
  }

  document.querySelectorAll('[data-filtro]').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    g.querySelectorAll('button').forEach(x => x.classList.toggle('ativo', x === b));
    filtros[g.dataset.filtro] = b.dataset.valor;
    render();
  }));
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (todos.length) porMes(filtrados()); }, 150); });

  fetch('/api/painel').then(r => r.json()).then(d => { todos = d; render(); })
    .catch(() => { $('#painel-sub').textContent = 'Não foi possível carregar os dados.'; });
})();
