import os
import tkinter as tk
from tkinter import messagebox, filedialog
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from docxtpl import DocxTemplate
from docx2pdf import convert

class GeradorContratosCBMPAModerno:
    def __init__(self, root):
        self.root = root
        self.root.title("CBMPA — Gerador Automático de Minutas e Contratos")
        self.root.geometry("980x920")
        self.root.resizable(False, False)

        # Mapeamento das opções de Contratante conforme a UASG
        self.opcoes_contratante = {
            "CBMPA - Corpo de Bombeiros Militar do Pará": "O Estado do Pará, por intermédio do Corpo de Bombeiros Militar do Pará.",
            "CEDEC - Coordenadoria Estadual de Proteção e Defesa Civil": "O Estado do Pará, por intermédio da Coordenadoria Estadual de Proteção e Defesa Civil - CEDEC do Corpo de Bombeiros Militar do Pará.",
            "FEBOM - Fundo Especial de Bombeiros": "O Estado do Pará, por intermédio do Fundo Especial de Bombeiros – FEBOM do Corpo de Bombeiros Militar do Pará."
        }

        # Mapeamento de combinações para os arquivos .docx
        self.mapa_modelos = {
            ("Contrato", "Aquisição de Bens", "Pessoa Jurídica (CNPJ)"): "MODELO_CONTRATO_BENS_PJ.docx",
            ("Contrato", "Aquisição de Bens", "Pessoa Física (CPF)"): "MODELO_CONTRATO_BENS_PF.docx",
            ("Contrato", "Prestação de Serviços", "Pessoa Jurídica (CNPJ)"): "MODELO_CONTRATO_SERVICOS_PJ.docx",
            ("Contrato", "Prestação de Serviços", "Pessoa Física (CPF)"): "MODELO_CONTRATO_SERVICOS_PF.docx",

            ("Termo Aditivo", "Aquisição de Bens", "Pessoa Jurídica (CNPJ)"): "MODELO_ADITIVO_BENS_PJ.docx",
            ("Termo Aditivo", "Prestação de Serviços", "Pessoa Jurídica (CNPJ)"): "MODELO_ADITIVO_SERVICOS_PJ.docx",
            ("Termo Aditivo", "Aquisição de Bens", "Pessoa Física (CPF)"): "MODELO_ADITIVO_BENS_PF.docx",
            ("Termo Aditivo", "Prestação de Serviços", "Pessoa Física (CPF)"): "MODELO_ADITIVO_SERVICOS_PF.docx",

            ("Apostilamento", "Aquisição de Bens", "Pessoa Jurídica (CNPJ)"): "MODELO_APOSTILAMENTO_BENS_PJ.docx",
            ("Apostilamento", "Prestação de Serviços", "Pessoa Jurídica (CNPJ)"): "MODELO_APOSTILAMENTO_SERVICOS_PJ.docx",
            ("Apostilamento", "Aquisição de Bens", "Pessoa Física (CPF)"): "MODELO_APOSTILAMENTO_BENS_PF.docx",
            ("Apostilamento", "Prestação de Serviços", "Pessoa Física (CPF)"): "MODELO_APOSTILAMENTO_SERVICOS_PF.docx",
        }

        # Container Principal
        main_frame = ttk.Frame(self.root, padding=20)
        main_frame.pack(fill=BOTH, expand=YES)

        # ------------------- CABEÇALHO INSTITUCIONAL -------------------
        header_card = tk.Frame(
            main_frame, 
            bg="white", 
            highlightbackground="#dc3545", 
            highlightthickness=1, 
            bd=0, 
            padx=20, 
            pady=15
        )
        header_card.pack(fill=X, pady=(0, 15))

        header_inner = tk.Frame(header_card, bg="white")
        header_inner.pack(anchor="center")

        try:
            img_original = tk.PhotoImage(file="logo_cbmpa.png")
            fator_reducao = max(1, img_original.width() // 200)
            self.img_logo = img_original.subsample(fator_reducao, fator_reducao)
            lbl_logo = tk.Label(header_inner, image=self.img_logo, bg="white")
            lbl_logo.pack(side=LEFT, padx=(0, 20))
        except Exception:
            lbl_logo_placeholder = tk.Label(header_inner, text="🚒", font=("Segoe UI", 32), bg="white")
            lbl_logo_placeholder.pack(side=LEFT, padx=(0, 20))

        header_text_frame = tk.Frame(header_inner, bg="white")
        header_text_frame.pack(side=LEFT)

        lbl_titulo_principal = tk.Label(
            header_text_frame, 
            text="GERADOR DE MINUTAS — DCA", 
            font=("Segoe UI", 16, "bold"), 
            fg="#dc3545", 
            bg="white"
        )
        lbl_titulo_principal.pack(anchor="w")

        lbl_subtitulo = tk.Label(
            header_text_frame, 
            text="Corpo de Bombeiros Militar do Pará • Diretoria de Contratações e Aquisições", 
            font=("Segoe UI", 10), 
            fg="#000000", 
            bg="white"
        )
        lbl_subtitulo.pack(anchor="w")

        # ------------------- PAINEL SELEÇÃO DE MODELO -------------------
        frame_selecao = ttk.LabelFrame(main_frame, text=" ⚙️ Modulagem do Documento ", padding=15, bootstyle="danger")
        frame_selecao.pack(fill=X, pady=(0, 15))

        frame_selecao.columnconfigure(1, weight=1)
        frame_selecao.columnconfigure(3, weight=1)

        # Linha 0: Órgão Contratante
        ttk.Label(frame_selecao, text="Órgão Contratante:", font=("Segoe UI", 9, "bold")).grid(row=0, column=0, sticky=W, padx=(5, 10), pady=6)
        self.cb_contratante = ttk.Combobox(
            frame_selecao, 
            values=list(self.opcoes_contratante.keys()), 
            state="readonly"
        )
        self.cb_contratante.set("CBMPA - Corpo de Bombeiros Militar do Pará")
        self.cb_contratante.grid(row=0, column=1, columnspan=3, sticky=EW, padx=5, pady=6)

        # Linha 1: Tipo de Documento e Objeto
        ttk.Label(frame_selecao, text="Tipo de Documento:", font=("Segoe UI", 9, "bold")).grid(row=1, column=0, sticky=W, padx=(5, 10), pady=6)
        self.cb_tipo_doc = ttk.Combobox(frame_selecao, values=["Contrato", "Termo Aditivo", "Apostilamento"], state="readonly")
        self.cb_tipo_doc.set("Contrato")
        self.cb_tipo_doc.grid(row=1, column=1, sticky=EW, padx=5, pady=6)

        ttk.Label(frame_selecao, text="Objeto:", font=("Segoe UI", 9, "bold")).grid(row=1, column=2, sticky=W, padx=(20, 10), pady=6)
        self.cb_objeto = ttk.Combobox(frame_selecao, values=["Aquisição de Bens", "Prestação de Serviços"], state="readonly")
        self.cb_objeto.set("Aquisição de Bens")
        self.cb_objeto.grid(row=1, column=3, sticky=EW, padx=5, pady=6)

        # Linha 2: Tipo de Contratado
        ttk.Label(frame_selecao, text="Tipo de Contratado:", font=("Segoe UI", 9, "bold")).grid(row=2, column=0, sticky=W, padx=(5, 10), pady=6)
        self.cb_pessoa = ttk.Combobox(frame_selecao, values=["Pessoa Jurídica (CNPJ)", "Pessoa Física (CPF)"], state="readonly")
        self.cb_pessoa.set("Pessoa Jurídica (CNPJ)")
        self.cb_pessoa.grid(row=2, column=1, sticky=EW, padx=5, pady=6)

        # ------------------- ABAS ORGANIZADAS -------------------
        notebook = ttk.Notebook(main_frame, bootstyle="danger")
        notebook.pack(fill=BOTH, expand=YES, pady=(0, 15))

        self.aba_geral = ttk.Frame(notebook, padding=15)
        notebook.add(self.aba_geral, text="📋  1. Processo & Partes")
        
        self.aba_valores = ttk.Frame(notebook, padding=15)
        notebook.add(self.aba_valores, text="💰  2. Objeto & Valores")

        self.aba_fiscal = ttk.Frame(notebook, padding=15)
        notebook.add(self.aba_fiscal, text="🛡️  3. Fiscalização & Conta")

        self.aba_dotacao = ttk.Frame(notebook, padding=15)
        notebook.add(self.aba_dotacao, text="📊  4. Dotação Orçamentária")

        self._construir_aba_geral()
        self._construir_aba_valores()
        self._construir_aba_fiscal()
        self._construir_aba_dotacao()

        # ------------------- BOTÃO PRINCIPAL -------------------
        btn_gerar = ttk.Button(
            main_frame, 
            text="📄 GERAR DOCUMENTO E CONVERTER EM PDF", 
            bootstyle="danger", 
            cursor="hand2",
            command=self.gerar_documento
        )
        btn_gerar.pack(fill=X, ipady=10)

    def _alternar_sem_informacao(self, entry, var_check):
        """Preenche 'XXXXXXXX' e desabilita o campo quando o Checkbutton é marcado."""
        if var_check.get() == 1:
            entry.config(state="normal")
            entry.delete(0, tk.END)
            entry.insert(0, "XXXXXXXX")
            entry.config(state="disabled")
        else:
            entry.config(state="normal")
            entry.delete(0, tk.END)

    def _alternar_sem_info_duplo(self, entry1, entry2, var_check):
        """Preenche 'XXXXXXXX' e desabilita ambos os campos na linha da Dotação."""
        if var_check.get() == 1:
            for e in (entry1, entry2):
                e.config(state="normal")
                e.delete(0, tk.END)
                e.insert(0, "XXXXXXXX")
                e.config(state="disabled")
        else:
            for e in (entry1, entry2):
                e.config(state="normal")
                e.delete(0, tk.END)

    def _criar_linha_campo(self, parent, row, label_text, key, dict_target, largura_entry=42):
        """Cria o rótulo, a caixa de texto e o Checkbutton 'Sem informação'."""
        ttk.Label(parent, text=label_text, font=("Segoe UI", 9)).grid(row=row, column=0, sticky=W, pady=5, padx=(0, 10))
        
        ent = ttk.Entry(parent, width=largura_entry)
        ent.grid(row=row, column=1, sticky=W, pady=5)
        dict_target[key] = ent

        var_check = tk.IntVar()
        chk = ttk.Checkbutton(
            parent, 
            text="Sem informação", 
            variable=var_check, 
            bootstyle="danger-square-toggle",
            command=lambda: self._alternar_sem_informacao(ent, var_check)
        )
        chk.grid(row=row, column=2, sticky=W, padx=(12, 0), pady=5)

    def _construir_aba_geral(self):
        campos = [
            ("Número do Contrato/Termo:", "NUM_CONTRATO"),
            ("Número do PAE:", "NUM_PAE"),
            ("Fundamento/Modalidade:", "FUNDAMENTO"),
            ("Parecer Jurídico nº:", "PARECER_JURIDICO"),
            ("Razão Social / Nome do Contratado:", "NOME_CONTRATADA"),
            ("CNPJ / CPF do Contratado:", "CNPJ_CONTRATADA"),
            ("Nome do Representante Legal:", "NOME_REPRESENTANTE"),
            ("CPF do Representante Legal:", "CPF_REPRESENTANTE")
        ]
        self.entries_geral = {}
        for idx, (label, key) in enumerate(campos):
            self._criar_linha_campo(self.aba_geral, idx, label, key, self.entries_geral)

    def _construir_aba_valores(self):
        campos = [
            ("Descrição Resumida do Objeto:", "OBJETO"),
            ("Valor Total Global (R$):", "VALOR_GLOBAL"),
            ("Prazo de Entrega (em dias):", "PRAZO_ENTREGA"),
            ("Prazo de Vigência (meses):", "PRAZO_VIGENCIA"),
            ("Data de Início da Vigência:", "DATA_INICIO"),
            ("Data do Fim da Vigência:", "DATA_FIM"),
            ("Índice de Reajuste:", "INDICE_REAJUSTE")
        ]
        self.entries_valores = {}
        for idx, (label, key) in enumerate(campos):
            self._criar_linha_campo(self.aba_valores, idx, label, key, self.entries_valores)

    def _construir_aba_fiscal(self):
        campos = [
            ("Fiscal Titular (Nome e Matrícula):", "FISCAL_TITULAR"),
            ("Fiscal Suplente (Nome e Matrícula):", "FISCAL_SUPLENTE"),
            ("Setor/Lotação da Fiscalização:", "SETOR_FISCAL"),
            ("Banco da Contratada:", "BANCO"),
            ("Agência:", "AGENCIA"),
            ("Conta Corrente:", "CONTA")
        ]
        self.entries_fiscal = {}
        for idx, (label, key) in enumerate(campos):
            self._criar_linha_campo(self.aba_fiscal, idx, label, key, self.entries_fiscal)

    def _construir_aba_dotacao(self):
        campos = [
            ("Exercício:", "EXERCICIO", "DESC_EXERCICIO"),
            ("Gestão / Unidade:", "GESTAO_UNIDADE", "DESC_GESTAO"),
            ("Fonte:", "FONTE", "DESC_FONTE"),
            ("Programa de Trabalho:", "PROG_TRABALHO", "DESC_PROG_TRABALHO"),
            ("Natureza de Despesa:", "NAT_DESPESA", "DESC_NAT_DESPESA"),
            ("Plano Interno:", "PLANO_INTERNO", "DESC_PLANO_INTERNO")
        ]
        
        self.entries_dotacao = {}

        # Cabeçalhos
        ttk.Label(self.aba_dotacao, text="Item da Dotação", font=("Segoe UI", 9, "bold")).grid(row=0, column=0, sticky=W, pady=6)
        ttk.Label(self.aba_dotacao, text="Código Contábil", font=("Segoe UI", 9, "bold")).grid(row=0, column=1, sticky=W, pady=6, padx=5)
        ttk.Label(self.aba_dotacao, text="Descrição", font=("Segoe UI", 9, "bold")).grid(row=0, column=2, sticky=W, pady=6, padx=5)

        for idx, (label, key_cod, key_desc) in enumerate(campos, start=1):
            ttk.Label(self.aba_dotacao, text=label, font=("Segoe UI", 9)).grid(row=idx, column=0, sticky=W, pady=5, padx=(0, 10))
            
            # Campo Código Contábil
            ent_cod = ttk.Entry(self.aba_dotacao, width=16)
            ent_cod.grid(row=idx, column=1, sticky=W, pady=5, padx=2)
            self.entries_dotacao[key_cod] = ent_cod

            # Campo Descrição
            ent_desc = ttk.Entry(self.aba_dotacao, width=28)
            ent_desc.grid(row=idx, column=2, sticky=W, pady=5, padx=2)
            self.entries_dotacao[key_desc] = ent_desc

            # Caixinha Sem Informação (Aplica aos dois campos da linha)
            var_check = tk.IntVar()
            chk = ttk.Checkbutton(
                self.aba_dotacao, 
                text="Sem informação", 
                variable=var_check, 
                bootstyle="danger-square-toggle",
                command=lambda e1=ent_cod, e2=ent_desc, v=var_check: self._alternar_sem_info_duplo(e1, e2, v)
            )
            chk.grid(row=idx, column=3, sticky=W, padx=(10, 0), pady=5)

    def obter_arquivo_modelo(self):
        tipo_doc = self.cb_tipo_doc.get()
        objeto = self.cb_objeto.get()
        pessoa = self.cb_pessoa.get()

        chave = (tipo_doc, objeto, pessoa)
        modelo = self.mapa_modelos.get(chave)

        if not modelo or not os.path.exists(modelo):
            messagebox.showinfo(
                "Modelo não localizado automaticamente",
                f"Não foi encontrado o arquivo automático para:\n- {tipo_doc}\n- {objeto}\n- {pessoa}\n\nPor favor, selecione o arquivo .docx correspondente."
            )
            modelo = filedialog.askopenfilename(
                title=f"Selecione o modelo .docx para {tipo_doc}",
                filetypes=[("Documentos Word", "*.docx")]
            )

        return modelo

    def gerar_documento(self):
        template_file = self.obter_arquivo_modelo()

        if not template_file or not os.path.exists(template_file):
            messagebox.showerror("Erro", "Nenhum arquivo modelo válido foi selecionado.")
            return

        contexto = {}
        for d in [self.entries_geral, self.entries_valores, self.entries_fiscal, self.entries_dotacao]:
            for k, v in d.items():
                estado_anterior = v.cget("state")
                v.config(state="normal")
                contexto[k] = v.get().strip()
                v.config(state=estado_anterior)

        opcao_selecionada = self.cb_contratante.get()
        contexto["NOME_CONTRATANTE"] = self.opcoes_contratante.get(opcao_selecionada, "")

        contexto["TIPO_DOCUMENTO"] = self.cb_tipo_doc.get()
        contexto["TIPO_OBJETO"] = self.cb_objeto.get()
        contexto["TIPO_PESSOA"] = self.cb_pessoa.get()

        if not contexto.get("NUM_CONTRATO") or not contexto.get("NOME_CONTRATADA"):
            messagebox.showwarning("Atenção", "Preencha ao menos o número do documento/contrato e o nome do contratado!")
            return

        try:
            doc = DocxTemplate(template_file)
            doc.render(contexto)

            num_limpo = contexto["NUM_CONTRATO"].replace("/", "-")
            empresa_limpa = "".join(c for c in contexto["NOME_CONTRATADA"] if c.isalnum() or c in (" ", "_")).strip()
            
            prefixo = self.cb_tipo_doc.get().upper().replace(" ", "_")
            pasta_saida = "Contratos_Gerados"
            os.makedirs(pasta_saida, exist_ok=True)

            caminho_word = os.path.join(pasta_saida, f"{prefixo}_{num_limpo}_{empresa_limpa}.docx")
            caminho_pdf = os.path.join(pasta_saida, f"{prefixo}_{num_limpo}_{empresa_limpa}.pdf")

            doc.save(caminho_word)

            try:
                convert(caminho_word, caminho_pdf)
                msg_pdf = f"\n\nPDF: {caminho_pdf}"
            except Exception:
                msg_pdf = "\n\n(Word gerado na pasta 'Contratos_Gerados')."

            messagebox.showinfo("Sucesso!", f"Documento gerado com sucesso!\n\nWord: {caminho_word}{msg_pdf}")

        except Exception as e:
            messagebox.showerror("Erro ao Gerar", f"Ocorreu um erro ao processar o documento:\n{str(e)}")

if __name__ == "__main__":
    app_root = ttk.Window(themename="flatly")
    app = GeradorContratosCBMPAModerno(app_root)
    app_root.mainloop()