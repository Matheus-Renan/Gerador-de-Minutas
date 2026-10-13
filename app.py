"""CBMPA — Gerador de Minutas (DCA).

Servidor local: a interface roda no navegador (HTML/CSS/JS) e o Python
preenche os modelos .docx (docxtpl) e converte para PDF.

    python app.py      ->  abre http://127.0.0.1:5000
"""
import io
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import webbrowser

from docxtpl import DocxTemplate
from flask import Flask, abort, jsonify, render_template, request, send_file

import conversor_preview
from banco import Banco

BASE = os.path.dirname(os.path.abspath(__file__))
PASTA_MODELOS = os.path.join(BASE, 'modelos')

with open(os.path.join(BASE, 'config.json'), encoding='utf-8') as fh:
    CONFIG = json.load(fh)

banco = Banco(os.path.join(BASE, 'dados', 'minutas.db'))

TIPOS = {'contrato': 'CONTRATO', 'aditivo': 'ADITIVO', 'apostilamento': 'APOSTILAMENTO'}
OBJETOS = {'bens': 'BENS', 'servicos': 'SERVICOS'}
PESSOAS = {'pj': 'PJ', 'pf': 'PF'}
PREFIXO_ARQUIVO = {'contrato': 'CONTRATO', 'aditivo': 'TERMO_ADITIVO', 'apostilamento': 'APOSTILAMENTO'}

app = Flask(__name__)
app.json.ensure_ascii = False
_cache_preview = {}


def arquivo_modelo(tipo, objeto, pessoa):
    try:
        nome = 'MODELO_%s_%s_%s.docx' % (TIPOS[tipo], OBJETOS[objeto], PESSOAS[pessoa])
    except KeyError:
        abort(400, 'Combinação de modelo inválida.')
    caminho = os.path.join(PASTA_MODELOS, nome)
    if not os.path.exists(caminho):
        abort(404, 'Modelo não encontrado: %s' % nome)
    return caminho


def nome_seguro(texto, limite=60):
    texto = re.sub(r'[\\/:*?"<>|]+', '-', texto or '')
    texto = ''.join(c for c in texto if c.isalnum() or c in ' -_.').strip()
    return re.sub(r'\s+', '_', texto)[:limite] or 'sem_nome'


def converter_pdf(caminho_docx):
    """Tenta Word (docx2pdf, Windows/macOS) e depois LibreOffice. Retorna o caminho do PDF ou None."""
    caminho_pdf = os.path.splitext(caminho_docx)[0] + '.pdf'
    erros = []
    try:
        if platform.system() == 'Windows':
            import pythoncom  # o Word via COM precisa ser inicializado em cada thread do Flask
            pythoncom.CoInitialize()
        from docx2pdf import convert
        convert(caminho_docx, caminho_pdf)
        if os.path.exists(caminho_pdf):
            return caminho_pdf, None
    except Exception as exc:  # Word ausente, docx2pdf não instalado...
        erros.append('Word: %s' % exc)
    soffice = shutil.which('soffice') or shutil.which('libreoffice')
    if not soffice and platform.system() == 'Windows':
        for c in (r'C:\Program Files\LibreOffice\program\soffice.exe',
                  r'C:\Program Files (x86)\LibreOffice\program\soffice.exe'):
            if os.path.exists(c):
                soffice = c
    if soffice:
        try:
            subprocess.run([soffice, '--headless', '--convert-to', 'pdf', '--outdir',
                            os.path.dirname(caminho_docx), caminho_docx],
                           check=True, timeout=180, capture_output=True)
            if os.path.exists(caminho_pdf):
                return caminho_pdf, None
        except Exception as exc:
            erros.append('LibreOffice: %s' % exc)
    else:
        erros.append('LibreOffice não encontrado')
    return None, '; '.join(erros)


@app.route('/')
def index():
    return render_template('index.html', config=CONFIG)


@app.route('/api/modelo')
def api_modelo():
    caminho = arquivo_modelo(request.args.get('tipo'), request.args.get('objeto'), request.args.get('pessoa'))
    mtime = os.path.getmtime(caminho)
    cache = _cache_preview.get(caminho)
    if not cache or cache[0] != mtime:
        dados = conversor_preview.converter(caminho)
        dados['arquivo'] = os.path.basename(caminho)
        cache = (mtime, dados)
        _cache_preview[caminho] = cache
    return jsonify(cache[1])


