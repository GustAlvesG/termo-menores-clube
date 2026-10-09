// Assistente passo a passo: uma tela por fase, botões grandes.
const TAM_MAT = 5;

let modelo = "";
let imprimindo = false;

const estado = {
  fluxo: null,          // "socio" | "manual"
  // sócio
  mat: null,            // matrícula carregada
  pessoas: [],
  resp: null,           // pessoa escolhida como responsável
  menor: null,          // { pessoa, mat }
  externa: null,        // { mat, menores } quando o menor vem de outra matrícula
  // teclado da matrícula
  matModo: "titular",   // "titular" | "menor"
  digitos: "",
  // não sócio
  idade: null,
  // servidor pediu confirmação de sobrenomes diferentes
  divergenciaServidor: false,
};

// ---------- Navegação (integrada ao botão voltar do celular) ----------
const TITULOS = {
  inicio: "Autorizações", matricula: "Matrícula", responsavel: "Responsável", menor: "Menor",
  "m-resp": "Não sócio", "m-menor": "Não sócio", "m-idade": "Não sócio",
  confirmar: "Confirmar", pronto: "Autorizações",
};
let telaAtual = "inicio";
let profundidade = 0;

function mostrar(tela) {
  telaAtual = tela;
  document.querySelectorAll(".tela").forEach((s) => (s.hidden = s.dataset.tela !== tela));
  $("#titulo").textContent = tela === "matricula" && estado.matModo === "menor" ? "Matrícula do menor" : TITULOS[tela];
  $("#btn-voltar").hidden = tela === "inicio";
  (RENDER[tela] || (() => {}))();
  $("#palco").scrollTop = 0;
  window.scrollTo(0, 0);
}

function ir(tela, { substituir = false } = {}) {
  if (substituir) history.replaceState({ tela, prof: profundidade }, "");
  else history.pushState({ tela, prof: ++profundidade }, "");
  mostrar(tela);
}

function irInicio() {
  if (profundidade > 0) history.go(-profundidade);
  else mostrar("inicio");
}

window.addEventListener("popstate", (e) => {
  const s = e.state || { tela: "inicio", prof: 0 };
  profundidade = s.prof;
  if ($("#dlg-config").open) $("#dlg-config").close();
  mostrar(s.tela);
});
$("#btn-voltar").addEventListener("click", () => history.back());

// ---------- Configurações ----------
async function carregarStatus() {
  try {
    const s = await api("/api/status");
    const sel = $("#sel-modelo");
    sel.replaceChildren(...s.modelos.map((m) => el("option", { value: m }, m.replace(/\.docx$/i, ""))));
    const salvo = guardado.ler("modelo");
    modelo = s.modelos.includes(salvo) ? salvo : (s.modelos[0] || "");
    sel.value = modelo;

    const aviso = $("#aviso-modelo");
    if (!modelo) {
      aviso.textContent = "Nenhum modelo cadastrado. Toque em ⚙️ → Cadastrar novo modelo.";
    } else if (!s.libreoffice) {
      aviso.textContent = "LibreOffice não encontrado no servidor. A impressão não vai funcionar.";
    }
    aviso.hidden = !!modelo && s.libreoffice;

    $("#status-servidor").replaceChildren(
      `Servidor: ${s.servidor} · `,
      s.libreoffice ? "LibreOffice OK" : el("strong", {}, "LibreOffice NÃO encontrado"),
    );
  } catch (e) {
    $("#aviso-modelo").hidden = false;
    $("#aviso-modelo").textContent = e.message;
  }
  atualizarInicio();
}

function atualizarInicio() {
  document.querySelectorAll(".escolha").forEach((b) => (b.disabled = !modelo));
  const chip = $("#chip-modelo");
  chip.hidden = !modelo;
  chip.textContent = `📄 ${modelo.replace(/\.docx$/i, "")}`;
}

