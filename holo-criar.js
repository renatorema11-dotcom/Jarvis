/*
 * holo-criar.js — o ateliê do laboratório holográfico (holo.js): criar coisas com as mãos.
 *
 *   dedo apontado          -> desenha no ar um traço de luz (ferramenta DESENHAR)
 *   pinça + afastar        -> cria uma forma e define o tamanho (ferramenta FORMAS)
 *   pinça perto de algo    -> pega e move (ferramenta MOVER, ou em qualquer uma se pegar um objeto)
 *   punho / duas mãos      -> giram e ampliam a criação inteira (feito pelo holo.js)
 * Com o mouse: arrastar desenha ou move, clique cria a forma, rodinha amplia.
 * No holograma tudo é luz; na foto real as formas viram vidro e metal. Fica salvo no navegador.
 */
import * as THREE from 'three';

const CHAVE = 'jarvis.criacao';
export const CORES = { ciano: '#4de8f0', laranja: '#ffa24c', verde: '#5dfca0', violeta: '#b794ff', branco: '#e8fdff', vermelho: '#ff5a4c' };
export const FORMAS = {
  cubo: { nome: 'CUBO', icone: '◻', geo: () => new THREE.BoxGeometry(1, 1, 1) },
  // nas formas redondas a grade do holograma sai de uma versão com menos faces
  esfera: { nome: 'ESFERA', icone: '◯', geo: () => new THREE.SphereGeometry(0.6, 40, 28), grade: () => new THREE.SphereGeometry(0.6, 16, 10) },
  anel: { nome: 'ANEL', icone: '◎', geo: () => new THREE.TorusGeometry(0.5, 0.16, 24, 72), grade: () => new THREE.TorusGeometry(0.5, 0.16, 8, 24) },
  cristal: { nome: 'CRISTAL', icone: '◇', geo: () => new THREE.IcosahedronGeometry(0.62, 0) },
  piramide: { nome: 'PIRÂMIDE', icone: '△', geo: () => new THREE.ConeGeometry(0.62, 1, 4) },
  cilindro: { nome: 'CILINDRO', icone: '▯', geo: () => new THREE.CylinderGeometry(0.45, 0.45, 1, 40), grade: () => new THREE.CylinderGeometry(0.45, 0.45, 1, 18, 3) },
};
const NOME_COR = { ciano: 'ciano', laranja: 'laranja', verde: 'verde', violeta: 'violeta', branco: 'branco', vermelho: 'vermelho' };
const RAIO_TRACO = 0.035;

const CSS = `
.holo-atelie[hidden]{ display:none; }
.holo-atelie .holo-caixa{ display:flex; flex-direction:column; gap:8px; }
.holo-atelie-grade{ display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; }
.holo-atelie-grade button, .holo-atelie-cores button{ min-height:44px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
  background:rgba(2,10,16,0.6); border:1px solid rgba(77,232,240,0.16); border-radius:3px; color:#a9c6cd; cursor:pointer; transition:all .2s;
  font-family:'Share Tech Mono',monospace; font-size:9.5px; letter-spacing:1px; }
.holo-atelie-grade button b{ font-size:17px; font-weight:400; line-height:1; color:#8ff3f7; }
.holo-atelie-grade button:hover, .holo-atelie-grade button.mirado{ border-color:rgba(77,232,240,0.6); color:#e9f7f9; }
.holo-atelie-grade button.ativo{ border-color:#4de8f0; color:#e9f7f9; box-shadow:0 0 16px rgba(77,232,240,0.25) inset; }
.holo-atelie-cores{ display:grid; grid-template-columns:repeat(6, 1fr); gap:6px; }
.holo-atelie-cores button{ min-height:32px; border-radius:50%; aspect-ratio:1; background:var(--cor); box-shadow:0 0 10px var(--cor); opacity:.55; }
.holo-atelie-cores button.ativo, .holo-atelie-cores button:hover, .holo-atelie-cores button.mirado{ opacity:1; outline:2px solid #e9f7f9; outline-offset:2px; }
.holo-atelie h3{ margin:2px 0 0; font-family:'Share Tech Mono',monospace; font-size:9.5px; letter-spacing:2.5px; color:#5f8791; font-weight:400; }
`;

