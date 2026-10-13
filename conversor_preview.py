"""Converte um modelo .docx (com marcações Jinja/docxtpl) em HTML para a prévia ao vivo.

O HTML gerado mantém a aparência do documento (fontes, cores, tabelas, imagens,
cabeçalho e rodapé) e marca os pontos dinâmicos para o JavaScript da página:

* ``{{ CAMPO }}``           -> <span class="ph" data-ph="CAMPO"></span>
* ``{%p if COND %}`` ...     -> <div class="cond-group"><div class="cond" data-cond="COND">...</div>...</div>
* ``{%tr for x in LISTA %}`` -> <tbody class="loop" data-loop="LISTA" data-item="x">...</tbody>
* parágrafos numerados       -> <p data-num="ID" data-lvl="N"><span class="num"></span>...</p>
  (a numeração é calculada no navegador, depois de aplicar as condições)
"""
import base64
import html
import io
import re

import docx
from docx.oxml.ns import qn

NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
NS_V = 'urn:schemas-microsoft-com:vml'
NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'

RE_PH = re.compile(r'\{\{\s*([A-Za-z_][\w.]*)\s*\}\}')
RE_P_TAG = re.compile(r'^\s*\{%p\s+(.*?)\s*%\}\s*$')
RE_TR_TAG = re.compile(r'\{%tr\s+(.*?)\s*%\}')
RE_IDENT = re.compile(r"'[^']*'|\"[^\"]*\"|\b[A-Za-z_]\w*\b")
JINJA_WORDS = {'if', 'elif', 'else', 'endif', 'for', 'in', 'endfor', 'not', 'and', 'or',
               'true', 'false', 'True', 'False', 'none', 'None', 'is'}

EMU_PER_PT = 12700
HIGHLIGHT = {
    'yellow': '#ffff00', 'green': '#00ff00', 'cyan': '#00ffff', 'magenta': '#ff00ff', 'blue': '#0000ff',
    'red': '#ff0000', 'darkBlue': '#000080', 'darkCyan': '#008080', 'darkGreen': '#008000',
    'darkMagenta': '#800080', 'darkRed': '#800000', 'darkYellow': '#808000', 'darkGray': '#808080',
    'lightGray': '#c0c0c0', 'black': '#000000', 'white': '#ffffff',
}
BORDER_STYLE = {'single': 'solid', 'thick': 'solid', 'double': 'double', 'dotted': 'dotted',
                'dashed': 'dashed', 'dashSmallGap': 'dashed', 'dotDash': 'dashed'}


def _w(el, name):
    return el.get(qn('w:' + name)) if el is not None else None


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _on(el):
    """Valor booleano de um elemento como <w:b/>, <w:b w:val="false"/>."""
    if el is None:
        return None
    return _w(el, 'val') not in ('0', 'false', 'off', 'none')


def _esc(t):
    return html.escape(t, quote=True)


# ---------------------------------------------------------------- propriedades

def parse_rpr(rpr, d):
    if rpr is None:
        return d
    for tag in ('b', 'i', 'strike', 'dstrike', 'caps', 'smallCaps', 'vanish'):
        v = _on(rpr.find(qn('w:' + tag)))
        if v is not None:
            d[tag] = v
    u = rpr.find(qn('w:u'))
    if u is not None:
        d['u'] = _w(u, 'val') not in (None, 'none', '0', 'false') if _w(u, 'val') else True
    c = rpr.find(qn('w:color'))
    if c is not None and _w(c, 'val'):
        d['color'] = None if _w(c, 'val').lower() == 'auto' else '#' + _w(c, 'val')
    sz = rpr.find(qn('w:sz'))
    if sz is not None and _w(sz, 'val'):
        d['sz'] = _num(_w(sz, 'val'), 22) / 2
    hl = rpr.find(qn('w:highlight'))
    if hl is not None:
        d['hl'] = HIGHLIGHT.get(_w(hl, 'val'))
    shd = rpr.find(qn('w:shd'))
    if shd is not None:
        fill = _w(shd, 'fill')
        d['bg'] = None if not fill or fill.lower() == 'auto' else '#' + fill
    va = rpr.find(qn('w:vertAlign'))
    if va is not None:
        d['va'] = _w(va, 'val')
    f = rpr.find(qn('w:rFonts'))
    if f is not None and _w(f, 'ascii'):
        d['font'] = _w(f, 'ascii')
    return d


