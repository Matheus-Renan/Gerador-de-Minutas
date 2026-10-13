"""Banco de dados (SQLite) dos documentos salvos.

Cada documento guarda os dados do formulário (para continuar a edição depois)
e o último contexto calculado (para gerar o .docx/.pdf sem abrir o formulário).
"""
import json
import os
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
