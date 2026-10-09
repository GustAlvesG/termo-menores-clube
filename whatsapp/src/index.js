const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { handleIncomingMessage } = require('./mediaHandler');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    // Sem proxy configurado, acessa direto: senao o Chromium usa o proxy
    // automatico da rede (WPAD), que exige login e derruba a conexao.
    args: process.env.PROXY_SERVER
      ? [`--proxy-server=${process.env.PROXY_SERVER}`]
      : ['--no-proxy-server'],
  },
  proxyAuthentication: process.env.PROXY_USERNAME
    ? {
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
      }
    : undefined,
});

client.on('qr', (qr) => {
  console.log('Escaneie o QR code abaixo com o WhatsApp (Aparelhos conectados):');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('[print-whatsapp] Conectado. Monitorando mensagens recebidas...');
});

client.on('auth_failure', (msg) => {
  console.error('[print-whatsapp] Falha na autenticacao:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('[print-whatsapp] Cliente desconectado:', reason);
});

// 'message_create' cobre tanto mensagens recebidas quanto as enviadas pelo
// proprio dono do numero (fromMe) - usado para permitir que o "ok" tambem
// seja mandado direto do celular, sem depender de quem enviou os documentos.
client.on('message_create', async (message) => {
  try {
    await handleIncomingMessage(message);
  } catch (err) {
    console.error('[print-whatsapp] Erro ao processar mensagem:', err);
  }
});

client.initialize();