export function criarAtelie({ cena, raiz, som, aoEvento }) {
  if (!document.getElementById('holo-atelie-estilo')) {
    const estilo = document.createElement('style');
    estilo.id = 'holo-atelie-estilo';
    estilo.textContent = CSS;
    document.head.append(estilo);
  }
  const grupo = new THREE.Group();
  grupo.position.y = 0.35;
  grupo.visible = false;
  cena.add(grupo);

  const estado = {
    ferramenta: 'desenhar', cor: 'ciano', forma: 'cubo', real: false,
    traco: null, criando: null, pegando: null, gestoAntes: 'nenhum', ultimaMalha: 0,
    itens: [],         // na ordem em que foram criados, para desfazer
  };

  // ---------- materiais ----------
  const materialTraco = (cor) => new THREE.MeshBasicMaterial({ color: new THREE.Color(CORES[cor]).multiplyScalar(2.2), toneMapped: false });
  const materiaisForma = (cor, tipo) => {
    const c = new THREE.Color(CORES[cor]);
    return {
      holo: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      real: tipo === 'cristal' || tipo === 'esfera'
        ? new THREE.MeshPhysicalMaterial({ color: c, metalness: 0, roughness: 0.05, transmission: 0.85, thickness: 0.6, ior: 1.45, clearcoat: 1 })
        : new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.75, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 }),
      aresta: new THREE.LineBasicMaterial({ color: c.clone().multiplyScalar(1.6), transparent: true, opacity: 0.95, toneMapped: false }),
    };
  };

  // ---------- traços ----------
  function malhaDoTraco(t) {
    if (t.pontos.length < 2) return;
    const curva = new THREE.CatmullRomCurve3(t.pontos);
    const geo = new THREE.TubeGeometry(curva, Math.min(900, t.pontos.length * 4), RAIO_TRACO, 8, false);
    if (t.malha) {
      t.malha.geometry.dispose();
      t.malha.geometry = geo;
    } else {
      t.malha = new THREE.Mesh(geo, materialTraco(t.cor));
      grupo.add(t.malha);
    }
  }

  function comecarTraco(p) {
    estado.traco = { tipo: 'traco', cor: estado.cor, pontos: [p.clone()], malha: null };
  }

  function continuarTraco(p) {
    const t = estado.traco;
    if (!t || t.pontos[t.pontos.length - 1].distanceTo(p) < 0.025) return;
    t.pontos.push(p.clone());
    const agora = performance.now();
    if (agora - estado.ultimaMalha > 45) {
      estado.ultimaMalha = agora;
      malhaDoTraco(t);
    }
  }

  function terminarTraco() {
    const t = estado.traco;
    estado.traco = null;
    if (!t) return;
    if (t.pontos.length < 3) {
      if (t.malha) grupo.remove(t.malha);
      return;
    }
    malhaDoTraco(t);
    estado.itens.push(t);
    salvar();
    aoEvento?.(`desenhou um traço ${NOME_COR[t.cor]} no ateliê`);
  }

  // ---------- formas ----------
  function novaForma(tipo, cor, posicao, escala) {
    const mats = materiaisForma(cor, tipo);
    const geo = FORMAS[tipo].geo();
    const solido = new THREE.Mesh(geo, estado.real ? mats.real : mats.holo);
    const grade = FORMAS[tipo].grade;
    const arestas = new THREE.LineSegments(grade ? new THREE.EdgesGeometry(grade(), 1) : new THREE.EdgesGeometry(geo, 25), mats.aresta);
    arestas.visible = !estado.real;
    const obj = new THREE.Group();
    obj.add(solido, arestas);
    obj.position.copy(posicao);
    obj.scale.setScalar(escala);
    obj.rotation.set(0.35, 0.6, 0);
    grupo.add(obj);
    return { tipo: 'forma', forma: tipo, cor, obj, solido, arestas, mats };
  }

  function pertoDe(p) {
    let melhor = null;
    let dist = Infinity;
    for (const item of estado.itens) {
      if (item.tipo !== 'forma') continue;
      const d = item.obj.position.distanceTo(p) / Math.max(0.3, item.obj.scale.x);
      if (d < 1.1 && d < dist) {
        melhor = item;
        dist = d;
      }
    }
    return melhor;
  }

  // ---------- entrada: mão ou mouse, sempre em coordenadas do grupo ----------
  // gesto: 'aponta' (dedo), 'pinca', outro qualquer = soltou
  function entrada(gesto, p) {
    const antes = estado.gestoAntes;
    estado.gestoAntes = gesto;
    // pinça perto de uma forma pega e move (com a ferramenta FORMAS a pinça sempre cria uma nova)
    if (gesto === 'pinca' && antes !== 'pinca' && !estado.criando) {
      const alvo = pertoDe(p);
      if (alvo && estado.ferramenta !== 'formas') {
        estado.pegando = { item: alvo, desvio: alvo.obj.position.clone().sub(p) };
        som.agarrar();
        return;
      }
      if (estado.ferramenta === 'formas') {
        estado.criando = { item: novaForma(estado.forma, estado.cor, p, 0.12), inicio: p.clone() };
        som.agarrar();
        return;
      }
    }
    if (gesto === 'pinca' && estado.pegando) {
      estado.pegando.item.obj.position.copy(p).add(estado.pegando.desvio);
      return;
    }
    if (gesto === 'pinca' && estado.criando) {
      const c = estado.criando;
      c.item.obj.scale.setScalar(THREE.MathUtils.clamp(0.12 + c.inicio.distanceTo(p) * 1.25, 0.12, 2.4));
      return;
    }
    if (gesto !== 'pinca') {
      if (estado.pegando) {
        aoEvento?.(`moveu ${artigo(estado.pegando.item)} no ateliê`);
        estado.pegando = null;
        som.soltar();
        salvar();
      }
      if (estado.criando) {
        const item = estado.criando.item;
        estado.criando = null;
        estado.itens.push(item);
        som.soltar();
        salvar();
        aoEvento?.(`criou ${artigo(item)} no ateliê`);
      }
    }
    if (estado.ferramenta === 'desenhar' && gesto === 'aponta') {
      if (!estado.traco) comecarTraco(p);
      else continuarTraco(p);
    } else if (estado.traco) {
      terminarTraco();
    }
  }

  const artigo = (item) => {
    const nomes = { cubo: 'um cubo', esfera: 'uma esfera', anel: 'um anel', cristal: 'um cristal', piramide: 'uma pirâmide', cilindro: 'um cilindro' };
    return `${nomes[item.forma] || 'uma forma'} ${NOME_COR[item.cor]}`;
  };

  // ---------- barra de ferramentas ----------
  const barra = document.createElement('aside');
  barra.className = 'holo-lado holo-esq holo-atelie';
  barra.hidden = true;
  barra.innerHTML = `
    <section class="holo-caixa"><h2>ATELIÊ</h2>
      <h3>FERRAMENTA</h3>
      <div class="holo-atelie-grade" data-c="ferramentas">
        <button type="button" data-mira data-ferramenta="desenhar"><b>✎</b>DESENHAR</button>
        <button type="button" data-mira data-ferramenta="formas"><b>⬡</b>FORMAS</button>
        <button type="button" data-mira data-ferramenta="mover"><b>✥</b>MOVER</button>
      </div>
      <h3>FORMA</h3>
      <div class="holo-atelie-grade" data-c="formas"></div>
      <h3>COR</h3>
      <div class="holo-atelie-cores" data-c="cores"></div>
      <div class="holo-acoes">
        <button class="holo-btn" type="button" data-mira data-c="desfazer">↶ DESFAZER</button>
        <button class="holo-btn" type="button" data-mira data-c="limpar">✕ LIMPAR</button>
      </div>
    </section>`;
  raiz.append(barra);
  const c = {};
  for (const x of barra.querySelectorAll('[data-c]')) c[x.dataset.c] = x;
  for (const [chave, f] of Object.entries(FORMAS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mira = '';
    b.dataset.forma = chave;
    b.innerHTML = `<b>${f.icone}</b>${f.nome}`;
    c.formas.append(b);
  }
  for (const [chave, cor] of Object.entries(CORES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mira = '';
    b.dataset.cor = chave;
    b.style.setProperty('--cor', cor);
    b.setAttribute('aria-label', `Cor ${NOME_COR[chave]}`);
    c.cores.append(b);
  }
  const marcar = () => {
    for (const b of barra.querySelectorAll('[data-ferramenta]')) b.classList.toggle('ativo', b.dataset.ferramenta === estado.ferramenta);
    for (const b of barra.querySelectorAll('[data-forma]')) b.classList.toggle('ativo', b.dataset.forma === estado.forma);
    for (const b of barra.querySelectorAll('[data-cor]')) b.classList.toggle('ativo', b.dataset.cor === estado.cor);
  };
  barra.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    som.clique();
    if (b.dataset.ferramenta) estado.ferramenta = b.dataset.ferramenta;
    if (b.dataset.forma) {
      estado.forma = b.dataset.forma;
      estado.ferramenta = 'formas';
    }
    if (b.dataset.cor) estado.cor = b.dataset.cor;
    if (b.dataset.c === 'desfazer') api.desfazer();
    if (b.dataset.c === 'limpar') api.limpar();
    marcar();
  });
  marcar();

  // ---------- guardar no navegador ----------
  let timerSalvar = 0;
  function salvar() {
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(() => {
      const dados = estado.itens.map((i) => (i.tipo === 'traco'
        ? { t: 'traco', cor: i.cor, p: i.pontos.map((v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]) }
        : { t: 'forma', forma: i.forma, cor: i.cor, p: i.obj.position.toArray().map((n) => +n.toFixed(3)), e: +i.obj.scale.x.toFixed(3) }));
      try { localStorage.setItem(CHAVE, JSON.stringify({ itens: dados, rot: [grupo.rotation.x, grupo.rotation.y], escala: grupo.scale.x })); } catch {}
    }, 400);
  }

  function carregar() {
    let dados = null;
    try { dados = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch {}
    if (!dados?.itens) return;
    for (const d of dados.itens) {
      if (d.t === 'traco' && CORES[d.cor] && d.p?.length > 2) {
        const t = { tipo: 'traco', cor: d.cor, pontos: d.p.map((p) => new THREE.Vector3(...p)), malha: null };
        malhaDoTraco(t);
        estado.itens.push(t);
      } else if (d.t === 'forma' && FORMAS[d.forma] && CORES[d.cor]) {
        estado.itens.push(novaForma(d.forma, d.cor, new THREE.Vector3(...d.p), d.e || 0.5));
      }
    }
  }
  carregar();

  function remover(item) {
    if (item.tipo === 'traco') {
      grupo.remove(item.malha);
      item.malha?.geometry.dispose();
    } else {
      grupo.remove(item.obj);
      item.solido.geometry.dispose();
      item.arestas.geometry.dispose();
    }
  }

  const api = {
    grupo,
    barra,
    ativar(sim) {
      grupo.visible = sim;
      barra.hidden = !sim;
      if (!sim) entrada('nenhum', new THREE.Vector3());
    },
    entrada,
    soltar() {
      entrada('nenhum', new THREE.Vector3());
    },
    definir({ ferramenta, forma, cor } = {}) {
      if (ferramenta && ['desenhar', 'formas', 'mover'].includes(ferramenta)) estado.ferramenta = ferramenta;
      if (forma && FORMAS[forma]) estado.forma = forma;
      if (cor && CORES[cor]) estado.cor = cor;
      marcar();
    },
    // cria uma forma no meio da mesa (pela voz)
    criar(forma, cor) {
      if (!FORMAS[forma]) return `Formas que eu crio: ${Object.keys(FORMAS).join(', ')}.`;
      const corUsada = CORES[cor] ? cor : estado.cor;
      const espalha = estado.itens.filter((i) => i.tipo === 'forma').length;
      const p = new THREE.Vector3(Math.sin(espalha * 2.4) * 0.9 * Math.min(1, espalha), 0.2, Math.cos(espalha * 2.4) * 0.6 * Math.min(1, espalha));
      const item = novaForma(forma, corUsada, p, 0.9);
      estado.itens.push(item);
      som.montar();
      salvar();
      aoEvento?.(`criou ${artigo(item)} no ateliê`);
      return `Criei ${artigo(item)} no ateliê.`;
    },
    desfazer() {
      const item = estado.itens.pop();
      if (!item) return 'Não há nada para desfazer.';
      remover(item);
      salvar();
      aoEvento?.('desfez a última criação');
      return 'Desfeito.';
    },
    limpar() {
      if (!estado.itens.length) return 'O ateliê já está vazio.';
      for (const item of estado.itens) remover(item);
      estado.itens = [];
      som.desmontar();
      salvar();
      aoEvento?.('limpou o ateliê');
      return 'Ateliê limpo.';
    },
    aplicarVisual(real) {
      estado.real = real;
      for (const item of estado.itens) {
        if (item.tipo !== 'forma') continue;
        item.solido.material = real ? item.mats.real : item.mats.holo;
        item.arestas.visible = !real;
      }
    },
    salvarPosicao: salvar,
    animar(t) {
      for (const item of estado.itens) {
        if (item.tipo === 'forma' && !estado.real) item.arestas.material.opacity = 0.75 + 0.2 * Math.sin(t * 2.2 + item.obj.position.x);
      }
    },
    resumo() {
      const tracos = estado.itens.filter((i) => i.tipo === 'traco');
      const formas = estado.itens.filter((i) => i.tipo === 'forma');
      const partes = [];
      if (tracos.length) partes.push(`${tracos.length} traço${tracos.length > 1 ? 's' : ''} de luz (${[...new Set(tracos.map((t) => NOME_COR[t.cor]))].join(', ')})`);
      if (formas.length) partes.push(formas.map(artigo).join(', '));
      return partes.length ? partes.join(' e ') : 'nada criado ainda';
    },
    dados: () => [
      ['Traços', String(estado.itens.filter((i) => i.tipo === 'traco').length)],
      ['Formas', String(estado.itens.filter((i) => i.tipo === 'forma').length)],
      ['Ferramenta', estado.ferramenta.toUpperCase()],
      ['Cor', NOME_COR[estado.cor].toUpperCase()],
    ],
    ferramenta: () => estado.ferramenta,
    ocupado: () => !!(estado.traco || estado.criando || estado.pegando),
  };
  return api;
}
