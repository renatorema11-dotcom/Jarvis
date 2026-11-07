/*
 * holo-apps.js — o mural de apps do laboratório holográfico (holo.js).
 *
 * Mostra os programas do menu Iniciar do PC, com os ícones de verdade, numa parede curva de
 * vidro. Com a mão: aponta o dedo para mirar e faz pinça (ou segura parado um instante) para
 * abrir; mão aberta deslizando troca de página. Com o mouse é só clicar. Quem lista e abre os
 * programas é o Jarvis PC (pc/apps.py), pelas funções listar() e abrir() que o console passa.
 */
const CSS = `
.holo-apps{ position:absolute; left:50%; top:118px; bottom:96px; width:min(1180px, calc(100% - 80px)); transform:translateX(-50%); z-index:2;
  display:flex; flex-direction:column; align-items:center; gap:14px; pointer-events:none; }
.holo-apps[hidden]{ display:none; }
.holo-apps > *{ pointer-events:auto; }
.holo-apps-topo{ display:flex; gap:18px; align-items:baseline; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:3px; color:#4de8f0; }
.holo-apps-topo b{ font-family:'Orbitron',sans-serif; font-size:12px; letter-spacing:4px; color:#e9f7f9; }
.holo-apps-palco{ flex:1; width:100%; display:grid; grid-template-columns:repeat(var(--colunas,6), minmax(0,1fr)); grid-auto-rows:minmax(0,1fr); gap:18px 16px;
  perspective:1300px; perspective-origin:50% 40%; align-content:center; }
.holo-app{ --c:0; position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; min-height:0; padding:16px 8px 12px;
  background:linear-gradient(160deg, rgba(20,48,64,0.55), rgba(4,14,22,0.42)); border:1px solid rgba(77,232,240,0.2); border-radius:6px;
  color:#cfe7ec; cursor:pointer; backdrop-filter:blur(6px); transform-style:preserve-3d;
  transform:translateZ(calc(var(--c) * var(--c) * -26px)) rotateY(calc(var(--c) * -7deg));
  transition:transform .25s cubic-bezier(.2,.8,.2,1), border-color .2s, box-shadow .2s, background .2s; animation:holo-app-entra .5s both; animation-delay:calc(var(--i) * 18ms); }
@keyframes holo-app-entra{ from{ opacity:0; filter:blur(6px); } to{ opacity:1; filter:none; } }
.holo-app::before{ content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background:repeating-linear-gradient(to bottom, rgba(143,243,247,0.05) 0 1px, transparent 1px 3px); opacity:.6; }
.holo-app img, .holo-app .holo-app-letra{ width:54px; height:54px; object-fit:contain; filter:drop-shadow(0 0 10px rgba(77,232,240,0.35)); transition:transform .25s; }
.holo-app .holo-app-letra{ display:grid; place-items:center; border:1px solid rgba(77,232,240,0.5); border-radius:12px; font-family:'Orbitron',sans-serif; font-size:22px; color:#8ff3f7; }
.holo-app span{ max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:'Rajdhani',sans-serif; font-weight:600; font-size:14px; letter-spacing:.5px; }
.holo-app:hover, .holo-app.mirado{ border-color:#4de8f0; background:linear-gradient(160deg, rgba(40,96,120,0.65), rgba(6,24,34,0.55));
  box-shadow:0 0 26px rgba(77,232,240,0.35), inset 0 0 18px rgba(77,232,240,0.15);
  transform:translateZ(calc(var(--c) * var(--c) * -26px + 46px)) rotateY(calc(var(--c) * -7deg)); }
.holo-app:hover img, .holo-app.mirado img{ transform:scale(1.12); }
.holo-app .holo-app-carga{ position:absolute; left:10%; right:10%; bottom:5px; height:2px; background:rgba(77,232,240,0.15); border-radius:2px; overflow:hidden; opacity:0; }
.holo-app.mirado .holo-app-carga{ opacity:1; }
.holo-app .holo-app-carga::after{ content:""; position:absolute; inset:0; transform-origin:0 50%; transform:scaleX(var(--carga,0)); background:#4de8f0; box-shadow:0 0 8px #4de8f0; }
.holo-app.abrindo{ animation:holo-app-abre .7s ease forwards; border-color:#5dfca0; }
@keyframes holo-app-abre{ 40%{ transform:translateZ(140px) scale(1.08); box-shadow:0 0 60px rgba(93,252,160,0.7); } 100%{ transform:translateZ(0); } }
.holo-apps-rodape{ display:flex; align-items:center; gap:12px; }
.holo-apps-paginas{ display:flex; gap:6px; }
.holo-apps-paginas i{ width:22px; height:3px; background:rgba(77,232,240,0.22); border-radius:2px; transition:background .2s, box-shadow .2s; }
.holo-apps-paginas i.ativo{ background:#4de8f0; box-shadow:0 0 8px #4de8f0; }
.holo-apps-aviso{ min-height:1.3em; font-family:'Share Tech Mono',monospace; font-size:12px; letter-spacing:2px; color:#8ff3f7; text-align:center; }
.holo-apps-aviso.erro{ color:#ffa24c; }
body .holo[data-visual="real"] .holo-app{ background:linear-gradient(160deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); border-color:rgba(255,255,255,0.18); color:#f2f6f8; }
body .holo[data-visual="real"] .holo-app img{ filter:drop-shadow(0 6px 10px rgba(0,0,0,0.55)); }
body .holo[data-visual="real"] .holo-app::before{ opacity:0; }
@media (max-width: 900px){
  .holo-apps{ top:112px; bottom:120px; width:calc(100% - 24px); }
  .holo-apps-topo{ flex-wrap:wrap; justify-content:center; gap:4px 12px; }
  .holo-apps-palco{ gap:10px; }
  .holo-app{ padding:10px 4px 8px; transform:none; }
  .holo-app img, .holo-app .holo-app-letra{ width:40px; height:40px; }
  .holo-app span{ font-size:12px; }
}
`;

