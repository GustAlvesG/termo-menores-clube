const fs = require('fs');
const path = require('path');
const config = require('./config');
const { buildCombinedPdf } = require('./pdfStamp');
const { printPdf } = require('./printer');

// Documentos acumulados por remetente, aguardando a palavra-chave de impressao.
// sender -> Array<{ type: 'image'|'pdf', buffer, mimetype, timestamp, identifier }>
const pendingQueues = new Map();

// Rotulo "Nome - Telefone" ativo por remetente, enquanto nao chega o "ok".
// sender -> { name: string, phone: string }
const labelOverrides = new Map();

function ensureDirs() {
  for (const dir of [config.mediaDir, config.rawDir, config.stampedDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitize(text) {
  return String(text).replace(/[^\d+]/g, '');
}

const COMBINING_MARKS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g');

function sanitizeFilename(text) {
  return String(text)
    .normalize('NFKD')
    .replace(COMBINING_MARKS_REGEX, '') // remove acentos (marcas de combinacao apos NFKD)
    .replace(/[^\w+-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

/**
 * Extrai o numero de telefone do contato ao qual a mensagem pertence (ex:
 * "5511999999999@c.us" -> "5511999999999"), independente de quem escreveu:
 * - Mensagem recebida: usa message.author (remetente real em grupos) com
 *   fallback para message.from (o proprio contato, em conversas privadas).
 * - Mensagem enviada por voce mesmo (message.fromMe, ex: "ok" digitado direto
 *   no celular): message.from passa a ser a SUA propria conta, entao o
 *   contato correto vem de message.to (o chat onde voce escreveu).
 *
 * O WhatsApp vem migrando contatos para o esquema "LID" (Linked ID), onde o id
 * chega como "<numero interno opaco>@lid" em vez de "<telefone>@c.us" - nesse
 * caso o numero real precisa ser resolvido via client.getContactLidAndPhone().
 * @param {import('whatsapp-web.js').Message} message
 */
async function extractSenderNumber(message) {
  const rawId = message.fromMe ? message.to : message.author || message.from;
  const [user, server] = String(rawId).split('@');

  if (server !== 'lid') {
    return sanitize(user);
  }

  const [resolved] = await message.client.getContactLidAndPhone([rawId]);
  if (resolved && resolved.pn) {
    return sanitize(resolved.pn.split('@')[0]);
  }

  console.warn(`[print-whatsapp] Nao foi possivel resolver o telefone real do LID ${rawId}`);
  return sanitize(user);
}

/**
 * Reconhece uma mensagem de texto no formato "Nome - Telefone" (o separador
 * precisa ser " - ", com espacos, para nao confundir com um "-" que faca
 * parte do proprio telefone, ex: "Joao - (11) 98888-7777").
 * @param {string} body
 * @returns {?{name: string, phone: string}}
 */
function parseNameLabel(body) {
  const text = String(body).trim();
  const separatorIndex = text.indexOf(' - ');
  if (separatorIndex <= 0) return null;

  const name = text.slice(0, separatorIndex).trim();
  const phoneRaw = text.slice(separatorIndex + 3).trim();
  const phoneDigits = phoneRaw.replace(/\D/g, '');

  if (!name || phoneDigits.length < 8) return null;
  return { name, phone: phoneDigits };
}

function extensionFor(mimetype) {
  if (mimetype.includes('png')) return 'png';
  if (mimetype.includes('pdf')) return 'pdf';
  return 'jpg';
}

function isPrintableMedia(message) {
  if (!message.hasMedia) return false;
  if (message.type === 'image') return true;
  if (message.type === 'document') return true; // mimetype confirmado apos download
  return false;
}

function isPrintTrigger(message) {
  if (message.hasMedia || !message.body) return false;
  return message.body.trim().toLowerCase() === config.printKeyword.toLowerCase();
}

function saveRaw(buffer, mimetype, identifier, timestamp) {
  const baseName = `${timestamp}_${sanitizeFilename(identifier)}_${Date.now()}`;
  const rawPath = path.join(config.rawDir, `${baseName}.${extensionFor(mimetype)}`);
  fs.writeFileSync(rawPath, buffer);
}

/**
 * Guarda a midia recebida na fila do remetente, sem imprimir - a fila fica
 * parada ate a pessoa mandar a palavra-chave de impressao (ex: "ok").
 * Se houver um rotulo "Nome - Telefone" ativo para esse remetente, a midia e
 * identificada por esse rotulo em vez do numero de quem esta enviando.
 * @param {import('whatsapp-web.js').Message} message
 */
async function queueIncomingMedia(message) {
  const media = await message.downloadMedia();
  if (!media) return;

  const isImage = media.mimetype.startsWith('image/');
  const isPdf = media.mimetype === 'application/pdf';
  if (!isImage && !isPdf) return; // ignora audio, video, vcard, etc.

  ensureDirs();

  const sender = await extractSenderNumber(message);
  const timestamp = message.timestamp || Math.floor(Date.now() / 1000);
  const buffer = Buffer.from(media.data, 'base64');

  const override = labelOverrides.get(sender);
  const identifier = override ? `${override.name} - ${override.phone}` : sender;

  saveRaw(buffer, media.mimetype, identifier, timestamp);

  if (!pendingQueues.has(sender)) {
    pendingQueues.set(sender, []);
  }
  pendingQueues.get(sender).push({
    type: isPdf ? 'pdf' : 'image',
    buffer,
    mimetype: media.mimetype,
    timestamp,
    identifier,
  });

  console.log(
    `[print-whatsapp] ${identifier}: documento acumulado (${pendingQueues.get(sender).length} na fila). Envie "${config.printKeyword}" para imprimir.`,
  );
}

/**
 * Une tudo que estiver acumulado na fila do remetente num unico PDF e envia
 * para a impressora padrao. Disparado quando a pessoa manda a palavra-chave,
 * que tambem reseta qualquer rotulo "Nome - Telefone" ativo para esse numero.
 * @param {import('whatsapp-web.js').Message} message
 */
async function printQueue(message) {
  const sender = await extractSenderNumber(message);
  labelOverrides.delete(sender);

  const queue = pendingQueues.get(sender);
  if (!queue || queue.length === 0) {
    console.log(`[print-whatsapp] ${sender}: nada na fila para imprimir.`);
    return;
  }

  pendingQueues.delete(sender);

  const firstTimestamp = queue[0].timestamp;
  const stampedBuffer = await buildCombinedPdf(queue, config.imagesPerPage);

  const stampedPath = path.join(config.stampedDir, `${firstTimestamp}_${sender}.pdf`);
  fs.writeFileSync(stampedPath, stampedBuffer);

  console.log(`[print-whatsapp] Imprimindo ${queue.length} documento(s) de ${sender} -> ${stampedPath}`);
  await printPdf(stampedPath, queue[0].identifier);

  // if (config.confirmOnWhatsApp) {
  //   await message.reply('Recebido e enviado para impressao.');
  // }
}

/**
 * Verifica se a mensagem de texto e um rotulo "Nome - Telefone" e, se for,
 * passa a identificar as proximas midias desse remetente por esse rotulo
 * (ate o "ok", que reseta - ver `printQueue`).
 * @param {import('whatsapp-web.js').Message} message
 */
async function maybeSetLabelOverride(message) {
  if (message.hasMedia || !message.body) return;

  const parsed = parseNameLabel(message.body);
  if (!parsed) return;

  const sender = await extractSenderNumber(message);
  labelOverrides.set(sender, parsed);

  console.log(
    `[print-whatsapp] ${sender}: proximas midias serao identificadas como "${parsed.name} - ${parsed.phone}" ate o "${config.printKeyword}".`,
  );
}

/**
 * Processa uma mensagem (recebida ou enviada por voce mesmo):
 * - Imagens e PDFs recebidos sao acumulados na fila do remetente
 *   (identificados pelo rotulo "Nome - Telefone" ativo, se houver, ou pelo
 *   proprio numero).
 * - A palavra-chave de impressao (config.printKeyword, ex: "ok") une tudo
 *   num unico PDF, envia para a impressora e reseta o rotulo ativo. Pode ser
 *   mandada por quem enviou os documentos OU por voce mesmo, direto do
 *   celular, na conversa com essa pessoa - as duas formas equivalem.
 * - Uma mensagem de texto no formato "Nome - Telefone" ativa esse rotulo.
 *   So se aplica a mensagens recebidas (nao faz sentido voce rotular a si
 *   mesmo enviando essa mensagem para o contato).
 * @param {import('whatsapp-web.js').Message} message
 */
async function handleIncomingMessage(message) {
  if (message.fromMe) {
    if (isPrintTrigger(message)) {
      await printQueue(message);
    }
    return;
  }

  if (isPrintableMedia(message)) {
    await queueIncomingMedia(message);
    return;
  }
  if (isPrintTrigger(message)) {
    await printQueue(message);
    return;
  }
  await maybeSetLabelOverride(message);
}

module.exports = { handleIncomingMessage };
