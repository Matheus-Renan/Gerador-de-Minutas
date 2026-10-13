# Gerador de Minutas — CBMPA / DCA

Gera contratos, termos aditivos e termos de apostilamento a partir dos modelos
`.docx` da Diretoria de Contratações e Aquisições. A interface roda no navegador
(HTML, CSS e JavaScript) e o Python preenche os modelos e converte para PDF.

Enquanto os campos são preenchidos, a prévia ao lado mostra o documento
atualizado em tempo real.

## Como usar

1. Instale o Python 3.10+ e as dependências (só na primeira vez):

   ```bash
   pip install -r requirements.txt
   ```

2. Inicie o programa:

   ```bash
   python app.py
   ```

   No Windows basta dar dois cliques em `iniciar.bat`. O navegador abre sozinho
   em `http://127.0.0.1:5000`.

3. Escolha o **documento** (Contrato, Termo Aditivo ou Apostilamento), o **objeto**
   (bens ou serviços) e o **contratado** (pessoa jurídica ou física). Preencha os
   campos; o formulário mostra só os campos que o modelo escolhido usa.

4. Clique em **Gerar documento**. O `.docx` (e o `.pdf`) ficam na pasta
   `Contratos_Gerados`.

### Recursos

- **Prévia ao vivo**: clique em um campo destacado no documento para ir até a
  caixa correspondente; ao focar uma caixa, o trecho dela é destacado na prévia.
- **Valores por extenso** automáticos (valor global, percentuais, prazos, datas).
- **Tabela de itens** com subtotal e total calculados (o valor global vem da soma).
- **Fim da vigência** sugerido a partir do início e da quantidade de meses.
- **S/I (sem informação)**: marca o campo como `XXXXXXXX`. Campos vazios também
  saem como `XXXXXXXX` (o programa avisa antes de gerar).
- **Rascunho automático** no navegador e **Exportar/Importar** dos dados em
  `.json` (útil para reaproveitar os dados de um contrato em um termo aditivo).

### PDF

O PDF é feito pelo Microsoft Word (via `docx2pdf`). Sem o Word, o programa usa
o LibreOffice, se estiver instalado. Se nenhum dos dois existir, só o `.docx` é
gerado.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `app.py` | Servidor local (Flask): preenche o modelo, salva e converte para PDF |
| `conversor_preview.py` | Converte o modelo `.docx` em HTML para a prévia |
| `config.json` | Órgãos (CNPJ/UASG), autoridade signatária, pasta de saída e porta |
| `modelos/` | Os 12 modelos `.docx` com os campos `{{ ... }}` |
| `templates/`, `static/` | Interface (HTML, CSS, JavaScript e logo) |

## Editando os modelos

Os modelos usam a sintaxe do [docxtpl](https://docxtpl.readthedocs.io/)
(Jinja). Dá para editá-los normalmente no Word, mantendo as marcações:

- `{{ NOME_CONTRATADA }}`: campo de texto (a lista completa de nomes está em
  `static/js/campos.js`);
- `{%p if GARANTIA_EXIGIDA %}` … `{%p else %}` … `{%p endif %}`: parágrafos
  condicionais (cada marcação fica sozinha em um parágrafo);
- `{%tr for item in ITENS %}` … `{%tr endfor %}`: linhas repetidas de tabela.

Digite cada marcação de uma vez, sem mudar a formatação no meio dela, para o
Word não a dividir. A prévia é lida direto do `.docx`, então as alterações
aparecem ao recarregar a página.

Os CNPJs e as UASGs da CEDEC e do FEBOM estão em branco em `config.json`:
preencha-os lá para que entrem automaticamente ao escolher o órgão.