def parse_ppr(ppr, d):
    if ppr is None:
        return d
    jc = ppr.find(qn('w:jc'))
    if jc is not None:
        d['jc'] = _w(jc, 'val')
    ind = ppr.find(qn('w:ind'))
    if ind is not None:
        for src, dst in (('left', 'left'), ('start', 'left'), ('right', 'right'), ('end', 'right'),
                         ('firstLine', 'first'), ('hanging', 'hanging')):
            v = _w(ind, src)
            if v is not None:
                d[dst] = _num(v) / 20
        if _w(ind, 'firstLine') is not None:
            d['hanging'] = 0
        if _w(ind, 'hanging') is not None:
            d['first'] = 0
    sp = ppr.find(qn('w:spacing'))
    if sp is not None:
        for src in ('before', 'after', 'line'):
            v = _w(sp, src)
            if v is not None:
                d[src] = _num(v)
        if _w(sp, 'lineRule'):
            d['lineRule'] = _w(sp, 'lineRule')
    shd = ppr.find(qn('w:shd'))
    if shd is not None:
        fill = _w(shd, 'fill')
        d['pbg'] = None if not fill or fill.lower() == 'auto' else '#' + fill
    np_ = ppr.find(qn('w:numPr'))
    if np_ is not None:
        nid = np_.find(qn('w:numId'))
        ilvl = np_.find(qn('w:ilvl'))
        if nid is not None:
            d['numId'] = _w(nid, 'val')
        if ilvl is not None:
            d['ilvl'] = _w(ilvl, 'val')
    return d


class Estilos:
    def __init__(self, document):
        self.root = document.styles.element
        self.by_id = {s.get(qn('w:styleId')): s for s in self.root.findall(qn('w:style'))}
        dd = self.root.find(qn('w:docDefaults'))
        self.r_default = parse_rpr(dd.find(qn('w:rPrDefault') + '/' + qn('w:rPr')) if dd is not None else None,
                                   {'sz': 10, 'font': 'Calibri'})
        self.p_default = parse_ppr(dd.find(qn('w:pPrDefault') + '/' + qn('w:pPr')) if dd is not None else None, {})
        self.default_para = None
        self.default_table = None
        for s in self.root.findall(qn('w:style')):
            if s.get(qn('w:default')) in ('1', 'true'):
                if s.get(qn('w:type')) == 'paragraph':
                    self.default_para = s.get(qn('w:styleId'))
                elif s.get(qn('w:type')) == 'table':
                    self.default_table = s.get(qn('w:styleId'))
        self._cache = {}

    def chain(self, sid):
        out = []
        seen = set()
        while sid and sid in self.by_id and sid not in seen:
            seen.add(sid)
            st = self.by_id[sid]
            out.insert(0, st)
            b = st.find(qn('w:basedOn'))
            sid = _w(b, 'val')
        return out

    def para(self, sid):
        """(pPr dict, rPr dict) de um estilo de parágrafo, já com herança."""
        sid = sid or self.default_para
        key = ('p', sid)
        if key not in self._cache:
            p, r = dict(self.p_default), dict(self.r_default)
            for st in self.chain(sid):
                parse_ppr(st.find(qn('w:pPr')), p)
                parse_rpr(st.find(qn('w:rPr')), r)
            self._cache[key] = (p, r)
        return self._cache[key]

    def run(self, sid):
        key = ('r', sid)
        if key not in self._cache:
            r = {}
            for st in self.chain(sid):
                parse_rpr(st.find(qn('w:rPr')), r)
            self._cache[key] = r
        return self._cache[key]

    def table(self, sid):
        """(tblPr element list) do estilo de tabela, do mais genérico ao mais específico."""
        sid = sid or self.default_table
        return [st.find(qn('w:tblPr')) for st in self.chain(sid)]


# ---------------------------------------------------------------- numeração