$("#btn-config").addEventListener("click", () => $("#dlg-config").showModal());
$("#chip-modelo").addEventListener("click", () => $("#dlg-config").showModal());
$("#sel-modelo").addEventListener("change", (e) => {
  modelo = e.target.value;
  guardado.gravar("modelo", modelo);
  $("#validar-msg").replaceChildren();
  atualizarInicio();
});
$("#impressora").value = guardado.ler("impressora");
$("#impressora").addEventListener("input", (e) => guardado.gravar("impressora", e.target.value.trim()));

$("#btn-validar").addEventListener("click", async () => {
  const caixa = $("#validar-msg");
  try {
    const r = await api(`/api/modelos/validar?nome=${encodeURIComponent(modelo)}`);
    const itens = [];
    if (r.faltantes.length) itens.push(alerta("erro", `Tags faltando: ${r.faltantes.join(", ")}`));
    if (r.desconhecidas.length) itens.push(alerta("aviso", `Tags desconhecidas: ${r.desconhecidas.join(", ")}`));
    if (!itens.length) itens.push(alerta("ok", "Modelo válido!"));
    caixa.replaceChildren(...itens);
  } catch (e) {
    caixa.replaceChildren(alerta("erro", e.message));
  }
});

// ---------- Início ----------
document.querySelectorAll(".escolha").forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.ir === "socio") {
      Object.assign(estado, { fluxo: "socio", mat: null, pessoas: [], resp: null, menor: null, externa: null });
      abrirMatricula("titular");
    } else {
      estado.fluxo = "manual";
      $("#form-resp").reset();
      $("#form-menor").reset();
      ir("m-resp");
    }
  }),
);

// ---------- Matrícula (teclado na tela) ----------
function abrirMatricula(modo, opcoes) {
  estado.matModo = modo;
  estado.digitos = "";
  $("#mat-msg").replaceChildren();
  ir("matricula", opcoes);
}

function renderVisor() {
  const visor = $("#mat-visor");
  visor.replaceChildren(...Array.from({ length: TAM_MAT }, (_, i) =>
    el("span", { class: `digito${i < estado.digitos.length ? " cheio" : ""}${i === estado.digitos.length ? " atual" : ""}` },
      estado.digitos[i] || "")));
}

let buscando = false;
function tecla(t) {
  if (buscando) return;
  if (t === "apagar") estado.digitos = estado.digitos.slice(0, -1);
  else if (t === "ok") { if (estado.digitos) buscarMatricula(); return; }
  else if (estado.digitos.length < TAM_MAT) estado.digitos += t;
  $("#mat-msg").replaceChildren();
  renderVisor();
  if (estado.digitos.length === TAM_MAT) buscarMatricula();
}

$("#teclado").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tecla]");
  if (b) tecla(b.dataset.tecla);
});
document.addEventListener("keydown", (e) => {
  if (telaAtual !== "matricula" || $("#dlg-config").open) return;
  if (/^\d$/.test(e.key)) tecla(e.key);
  else if (e.key === "Backspace") tecla("apagar");
  else if (e.key === "Enter") tecla("ok");
});

function travarTeclado(sim) {
  buscando = sim;
  document.querySelectorAll("#teclado button").forEach((b) => (b.disabled = sim));
}

async function buscarMatricula() {
  const mat = estado.digitos;
  const msg = $("#mat-msg");
  msg.replaceChildren(el("p", { class: "carregando" }, "Buscando…"));
  travarTeclado(true);
  try {
    const r = await api(`/api/socio/${mat}`);
    msg.replaceChildren();
    if (estado.matModo === "titular") {
      const adultos = r.pessoas.filter((p) => p.idade != null && p.idade >= 18);
      if (!adultos.length) throw new Error(`Nenhum maior de 18 anos na matrícula ${mat}.`);
      Object.assign(estado, { mat, pessoas: r.pessoas, resp: null, menor: null, externa: null, divergenciaServidor: false });
      if (adultos.length === 1) {
        estado.resp = adultos[0];
        irMenor({ pularSeUnico: true });
      } else {
        ir("responsavel");
      }
    } else {
      const menores = r.pessoas.filter((p) => p.idade != null && p.idade < 18);
      if (!menores.length) throw new Error(`Nenhum menor de idade na matrícula ${mat}.`);
      estado.externa = { mat, menores };
      estado.divergenciaServidor = false;
      if (menores.length === 1) {
        estado.menor = { pessoa: menores[0], mat };
        ir("confirmar", { substituir: true });
      } else {
        estado.menor = null;
        ir("menor", { substituir: true });
      }
    }
  } catch (e) {
    estado.digitos = "";
    renderVisor();
    msg.replaceChildren(alerta("erro", e.message));
    if (navigator.vibrate) navigator.vibrate([60, 60, 60]);
  } finally {
    travarTeclado(false);
  }
}