export function criarMuralApps({ raiz, listar, abrir, som, aoEvento }) {
  if (!document.getElementById('holo-apps-estilo')) {
    const estilo = document.createElement('style');
    estilo.id = 'holo-apps-estilo';
    estilo.textContent = CSS;
    document.head.append(estilo);
  }
  const el = document.createElement('section');
  el.className = 'holo-apps';
  el.hidden = true;
  el.setAttribute('aria-label', 'Apps do PC');
  el.innerHTML = `
    <div class="holo-apps-topo"><b>APPS DO PC</b><span data-a="info">—</span></div>
    <div class="holo-apps-palco" data-a="palco"></div>
    <div class="holo-apps-rodape">
      <button class="holo-btn" type="button" data-a="antes" data-mira aria-label="Página anterior">◂</button>
      <div class="holo-apps-paginas" data-a="paginas"></div>
      <button class="holo-btn" type="button" data-a="depois" data-mira aria-label="Próxima página">▸</button>
    </div>
    <div class="holo-apps-aviso" data-a="aviso"></div>`;
  raiz.append(el);
  const a = {};
  for (const x of el.querySelectorAll('[data-a]')) a[x.dataset.a] = x;

  const estado = { apps: [], pagina: 0, carregado: false, carregando: null, abrindo: false, erro: '' };
  const colunas = () => (innerWidth > 1300 ? 6 : innerWidth > 900 ? 5 : 3);
  const porPagina = () => colunas() * 3;
  const paginas = () => Math.max(1, Math.ceil(estado.apps.length / porPagina()));

  const avisar = (texto, erro = false) => {
    a.aviso.textContent = texto;
    a.aviso.classList.toggle('erro', erro);
  };

  function desenhar() {
    const n = colunas();
    a.palco.style.setProperty('--colunas', n);
    estado.pagina = Math.max(0, Math.min(estado.pagina, paginas() - 1));
    const inicio = estado.pagina * porPagina();
    const lista = estado.apps.slice(inicio, inicio + porPagina());
    a.palco.replaceChildren(...lista.map((app, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'holo-app';
      b.dataset.mira = '';
      b.dataset.esperar = '1100';
      b.style.setProperty('--c', ((i % n) - (n - 1) / 2).toFixed(2));
      b.style.setProperty('--i', i);
      b.title = app.nome;
      if (app.icone) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = `data:image/png;base64,${app.icone}`;
        b.append(img);
      } else {
        const letra = document.createElement('div');
        letra.className = 'holo-app-letra';
        letra.textContent = app.nome.trim()[0] || '?';
        b.append(letra);
      }
      const nome = document.createElement('span');
      nome.textContent = app.nome;
      const carga = document.createElement('i');
      carga.className = 'holo-app-carga';
      b.append(nome, carga);
      b.addEventListener('click', () => lancar(app, b));
      return b;
    }));
    a.paginas.replaceChildren(...Array.from({ length: paginas() }, (_, i) => {
      const p = document.createElement('i');
      if (i === estado.pagina) p.className = 'ativo';
      return p;
    }));
    a.info.textContent = estado.apps.length ? `${estado.apps.length} PROGRAMAS · PÁGINA ${estado.pagina + 1}/${paginas()}` : '—';
  }

  async function carregar() {
    if (estado.carregado) return;
    if (estado.carregando) return estado.carregando;
    avisar('CONECTANDO AO JARVIS PC…');
    estado.carregando = (async () => {
      try {
        estado.apps = await listar();
        estado.carregado = true;
        estado.erro = '';
        avisar(estado.apps.length ? 'APONTE PARA UM APP E FAÇA PINÇA (OU SEGURE) PARA ABRIR' : 'O MENU INICIAR VEIO VAZIO');
      } catch (erro) {
        estado.erro = erro.message;
        avisar(`JARVIS PC FORA DO AR · ${erro.message}`.toUpperCase(), true);
      } finally {
        estado.carregando = null;
        desenhar();
      }
    })();
    return estado.carregando;
  }

  async function lancar(app, botao) {
    if (estado.abrindo) return;
    estado.abrindo = true;
    som.clique();
    botao?.classList.add('abrindo');
    avisar(`ABRINDO ${app.nome.toUpperCase()}…`);
    const r = await abrir(app);
    avisar(r.ok ? `${app.nome.toUpperCase()} ABERTO NO PC` : (r.mensagem || 'NÃO ABRIU').toUpperCase(), !r.ok);
    aoEvento?.(r.ok ? `abriu o ${app.nome} pelo mural de apps` : `tentou abrir o ${app.nome} pelo mural, mas falhou (${r.mensagem})`);
    setTimeout(() => {
      botao?.classList.remove('abrindo');
      estado.abrindo = false;
    }, 900);
    return r;
  }

  a.antes.addEventListener('click', () => pagina(-1));
  a.depois.addEventListener('click', () => pagina(1));
  addEventListener('resize', () => { if (!el.hidden) desenhar(); });

  function pagina(delta) {
    if (paginas() < 2) return;
    estado.pagina = (estado.pagina + delta + paginas()) % paginas();
    som.clique();
    desenhar();
  }

  // procura um app pelo nome falado ("chrome", "spotify", "vs code"...)
  function achar(nome) {
    const n = normalizar(nome);
    if (!n) return null;
    const pontos = estado.apps.map((app) => {
      const x = normalizar(app.nome);
      let s = 0;
      if (x === n) s = 100;
      else if (x.startsWith(n) || x.split(' ').includes(n)) s = 80;
      else if (x.includes(n)) s = 60;
      else if (n.split(' ').every((p) => x.includes(p))) s = 50;
      return { app, s: s + (app.favorito ? 5 : 0) };
    }).filter((p) => p.s > 0).sort((p1, p2) => p2.s - p1.s);
    return pontos[0]?.app || null;
  }

  return {
    el,
    mostrar() {
      el.hidden = false;
      desenhar();
      return carregar();
    },
    esconder() {
      el.hidden = true;
    },
    pagina,
    async abrirPorNome(nome) {
      await carregar();
      if (estado.erro) return `Não consegui listar os apps do PC: ${estado.erro}`;
      const app = achar(nome);
      if (!app) return `Não achei "${nome}" entre os ${estado.apps.length} programas do menu Iniciar.`;
      const botao = [...a.palco.querySelectorAll('.holo-app')].find((b) => b.title === app.nome);
      const r = await lancar(app, botao);
      return r?.mensagem || `Abrindo ${app.nome}.`;
    },
    resumo() {
      if (estado.erro) return `mural de apps sem conexão com o Jarvis PC (${estado.erro})`;
      const visiveis = [...a.palco.querySelectorAll('.holo-app')].map((b) => b.title);
      return `mural com ${estado.apps.length} apps do PC, página ${estado.pagina + 1} de ${paginas()} mostrando: ${visiveis.join(', ')}`;
    },
    dados: () => [['Apps', String(estado.apps.length || '—')], ['Página', `${estado.pagina + 1}/${paginas()}`], ['Jarvis PC', estado.erro ? 'FORA DO AR' : estado.carregado ? 'ONLINE' : 'CONECTANDO']],
  };
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
