const fs = require('fs');
const path = require('path');

// .env compartilhado da Central de Impressao (variaveis ja definidas tem prioridade).
const envCentral = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envCentral)) process.loadEnvFile(envCentral);

module.exports = {
  // Pasta raiz onde as midias originais e os PDFs carimbados sao salvos
  mediaDir: path.join(__dirname, '..', 'media'),
  rawDir: path.join(__dirname, '..', 'media', 'recebidos'),
  stampedDir: path.join(__dirname, '..', 'media', 'para_impressao'),

  // Nome exato da impressora (Painel de Controle > Dispositivos e Impressoras).
  // Deixe null/undefined para usar a impressora padrao do Windows.
  printerName: process.env.PRINTER_NAME || null,

  // Quantas imagens colocar lado a lado em cada folha (grade), para economizar papel.
  imagesPerPage: Number(process.env.IMAGES_PER_PAGE) || 4,

  // Palavra-chave que o remetente manda para fechar a fila e imprimir tudo
  // que foi acumulado ate ali. Comparada sem diferenciar maiusculas/minusculas.
  printKeyword: process.env.PRINT_KEYWORD || 'ok',

  // Servidor de termos (Python): as impressoes passam pela fila unica dele.
  centralUrl: `http://127.0.0.1:${process.env.APP_PORT || 8501}`,

  // Envia uma mensagem de confirmacao de volta para quem enviou a midia
  confirmOnWhatsApp: true,
};
