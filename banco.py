"""Banco de dados (SQLite) dos documentos salvos.

Cada documento guarda os dados do formulário (para continuar a edição depois)
e o último contexto calculado (para gerar o .docx/.pdf sem abrir o formulário).
"""
import json
import os
import re
import sqlite3
from contextlib import closing
from datetime import datetime

ESQUEMA = """
CREATE TABLE IF NOT EXISTS documentos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo            TEXT NOT NULL,
    objeto          TEXT NOT NULL,
    pessoa          TEXT NOT NULL,
    orgao           TEXT,
    numero          TEXT NOT NULL,
    num_termo       TEXT,
    contratado      TEXT,
    objeto_desc     TEXT,
    pendentes       INTEGER NOT NULL DEFAULT 0,
    dados_json      TEXT NOT NULL,
    contexto_json   TEXT NOT NULL,
    criado_em       TEXT NOT NULL,
    atualizado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documentos_atualizado ON documentos (atualizado_em DESC);
"""

CAMPOS_RESUMO = ('id', 'tipo', 'objeto', 'pessoa', 'orgao', 'numero', 'num_termo', 'contratado',
                 'objeto_desc', 'pendentes', 'criado_em', 'atualizado_em')


def chave_numero(numero):
    """Normaliza o nº do contrato para comparação: '012/2026/cbmpa ' -> '12/2026/CBMPA'.
    O sufixo do órgão faz parte do número, então 012/2026/CBMPA e 012/2026/CBMPA/FEBOM são diferentes."""
    partes = [p.strip().upper() for p in re.sub(r'\s+', '', str(numero or '')).split('/') if p.strip()]
    return '/'.join(str(int(p)) if p.isdigit() else p for p in partes)


def chave_termo(num_termo):
    t = re.sub(r'\D', '', str(num_termo or ''))
    return str(int(t)) if t else ''


def valor_numerico(texto):
    """'1.234,56' -> 1234.56; vazio ou XXXXXXXX -> None."""
    t = re.sub(r'[^\d,.-]', '', str(texto or ''))
    if not t or not re.search(r'\d', t):
        return None
    if ',' in t:
        t = t.replace('.', '').replace(',', '.')
    try:
        return float(t)
    except ValueError:
        return None


TITULOS = {'contrato': 'Contrato', 'aditivo': 'Termo Aditivo', 'apostilamento': 'Termo de Apostilamento'}


def titulo(tipo, numero, num_termo):
    if tipo == 'contrato':
        return 'Contrato nº %s' % numero
    return '%s%s ao Contrato nº %s' % ((num_termo + 'º ') if num_termo else '', TITULOS.get(tipo, tipo), numero)


