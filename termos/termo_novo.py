import os
import glob
import time
import locale
import platform
import getpass
import msvcrt
import re
from datetime import datetime
from docx import Document
# Certifique-se que o Database.py está na pasta
from Database import Database 

# Configuração de Localização
try:
    locale.setlocale(locale.LC_TIME, 'pt_BR.utf8')
except:
    try:
        locale.setlocale(locale.LC_TIME, 'Portuguese_Brazil.1252')
    except:
        locale.setlocale(locale.LC_TIME, 'C')

class Cores:
    RESET = '\033[0m'
    VERMELHO = '\033[91m'
    VERDE = '\033[92m'
    AMARELO = '\033[93m'
    AZUL = '\033[94m'
    MAGENTA = '\033[95m'
    CIANO = '\033[96m'
    BRANCO = '\033[97m'
    NEGRITO = '\033[1m'
    FUNDO_CINZA = '\033[100m'

class SistemaAutorizacao:
    def __init__(self):
        os.system('') # Habilita cores no Windows
        
        self.dirs = {
            'templates': './templates',
            'output': './output',
            'logs_local': './logs',
            'logs_rede': r'\\192.168.10.3\Departamentos\Pública\autorizacaoAuto\logs'
        }
        
        # Tags obrigatórias para validação do template
        self.tags_obrigatorias = [
            "{{RESPONSAVEL}}", "{{CPF RESPONSAVEL}}", "{{ENDERECO RESPONSAVEL}}",
            "{{NOME MENOR}}", "{{CPF MENOR}}", "{{IDADE MENOR}}",
            "{{DATA ASSINATURA}}"
        ]

        # Tags que o sistema preenche automaticamente
        self.tags_conhecidas = self.tags_obrigatorias + ["{{EMAIL RESPONSAVEL}}", "{{MAT}}"]

        self.db = Database('ODBC Driver 18 for SQL Server', '192.168.10.4,56183', 'MultiClubes', 'grafanaViewer', '9mRBTh87Q4m45twfGoWf')
        
        for d in [self.dirs['templates'], self.dirs['output'], self.dirs['logs_local']]:
            os.makedirs(d, exist_ok=True)

        self.template_atual = None
        self.nome_template_atual = ""

    # --- UTILITÁRIOS ---
    def limpar_tela(self):
        os.system('cls' if os.name == 'nt' else 'clear')

    def cabecalho(self, titulo):
        print(f"{Cores.AZUL}{'='*60}{Cores.RESET}")
        print(f"{Cores.NEGRITO}{titulo.center(60)}{Cores.RESET}")
        print(f"{Cores.AZUL}{'='*60}{Cores.RESET}")
        if self.template_atual:
             print(f"{Cores.CIANO}Template: {self.nome_template_atual}{Cores.RESET}")
             print(f"{Cores.AZUL}{'-'*60}{Cores.RESET}")

    def log(self, tipo, mensagem):
        user = getpass.getuser()
        machine = platform.node()
        timestamp = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        log_line = f"[{timestamp}] | {tipo:<10} | {user}@{machine} | {mensagem}\n"
        try:
            with open(os.path.join(self.dirs['logs_local'], f"log_{datetime.now().strftime('%Y-%m')}.txt"), 'a', encoding='utf-8') as f: f.write(log_line)
            if os.path.exists(self.dirs['logs_rede']):
                with open(os.path.join(self.dirs['logs_rede'], f"log_geral_{datetime.now().strftime('%Y-%m')}.txt"), 'a', encoding='utf-8') as f: f.write(log_line)
        except: pass

    # --- VALIDAÇÃO DE NEGÓCIO ---
    def verificar_parentesco(self, nome_resp, nome_menor):
        """
        Retorna True se houver pelo menos um sobrenome em comum.
        Ignora preposições comuns.
        """
        ignorar = {'da', 'de', 'do', 'das', 'dos', 'e', 'junior', 'neto', 'filho', 'sobrinho', 'segundo', 'terceiro'}
        
        # Cria conjuntos de palavras (sets) em minúsculo
        partes_resp = set(nome_resp.lower().split()) - ignorar
        partes_menor = set(nome_menor.lower().split()) - ignorar
        
        # Interseção: se houver algo em comum, retorna True
        return bool(partes_resp & partes_menor)

    # --- MENU E INTERFACE ---
    def menu_interativo(self, titulo, opcoes, cor_titulo=Cores.BRANCO):
        indice = 0
        while True:
            self.limpar_tela()
            print(f"{cor_titulo}{titulo}{Cores.RESET}")
            print(f"{Cores.AZUL}-{Cores.RESET}" * 60)
            
            for i, opcao in enumerate(opcoes):
                if i == indice:
                    print(f"{Cores.VERDE} -> {Cores.RESET}{Cores.FUNDO_CINZA}{Cores.NEGRITO} {opcao} {Cores.RESET}")
                else:
                    print(f"     {opcao}")
            
            print(f"\n{Cores.AMARELO}[↑/↓] Navegar   [ENTER] Selecionar{Cores.RESET}")
            
            key = msvcrt.getch()
            if key == b'\xe0': 
                seta = msvcrt.getch()
                if seta == b'H': indice = max(0, indice - 1)
                elif seta == b'P': indice = min(len(opcoes) - 1, indice + 1)
            elif key == b'\r': return indice
            elif key == b'\x03': exit()

    # --- LÓGICA DE TEMPLATES ---
    def validar_tags(self, caminho_docx):
        try:
            doc = Document(caminho_docx)
            texto_completo = " ".join([p.text for p in doc.paragraphs])
            for t in doc.tables:
                for r in t.rows:
                    for c in r.cells: texto_completo += " " + c.text
            
            faltantes = [t for t in self.tags_obrigatorias if t not in texto_completo]
            todas_tags_doc = set(re.findall(r"\{\{.*?\}\}", texto_completo))
            desconhecidas = [t for t in todas_tags_doc if t not in self.tags_conhecidas]

            return faltantes, desconhecidas
        except Exception as e:
            return [f"Erro leitura: {e}"], []

    def selecionar_template(self):
        arquivos = glob.glob(os.path.join(self.dirs['templates'], "*.docx"))
        
        if not arquivos:
            self.limpar_tela()
            print(f"{Cores.VERMELHO}ERRO CRÍTICO:{Cores.RESET} Pasta 'templates' vazia.")
            input("Enter para sair...")
            exit()

        nomes = [os.path.basename(x) for x in arquivos]
        idx = self.menu_interativo("SELECIONE O MODELO", nomes, Cores.CIANO)
        caminho = arquivos[idx]

        self.limpar_tela()
        print(f"{Cores.AMARELO}Validando tags do documento...{Cores.RESET}")
        time.sleep(0.5)
        
        faltantes, desconhecidas = self.validar_tags(caminho)

        if faltantes or desconhecidas:
            msg = f"{Cores.AMARELO}⚠️  AVISO DE FORMATO ⚠️{Cores.RESET}\n"
            if faltantes:
                msg += f"\n{Cores.VERMELHO}[CRÍTICO] Tags obrigatórias ausentes:{Cores.RESET}\n"
                for f in faltantes: msg += f" - {f}\n"
            if desconhecidas:
                msg += f"\n{Cores.MAGENTA}[INFO] Campos extras detectados (serão preenchidos com linhas):{Cores.RESET}\n"
                for d in desconhecidas: msg += f" - {d}\n"
            
            msg += "\nO QUE DESEJA FAZER?"
            if self.menu_interativo(msg, ["VOLTAR", "ACEITAR E CONTINUAR"]) == 0:
                return self.selecionar_template()

        self.template_atual = caminho
        self.nome_template_atual = nomes[idx]
        self.log("TEMPLATE", f"Selecionado: {self.nome_template_atual}")

    # --- DADOS E GERAÇÃO ---
    def buscar_dados(self, mat):
        try:
            t = self.db.select('Id, Street, Number, Burgh, City, State, PostalCode', 'dbo.Titles', f"dbo.Titles.Code = '{mat}'")
            if not t: return None
            
            end = ", ".join([str(x) for x in t[0][1:] if x])
            m = self.db.select("Name, Document, Rg, BirthDate, Email", "dbo.Members", f"dbo.Members.Title = '{t[0][0]}' AND dbo.Members.Status = 0")
            
            pessoas = []
            hoje = datetime.now()
            for p in m:
                idade = hoje.year - p[3].year - ((hoje.month, hoje.day) < (p[3].month, p[3].day)) if p[3] else 0
                pessoas.append({'nome': p[0], 'cpf': p[1], 'rg': p[2], 'idade': idade, 'email': p[4], 'endereco': end})
            return pessoas
        except: return None

    def gerar_doc(self, resp, menor, mat=""):
        doc = Document(self.template_atual)
        
        mapa = {
            "{{RESPONSAVEL}}": str(resp['nome']), 
            "{{CPF RESPONSAVEL}}": str(resp['cpf'] or "___.___.___-__"),
            "{{ENDERECO RESPONSAVEL}}": str(resp['endereco']), 
            "{{EMAIL RESPONSAVEL}}": str(resp.get('email', '') or ""),
            "{{NOME MENOR}}": str(menor['nome']), 
            "{{CPF MENOR}}": str(menor['cpf'] or "___.___.___-__"),
            "{{IDADE MENOR}}": str(menor['idade']), 
            "{{DATA ASSINATURA}}": datetime.now().strftime('%d de %B de %Y'),
            "{{MAT}}": f"Matrícula: {mat}" if mat else ""
        }

        def processar_texto(obj):
            if hasattr(obj, 'text') and obj.text:
                for k,v in mapa.items(): 
                    if k in obj.text: obj.text = obj.text.replace(k,v)
                # Substitui tags restantes por linhas
                if "{{" in obj.text:
                    obj.text = re.sub(r"\{\{.*?\}\}", "__________________________", obj.text)

        for p in doc.paragraphs: processar_texto(p)
        for t in doc.tables:
            for r in t.rows:
                for c in r.cells:
                    for p in c.paragraphs: processar_texto(p)

        nome = f"{resp['nome'].split()[0]}_{menor['nome'].split()[0]}.docx"
        path = os.path.abspath(os.path.join(self.dirs['output'], nome))
        doc.save(path)
        self.log("GERACAO", f"Arquivo criado: {nome}")
        return path

    def acao_final(self, path):
        op = self.menu_interativo(f"ARQUIVO: {os.path.basename(path)}", ["IMPRIMIR", "VISUALIZAR", "SALVAR"], Cores.VERDE)
        self.limpar_tela()
        
        if op == 0:
            print(f"{Cores.AMARELO}Imprimindo...{Cores.RESET}")
            try:
                os.startfile(path, "print")
                self.log("IMPRESSAO", f"Enviado: {path}")
                time.sleep(3)
            except: pass
        elif op == 1:
            os.startfile(path)

    # --- FLUXOS ---
    def fluxo_socio(self):
        self.limpar_tela()
        self.cabecalho("MODO SÓCIO")
        mat = input(f"{Cores.AMARELO}Matrícula: {Cores.RESET}")
        pessoas = self.buscar_dados(mat)

        if not pessoas: print(f"{Cores.VERMELHO}Não encontrada.{Cores.RESET}"); time.sleep(1); return

        adultos = [p for p in pessoas if p['idade'] >= 18]
        criancas = [p for p in pessoas if p['idade'] < 18]

        if not adultos: print(f"{Cores.VERMELHO}Sem responsáveis (+18).{Cores.RESET}"); time.sleep(2); return

        resp = adultos[self.menu_interativo("SELECIONE O RESPONSÁVEL", [f"{p['nome']} ({p['idade']})" for p in adultos], Cores.CIANO)]

        while True:
            origem = self.menu_interativo(f"RESP: {resp['nome']}", ["MENOR DA MESMA MATRÍCULA", "OUTRA MATRÍCULA"])
            menor = None
            
            if origem == 0:
                if not criancas: print("Sem menores aqui."); time.sleep(1); continue
                menor = criancas[self.menu_interativo("MENOR", [f"{p['nome']} ({p['idade']})" for p in criancas])]
            else:
                self.limpar_tela()
                p2 = self.buscar_dados(input("Matrícula Menor: "))
                if p2 and (c2 := [p for p in p2 if p['idade'] < 18]):
                    menor = c2[self.menu_interativo("MENOR", [f"{p['nome']} ({p['idade']})" for p in c2])]
                else: print("Não encontrado."); time.sleep(1); continue

            # --- VALIDAÇÃO DE PARENTESCO ---
            if menor:
                if not self.verificar_parentesco(resp['nome'], menor['nome']):
                    alerta = f"{Cores.VERMELHO}⚠️  ALERTA DE DIVERGÊNCIA ⚠️{Cores.RESET}\n"
                    alerta += f"O sobrenome do menor não coincide com o responsável.\n\n"
                    alerta += f"Resp:  {resp['nome']}\n"
                    alerta += f"Menor: {menor['nome']}\n\n"
                    alerta += "DESEJA CONTINUAR?"
                    
                    decisao = self.menu_interativo(alerta, ["NÃO (Cancelar e voltar)", "SIM (Confirmar impressão)"])
                    if decisao == 0:
                        continue # Volta para o início do loop (seleção de menor)

                self.acao_final(self.gerar_doc(resp, menor, mat))
            
            if self.menu_interativo("CONTINUAR?", ["ADICIONAR OUTRO", "MENU PRINCIPAL"]) == 1: break

    def fluxo_nao_socio(self):
        self.limpar_tela()
        self.cabecalho("MODO MANUAL")
        resp = {'nome': input("Nome Resp: "), 'cpf': input("CPF: "), 'endereco': input("Endereço: "), 'email': '', 'idade': 'N/A'}
        while True:
            self.limpar_tela()
            print(f"Resp: {resp['nome']}")
            menor = {'nome': input("Nome Menor: "), 'cpf': input("CPF Menor: "), 'idade': input("Idade: ")}
            
            # --- VALIDAÇÃO DE PARENTESCO ---
            if not self.verificar_parentesco(resp['nome'], menor['nome']):
                alerta = f"{Cores.VERMELHO}⚠️  SOBRENOMES DIFERENTES ⚠️{Cores.RESET}\n"
                alerta += f"Responsável: {resp['nome']}\n"
                alerta += f"Menor:       {menor['nome']}\n"
                if self.menu_interativo(alerta, ["CORRIGIR DADOS", "CONFIRMAR ASSIM MESMO"]) == 0:
                    continue # Reinicia o loop do menor para digitar novamente

            self.acao_final(self.gerar_doc(resp, menor, "MANUAL"))
            if self.menu_interativo("AÇÃO", ["OUTRO MENOR", "SAIR"]) == 1: break

    def main(self):
        while True:
            if not self.template_atual: self.selecionar_template()
            op = self.menu_interativo("MENU PRINCIPAL", ["SÓCIO", "NÃO SÓCIO", "TROCAR TEMPLATE", "SAIR"], Cores.AZUL)
            if op == 0: self.fluxo_socio()
            elif op == 1: self.fluxo_nao_socio()
            elif op == 2: self.template_atual = None; continue
            elif op == 3: break

if __name__ == "__main__":
    try: SistemaAutorizacao().main()
    except Exception as e: print(e); input()