"""CBMPA — Gerador de Minutas (DCA).

Servidor local: a interface roda no navegador (HTML/CSS/JS) e o Python
preenche os modelos .docx (docxtpl) e converte para PDF.

    python app.py      ->  abre http://127.0.0.1:5000
"""
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime

from docxtpl import DocxTemplate
from flask import Flask, abort, jsonify, render_template, request, send_from_directory

import conversor_preview

BASE = os.path.dirname(os.path.abspath(__file__))
PASTA_MODELOS = os.path.join(BASE, 'modelos')

with open(os.path.join(BASE, 'config.json'), encoding='utf-8') as fh:
    CONFIG = json.load(fh)

PASTA_SAIDA = os.path.join(BASE, CONFIG.get('pasta_saida', 'Contratos_Gerados'))

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


@app.route('/api/gerar', methods=['POST'])
def api_gerar():
    dados = request.get_json(force=True)
    tipo = dados.get('tipo')
    caminho = arquivo_modelo(tipo, dados.get('objeto'), dados.get('pessoa'))
    contexto = dados.get('contexto') or {}

    try:
        doc = DocxTemplate(caminho)
        doc.render(contexto, autoescape=True)
    except Exception as exc:
        return jsonify({'ok': False, 'erro': 'Erro ao preencher o modelo: %s' % exc}), 500

    os.makedirs(PASTA_SAIDA, exist_ok=True)
    numero = nome_seguro(str(contexto.get('NUM_CONTRATO', '')).replace('/', '-'), 30)
    if tipo != 'contrato' and contexto.get('NUM_TERMO'):
        numero = '%s-%s' % (nome_seguro(str(contexto['NUM_TERMO']), 5), numero)
    contratado = nome_seguro(contexto.get('NOME_CONTRATADA', ''), 40)
    base = '%s_%s_%s' % (PREFIXO_ARQUIVO[tipo], numero, contratado)
    caminho_docx = os.path.join(PASTA_SAIDA, base + '.docx')
    if os.path.exists(caminho_docx):
        base += datetime.now().strftime('_%Y%m%d-%H%M%S')
        caminho_docx = os.path.join(PASTA_SAIDA, base + '.docx')
    try:
        doc.save(caminho_docx)
    except PermissionError:
        return jsonify({'ok': False, 'erro': 'Não foi possível salvar: o arquivo está aberto em outro programa?'}), 500

    resposta = {'ok': True, 'docx': os.path.basename(caminho_docx), 'pasta': PASTA_SAIDA}
    if dados.get('pdf', True):
        pdf, erro = converter_pdf(caminho_docx)
        resposta['pdf'] = os.path.basename(pdf) if pdf else None
        if erro and not pdf:
            resposta['aviso_pdf'] = ('PDF não gerado (é necessário Microsoft Word ou LibreOffice instalado). '
                                     'O arquivo Word foi salvo normalmente.')
    return jsonify(resposta)


@app.route('/arquivos/<path:nome>')
def baixar(nome):
    return send_from_directory(PASTA_SAIDA, nome, as_attachment=request.args.get('baixar') == '1')


@app.route('/api/abrir-pasta', methods=['POST'])
def abrir_pasta():
    os.makedirs(PASTA_SAIDA, exist_ok=True)
    try:
        if platform.system() == 'Windows':
            os.startfile(PASTA_SAIDA)  # noqa: S606 - abre o Explorer local
        elif platform.system() == 'Darwin':
            subprocess.Popen(['open', PASTA_SAIDA])
        else:
            subprocess.Popen(['xdg-open', PASTA_SAIDA])
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'ok': False, 'erro': str(exc), 'pasta': PASTA_SAIDA})


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