class Banco:
    def __init__(self, caminho):
        self.caminho = caminho
        os.makedirs(os.path.dirname(caminho), exist_ok=True)
        with closing(self._conexao()) as con, con:
            con.executescript(ESQUEMA)

    def _conexao(self):
        con = sqlite3.connect(self.caminho, timeout=10)
        con.row_factory = sqlite3.Row
        return con

    @staticmethod
    def _agora():
        return datetime.now().isoformat(timespec='seconds')

    @staticmethod
    def _colunas(doc):
        ctx = doc.get('contexto') or {}
        dados = doc.get('dados') or {}
        valores = dados.get('valores') or {}
        return {
            'tipo': doc['tipo'], 'objeto': doc['objeto'], 'pessoa': doc['pessoa'],
            'orgao': valores.get('ORGAO') or 'CBMPA',
            'numero': str(ctx.get('NUM_CONTRATO') or valores.get('CONTRATO_NUMERO') or '').strip(),
            'num_termo': str(valores.get('NUM_TERMO') or '').strip() or None,
            'contratado': str(valores.get('NOME_CONTRATADA') or '').strip() or None,
            'objeto_desc': str(valores.get('OBJETO') or '').strip()[:300] or None,
            'pendentes': int(doc.get('pendentes') or 0),
            'dados_json': json.dumps(dados, ensure_ascii=False),
            'contexto_json': json.dumps(ctx, ensure_ascii=False),
        }

    def conflito(self, tipo, numero, num_termo=None, ignorar_id=None):
        """Procura outro documento com o mesmo número (e órgão, que está no sufixo).
        Contratos: o número não pode se repetir. Termos: o nº do termo não pode se repetir no mesmo contrato."""
        chave = chave_numero(numero)
        if not chave:
            return None
        with closing(self._conexao()) as con:
            linhas = con.execute('SELECT id, tipo, numero, num_termo FROM documentos WHERE tipo = ?', (tipo,)).fetchall()
        for r in linhas:
            if ignorar_id is not None and r['id'] == ignorar_id:
                continue
            if chave_numero(r['numero']) != chave:
                continue
            if tipo != 'contrato' and chave_termo(r['num_termo']) != chave_termo(num_termo):
                continue
            return {'id': r['id'], 'titulo': titulo(r['tipo'], r['numero'], r['num_termo'])}
        return None

    def conflito_doc(self, doc, ignorar_id=None):
        cols = self._colunas(doc)
        return self.conflito(cols['tipo'], cols['numero'], cols['num_termo'], ignorar_id)

    def para_painel(self):
        """Resumo de todos os documentos com o valor de cada um, para o painel."""
        with closing(self._conexao()) as con:
            linhas = con.execute('SELECT %s, contexto_json FROM documentos' % ', '.join(CAMPOS_RESUMO)).fetchall()
        out = []
        for r in linhas:
            d = {k: r[k] for k in CAMPOS_RESUMO}
            ctx = json.loads(r['contexto_json'] or '{}')
            if d['tipo'] == 'contrato':
                bruto = ctx.get('VALOR_GLOBAL')
            elif ctx.get('PRECO_MODALIDADE') == 'mensal':
                bruto = ctx.get('VALOR_ANUAL')
            else:
                bruto = ctx.get('NOVO_VALOR')
            d['valor'] = valor_numerico(bruto)
            d['titulo'] = titulo(d['tipo'], d['numero'], d['num_termo'])
            out.append(d)
        return out

    def listar(self, busca=''):
        sql = 'SELECT %s FROM documentos' % ', '.join(CAMPOS_RESUMO)
        args = []
        if busca:
            sql += ' WHERE numero LIKE ? OR contratado LIKE ? OR objeto_desc LIKE ?'
            args = ['%' + busca + '%'] * 3
        sql += ' ORDER BY atualizado_em DESC'
        with closing(self._conexao()) as con:
            return [dict(r) for r in con.execute(sql, args)]

    def obter(self, doc_id):
        with closing(self._conexao()) as con:
            r = con.execute('SELECT * FROM documentos WHERE id = ?', (doc_id,)).fetchone()
        if not r:
            return None
        d = {k: r[k] for k in CAMPOS_RESUMO}
        d['dados'] = json.loads(r['dados_json'])
        d['contexto'] = json.loads(r['contexto_json'])
        return d

    def criar(self, doc):
        cols = self._colunas(doc)
        cols['criado_em'] = cols['atualizado_em'] = self._agora()
        nomes = ', '.join(cols)
        marcas = ', '.join('?' for _ in cols)
        with closing(self._conexao()) as con, con:
            cur = con.execute('INSERT INTO documentos (%s) VALUES (%s)' % (nomes, marcas), list(cols.values()))
            return cur.lastrowid

    def atualizar(self, doc_id, doc):
        cols = self._colunas(doc)
        cols['atualizado_em'] = self._agora()
        atrib = ', '.join('%s = ?' % k for k in cols)
        with closing(self._conexao()) as con, con:
            cur = con.execute('UPDATE documentos SET %s WHERE id = ?' % atrib, list(cols.values()) + [doc_id])
            return cur.rowcount > 0

    def excluir(self, doc_id):
        with closing(self._conexao()) as con, con:
            return con.execute('DELETE FROM documentos WHERE id = ?', (doc_id,)).rowcount > 0
