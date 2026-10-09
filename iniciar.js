// Inicializador da Central de Impressao: sobe o servidor de termos (Python/Flask)
// e o monitor do WhatsApp (Node), reiniciando qualquer um que cair.
// Uso: node iniciar.js   (ou iniciar.bat)
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const envArquivo = path.join(RAIZ, '.env');
if (fs.existsSync(envArquivo)) process.loadEnvFile(envArquivo);

const LOGS_DIR = path.join(RAIZ, 'logs');
fs.mkdirSync(LOGS_DIR, { recursive: true });
process.env.LOGS_DIR = LOGS_DIR;
process.env.PYTHONUNBUFFERED = '1';

const ESPERA_REINICIO_MS = 5000;
let encerrando = false;
const filhos = new Map();

const servicos = [
  {
    nome: 'termos',
    cmd: path.join(RAIZ, 'termos', 'venv', 'Scripts', 'python.exe'),
    args: ['servidor.py'],
    cwd: path.join(RAIZ, 'termos'),
  },
  {
    nome: 'whatsapp',
    cmd: process.execPath,
    args: [path.join('src', 'index.js')],
    cwd: path.join(RAIZ, 'whatsapp'),
    // Se o Node do WhatsApp cair, o Chromium dele fica orfao segurando a sessao
    // (.wwebjs_auth) e o proximo inicio falha com EBUSY. Fecha antes de subir.
    antes: () => encerrarOrfaos(path.join(RAIZ, 'whatsapp', '.wwebjs_auth')),
  },
];

function encerrarOrfaos(trechoLinhaDeComando) {
  const filtro = trechoLinhaDeComando.replace(/'/g, "''");
  spawnSync('powershell.exe', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*${filtro}*' } | ` +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'],
  { stdio: 'ignore' });
}

// Mata o processo e todos os filhos dele (ex.: o Chromium aberto pelo WhatsApp).
function matarArvore(filho) {
  spawnSync('taskkill', ['/PID', String(filho.pid), '/T', '/F'], { stdio: 'ignore' });
}

function registrar(mensagem) {
  const agora = new Date().toLocaleString('pt-BR');
  console.log(`[central ${agora}] ${mensagem}`);
}

function iniciar(servico) {
  registrar(`Iniciando ${servico.nome}...`);
  if (servico.antes) servico.antes();
  // stdio herdado: o QR code do WhatsApp aparece direto neste terminal.
  const filho = spawn(servico.cmd, servico.args, { cwd: servico.cwd, stdio: 'inherit' });
  filhos.set(servico.nome, filho);

  filho.on('error', (err) => registrar(`Falha ao iniciar ${servico.nome}: ${err.message}`));
  filho.on('exit', (codigo) => {
    filhos.delete(servico.nome);
    if (encerrando) return;
    registrar(`${servico.nome} parou (codigo ${codigo}). Reiniciando em ${ESPERA_REINICIO_MS / 1000}s...`);
    setTimeout(() => !encerrando && iniciar(servico), ESPERA_REINICIO_MS);
  });
}

function encerrar() {
  if (encerrando) return;
  encerrando = true;
  registrar('Encerrando...');
  for (const filho of filhos.values()) matarArvore(filho);
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

servicos.forEach(iniciar);
