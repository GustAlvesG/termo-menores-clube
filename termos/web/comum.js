// Utilitários compartilhados pelas páginas.
const $ = (sel) => document.querySelector(sel);

// Cria elemento com texto seguro (nunca interpreta HTML vindo do servidor).
function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const f of filhos) if (f != null) e.append(f);
  return e;
}

function alerta(tipo, texto) {
  return el("div", { class: `alerta ${tipo}` }, texto);
}

async function api(url, opcoes = {}) {
  let resp;
  try {
    resp = await fetch(url, opcoes);
  } catch {
    throw Object.assign(new Error("Sem conexão com o servidor. Verifique o Wi-Fi."), { status: 0 });
  }
  let dados = {};
  try { dados = await resp.json(); } catch { /* resposta sem JSON */ }
  if (!resp.ok) {
    throw Object.assign(new Error(dados.erro || `Erro ${resp.status}`), { status: resp.status, dados });
  }
  return dados;
}

const guardado = {
  ler(chave) { try { return localStorage.getItem(chave) || ""; } catch { return ""; } },
  gravar(chave, valor) { try { localStorage.setItem(chave, valor); } catch { /* sem storage */ } },
};

let _toastTimer;
function toast(texto, ms = 3500) {
  const t = $("#toast");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => (t.hidden = true), ms);
}
