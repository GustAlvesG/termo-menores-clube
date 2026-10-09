import os
import dotenv
from docx import Document
from datetime import datetime
from Database import Database
import time
static = ""



def p_static():
    print(static)

def print_new(text):
    #Clear the console
    os.system('cls' if os.name == 'nt' else 'clear')
    print(text)

def log(text):
    with open('nomes.txt', 'a') as f:
        f.write(f"{datetime.now()} - {text}\n")

    with open(fr'\\192.168.10.3\Departamentos\Pública\autorizacaoAuto\nomes.txt', 'a') as f:
        f.write(f"{datetime.now()} - {text}\n")



def database():

    global static

    db = Database('ODBC Driver 18 for SQL Server', '192.168.10.4,56183', 'MultiClubes', 'grafanaViewer', '9mRBTh87Q4m45twfGoWf')

    mat = input("Qual a matrícula do responsável? ")

    title = db.select('Id, Street, Number, Burgh, City, State, PostalCode ', 'dbo.Titles', f"dbo.Titles.Code = '{mat}'")


    id = title[0][0]

    address = title[0][1:]

    address = [str(i) for i in address]
    address = ', '.join(address)

    resps = [list(r) for r in db.select(fr"Name,Document, Rg, BirthDate, Email", fr"dbo.Members", fr"dbo.Members.Title = '{id}' AND dbo.Members.Status = 0")]
    
    for pessoa in resps:
        idade = datetime.now() - pessoa[3]
        idade = int(idade.days / 365)
        pessoa[3] = idade  # Agora funciona, pois pessoa é uma lista

    print_new("Qual o responsável? ")
    for i, person in enumerate(resps):
        print(f"{i+1} - {person[0]} - {person[3]} anos")
    resp = int(input("Digite o número do responsável: "))
    resp -= 1

    static += f"Responsável: {resps[resp][0]} - {resps[resp][1]} - {resps[resp][3]} anos\n"
    static += f"Endereço: {address}\n"






    resps[resp][2] = address  # Atualiza o endereço do responsável
    
    menor_list = []

    while True:
        print_new("\nSeleção de menor:")
        mat_menor = input(f"Qual a matrícula do menor? Deixe em branco caso seja o mesmo do responsável ({mat}) ")

        if mat_menor != "":
            mat = mat_menor

        title_id = db.select('Id', 'dbo.Titles', f"dbo.Titles.Code = '{mat}'").pop()[0]

        menors = [list(r) for r in db.select(fr"Name,Document, Rg, BirthDate", fr"dbo.Members", fr"dbo.Members.Title = '{title_id}' AND dbo.Members.Status = 0")]
        
        for pessoa in menors:
            idade = datetime.now() - pessoa[3]
            idade = int(idade.days / 365)
            pessoa[3] = idade

        print_new("Qual o menor? ")
        for i, person in enumerate(menors):
            print(f"{i+1} - {person[0]} - {person[3]} anos")
        opt = int(input("Digite o número do menor: "))
        opt -= 1
        if opt < 0 or opt >= len(menors):
            print_new("")
            print("Opção inválida. Tente novamente.")
            continue
        menor_list.append(menors[opt])
        static += f"Menor: {menors[opt][0]} - {menors[opt][1]} - {menors[opt][3]} anos\n"
        print_new("")
        if input("Deseja inserir outro menor com o mesmo responsável? (s/n) ").lower() == 's':
            continue
        break
    
    #Validar dados:
    print_new("\nDados coletados:")
    print(resps)
    p_static()


    if input("Todos os dados estão corretos? (s/n) ").lower() != 's':
        if input("Deseja reiniciar o processo? (s/n) ").lower() == 's':
            static = ""
            database()
            return
        elif input("Deseja corrigir o nome do responsável? (s/n) ").lower() == 's':
            new_name = input("Digite o novo nome do responsável: ")
            resps[resp][0] = new_name
            static = static.replace(resps[resp][0], new_name)
        elif input("Deseja corrigir o endereço do responsável? (s/n) ").lower() == 's':
            new_address = input("Digite o novo endereço do responsável: ")
            resps[resp][2] = new_address
            static = static.replace(resps[resp][2], new_address)
        elif input("Para corrigir o nome do menor, reinicie o processo. (s/n) ").lower() == 's':
            static = ""
            database()
            return
        

    for i in menor_list:
        main(resps[resp], i, mat)

