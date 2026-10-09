"""Servidor web do Emissor de Autorizações.

Desenvolvimento:  venv\\Scripts\\python servidor.py --debug
Produção:         venv\\Scripts\\python servidor.py   (ou iniciar_servidor.bat / .exe)
"""
import json
import os
import platform
import sys

from flask import Flask, jsonify, request, send_from_directory

from autorizacao import (TAGS_CONHECIDAS, ErroUsuario, SistemaAutorizacao)

# Arquivos da interface: dentro do pacote do PyInstaller, ou ao lado deste arquivo.
WEB_DIR = os.path.join(getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__))), "web")

app = Flask(__name__, static_folder=None, template_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # uploads de até 10 MB
sistema = SistemaAutorizacao()


@app.errorhandler(ErroUsuario)
def erro_usuario(e):
    return jsonify(erro=str(e)), 400


@app.errorhandler(Exception)
def erro_geral(e):
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return jsonify(erro=e.description), e.code
    sistema.log("ERRO", f"{request.method} {request.path} | {e!r}", request.remote_addr)
    return jsonify(erro=f"Erro interno no servidor: {e}"), 500


# --- páginas ---
@app.get("/")
def pagina_inicial():
    return send_from_directory(WEB_DIR, "index.html")


@app.get("/modelos")
def pagina_modelos():
    return send_from_directory(WEB_DIR, "modelos.html")


@app.get("/web/<path:arquivo>")
def arquivos_web(arquivo):
    return send_from_directory(WEB_DIR, arquivo)


# --- API ---
@app.get("/api/status")
def status():
    return jsonify(
        modelos=sistema.listar_templates(),
        libreoffice=sistema.localizar_soffice() is not None,
        servidor=platform.node(),
    )


@app.get("/api/modelos/validar")
def validar_modelo():
    faltantes, desconhecidas = sistema.validar_template(request.args.get("nome", ""))
    return jsonify(faltantes=faltantes, desconhecidas=desconhecidas)


@app.get("/api/socio/<mat>")
def buscar_socio(mat):
    pessoas = sistema.buscar_dados(mat)
    if pessoas is None:
        return jsonify(erro=f"Matrícula {mat} não encontrada."), 404
    return jsonify(matricula=mat, pessoas=pessoas)


def _pessoa_da_matricula(mat, nome, maior_de_idade):
    pessoas = sistema.buscar_dados(mat) or []
    for p in pessoas:
        if p["nome"] == nome and p["idade"] is not None and (p["idade"] >= 18) == maior_de_idade:
            return p
    raise ErroUsuario(f"'{nome}' não encontrado(a) na matrícula {mat}.")


@app.post("/api/imprimir")
def imprimir():
    dados = request.get_json(silent=True) or {}
    modelo = dados.get("modelo", "")
    impressora = (dados.get("impressora") or "").strip() or os.getenv("PRINTER_NAME") or None

    if dados.get("tipo") == "socio":
        # Os dados do sócio são relidos do banco: o celular envia só matrícula e nome.
        mat = sistema.validar_matricula(dados.get("matricula"))
        resp = _pessoa_da_matricula(mat, dados.get("responsavel", ""), True)
        menor = _pessoa_da_matricula(dados.get("matricula_menor") or mat, dados.get("menor", ""), False)
        mat_doc = mat
    else:
        r, m = dados.get("responsavel") or {}, dados.get("menor") or {}
        resp = {k: str(r.get(k, "")).strip() for k in ("nome", "cpf", "endereco", "rg", "email")}
        menor = {k: str(m.get(k, "")).strip() for k in ("nome", "cpf", "rg")}
        try:
            menor["idade"] = int(m.get("idade"))
        except (TypeError, ValueError):
            raise ErroUsuario("Informe a idade do menor.")
        if not 0 <= menor["idade"] <= 17:
            raise ErroUsuario("A idade do menor deve estar entre 0 e 17 anos.")
        if not resp["nome"] or not menor["nome"]:
            raise ErroUsuario("Os nomes do responsável e do menor são obrigatórios.")
        mat_doc = "MANUAL"

    if not sistema.verificar_parentesco(resp["nome"], menor["nome"]) and not dados.get("confirmar_divergencia"):
        return jsonify(divergencia=True,
                       erro="Os sobrenomes do responsável e do menor não conferem."), 409

    caminho, nome_arq = sistema.gerar_documento(modelo, resp, menor, mat_doc)
    sistema.log("PEDIDO", f"{nome_arq} | impressora={impressora or 'PADRÃO'}", request.remote_addr)
    sucesso, msg = sistema.imprimir(caminho, impressora)
    if not sucesso:
        return jsonify(erro=f"Documento gerado, mas a impressão falhou: {msg}", arquivo=nome_arq), 502
    return jsonify(mensagem=msg, arquivo=nome_arq)


@app.post("/api/imprimir-pdf")
def imprimir_pdf():
    """Usado pelo processo do WhatsApp (mesma máquina) para imprimir na fila única."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify(erro="Acesso permitido apenas localmente."), 403
    dados = request.get_json(silent=True) or {}
    origem = f"WHATSAPP {dados.get('remetente') or '?'}"
    sucesso, msg = sistema.imprimir_pdf(dados.get("arquivo"), os.getenv("PRINTER_NAME") or None, origem)
    if not sucesso:
        return jsonify(erro=msg), 502
    return jsonify(mensagem=msg)


@app.post("/api/modelos/analisar")
def analisar_modelo():
    arquivo = request.files.get("arquivo")
    if not arquivo or not arquivo.filename.lower().endswith(".docx"):
        raise ErroUsuario("Envie um arquivo .docx.")
    return jsonify(campos=sistema.analisar_linhas(arquivo.read()), tags=TAGS_CONHECIDAS)


@app.post("/api/modelos")
def salvar_modelo():
    arquivo = request.files.get("arquivo")
    if not arquivo:
        raise ErroUsuario("Envie o arquivo .docx novamente.")
    try:
        mapeamento = json.loads(request.form.get("mapeamento", "[]"))
    except json.JSONDecodeError:
        raise ErroUsuario("Mapeamento inválido.")
    nome = request.form.get("nome", "")
    if not nome.strip():
        raise ErroUsuario("Digite um nome para o modelo.")
    salvo = sistema.criar_novo_template(arquivo.read(), mapeamento, nome)
    return jsonify(mensagem=f"Modelo '{salvo}' salvo.", nome=salvo)


def main():
    host = os.getenv("APP_HOST", "0.0.0.0")
    porta = int(os.getenv("APP_PORT", "8501"))
    if "--debug" in sys.argv:
        app.run(host=host, port=porta, debug=True)
        return
    # No Windows o waitress consegue dividir a porta com outro programa sem dar erro,
    # e os acessos caem no programa antigo. Recusa subir se a porta já responde.
    import socket
    with socket.socket() as s:
        s.settimeout(1)
        if s.connect_ex(("127.0.0.1", porta)) == 0:
            print(f"ERRO: a porta {porta} já está em uso por outro programa "
                  f"(ex.: o Streamlit ou o autorizacaoAuto antigo). Feche-o e tente de novo.")
            sys.exit(1)

    from waitress import serve
    print(f"Emissor de Autorizações rodando em http://{platform.node()}:{porta}  (Ctrl+C para parar)")
    serve(app, host=host, port=porta, threads=8)


if __name__ == "__main__":
    main()