// ---------- Responsável / Menor (sócio) ----------
function botaoPessoa(pessoa, aoEscolher, selecionado) {
  const det = [pessoa.idade != null ? `${pessoa.idade} anos` : "idade desconhecida",
               pessoa.cpf ? `CPF ${pessoa.cpf}` : "sem CPF"].join(" · ");
  return el("button", { type: "button", class: `pessoa${selecionado ? " sel" : ""}`, onclick: aoEscolher },
    el("span", { class: "nome" }, pessoa.nome),
    el("span", { class: "det" }, det));
}

function renderResponsavel() {
  const adultos = estado.pessoas.filter((p) => p.idade != null && p.idade >= 18);
  const semIdade = estado.pessoas.filter((p) => p.idade == null);
  const lista = $("#lista-resp");
  lista.replaceChildren(...adultos.map((p) => botaoPessoa(p, () => {
    estado.resp = p;
    estado.divergenciaServidor = false;
    irMenor({ pularSeUnico: true });
  }, estado.resp && estado.resp.nome === p.nome)));
  if (semIdade.length) {
    lista.append(el("p", { class: "dica" }, `Sem data de nascimento: ${semIdade.map((p) => p.nome).join(", ")}`));
  }
}

function menoresDisponiveis() {
  if (estado.externa) return estado.externa;
  return { mat: estado.mat, menores: estado.pessoas.filter((p) => p.idade != null && p.idade < 18) };
}

function irMenor({ pularSeUnico = false } = {}) {
  const { mat, menores } = menoresDisponiveis();
  if (pularSeUnico && menores.length === 1) {
    estado.menor = { pessoa: menores[0], mat };
    ir("confirmar");
  } else {
    ir("menor");
  }
}

function renderMenor() {
  const { mat, menores } = menoresDisponiveis();
  $("#menor-pergunta").replaceChildren("Qual é o ", el("strong", {}, "menor"), "?");
  const itens = menores.map((p) => botaoPessoa(p, () => {
    estado.menor = { pessoa: p, mat };
    estado.divergenciaServidor = false;
    ir("confirmar");
  }, estado.menor && estado.menor.mat === mat && estado.menor.pessoa.nome === p.nome));
  if (estado.externa) {
    itens.unshift(el("p", { class: "dica" }, `Menores da matrícula ${estado.externa.mat}`));
    itens.push(el("button", { type: "button", class: "link", onclick: () => {
      estado.externa = null; estado.menor = null; renderMenor();
    } }, `← Voltar para a matrícula ${estado.mat}`));
  } else if (!menores.length) {
    itens.push(el("p", { class: "vazio" }, `Nenhum menor na matrícula ${estado.mat}.`));
  }
  $("#lista-menor").replaceChildren(...itens);
}

$("#btn-outra-mat").addEventListener("click", () => abrirMatricula("menor"));

// ---------- Não sócio ----------
document.querySelectorAll("input.cpf").forEach((inp) =>
  inp.addEventListener("input", () => {
    const d = inp.value.replace(/\D/g, "").slice(0, 11);
    inp.value = d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }),
);