def nao_socio():
    global static

    print_new("Digite os dados do responsável:")
    resp = input("Digite o nome do responsável: ")
    cpf = input("Digite o CPF do responsável: ")
    endereco = input("Digite o endereço do responsável: ")

    static += f"Responsável: {resp} - {cpf}\n"
    static += f"Endereço: {endereco}\n"
    menor_list = []

    while True:
        print_new("\nSeleção de menor:")
        menor = input("Digite o nome do menor: ")
        cpf_menor = input("Digite o CPF do menor: ")
        idade_menor = int(input("Digite a idade do menor: "))

        static += f"Menor: {menor} - {cpf_menor} - {idade_menor} anos\n"

        menor_list.append((menor, cpf_menor,"", idade_menor))

        if input("Deseja adicionar outro menor? (s/n) ").lower() != 's':
            break

    print_new("\nDados coletados:")
    p_static()
    if input("Todos os dados estão corretos? (s/n) ").lower() != 's':
        if input("Deseja reiniciar o processo? (s/n) ").lower() == 's':
            static = ""
            nao_socio()
            return
        elif input("Deseja corrigir o nome do responsável? (s/n) ").lower() == 's':
            new_name = input("Digite o novo nome do responsável: ")
            static = static.replace(resp, new_name)
            resp = new_name
        elif input("Deseja corrigir o endereço do responsável? (s/n) ").lower() == 's':
            new_address = input("Digite o novo endereço do responsável: ")
            static = static.replace(endereco, new_address)
            endereco = new_address
        elif input("Para corrigir o nome do menor, reinicie o processo. (s/n) ").lower() == 's':
            static = ""
            nao_socio()
            return
    
    resp = [resp, cpf, endereco]

    for i in menor_list:
        main(resp, i)
        
        


def main(resp, menor, socio = ""):
    doc = Document('./termo_base.docx')

    for paragraph in doc.paragraphs:
        if r"{{RESPONSAVEL}}" in paragraph.text:
            paragraph.text = paragraph.text.replace(r"{{RESPONSAVEL}}", fr"{resp[0]}")
        if r"{{CPF RESPONSAVEL}}" in paragraph.text:
            paragraph.text = paragraph.text.replace(r"{{CPF RESPONSAVEL}}", f"{resp[1]}")
        if r"{{ENDERECO RESPONSAVEL}}" in paragraph.text:
            paragraph.text = paragraph.text.replace(r"{{ENDERECO RESPONSAVEL}}", f"{resp[2]}")
        if r"{{NOME MENOR}}" in paragraph.text:
            paragraph.text = paragraph.text.replace(r"{{NOME MENOR}}", f"{menor[0]}")
        if r"{{CPF MENOR}}" in paragraph.text:
            paragraph.text = paragraph.text.replace(r"{{CPF MENOR}}", f"{menor[1]}")
        
        if r"{{EMAIL RESPONSAVEL}}" in paragraph.text:
            paragraph.text = paragraph.text.replace(r"{{ENDERECO RESPONSAVEL}}", f"{menor[1]}")
        
        if r"{{IDADE MENOR}}" in paragraph.text:
            paragraph.text = paragraph.text.replace(r"{{IDADE MENOR}}", f"{menor[3]}")
        
        if socio != "":
            if r"{{MAT}}" in paragraph.text:
                paragraph.text = paragraph.text.replace(r"{{MAT}}", "Matrícula Sócio: " + socio)

        today = datetime.now().strftime('%d/%m/%Y')

        #Convert data para o formato brasileiro com mess por extenso
        today = datetime.now().strftime('%d de %B de %Y').replace('January', 'Janeiro')
        if r"{{DATA ASSINATURA}}" in paragraph.text:
            paragraph.text = paragraph.text.replace(r"{{DATA ASSINATURA}}", today)
        
    doc.save(fr'./to_print/{resp[0]}_{menor[0]}.docx'.strip())
    doc.save(fr'./toprint.docx')
    # time.sleep(3)
    #Imprimir o documento na impressora
    os.startfile('C:/Users/gustavo.alves/Documents/Projetos/autorizacaoAuto/toprint.docx', 'print', 'LocalSam')
    input("Documento enviado para impressão. Pressione Enter para continuar...")
    log(f"Documento gerado para {resp[0]} e {menor[0]}")

if __name__ == "__main__":
    while True:
        print_new("Bem-vindo ao sistema de autorização de menores.")
        try:
                #Convert data para o formato brasileiro com mess por extenso
            if input("Selecione o modo:\n1 - Sócio\n2 - Não sócio\nDigite o número: ") == '1':
                static = "Sócio selecionado.\n"
                database()
            else:
                static = "Não sócio selecionado.\n"
                nao_socio()
        except KeyboardInterrupt:
            print_new("Processo interrompido pelo usuário.")
            try:
                input("Pressione Enter para reiniciar e Ctrl+C para sair.")
            except KeyboardInterrupt:
                print_new("Saindo do programa.")
                break
            # break
        except Exception as e:
            print_new(f"Ocorreu um erro: {e}")
            # log(f"Erro: {e}")
            # 