# print-whatsapp

Monitora o WhatsApp (via [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js)) e, ao
receber imagens ou PDFs, acumula tudo por remetente. Quando a pessoa manda
"ok" (em qualquer combinacao de maiusculas/minusculas), o sistema une os
arquivos acumulados num unico PDF, carimba o numero do remetente e envia
automaticamente para a impressora padrao do Windows.

## Instalacao

```
npm install
```

## Uso

```
npm start
```

Na primeira execucao sera exibido um QR code no terminal — escaneie com
**WhatsApp > Aparelhos conectados**. A sessao fica salva em `.wwebjs_auth/`,
entao nas proximas vezes nao sera necessario escanear novamente.

## Como funciona

1. `src/index.js` inicializa o client do whatsapp-web.js e escuta o evento
   `message_create` (cobre tanto mensagens recebidas quanto as enviadas pelo
   proprio dono do numero, para permitir a impressao manual — ver abaixo).
2. `src/mediaHandler.js` verifica se a mensagem tem midia do tipo imagem ou PDF.
   Outros tipos (audio, video, vcard, sticker etc.) sao ignorados.
3. A midia original e salva em `media/recebidos/` e entra na fila daquele
   remetente — nada e impresso ainda, a fila so acumula.
4. Quando o mesmo remetente manda a palavra-chave de impressao (por padrao
   "ok", aceitando qualquer combinacao de maiusculas/minusculas: `ok`, `OK`,
   `Ok`, `oK` etc.), `src/pdfStamp.js` une tudo que estava na fila num unico
   PDF, na ordem de chegada:
   - **Imagens** consecutivas viram paginas em grade (varias por folha, ver
     "Economia de papel" abaixo).
   - **PDFs** sao anexados na integra logo em seguida.
   - Cada pagina final recebe um rodape carimbado com o identificador do
     remetente (numero, ou "Nome - Telefone" se um rotulo estiver ativo — ver
     abaixo), a data/hora e a numeracao de pagina.
   O resultado fica em `media/para_impressao/` e a fila desse remetente e
   limpa (o rotulo "Nome - Telefone", se houver, tambem e resetado).
5. `src/printer.js` envia esse PDF carimbado para a impressora padrao usando
   `pdf-to-printer` (baseado no SumatraPDF, ja incluso no pacote no Windows).
6. Opcionalmente, o bot responde na conversa confirmando o recebimento.

## Economia de papel (grade de imagens)

Imagens acumuladas na fila sao organizadas em grade (por padrao 2x2 = 4 por
folha) em vez de uma pagina por foto, o que reduz bastante o consumo de
papel quando a pessoa manda varias fotos antes do "ok".

## Identificar midias por "Nome - Telefone"

Se o remetente mandar uma mensagem de texto no formato `Nome - Telefone`
(por exemplo `Maria Souza - 11988887777`), as midias enviadas a partir dali
passam a ser salvas e carimbadas com esse nome/telefone em vez do numero de
quem esta enviando a mensagem — util quando alguem esta mandando documentos
em nome de outra pessoa. Esse rotulo fica ativo ate o "ok" ser enviado, que
imprime a fila e reseta o rotulo (voltando a identificar pelo numero de quem
envia). Enviar um novo `Nome - Telefone` antes do "ok" troca o rotulo e fecha
a grade de imagens atual, comecando uma nova.

O separador precisa ser um traco cercado por espacos (` - `); um traco sem
espaco dentro do proprio telefone (ex: `Joao - (11) 98888-7777`) nao confunde
o reconhecimento.

## Imprimir manualmente pelo seu proprio celular

Alem de quem enviou os documentos poder mandar "ok", voce (dono do numero
conectado) tambem pode disparar a impressao mandando "ok" direto do seu
celular, digitado na propria conversa com essa pessoa — sem precisar pedir
para ela mandar. As duas formas imprimem a mesma fila e tem o mesmo efeito
(inclusive resetando o rotulo "Nome - Telefone" ativo). Mensagens de midia ou
"Nome - Telefone" mandadas por voce mesmo sao ignoradas pelo sistema (essas
duas so fazem sentido vindas de quem esta enviando os documentos).

## Configuracao

Edite `src/config.js` ou use variaveis de ambiente:

- `PRINTER_NAME`: nome exato da impressora (como aparece em "Dispositivos e
  impressoras"). Se nao for definido, usa a impressora padrao do sistema.
- `IMAGES_PER_PAGE` (padrao `4`): quantas imagens colocar em cada folha.
- `PRINT_KEYWORD` (padrao `ok`): palavra que fecha a fila e dispara a
  impressao (comparacao ignora maiusculas/minusculas e espacos nas bordas).

```
set PRINTER_NAME=HP LaserJet
set IMAGES_PER_PAGE=6
npm start
```

> Atencao: a fila de cada remetente fica apenas em memoria. Se o processo for
> reiniciado antes do "ok", os arquivos ja enviados nao sao impressos (mas os
> originais continuam salvos em `media/recebidos/`, ja que sao gravados assim
> que chegam).

## Estrutura de pastas geradas

```
media/
  recebidos/        arquivos originais recebidos (jpg/png/pdf)
  para_impressao/   PDFs ja carimbados, prontos/enviados para impressao
```

Essas pastas e a sessao do WhatsApp (`.wwebjs_auth/`) nao sao versionadas
(veja `.gitignore`).