def ler_numeracao(document):
    try:
        root = document.part.numbering_part.element
    except (NotImplementedError, AttributeError, KeyError):
        return {}
    abstracts = {}
    for a in root.findall(qn('w:abstractNum')):
        lvls = {}
        for lvl in a.findall(qn('w:lvl')):
            il = lvl.get(qn('w:ilvl'))
            start = lvl.find(qn('w:start'))
            fmt = lvl.find(qn('w:numFmt'))
            txt = lvl.find(qn('w:lvlText'))
            ppr = parse_ppr(lvl.find(qn('w:pPr')), {})
            rpr = parse_rpr(lvl.find(qn('w:rPr')), {})
            lvls[il] = {
                'start': int(_num(_w(start, 'val'), 1)) if start is not None else 1,
                'fmt': _w(fmt, 'val') or 'decimal',
                'text': _w(txt, 'val') if txt is not None else '',
                'left': ppr.get('left'), 'hanging': ppr.get('hanging'), 'first': ppr.get('first'),
                'bold': rpr.get('b'),
            }
        abstracts[a.get(qn('w:abstractNumId'))] = lvls
    nums = {}
    for n in root.findall(qn('w:num')):
        aid = _w(n.find(qn('w:abstractNumId')), 'val')
        lvls = {k: dict(v) for k, v in abstracts.get(aid, {}).items()}
        proprio = False
        for ov in n.findall(qn('w:lvlOverride')):
            proprio = True
            il = ov.get(qn('w:ilvl'))
            so = ov.find(qn('w:startOverride'))
            if so is not None and il in lvls:
                lvls[il]['start'] = int(_num(_w(so, 'val'), 1))
        # listas que apontam para o mesmo abstractNum continuam a contagem (como no Word),
        # a menos que redefinam o início
        chave = 'n' + n.get(qn('w:numId')) if proprio else 'a' + str(aid)
        nums[n.get(qn('w:numId'))] = {'abstract': aid, 'levels': lvls, 'chave': chave}
    return nums


# ---------------------------------------------------------------- conversor

