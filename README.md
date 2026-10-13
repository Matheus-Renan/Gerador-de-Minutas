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

4. Use os botões da barra inferior:
   - **Salvar** (ou Ctrl+S): grava o andamento no banco de dados para continuar
     depois. Basta ter o **nº do contrato** preenchido; o resto pode ficar
     pendente até as informações chegarem.
   - **Baixar DOCX** / **Baixar PDF**: salva e faz o download pelo navegador.
     Nenhum arquivo fica gravado em pasta do computador.

5. Em **Documentos salvos** (no topo) ficam todos os documentos: busque por nº do
   contrato, contratado ou objeto, veja quantos campos ainda estão pendentes,
   continue a edição, baixe em DOCX ou PDF ou exclua.

### Recursos

- **Prévia ao vivo**: clique em um campo destacado no documento para ir até a
  caixa correspondente; ao focar uma caixa, o trecho dela é destacado na prévia.
- **Valores por extenso** automáticos (valor global, percentuais, prazos, datas).
- **Tabela de itens** com subtotal e total calculados (o valor global vem da soma).
- **Fim da vigência** sugerido a partir do início e da quantidade de meses.
- **S/I (sem informação)**: marca o campo como `XXXXXXXX`. Campos vazios também
  saem como `XXXXXXXX` (o programa avisa antes de gerar).
- **Rascunho automático** no navegador: se a página for fechada sem salvar, o
  que estava preenchido continua lá ao abrir de novo.

### Painel

O botão **Painel**, no topo, abre gráficos com os documentos salvos:
quantidade e valor por órgão (CNPJ), documentos criados por mês, tipos de
documento, bens × serviços, PJ × PF, situação do preenchimento, contratados com
mais documentos e os maiores valores. Dá para filtrar por período e tipo de
documento. Clicar em um documento leva direto para a edição dele.

### Número do contrato único

O nº do contrato não pode se repetir no mesmo órgão (CNPJ): `012/2026/CBMPA`
e `012/2026/CBMPA/FEBOM` podem existir juntos, mas dois `012/2026/CBMPA` não
(zeros à esquerda são ignorados, então `12/2026` conta como `012/2026`). Para
termos aditivos e apostilamentos, o que não pode se repetir é o nº do termo
dentro do mesmo contrato. O aviso aparece enquanto você digita, e o programa
não deixa salvar um número repetido.

### Tema escuro

O botão com o ícone de lua/sol, no topo, alterna entre os temas claro e
escuro. A escolha fica guardada no navegador; sem escolha, segue o tema do
sistema. A folha do documento na prévia continua branca, como no papel.

### Banco de dados

Os documentos ficam em `dados/minutas.db` (SQLite, já incluso no Python). Para
fazer backup, copie esse arquivo. A pasta `dados/` não vai para o git, para não
publicar dados de contratos.

### PDF

O PDF é feito pelo Microsoft Word (via `docx2pdf`). Sem o Word, o programa usa
o LibreOffice, se estiver instalado, no computador onde o programa roda. Se
nenhum dos dois existir, só o download em `.docx` funciona.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `app.py` | Servidor local (Flask): salva os documentos e gera os downloads em DOCX/PDF |
| `banco.py` | Banco de dados SQLite dos documentos salvos |
| `conversor_preview.py` | Converte o modelo `.docx` em HTML para a prévia |
| `config.json` | Órgãos (CNPJ/UASG), autoridade signatária e porta |
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

Órgãos (nome, CNPJ, UASG, sufixo do número do contrato e textos de cada
órgão) e a autoridade signatária ficam em `config.json`: ajuste lá quando mudar.