// Enter passa para o próximo campo; no último, avança de tela.
function ligarFormulario(form, botao, campoObrigatorio, proximo) {
  const validar = () => (botao.disabled = !$(campoObrigatorio).value.trim());
  form.addEventListener("input", validar);
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const campos = [...form.querySelectorAll("input")];
    const i = campos.indexOf(e.target);
    if (i >= 0 && i < campos.length - 1) campos[i + 1].focus();
    else if (!botao.disabled) botao.click();
  });
  botao.addEventListener("click", () => { document.activeElement.blur(); estado.divergenciaServidor = false; proximo(); });
  return validar;
}
const validarResp = ligarFormulario($("#form-resp"), $("#btn-resp-ok"), "#r-nome", () => ir("m-menor"));
const validarMenor = ligarFormulario($("#form-menor"), $("#btn-menor-ok"), "#m-nome", () => ir("m-idade"));

function renderIdade() {
  $("#grade-idade").replaceChildren(...Array.from({ length: 18 }, (_, i) =>
    el("button", { type: "button", class: estado.idade === i ? "sel" : "", onclick: () => {
      estado.idade = i;
      ir("confirmar");
    } }, String(i))));
}

function dadosManual() {
  const v = (id) => $(id).value.trim();
  return {
    responsavel: { nome: v("#r-nome"), cpf: v("#r-cpf"), endereco: v("#r-end"), email: v("#r-email") },
    menor: { nome: v("#m-nome"), cpf: v("#m-cpf"), idade: estado.idade },
  };
}

// ---------- Confirmar ----------
// Mesma regra do servidor (verificar_parentesco): algum sobrenome em comum.
const IGNORAR = new Set(["da", "de", "do", "das", "dos", "e", "junior", "neto", "filho",
                         "sobrinho", "segundo", "terceiro"]);
function parentesco(a, b) {
  const partes = (n) => new Set(String(n).toLowerCase().split(/\s+/).filter((p) => p && !IGNORAR.has(p)));
  const pa = partes(a);
  return [...partes(b)].some((p) => pa.has(p));
}

function resumo() {
  if (estado.fluxo === "socio") {
    const r = estado.resp, m = estado.menor.pessoa;
    return {
      resp: r.nome, respDet: r.cpf ? `CPF ${r.cpf}` : "sem CPF",
      menor: m.nome, menorDet: [`${m.idade} anos`, m.cpf ? `CPF ${m.cpf}` : "sem CPF",
                                estado.menor.mat !== estado.mat ? `matrícula ${estado.menor.mat}` : ""]
        .filter(Boolean).join(" · "),
      avisos: [!r.cpf && "Responsável sem CPF: o campo ficará em branco.",
               !m.cpf && "Menor sem CPF: o campo ficará em branco.",
               !r.endereco && "Endereço do responsável não cadastrado."].filter(Boolean),
    };
  }
  const d = dadosManual();
  return {
    resp: d.responsavel.nome, respDet: d.responsavel.cpf ? `CPF ${d.responsavel.cpf}` : "sem CPF",
    menor: d.menor.nome, menorDet: [`${d.menor.idade} anos`, d.menor.cpf ? `CPF ${d.menor.cpf}` : "sem CPF"].join(" · "),
    avisos: [],
  };
}

function divergente() {
  const r = resumo();
  return estado.divergenciaServidor || !parentesco(r.resp, r.menor);
}

function renderConfirmar(erro) {
  const r = resumo();
  $("#cf-resp").textContent = r.resp;
  $("#cf-resp-det").textContent = r.respDet;
  $("#cf-menor").textContent = r.menor;
  $("#cf-menor-det").textContent = r.menorDet;

  const avisos = r.avisos.map((a) => alerta("aviso", a));
  const div = divergente();
  if (div) avisos.unshift(alerta("erro", "⚠️ Os sobrenomes não conferem. Confira antes de imprimir."));
  if (erro) avisos.unshift(alerta("erro", `❌ ${erro}`));
  $("#cf-avisos").replaceChildren(...avisos);

  const btn = $("#btn-imprimir");
  btn.disabled = imprimindo;
  btn.classList.toggle("perigo", div);
  $("#btn-imprimir-txt").textContent = imprimindo ? "Imprimindo…" : (div ? "IMPRIMIR MESMO ASSIM" : "IMPRIMIR");
}

