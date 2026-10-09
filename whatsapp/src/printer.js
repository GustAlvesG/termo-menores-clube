const printerLib = require('pdf-to-printer');
const config = require('./config');

const TENTATIVAS = 5;
const ESPERA_MS = 3000;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pede ao servidor de termos (Python) para imprimir o PDF. Assim midias do
 * WhatsApp e termos da web passam pela mesma fila e nao se misturam na impressora.
 * @returns {Promise<boolean>} false se o servidor nao respondeu (fora do ar)
 */
async function imprimirViaCentral(pdfPath, remetente) {
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    let resp;
    try {
      resp = await fetch(`${config.centralUrl}/api/imprimir-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arquivo: pdfPath, remetente }),
      });
    } catch {
      console.warn(`[print-whatsapp] Servidor de termos indisponivel (tentativa ${tentativa}/${TENTATIVAS}).`);
      await esperar(ESPERA_MS);
      continue;
    }
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(dados.erro || `Servidor de termos respondeu ${resp.status}`);
    }
    return true;
  }
  return false;
}

/**
 * Envia um arquivo PDF para a impressora padrao (ou a definida em config.printerName).
 * @param {string} pdfPath caminho absoluto do PDF ja carimbado
 * @param {string} remetente identificador de quem enviou (vai para o log)
 */
async function printPdf(pdfPath, remetente) {
  if (await imprimirViaCentral(pdfPath, remetente)) return;

  // Servidor de termos fora do ar: imprime direto para nao perder o pedido.
  console.warn('[print-whatsapp] Imprimindo direto, fora da fila unica.');
  const options = {};
  if (config.printerName) {
    options.printer = config.printerName;
  }
  await printerLib.print(pdfPath, options);
}

module.exports = { printPdf };
