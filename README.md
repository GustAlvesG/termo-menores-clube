# Central de Impressao

Junta os dois sistemas de impressao num servico so:

- **termos/** (Python/Flask, antigo `autorizacaoAuto`): pagina web que consulta a
  matricula no banco e imprime o termo preenchido para socios (ou preenchido a mao
  para nao socios).
- **whatsapp/** (Node, antigo `print-whatsapp`): recebe imagens/PDFs pelo WhatsApp e
  imprime quando a pessoa (ou voce) manda "ok".

## Uso

```
iniciar.bat
```

Antes de subir, o `iniciar.bat` verifica e instala o que faltar: Node.js LTS,
Python 3, LibreOffice e ODBC Driver 18 for SQL Server (via `winget`, pode pedir
permissao de administrador), o `termos/venv` com os pacotes do `requirements.txt`
e os pacotes Node do `whatsapp/`. Na primeira vez, cria o `.env` a partir de
`termos/.env.example` e abre no Bloco de Notas para preencher.

Sobe os dois servicos no mesmo terminal. O QR code do WhatsApp aparece ali na
primeira vez (ou quando a sessao expirar). A pagina dos termos fica em
`http://<este-computador>:8501`. Se um dos servicos cair, ele e reiniciado em 5s.
Ctrl+C encerra tudo.

Nao rode junto com os projetos antigos (`autorizacaoAuto` / `print-whatsapp`):
a porta seria disputada e as midias do WhatsApp poderiam ser impressas duas vezes.

## Configuracao

Um unico `.env` na raiz (banco, porta, impressora, imagens por folha, palavra-chave,
proxy). `PRINTER_NAME` vale para os dois lados.

## Fila de impressao unica

O WhatsApp nao imprime sozinho: ele gera o PDF carimbado em
`whatsapp/media/para_impressao/` e chama `POST /api/imprimir-pdf` no servidor de
termos, que imprime (via SumatraPDF) sob o mesmo bloqueio usado pelos termos. Assim
os trabalhos nao se misturam na impressora. A rota so aceita chamadas do proprio
computador e apenas PDFs daquela pasta. Se o servidor de termos estiver fora do ar,
o WhatsApp tenta por ~15s e depois imprime direto, para nao perder o pedido.

Todas as impressoes (web e WhatsApp) ficam em `logs/log_AAAA-MM.txt`; as do WhatsApp
aparecem com origem `WHATSAPP <remetente>`.