document.querySelectorAll(".trocar").forEach((b) =>
  b.addEventListener("click", () => {
    estado.divergenciaServidor = false;
    if (b.dataset.trocar === "resp") ir(estado.fluxo === "socio" ? "responsavel" : "m-resp");
    else if (estado.fluxo === "socio") ir("menor");
    else ir("m-menor");
  }),
);

$("#btn-imprimir").addEventListener("click", async () => {
  if (imprimindo) return;
  const corpo = { modelo, impressora: guardado.ler("impressora"), confirmar_divergencia: divergente() };
  if (estado.fluxo === "socio") {
    Object.assign(corpo, { tipo: "socio", matricula: estado.mat, responsavel: estado.resp.nome,
                           menor: estado.menor.pessoa.nome, matricula_menor: estado.menor.mat });
  } else {
    Object.assign(corpo, { tipo: "manual" }, dadosManual());
  }

  imprimindo = true;
  renderConfirmar();
  try {
    const r = await api("/api/imprimir", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    });
    imprimindo = false;
    if (navigator.vibrate) navigator.vibrate(120);
    mostrarResultado(r.mensagem);
  } catch (e) {
    imprimindo = false;
    if (e.status === 409 && e.dados && e.dados.divergencia) {
      estado.divergenciaServidor = true;
      renderConfirmar();
    } else {
      renderConfirmar(e.message);
    }
  }
});

// ---------- Resultado ----------
function acao(texto, classe, aoTocar) {
  return el("button", { type: "button", class: `grande ${classe}`, onclick: aoTocar }, texto);
}

function mostrarResultado(mensagem) {
  const r = resumo();
  $("#res-det").textContent = `${r.menor} · ${mensagem}`;
  const acoes = estado.fluxo === "socio"
    ? [
        acao("👶 Outro menor, mesmo responsável", "primario", () => {
          estado.menor = null; estado.externa = null; estado.divergenciaServidor = false;
          irMenor();
        }),
        acao("🔢 Nova matrícula", "secundario", () => abrirMatricula("titular")),
      ]
    : [
        acao("👶 Outro menor, mesmo responsável", "primario", () => {
          $("#form-menor").reset(); validarMenor(); estado.idade = null; estado.divergenciaServidor = false;
          ir("m-menor");
        }),
        acao("📝 Novo responsável", "secundario", () => {
          $("#form-resp").reset(); $("#form-menor").reset(); validarResp(); validarMenor(); estado.idade = null;
          ir("m-resp");
        }),
      ];
  acoes.push(acao("🏠 Início", "secundario", irInicio));
  $("#res-acoes").replaceChildren(...acoes);
  // Substitui a confirmação: voltar a partir daqui não reimprime por engano.
  ir("pronto", { substituir: true });
}

const RENDER = {
  inicio: atualizarInicio,
  matricula: () => {
    $("#mat-pergunta").textContent = estado.matModo === "menor" ? "Matrícula do menor" : "Digite a matrícula";
    renderVisor();
  },
  responsavel: renderResponsavel,
  menor: renderMenor,
  "m-resp": () => { validarResp(); setTimeout(() => !$("#r-nome").value && $("#r-nome").focus(), 50); },
  "m-menor": () => { validarMenor(); setTimeout(() => !$("#m-nome").value && $("#m-nome").focus(), 50); },
  "m-idade": renderIdade,
  confirmar: () => {
    const incompleto = estado.fluxo === "socio" ? !estado.resp || !estado.menor : estado.idade == null;
    if (incompleto) irInicio(); // chegou aqui pelo histórico sem dados
    else renderConfirmar();
  },
};

history.replaceState({ tela: "inicio", prof: 0 }, "");
mostrar("inicio");
carregarStatus();
