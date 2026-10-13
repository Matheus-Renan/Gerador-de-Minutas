/* Utilitários: números por extenso, moeda, datas e máscaras de entrada. */
(function (global) {
  'use strict';

  const SI = 'XXXXXXXX'; // marcador de "sem informação"

  const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
    'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
    'setecentos', 'oitocentos', 'novecentos'];
  const ESCALAS = [
    ['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões'], ['trilhão', 'trilhões']];

  function ate999(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100;
    const partes = [];
    if (c) partes.push(CENTENAS[c]);
    if (r) {
      if (r < 20) partes.push(UNIDADES[r]);
      else {
        const d = Math.floor(r / 10), u = r % 10;
        partes.push(u ? DEZENAS[d] + ' e ' + UNIDADES[u] : DEZENAS[d]);
      }
    }
    return partes.join(' e ');
  }

  /** Inteiro por extenso: 1234 -> "mil duzentos e trinta e quatro". */
  function numeroExtenso(n) {
    n = Math.floor(Math.abs(Number(n)));
    if (!isFinite(n)) return '';
    if (n === 0) return 'zero';
    const grupos = [];
    let x = n;
    while (x > 0) { grupos.push(x % 1000); x = Math.floor(x / 1000); }
    const partes = [];
    for (let i = grupos.length - 1; i >= 0; i--) {
      const g = grupos[i];
      if (!g) continue;
      let txt;
      if (i === 0) txt = ate999(g);
      else if (i === 1) txt = g === 1 ? 'mil' : ate999(g) + ' mil';
      else txt = ate999(g) + ' ' + (g === 1 ? ESCALAS[i][0] : ESCALAS[i][1]);
      partes.push({ txt, g });
    }
    let out = '';
    partes.forEach((p, idx) => {
      if (idx === 0) { out = p.txt; return; }
      const ultimo = idx === partes.length - 1;
      // "mil e duzentos", "mil e trinta", mas "mil duzentos e trinta"
      out += (ultimo && (p.g < 100 || p.g % 100 === 0)) ? ' e ' + p.txt : ' ' + p.txt;
    });
    return out;
  }

  /** "1.234,56" -> 1234.56 */
  function parseMoeda(s) {
    if (s === null || s === undefined) return NaN;
    if (typeof s === 'number') return s;
    s = String(s).trim().replace(/[R$\s]/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return Number(s);
  }

  /** 1234.5 -> "1.234,50" */
  function formatMoeda(v) {
    if (!isFinite(v)) return '';
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Valor em reais por extenso: 1200.5 -> "mil e duzentos reais e cinquenta centavos". */
  function moedaExtenso(valor) {
    const v = parseMoeda(valor);
    if (!isFinite(v)) return '';
    const centavosTotal = Math.round(Math.abs(v) * 100);
    const reais = Math.floor(centavosTotal / 100);
    const cent = centavosTotal % 100;
    const partes = [];
    if (reais > 0) {
      let txt = numeroExtenso(reais);
      const deReais = reais >= 1e6 && reais % 1e6 === 0;
      txt += reais === 1 ? ' real' : (deReais ? ' de reais' : ' reais');
      partes.push(txt);
    }
    if (cent > 0) partes.push(numeroExtenso(cent) + (cent === 1 ? ' centavo' : ' centavos'));
    if (!partes.length) return 'zero real';
    return partes.join(' e ');
  }

  /** "2,5" -> "2,5% (dois vírgula cinco por cento)" */
  function percentualExtenso(p) {
    const s = String(p || '').trim().replace('%', '').replace('.', ',');
    if (!s) return '';
    const [int, dec] = s.split(',');
    if (!/^\d+$/.test(int) || (dec !== undefined && !/^\d+$/.test(dec))) return s + '%';
    let ext = numeroExtenso(Number(int));
    if (dec !== undefined && Number(dec) > 0) {
      const d = dec.replace(/0+$/, '');
      ext += ' vírgula ' + (d.startsWith('0') ? d.split('').map(c => UNIDADES[Number(c)]).join(' ') : numeroExtenso(Number(d)));
    }
    return s + '% (' + ext + ' por cento)';
  }

  /** 12 -> "12 (doze)" */
  function quantidadeExtenso(n) {
    const s = String(n || '').trim();
    if (!/^\d+$/.test(s)) return s;
    return Number(s) + ' (' + numeroExtenso(Number(s)) + ')';
  }

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
    'outubro', 'novembro', 'dezembro'];

  function isoParaData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  function dataParaIso(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /** "2026-10-13" -> "13/10/2026" */
  function formatData(iso) {
    const d = isoParaData(iso);
    if (!d) return iso || '';
    const p = n => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  /** "2026-10-01" -> "1º de outubro de 2026" */
  function dataExtenso(iso) {
    const d = isoParaData(iso);
    if (!d) return '';
    const dia = d.getDate() === 1 ? '1º' : String(d.getDate());
    return dia + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }

  /** Fim de vigência: início + N meses - 1 dia. */
  function fimVigencia(isoInicio, meses) {
    const d = isoParaData(isoInicio);
    const n = parseInt(meses, 10);
    if (!d || !n) return '';
    const alvo = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
    if (alvo.getDate() !== d.getDate()) alvo.setDate(0); // 31/01 + 1 mês -> fim de fevereiro
    alvo.setDate(alvo.getDate() - 1);
    return dataParaIso(alvo);
  }

  // ---------------- máscaras
  const so = s => String(s || '').replace(/\D/g, '');
  const MASCARAS = {
    cpf(v) {
      const d = so(v).slice(0, 11);
      return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    },
    cnpj(v) {
      const d = so(v).slice(0, 14);
      return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
    },
    telefone(v) {
      const d = so(v).slice(0, 11);
      if (d.length <= 2) return d.length ? '(' + d : '';
      if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
      if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    },
    moeda(v) {
      const d = so(v).replace(/^0+(?=\d)/, '');
      if (!d) return '';
      return formatMoeda(Number(d) / 100);
    },
    inteiro(v) { return so(v).slice(0, 6); },
    percentual(v) { return String(v || '').replace(/[^\d,]/g, '').replace(/,(?=.*,)/g, '').slice(0, 7); },
  };

  global.U = {
    SI, numeroExtenso, moedaExtenso, percentualExtenso, quantidadeExtenso, parseMoeda, formatMoeda,
    formatData, dataExtenso, fimVigencia, MASCARAS, isoParaData, dataParaIso,
  };
})(window);