class Conversor:
    def __init__(self, caminho):
        self.doc = docx.Document(caminho)
        self.estilos = Estilos(self.doc)
        self.numeracao = ler_numeracao(self.doc)
        self.vars = set()
        self.itens_loop = set()
        self.img_cache = {}
        sect = self.doc.sections[-1]
        self.pagina = {
            'largura': (sect.page_width.pt if sect.page_width else 595),
            'm_esq': sect.left_margin.pt if sect.left_margin is not None else 72,
            'm_dir': sect.right_margin.pt if sect.right_margin is not None else 72,
            'm_sup': sect.top_margin.pt if sect.top_margin is not None else 72,
            'm_inf': sect.bottom_margin.pt if sect.bottom_margin is not None else 72,
        }
        self.part = self.doc.part

    # ------------ util
    def _registrar_expr(self, expr):
        for tok in RE_IDENT.findall(expr):
            if tok[0] in '\'"' or tok in JINJA_WORDS:
                continue
            self.vars.add(tok)

    def _imagem(self, rid, largura_pt):
        part = self.part
        key = (id(part), rid)
        if key in self.img_cache:
            return self.img_cache[key]
        try:
            img_part = part.related_parts[rid]
        except KeyError:
            return None
        blob = img_part.blob
        ctype = img_part.content_type or 'image/png'
        if len(blob) > 60_000:
            try:
                from PIL import Image
                im = Image.open(io.BytesIO(blob))
                alvo = max(64, int(largura_pt * 3))
                if im.width > alvo:
                    im = im.resize((alvo, max(1, int(im.height * alvo / im.width))), Image.LANCZOS)
                    buf = io.BytesIO()
                    if im.mode not in ('RGB', 'RGBA'):
                        im = im.convert('RGBA')
                    im.save(buf, format='PNG', optimize=True)
                    blob, ctype = buf.getvalue(), 'image/png'
            except Exception:
                pass
        uri = 'data:%s;base64,%s' % (ctype, base64.b64encode(blob).decode('ascii'))
        self.img_cache[key] = uri
        return uri

    # ------------ runs
    def _drawing(self, el):
        """HTML de um <w:drawing> (imagem inline ou ancorada)."""
        for container in el:
            tag = container.tag.split('}')[1]
            if tag not in ('inline', 'anchor'):
                continue
            ext = container.find('{%s}extent' % NS_WP)
            w = _num(ext.get('cx')) / EMU_PER_PT if ext is not None else 50
            h = _num(ext.get('cy')) / EMU_PER_PT if ext is not None else 50
            blip = container.find('.//{%s}blip' % NS_A)
            if blip is None:
                return ''
            uri = self._imagem(blip.get('{%s}embed' % NS_R), w)
            if not uri:
                return ''
            style = 'width:%.1fpt;height:%.1fpt;' % (w, h)
            if tag == 'anchor':
                ph = container.find('{%s}positionH' % NS_WP)
                pv = container.find('{%s}positionV' % NS_WP)
                x = y = 0.0
                if ph is not None and ph.find('{%s}posOffset' % NS_WP) is not None:
                    x = _num(ph.find('{%s}posOffset' % NS_WP).text) / EMU_PER_PT
                    if ph.get('relativeFrom') == 'page':
                        x -= self.pagina['m_esq']
                elif ph is not None and ph.find('{%s}align' % NS_WP) is not None:
                    al = ph.find('{%s}align' % NS_WP).text
                    largura = self.pagina['largura'] - self.pagina['m_esq'] - self.pagina['m_dir']
                    x = {'center': (largura - w) / 2, 'right': largura - w}.get(al, 0)
                if self.part is self.doc.part and pv is not None and \
                        pv.get('relativeFrom') not in ('paragraph', 'line'):
                    # imagem presa à página (ex.: selo no rodapé) - não tem posição útil no fluxo contínuo
                    return ''
                if pv is not None and pv.find('{%s}posOffset' % NS_WP) is not None \
                        and pv.get('relativeFrom') in ('paragraph', 'line'):
                    y = _num(pv.find('{%s}posOffset' % NS_WP).text) / EMU_PER_PT
                z = 0 if container.get('behindDoc') == '1' else 2
                style += 'position:absolute;left:%.1fpt;top:%.1fpt;z-index:%d;' % (x, y, z)
                return '<img class="anchor" src="%s" style="%s" alt="">' % (uri, style)
            return '<img src="%s" style="%s;vertical-align:bottom" alt="">' % (uri, style)
        return ''

    def _segmentos(self, p, r_base):
        """Lista de (tipo, conteúdo, props) do parágrafo, na ordem do texto."""
        segs = []

        def walk(el):
            for child in el:
                tag = child.tag
                if tag == qn('w:r'):
                    run(child)
                elif tag in (qn('w:hyperlink'), qn('w:smartTag'), qn('w:ins'), qn('w:fldSimple')):
                    walk(child)
                elif tag == qn('w:sdt'):
                    c = child.find(qn('w:sdtContent'))
                    if c is not None:
                        walk(c)
                elif tag == '{%s}AlternateContent' % NS_MC:
                    walk(child)

        def run(r):
            props = dict(r_base)
            rpr = r.find(qn('w:rPr'))
            if rpr is not None:
                rs = rpr.find(qn('w:rStyle'))
                if rs is not None:
                    props.update(self.estilos.run(_w(rs, 'val')))
                parse_rpr(rpr, props)
            if props.get('vanish'):
                return
            for c in r:
                tag = c.tag
                if tag == qn('w:t'):
                    segs.append(('t', c.text or '', props))
                elif tag == qn('w:tab'):
                    segs.append(('tab', '', props))
                elif tag in (qn('w:br'), qn('w:cr')):
                    segs.append(('br', '', props))
                elif tag == qn('w:noBreakHyphen'):
                    segs.append(('t', '-', props))
                elif tag == qn('w:sym'):
                    segs.append(('t', '•', props))
                elif tag == qn('w:drawing'):
                    segs.append(('raw', self._drawing(c), props))
                elif tag == '{%s}AlternateContent' % NS_MC:
                    choice = c.find('{%s}Choice' % NS_MC)
                    if choice is not None:
                        for d in choice.iter(qn('w:drawing')):
                            segs.append(('raw', self._drawing(d), props))
                            break

        walk(p)
        return segs

    @staticmethod
    def _css_run(pr):
        css = []
        if pr.get('b'):
            css.append('font-weight:700')
        if pr.get('i'):
            css.append('font-style:italic')
        deco = []
        if pr.get('u'):
            deco.append('underline')
        if pr.get('strike') or pr.get('dstrike'):
            deco.append('line-through')
        if deco:
            css.append('text-decoration:' + ' '.join(deco))
        if pr.get('color'):
            css.append('color:' + pr['color'])
        if pr.get('sz'):
            css.append('font-size:%.1fpt' % pr['sz'])
        if pr.get('caps'):
            css.append('text-transform:uppercase')
        elif pr.get('smallCaps'):
            css.append('font-variant:small-caps')
        bg = pr.get('hl') or pr.get('bg')
        if bg:
            css.append('background:' + bg)
        if pr.get('va') == 'superscript':
            css.append('vertical-align:super;font-size:smaller')
        elif pr.get('va') == 'subscript':
            css.append('vertical-align:sub;font-size:smaller')
        if pr.get('font'):
            css.append("font-family:'%s',Carlito,Calibri,Arial,sans-serif" % pr['font'])
        return ';'.join(css)

    def _html_segmentos(self, segs):
        """Converte os segmentos em HTML, detectando {{ }} mesmo que estejam quebrados entre runs."""
        texto = ''.join(s[1] for s in segs if s[0] == 't')
        phs = [(m.start(), m.end(), m.group(1)) for m in RE_PH.finditer(texto)]
        for _, _, name in phs:
            self.vars.add(name.split('.')[0])
        out = []
        pos = 0
        for kind, content, props in segs:
            css = self._css_run(props)
            if kind != 't':
                if kind == 'tab':
                    out.append('<span class="tab"></span>')
                elif kind == 'br':
                    out.append('<br>')
                else:
                    out.append(content)
                continue
            s, e = pos, pos + len(content)
            pos = e
            cur = s
            pieces = []
            while cur < e:
                prox = next((ph for ph in phs if ph[1] > cur), None)
                if prox is None or prox[0] >= e:
                    pieces.append(_esc(texto[cur:e]))
                    break
                ps, pe, name = prox
                if ps > cur:
                    pieces.append(_esc(texto[cur:ps]))
                    cur = ps
                if cur == ps:
                    pieces.append('<span class="ph" data-ph="%s"></span>' % _esc(name))
                cur = min(pe, e)
            if pieces:
                html_txt = ''.join(pieces)
                out.append('<span style="%s">%s</span>' % (css, html_txt) if css else html_txt)
        return ''.join(out)

    # ------------ parágrafo
    def paragrafo(self, p, extra_r=None):
        ppr = p.find(qn('w:pPr'))
        sid = _w(ppr.find(qn('w:pStyle')), 'val') if ppr is not None else None
        p_props, r_base = self.estilos.para(sid)
        p_props = dict(p_props)
        r_base = dict(r_base)
        if extra_r:
            r_base.update(extra_r)
        parse_ppr(ppr, p_props)
        mark = dict(r_base)
        if ppr is not None:
            parse_rpr(ppr.find(qn('w:rPr')), mark)

        segs = self._segmentos(p, r_base)
        conteudo = self._html_segmentos(segs)

        css = []
        jc = p_props.get('jc')
        css.append('text-align:%s' % {'both': 'justify', 'distribute': 'justify', 'center': 'center',
                                      'right': 'right', 'end': 'right'}.get(jc, 'left'))
        num_attr = ''
        num_html = ''
        nid, ilvl = p_props.get('numId'), p_props.get('ilvl', '0')
        lvl_info = None
        if nid and nid != '0' and nid in self.numeracao:
            lvl_info = self.numeracao[nid]['levels'].get(ilvl or '0')
            if lvl_info and lvl_info['fmt'] != 'none' and lvl_info['text']:
                num_attr = ' data-num="%s" data-lvl="%s"' % (nid, ilvl or '0')
                bold = ';font-weight:700' if lvl_info.get('bold') else ''
                num_html = '<span class="num" style="%s"></span>' % (self._css_run(r_base) + bold)
            for k in ('left', 'hanging', 'first'):
                ind_direto = ppr is not None and ppr.find(qn('w:ind')) is not None
                if lvl_info and lvl_info.get(k) is not None and not ind_direto:
                    p_props[k] = lvl_info[k]
        left = p_props.get('left', 0) or 0
        first = (p_props.get('first', 0) or 0) - (p_props.get('hanging', 0) or 0)
        if left:
            css.append('margin-left:%.1fpt' % left)
        if p_props.get('right'):
            css.append('margin-right:%.1fpt' % p_props['right'])
        if first:
            css.append('text-indent:%.1fpt' % first)
        css.append('margin-top:%.1fpt' % (p_props.get('before', 0) / 20))
        css.append('margin-bottom:%.1fpt' % (p_props.get('after', 0) / 20))
        line, rule = p_props.get('line'), p_props.get('lineRule', 'auto')
        if line:
            if rule == 'auto':
                css.append('line-height:%.3f' % (line / 240 * 1.18))
            elif rule == 'exact':
                css.append('line-height:%.1fpt' % (line / 20))
            else:
                css.append('min-height:%.1fpt' % (line / 20))
        if p_props.get('pbg'):
            css.append('background:' + p_props['pbg'])
        if mark.get('sz'):
            css.append('font-size:%.1fpt' % mark['sz'])
        if mark.get('font'):
            css.append("font-family:'%s',Carlito,Calibri,Arial,sans-serif" % mark['font'])
        if 'class="anchor"' in conteudo:
            css.append('position:relative')
        if not conteudo.strip() and not num_html:
            conteudo = '&#8203;'
        return '<p%s style="%s">%s%s</p>' % (num_attr, ';'.join(css), num_html, conteudo)

    # ------------ tabela
    def _bordas_tabela(self, tbl):
        bordas = {}
        tblpr = tbl.find(qn('w:tblPr'))
        sid = _w(tblpr.find(qn('w:tblStyle')), 'val') if tblpr is not None else None
        fontes = self.estilos.table(sid) + [tblpr]
        margens = {'left': 5.4, 'right': 5.4, 'top': 0, 'bottom': 0}
        for src in fontes:
            if src is None:
                continue
            tb = src.find(qn('w:tblBorders'))
            if tb is not None:
                for b in tb:
                    bordas[b.tag.split('}')[1]] = b
            cm = src.find(qn('w:tblCellMar'))
            if cm is not None:
                for m in cm:
                    nome = {'start': 'left', 'end': 'right'}.get(m.tag.split('}')[1], m.tag.split('}')[1])
                    margens[nome] = _num(_w(m, 'w')) / 20
        return bordas, margens, tblpr

    @staticmethod
    def _css_borda(b):
        if b is None:
            return None
        val = _w(b, 'val')
        if val in (None, 'nil', 'none'):
            return 'none'
        sz = max(0.5, _num(_w(b, 'sz'), 4) / 8)
        cor = _w(b, 'color')
        cor = '#000' if not cor or cor == 'auto' else '#' + cor
        if val == 'double':
            sz = max(sz, 2.25)
        return '%.2fpt %s %s' % (sz, BORDER_STYLE.get(val, 'solid'), cor)

    def tabela(self, tbl):
        bordas, margens, tblpr = self._bordas_tabela(tbl)
        grid = [_num(_w(g, 'w')) / 20 for g in tbl.findall(qn('w:tblGrid') + '/' + qn('w:gridCol'))]
        total = sum(grid) or 1
        css = ['width:%.1fpt' % total]
        if tblpr is not None:
            jc = tblpr.find(qn('w:jc'))
            if _w(jc, 'val') == 'center':
                css.append('margin-left:auto;margin-right:auto')
            ind = tblpr.find(qn('w:tblInd'))
            if ind is not None and _w(jc, 'val') != 'center':
                css.append('margin-left:%.1fpt' % (_num(_w(ind, 'w')) / 20))
        linhas = tbl.findall(qn('w:tr'))
        n = len(linhas)

        # pré-cálculo de rowspan (vMerge)
        layout = []
        for tr in linhas:
            col = 0
            row = []
            for tc in tr.findall(qn('w:tc')):
                tcpr = tc.find(qn('w:tcPr'))
                span = int(_num(_w(tcpr.find(qn('w:gridSpan')), 'val'), 1)) if tcpr is not None and \
                    tcpr.find(qn('w:gridSpan')) is not None else 1
                vm = tcpr.find(qn('w:vMerge')) if tcpr is not None else None
                estado = None
                if vm is not None:
                    estado = 'restart' if _w(vm, 'val') == 'restart' else 'continue'
                row.append({'tc': tc, 'col': col, 'span': span, 'vm': estado, 'rowspan': 1})
                col += span
            layout.append(row)
        for ri, row in enumerate(layout):
            for cell in row:
                if cell['vm'] == 'restart':
                    k = ri + 1
                    while k < n:
                        nxt = [c for c in layout[k] if c['col'] == cell['col']]
                        if nxt and nxt[0]['vm'] == 'continue':
                            cell['rowspan'] += 1
                            k += 1
                        else:
                            break

        partes = ['<table class="dtbl" style="%s"><colgroup>%s</colgroup>' % (
            ';'.join(css), ''.join('<col style="width:%.1fpt">' % g for g in grid))]
        tbody_aberto = False
        loop_aberto = False
        for ri, tr in enumerate(linhas):
            texto = ''.join(t.text or '' for t in tr.iter(qn('w:t')))
            m = RE_TR_TAG.search(texto)
            if m:
                expr = m.group(1)
                mf = re.match(r'for\s+(\w+)\s+in\s+(\w+)', expr)
                if tbody_aberto:
                    partes.append('</tbody>')
                    tbody_aberto = False
                if mf:
                    self.vars.add(mf.group(2))
                    self.itens_loop.add(mf.group(1))
                    partes.append('<tbody class="loop" data-item="%s" data-loop="%s">' % (mf.group(1), mf.group(2)))
                    loop_aberto = True
                elif expr.startswith('endfor'):
                    if loop_aberto:
                        partes.append('</tbody>')
                        loop_aberto = False
                continue
            if not tbody_aberto and not loop_aberto:
                partes.append('<tbody>')
                tbody_aberto = True
            trpr = tr.find(qn('w:trPr'))
            altura = ''
            if trpr is not None and trpr.find(qn('w:trHeight')) is not None:
                altura = ' style="height:%.1fpt"' % (_num(_w(trpr.find(qn('w:trHeight')), 'val')) / 20)
            partes.append('<tr%s>' % altura)
            ncols = len(grid)
            for cell in layout[ri]:
                if cell['vm'] == 'continue':
                    continue
                partes.append(self._celula(cell, ri, n, ncols, bordas, margens))
            partes.append('</tr>')
        if tbody_aberto or loop_aberto:
            partes.append('</tbody>')
        partes.append('</table>')
        return ''.join(partes)

    def _celula(self, cell, ri, nlinhas, ncols, bordas, margens):
        tc = cell['tc']
        tcpr = tc.find(qn('w:tcPr'))
        css = ['padding:%.1fpt %.1fpt %.1fpt %.1fpt' % (margens['top'], margens['right'],
                                                         margens['bottom'], margens['left'])]
        ultima_linha = ri + cell['rowspan'] >= nlinhas
        lados = {
            'top': bordas.get('top') if ri == 0 else bordas.get('insideH'),
            'bottom': bordas.get('bottom') if ultima_linha else bordas.get('insideH'),
            'left': bordas.get('left', bordas.get('start')) if cell['col'] == 0 else bordas.get('insideV'),
            'right': bordas.get('right', bordas.get('end')) if cell['col'] + cell['span'] >= ncols
            else bordas.get('insideV'),
        }
        valign = 'top'
        if tcpr is not None:
            tb = tcpr.find(qn('w:tcBorders'))
            if tb is not None:
                for b in tb:
                    nome = {'start': 'left', 'end': 'right'}.get(b.tag.split('}')[1], b.tag.split('}')[1])
                    if nome in lados:
                        lados[nome] = b
            shd = tcpr.find(qn('w:shd'))
            if shd is not None and _w(shd, 'fill') and _w(shd, 'fill').lower() != 'auto':
                css.append('background:#' + _w(shd, 'fill'))
            va = tcpr.find(qn('w:vAlign'))
            if va is not None:
                valign = {'center': 'middle', 'bottom': 'bottom'}.get(_w(va, 'val'), 'top')
            mar = tcpr.find(qn('w:tcMar'))
            if mar is not None:
                for m in mar:
                    nome = {'start': 'left', 'end': 'right'}.get(m.tag.split('}')[1], m.tag.split('}')[1])
                    css.append('padding-%s:%.1fpt' % (nome, _num(_w(m, 'w')) / 20))
            td = tcpr.find(qn('w:textDirection'))
            if td is not None and _w(td, 'val') in ('btLr', 'tbRl'):
                css.append('writing-mode:vertical-rl')
                if _w(td, 'val') == 'btLr':
                    css.append('transform:rotate(180deg)')
        for lado, b in lados.items():
            v = self._css_borda(b)
            if v:
                css.append('border-%s:%s' % (lado, v))
        css.append('vertical-align:' + valign)
        attrs = ''
        if cell['span'] > 1:
            attrs += ' colspan="%d"' % cell['span']
        if cell['rowspan'] > 1:
            attrs += ' rowspan="%d"' % cell['rowspan']
        corpo = self.bloco(tc)
        return '<td%s style="%s">%s</td>' % (attrs, ';'.join(css), corpo)

    # ------------ blocos e condições
    def bloco(self, container):
        """Converte filhos de body/célula/cabeçalho, tratando {%p if %} ... {%p endif %}."""
        saida = [[]]          # pilha de buffers
        grupos = []           # pilha de grupos de condição abertos

        def emit(s):
            saida[-1].append(s)

        def filhos(el):
            for c in el:
                if c.tag == qn('w:sdt'):
                    cont = c.find(qn('w:sdtContent'))
                    if cont is not None:
                        yield from filhos(cont)
                else:
                    yield c

        for el in filhos(container):
            if el.tag == qn('w:p'):
                texto = ''.join(t.text or '' for t in el.iter(qn('w:t')))
                m = RE_P_TAG.match(texto)
                if m:
                    expr = m.group(1).strip()
                    palavra = expr.split()[0]
                    if palavra == 'if':
                        cond = expr[2:].strip()
                        self._registrar_expr(cond)
                        grupos.append([[cond, None]])
                        saida.append([])
                    elif palavra in ('elif', 'else') and grupos:
                        grupos[-1][-1][1] = ''.join(saida.pop())
                        cond = expr[4:].strip() if palavra == 'elif' else '__else__'
                        if palavra == 'elif':
                            self._registrar_expr(cond)
                        grupos[-1].append([cond, None])
                        saida.append([])
                    elif palavra == 'endif' and grupos:
                        grupos[-1][-1][1] = ''.join(saida.pop())
                        g = grupos.pop()
                        emit('<div class="cond-group">%s</div>' % ''.join(
                            '<div class="cond" data-cond="%s">%s</div>' % (_esc(c), h) for c, h in g))
                    continue
                emit(self.paragrafo(el))
            elif el.tag == qn('w:tbl'):
                emit(self.tabela(el))
        while grupos:  # marcação malformada: fecha o que sobrou
            grupos[-1][-1][1] = ''.join(saida.pop())
            g = grupos.pop()
            emit(''.join(h for _, h in g))
        return ''.join(saida[0])

    def cabecalho_rodape(self, tipo):
        sect = self.doc.sections[-1]
        hf = sect.header if tipo == 'header' else sect.footer
        try:
            if hf.is_linked_to_previous and len(self.doc.sections) == 1:
                return ''
            el = hf._element
            part = hf.part
        except Exception:
            return ''
        anterior = self.part
        self.part = part
        try:
            return self.bloco(el)
        finally:
            self.part = anterior

    def converter(self):
        corpo = self.bloco(self.doc.element.body)
        cab = self.cabecalho_rodape('header')
        rod = self.cabecalho_rodape('footer')
        pg = self.pagina
        _, r_def = self.estilos.para(None)
        fonte = r_def.get('font') or 'Calibri'
        tamanho = r_def.get('sz') or 11
        html_doc = (
            '<div class="doc-page" style="width:%.1fpt;padding:%.1fpt %.1fpt %.1fpt %.1fpt;'
            "font-family:'%s',Carlito,Calibri,Arial,sans-serif;font-size:%.1fpt\">"
            '<header class="doc-header">%s</header><main class="doc-body">%s</main>'
            '<footer class="doc-footer">%s</footer></div>'
        ) % (pg['largura'], min(pg['m_sup'], 48), pg['m_dir'], min(pg['m_inf'], 36), pg['m_esq'],
             fonte, tamanho, cab, corpo, rod)
        numeracao = {
            nid: {'chave': info['chave'],
                  'niveis': {il: {'start': lv['start'], 'fmt': lv['fmt'], 'text': lv['text']}
                             for il, lv in info['levels'].items()}}
            for nid, info in self.numeracao.items()
        }
        return {'html': html_doc, 'vars': sorted(self.vars - self.itens_loop), 'numeracao': numeracao}


def converter(caminho):
    return Conversor(caminho).converter()


if __name__ == '__main__':
    import json
    import sys
    r = converter(sys.argv[1])
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w', encoding='utf-8') as fh:
            fh.write('<meta charset="utf-8"><style>.ph{background:#fde68a}.ph:empty:before{content:attr(data-ph)}'
                     '.tab{display:inline-block;width:36pt}.dtbl{border-collapse:collapse}'
                     '.doc-page{background:#fff;margin:auto;box-sizing:content-box}p{margin:0}</style>')
            fh.write(r['html'])
    print(json.dumps(r['vars'], ensure_ascii=False))
    print(len(r['html']))