def _validar_documento(doc):
    if not isinstance(doc, dict):
        abort(400, 'Dados inválidos.')
    if doc.get('tipo') not in TIPOS or doc.get('objeto') not in OBJETOS or doc.get('pessoa') not in PESSOAS:
        abort(400, 'Combinação de modelo inválida.')
    valores = (doc.get('dados') or {}).get('valores') or {}
    if not str(valores.get('CONTRATO_NUMERO') or '').strip():
        return 'Informe o número do contrato para salvar.'
    return None


def nome_arquivo(doc):
    contexto = doc.get('contexto') or {}
    numero = nome_seguro(str(contexto.get('NUM_CONTRATO', '')).replace('/', '-'), 40)
    if doc['tipo'] != 'contrato' and contexto.get('NUM_TERMO'):
        numero = '%s-%s' % (nome_seguro(str(contexto['NUM_TERMO']), 5), numero)
    contratado = nome_seguro(contexto.get('NOME_CONTRATADA', ''), 40)
    return '%s_%s_%s' % (PREFIXO_ARQUIVO[doc['tipo']], numero, contratado)


def gerar_arquivo(doc, formato):
    """Gera o .docx (e o .pdf, se pedido) numa pasta temporária e devolve (bytes, nome do arquivo).
    Nada fica gravado no computador: o arquivo vai direto para o download do navegador."""
    modelo = DocxTemplate(arquivo_modelo(doc['tipo'], doc['objeto'], doc['pessoa']))
    modelo.render(doc.get('contexto') or {}, autoescape=True)
    base = nome_arquivo(doc)
    with tempfile.TemporaryDirectory(prefix='minuta_') as pasta:
        caminho = os.path.join(pasta, base + '.docx')
        modelo.save(caminho)
        if formato == 'pdf':
            caminho, _ = converter_pdf(caminho)
            if not caminho:
                return None, None
        with open(caminho, 'rb') as fh:
            return fh.read(), os.path.basename(caminho)


@app.route('/api/documentos')
def listar_documentos():
    return jsonify(banco.listar(request.args.get('q', '').strip()))


@app.route('/api/documentos/<int:doc_id>')
def obter_documento(doc_id):
    doc = banco.obter(doc_id)
    if not doc:
        return jsonify({'ok': False, 'erro': 'Documento não encontrado.'}), 404
    return jsonify(doc)


@app.route('/api/documentos', methods=['POST'])
@app.route('/api/documentos/<int:doc_id>', methods=['PUT'])
def salvar_documento(doc_id=None):
    doc = request.get_json(force=True, silent=True)
    erro = _validar_documento(doc)
    if erro:
        return jsonify({'ok': False, 'erro': erro}), 400
    if doc_id is None:
        doc_id = banco.criar(doc)
    elif not banco.atualizar(doc_id, doc):
        return jsonify({'ok': False, 'erro': 'Documento não encontrado (pode ter sido excluído).'}), 404
    return jsonify({'ok': True, 'documento': {k: v for k, v in banco.obter(doc_id).items()
                                              if k not in ('dados', 'contexto')}})


@app.route('/api/documentos/<int:doc_id>', methods=['DELETE'])
def excluir_documento(doc_id):
    return jsonify({'ok': banco.excluir(doc_id)})


@app.route('/api/documentos/<int:doc_id>/baixar/<formato>')
def baixar_documento(doc_id, formato):
    if formato not in ('docx', 'pdf'):
        abort(404)
    doc = banco.obter(doc_id)
    if not doc:
        return jsonify({'ok': False, 'erro': 'Documento não encontrado.'}), 404
    try:
        conteudo, nome = gerar_arquivo(doc, formato)
    except Exception as exc:
        return jsonify({'ok': False, 'erro': 'Erro ao preencher o modelo: %s' % exc}), 500
    if conteudo is None:
        return jsonify({'ok': False, 'erro': 'Não foi possível gerar o PDF: é preciso ter o Microsoft Word '
                                             'ou o LibreOffice instalado no computador onde o programa roda. '
                                             'O Word (.docx) pode ser baixado normalmente.'}), 500
    mime = ('application/pdf' if formato == 'pdf' else
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return send_file(io.BytesIO(conteudo), mimetype=mime, as_attachment=True, download_name=nome)


def main():
    porta = int(os.environ.get('PORTA', CONFIG.get('porta', 5000)))
    url = 'http://127.0.0.1:%d' % porta
    if '--sem-navegador' not in sys.argv:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print('\n  Gerador de Minutas — CBMPA/DCA')
    print('  Acesse %s  (Ctrl+C para encerrar)\n' % url)
    app.run(host='127.0.0.1', port=porta, debug=False)


if __name__ == '__main__':
    main()
