/*
 * holo.js — Laboratório holográfico do Jarvis.
 *
 * Uma tela inteira de projeções 3D feitas de partículas (Terra, Saturno, Reator
 * Arc, Átomo, DNA e Cidade) sobre uma mesa de projeção, controladas com as mãos
 * pela câmera, como o Tony Stark faz:
 *   punho fechado + mover  -> gira a projeção
 *   pinça + subir/descer   -> zoom
 *   mão aberta             -> desmonta; as partículas seguem a mão
 *   duas mãos              -> afastar/aproximar amplia ou reduz
 *   deslizar a mão rápido  -> troca de projeção
 * Também funciona com mouse/teclado e com a voz (ferramenta "holograma").
 *
 * Carregado só quando o laboratório abre (import dinâmico no index.html, que
 * define o importmap de "three").
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------- CONFIG ----------------
const VISAO = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const MODELO_MAOS = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const TOTAL = 26000;              // toda projeção usa o mesmo tanto de partículas, para uma virar a outra
const MARCADOR = { nome: 'Campo Mourão · PR', lat: -24.05, lon: -52.38 };
// ----------------------------------------

const COR = {
  ciano: new THREE.Color('#4de8f0'),
  azul: new THREE.Color('#2f7bff'),
  branco: new THREE.Color('#e8fdff'),
  laranja: new THREE.Color('#ffa24c'),
  verde: new THREE.Color('#5dfca0'),
  violeta: new THREE.Color('#b794ff'),
  ouro: new THREE.Color('#ffd89a'),
};
const LIGACOES_MAO = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const CORES_GESTO = { punho: '#ffa24c', pinca: '#5dfca0', aberta: '#4de8f0', nenhum: '#8ff3f7' };
const NOMES_GESTO = { punho: 'PUNHO · GIRAR', pinca: 'PINÇA · ZOOM', aberta: 'MÃO ABERTA · DESMONTAR', dupla: 'DUAS MÃOS · ESCALA', nenhum: '—' };

// ---------------- estado ----------------
const L = {
  pronto: false,
  aberto: false,
  raiz: null,
  aoVoltar: null,
  quadro: 0,
  relogio: new THREE.Clock(),
  renderer: null,
  composer: null,
  bloom: null,
  cena: null,
  camera: null,
  projecao: null,       // grupo que gira/escala
  nuvem: null,          // as partículas (com transformação entre formas)
  linhas: null,         // linhas/objetos extras da forma atual
  mesa: null,
  poeira: null,
  maosVisuais: [],
  formas: [],
  indice: 0,
  morph: 1,
  rot: { x: 0.18, y: 0, vx: 0, vy: 0 },
  escala: 1,
  escalaAlvo: 1,
  explosao: 0,
  explosaoAlvo: 0,
  atracao: 0,
  atracaoAlvo: 0,
  desmontadoPorComando: false,
  stream: null,
  streamProprio: false,
  video: null,
  detector: null,
  ultimoTempoVideo: -1,
  maos: [],
  gesto: 'nenhum',
  duas: null,
  arraste: null,
  historico: [],
  trocaEm: 0,
  ultimaMaoEm: 0,
  fps: 0,
  hud: {},
};

// ---------------- formas ----------------
function gerador() {
  const posicoes = new Float32Array(TOTAL * 3);
  const cores = new Float32Array(TOTAL * 3);
  let n = 0;
  const add = (x, y, z, cor, brilho = 1) => {
    if (n >= TOTAL) return;
    posicoes[n * 3] = x;
    posicoes[n * 3 + 1] = y;
    posicoes[n * 3 + 2] = z;
    cores[n * 3] = cor.r * brilho;
    cores[n * 3 + 1] = cor.g * brilho;
    cores[n * 3 + 2] = cor.b * brilho;
    n++;
  };
  // completa as vagas com cópias levemente deslocadas das partículas que já existem
  const completar = (jitter = 0.03) => {
    const base = Math.max(1, n);
    while (n < TOTAL) {
      const i = Math.floor(Math.random() * base) * 3;
      add(posicoes[i] + (Math.random() - 0.5) * jitter, posicoes[i + 1] + (Math.random() - 0.5) * jitter, posicoes[i + 2] + (Math.random() - 0.5) * jitter,
        new THREE.Color(cores[i], cores[i + 1], cores[i + 2]), 0.6);
    }
  };
  return { posicoes, cores, add, completar, quantos: () => n };
}

function esferaFibonacci(quantos, cada) {
  const ouro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < quantos; i++) {
    const y = 1 - (i / (quantos - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const fi = i * ouro;
    cada(Math.cos(fi) * r, y, Math.sin(fi) * r);
  }
}

function materialLinha(cor, opacidade = 0.35) {
  return new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: opacidade, blending: THREE.AdditiveBlending, depthWrite: false });
}

function circulo(raio, segmentos = 128, cor = COR.ciano, opacidade = 0.35) {
  const pts = [];
  for (let i = 0; i < segmentos; i++) {
    const a = (i / segmentos) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * raio, 0, Math.sin(a) * raio));
  }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), materialLinha(cor, opacidade));
}

function texturaBrilho() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(160,250,255,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function brilho(cor, tamanho) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrilho(), color: cor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(tamanho);
  return s;
}

// continentes em 240×120 (equirretangular), tirados do mapa especular do three.js: cada linha são
// trechos alternados oceano/terra, começando no oceano, com o tamanho em base 36 (2 caracteres)
const CONTINENTES = '6o,6o,6o,6o,6o,1r0g0702010f3s,1l02020a060r010224021j,1s05080t0n0302022w,1k010605060v3r,16020202080b0e0p290819,12040e040n0n1f010l0d01011a,110301040202040201010303010202010e0k01011f010902070t0a020o,00010e010p090602040a0e0h01011f0108040101020x020a01020i01,0b0f0702020203090601050204050a01010i0u070j02030d011b080402,0002080x06010704020206040b0d0w0f03020302010c01080115020i,0005070r010p06010105070c0w0c0204030i011z,0302040t0206010e0a04020108070c050j050306032m,0d0s010c01050303060509070c040i070208012m01,0b0z010b0g010c050x07022m020802,0c0u020d0c030i010x070302060101280301020406,0f020b0t0c051e0201040806011x0p,0f010e0l01060b0912020a030509011v0d020c,0v0u080a1202090105250d040c,0v01010u05090102120107010101051m010i0d030d,0y0k010a030e0w020202051v010j0c020e,0z1a1103022j0a010f,0z141a2l01010o,120n020e04030x2p0q,120l050d160q011v0r,120o050b150l020102070403010901160s,120o01020108020116070101020907050304031e0t,110p010a1508060103070805031g07020o,120y17070701030603020405021f0y,120w18060a010202030f0317030309010p,120w18060e01030a01040317050108010q,130u220701030219040105030q,140t1f070h1k14,160p1c0c0h1k07020v,1601010m1c0e0g1l13,190f03021d0h0205041m14,190b09011b13021b13,180101090a011a0u0208031914,190101081k0v020a051514,1c071j0x02090b0y15,1d051k0x030d0701010u16,1e050c01150z020d07020109030e19,1e0505020701130z030c0a0904091d,1f0503030a020z10020b0b07070702021a,1h081d1002080d0608081d,1j0102031c1103050f050b071c,1o04191202020j030d071b,1q02190k010i0m030f051b,1r011a130m020g031c,1s01050601020w1201040h021v,1w0c0w151d0210,1w0d0w08020u2f,1x0g0t020201050s0w010201090215,1x0h150o0y010201070216,1w0i150n1001070515,1v0j150m10030506010311,1v0l120f0205130204050a010v,1v0n110e0105150203050201070102020r,1v0r0y0i17010a0108070o,1u0t0x0i1u050n,1v0t0x0h19010k060m,1w0s0x0h1v0301010m,1w0s0x0h2m,1x0q0z0c02032l,1x0p0z0d02031p030t,1y0o0z0i05021h0305010o,1z0n0y0i05021e0804010o,200m0y0h04041d0b01030l0101,210l0z0f06031c0g0n,210k100e07021b0k0l,210k110d0603190m0l,210h140d0603180o0k,210f160d0603180p0j,210e170b1j0q0i,210e180a1j0q0i,200f180a1k0p0i,200e1a081l0p0i,200d1b071m06060d0i,200c1d011r030a0101080k,20093o070k,1z0b3n070k,1z0a4b0202,20074e0102,1z063w010h0104,1z063w010g0105,1z064c0106,1z044c0207,1y064k,1y054l,1y054l,1z034m,20024m,22014l,6o,6o,6o,6o,6o,6o,26014h,240125040m0c0105050201080q,2301200j061a0l,20071r02020k051j0e,200201041001051a011s08,1i020g0201040x3d07,12030b0r0s3f0a,0r1c0t3h0b,0l1c02030q3l0b,0h1c0l030a3k0d,0m1a0v3k0d,0j1j0c02053q0d,0i5y08,00090j5w,006o,006o,006o';

function mascaraTerra() {
  const largura = 240;
  const linhas = CONTINENTES.split(',');
  const mapa = new Uint8Array(largura * linhas.length);
  linhas.forEach((linha, y) => {
    let x = 0;
    for (let i = 0, terra = 0; i < linha.length; i += 2, terra ^= 1) {
      const n = parseInt(linha.slice(i, i + 2), 36);
      if (terra) mapa.fill(1, y * largura + x, y * largura + x + n);
      x += n;
    }
  });
  return (lat, lon) => {
    const u = Math.min(largura - 1, Math.max(0, Math.floor(((lon + Math.PI) / (Math.PI * 2)) * largura)));
    const v = Math.min(linhas.length - 1, Math.max(0, Math.floor(((Math.PI / 2 - lat) / Math.PI) * linhas.length)));
    return mapa[v * largura + u] === 1;
  };
}

function formaTerra() {
  const R = 2;
  const g = gerador();
  const terra = mascaraTerra();
  const giro = THREE.MathUtils.degToRad(-MARCADOR.lon);   // o Brasil começa de frente
  const pos = (lat, lon, r) => {
    const l = lon + giro;
    return [Math.cos(lat) * Math.sin(l) * r, Math.sin(lat) * r, Math.cos(lat) * Math.cos(l) * r];
  };
  esferaFibonacci(64000, (x, y, z) => {
    const lat = Math.asin(y);
    const lon = Math.atan2(x, z);
    if (terra(lat, lon)) g.add(...pos(lat, lon, R), Math.random() < 0.7 ? COR.ciano : COR.branco, 0.75 + Math.random() * 0.45);
    else if (Math.random() < 0.13) g.add(...pos(lat, lon, R * 0.995), COR.azul, 0.35 + Math.random() * 0.25);
  });
  // atmosfera: uma casca rala de partículas
  while (g.quantos() < TOTAL) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(R * (1.06 + Math.random() * 0.09));
    g.add(v.x, v.y, v.z, COR.ciano, 0.18 + Math.random() * 0.15);
  }

  const linhas = new THREE.Group();
  const grade = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    const r = Math.cos(THREE.MathUtils.degToRad(lat)) * R * 1.012;
    const y = Math.sin(THREE.MathUtils.degToRad(lat)) * R * 1.012;
    for (let i = 0; i < 96; i++) {
      const a1 = (i / 96) * Math.PI * 2;
      const a2 = ((i + 1) / 96) * Math.PI * 2;
      grade.push(Math.cos(a1) * r, y, Math.sin(a1) * r, Math.cos(a2) * r, y, Math.sin(a2) * r);
    }
  }
  for (let lon = 0; lon < 180; lon += 30) {
    for (let i = 0; i < 96; i++) {
      const a1 = (i / 96) * Math.PI * 2;
      const a2 = ((i + 1) / 96) * Math.PI * 2;
      const l = THREE.MathUtils.degToRad(lon);
      grade.push(Math.cos(a1) * Math.cos(l) * R * 1.012, Math.sin(a1) * R * 1.012, Math.cos(a1) * Math.sin(l) * R * 1.012,
        Math.cos(a2) * Math.cos(l) * R * 1.012, Math.sin(a2) * R * 1.012, Math.cos(a2) * Math.sin(l) * R * 1.012);
    }
  }
  const geoGrade = new THREE.BufferGeometry();
  geoGrade.setAttribute('position', new THREE.Float32BufferAttribute(grade, 3));
  linhas.add(new THREE.LineSegments(geoGrade, materialLinha(COR.ciano, 0.09)));

  // halo de atmosfera (brilho na borda)
  const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 64, 64), new THREE.ShaderMaterial({
    uniforms: { uCor: { value: COR.ciano } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uCor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 4.0) * 0.3; gl_FragColor = vec4(uCor * f, f); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  }));
  linhas.add(halo);

  // órbitas de satélites
  const orbitas = [];
  for (const [raio, inclinacao, giroOrbita] of [[2.9, 0.5, 0.2], [3.4, -0.9, 1.4]]) {
    const anel = circulo(raio, 160, COR.ciano, 0.28);
    anel.rotation.set(inclinacao, giroOrbita, 0);
    const satelite = brilho(COR.branco, 0.32);
    linhas.add(anel, satelite);
    orbitas.push({ anel, satelite, raio, velocidade: 0.5 / raio * 2 });
  }

  // marcador da cidade do Renato
  const [mx, my, mz] = pos(THREE.MathUtils.degToRad(MARCADOR.lat), THREE.MathUtils.degToRad(MARCADOR.lon), R);
  const normal = new THREE.Vector3(mx, my, mz).normalize();
  const haste = new THREE.Line(new THREE.BufferGeometry().setFromPoints([normal.clone().multiplyScalar(R), normal.clone().multiplyScalar(R * 1.35)]), materialLinha(COR.laranja, 0.9));
  const pulso = circulo(0.14, 48, COR.laranja, 0.9);
  pulso.position.copy(normal.clone().multiplyScalar(R * 1.01));
  pulso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  const ponta = brilho(COR.laranja, 0.35);
  ponta.position.copy(normal.clone().multiplyScalar(R * 1.35));
  linhas.add(haste, pulso, ponta);

  return {
    chave: 'terra', codigo: 'GEO-01', titulo: 'TERRA',
    descricao: `Globo com os continentes em partículas, órbitas de satélites e marcador em ${MARCADOR.nome}.`,
    dados: [['Partículas', TOTAL.toLocaleString('pt-BR')], ['Raio', '6.371 km'], ['Marcador', MARCADOR.nome], ['Satélites', '2 em órbita']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    animar(t) {
      for (const o of orbitas) {
        const a = t * o.velocidade;
        o.satelite.position.set(Math.cos(a) * o.raio, 0, Math.sin(a) * o.raio).applyEuler(o.anel.rotation);
      }
      const s = 1 + ((t * 0.9) % 1) * 2.2;
      pulso.scale.setScalar(s);
      pulso.material.userData.pulso = 1 - ((t * 0.9) % 1);
    },
  };
}

function formaSaturno() {
  const g = gerador();
  const inclina = new THREE.Euler(0.47, 0, 0.12);
  const v = new THREE.Vector3();
  const add = (x, y, z, cor, b) => {
    v.set(x, y, z).applyEuler(inclina);
    g.add(v.x, v.y, v.z, cor, b);
  };
  esferaFibonacci(8000, (x, y, z) => {
    const faixa = 0.5 + 0.5 * Math.sin(y * 16 + Math.sin(y * 5) * 2);
    const cor = COR.ouro.clone().lerp(COR.ciano, 0.35 + faixa * 0.4);
    add(x * 1.45, y * 1.32, z * 1.45, cor, 0.55 + faixa * 0.55);
  });
  while (g.quantos() < TOTAL) {
    const r = 2.0 + Math.random() * 1.75;
    if (r > 2.9 && r < 3.02 && Math.random() < 0.92) continue;   // divisão de Cassini
    const a = Math.random() * Math.PI * 2;
    const t = (r - 2) / 1.75;
    const cor = COR.branco.clone().lerp(COR.azul, t);
    add(Math.cos(a) * r, (Math.random() - 0.5) * 0.04, Math.sin(a) * r, cor, 0.35 + Math.random() * 0.55 * (1 - Math.abs(t - 0.4)));
  }
  const linhas = new THREE.Group();
  for (const r of [2.0, 3.76]) {
    const c = circulo(r, 180, COR.ciano, 0.22);
    c.rotation.copy(inclina);
    linhas.add(c);
  }
  return {
    chave: 'saturno', codigo: 'AST-02', titulo: 'SATURNO',
    descricao: 'Gigante gasoso com faixas na atmosfera e anéis de fragmentos, com a divisão de Cassini.',
    dados: [['Partículas', TOTAL.toLocaleString('pt-BR')], ['Inclinação', '26,7°'], ['Anéis', 'A, B e C'], ['Luas', '146 conhecidas']],
    posicoes: g.posicoes, cores: g.cores, linhas, animar() {},
  };
}

function formaReator() {
  const g = gerador();
  const polar = (r, a, z, cor, b) => g.add(Math.cos(a) * r, Math.sin(a) * r, z, cor, b);
  // núcleo
  for (let i = 0; i < 3200; i++) {
    const r = Math.pow(Math.random(), 0.7) * 0.55;
    polar(r, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25, COR.branco, 1.1 - r);
  }
  // anel interno
  for (let i = 0; i < 2600; i++) polar(1.0 + Math.random() * 0.2, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.18, COR.ciano, 0.9);
  // dez bobinas
  for (let b = 0; b < 10; b++) {
    const centro = (b / 10) * Math.PI * 2;
    for (let i = 0; i < 1250; i++) {
      const r = 1.38 + Math.random() * 0.78;
      const a = centro + (Math.random() - 0.5) * THREE.MathUtils.degToRad(24);
      polar(r, a, (Math.random() - 0.5) * 0.32, COR.ciano.clone().lerp(COR.branco, Math.random() * 0.4), 0.55 + (r - 1.38) * 0.4);
    }
  }
  // carcaça
  for (let i = 0; i < 3000; i++) polar(2.32 + Math.random() * 0.2, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4, COR.azul.clone().lerp(COR.ciano, 0.5), 0.7);
  // triângulo central
  const vertices = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2 + Math.PI / 2);
  for (let i = 0; i < 1500; i++) {
    const lado = i % 3;
    const t = Math.random();
    const a1 = vertices[lado];
    const a2 = vertices[(lado + 1) % 3];
    g.add(THREE.MathUtils.lerp(Math.cos(a1), Math.cos(a2), t) * 0.92, THREE.MathUtils.lerp(Math.sin(a1), Math.sin(a2), t) * 0.92, 0.1, COR.branco, 1);
  }
  // placa de fundo
  while (g.quantos() < TOTAL) polar(Math.sqrt(Math.random()) * 2.5, Math.random() * Math.PI * 2, -0.32, COR.azul, 0.22);

  const linhas = new THREE.Group();
  const anelGiro = new THREE.Group();
  for (const r of [0.62, 1.26, 2.24, 2.55]) {
    const c = circulo(r, 160, COR.ciano, 0.4);
    c.rotation.x = Math.PI / 2;
    (r > 2 ? anelGiro : linhas).add(c);
  }
  const raios = [];
  for (let b = 0; b < 10; b++) {
    const a = ((b + 0.5) / 10) * Math.PI * 2;
    raios.push(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0.15, Math.cos(a) * 2.24, Math.sin(a) * 2.24, 0.15);
  }
  const geoRaios = new THREE.BufferGeometry();
  geoRaios.setAttribute('position', new THREE.Float32BufferAttribute(raios, 3));
  anelGiro.add(new THREE.LineSegments(geoRaios, materialLinha(COR.ciano, 0.5)));
  const triangulo = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(vertices.map((a) => new THREE.Vector3(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.12))), materialLinha(COR.branco, 0.85));
  const nucleo = brilho(COR.ciano, 1.9);
  linhas.add(anelGiro, triangulo, nucleo);
  return {
    chave: 'reator', codigo: 'ARC-03', titulo: 'REATOR ARC',
    descricao: 'Núcleo de energia em anel: dez bobinas, triângulo central e núcleo pulsante.',
    dados: [['Partículas', TOTAL.toLocaleString('pt-BR')], ['Bobinas', '10'], ['Saída', '3 GJ/s'], ['Estado', 'ESTÁVEL']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    animar(t) {
      anelGiro.rotation.z = t * 0.35;
      triangulo.material.userData.pulso = 0.75 + 0.25 * Math.sin(t * 3.2);
      nucleo.scale.setScalar(1.7 + Math.sin(t * 3.2) * 0.25);
    },
  };
}

function formaAtomo() {
  const g = gerador();
  const nucleons = [];
  for (let i = 0; i < 40; i++) nucleons.push(new THREE.Vector3().randomDirection().multiplyScalar(Math.cbrt(Math.random()) * 0.42));
  nucleons.forEach((c, i) => {
    const cor = i % 2 ? COR.laranja : COR.ciano;
    for (let k = 0; k < 120; k++) {
      const p = new THREE.Vector3().randomDirection().multiplyScalar(Math.cbrt(Math.random()) * 0.15).add(c);
      g.add(p.x, p.y, p.z, cor, 0.9);
    }
  });
  // como o símbolo do átomo: três elipses a 60° uma da outra, com uma leve inclinação para dar volume
  const orbitas = [0, 1, 2].map((i) => new THREE.Euler(0.35, 0.3, (i * Math.PI) / 3));
  const elipse = (a, alvo) => alvo.set(Math.cos(a) * 2.7, Math.sin(a) * 1.05, 0);
  const v = new THREE.Vector3();
  for (const e of orbitas) {
    for (let k = 0; k < 3200; k++) {
      elipse(Math.random() * Math.PI * 2, v).add(new THREE.Vector3().randomDirection().multiplyScalar(0.03)).applyEuler(e);
      g.add(v.x, v.y, v.z, COR.ciano, 0.32);
    }
  }
  // nuvem de probabilidade
  while (g.quantos() < TOTAL) {
    const p = new THREE.Vector3().randomDirection().multiplyScalar(Math.abs((Math.random() + Math.random() + Math.random() - 1.5)) * 2.4);
    g.add(p.x, p.y, p.z, COR.azul, 0.16);
  }
  const linhas = new THREE.Group();
  const eletrons = [];
  for (const [i, e] of orbitas.entries()) {
    const anel = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 160 }, (_, k) => (
      elipse((k / 160) * Math.PI * 2, new THREE.Vector3()).applyEuler(e)
    ))), materialLinha(COR.ciano, 0.45));
    const eletron = brilho(COR.verde, 0.45);
    linhas.add(anel, eletron);
    eletrons.push({ e, eletron, fase: i * 2.1, velocidade: 1.3 + i * 0.35 });
  }
  linhas.add(brilho(COR.laranja, 1.6));
  return {
    chave: 'atomo', codigo: 'ATM-04', titulo: 'ÁTOMO',
    descricao: 'Modelo atômico: núcleo de prótons e nêutrons, três órbitas e a nuvem de elétrons.',
    dados: [['Partículas', TOTAL.toLocaleString('pt-BR')], ['Núcleons', '40'], ['Órbitas', '3'], ['Elétrons', '3']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    animar(t) {
      for (const o of eletrons) {
        elipse(t * o.velocidade + o.fase, o.eletron.position).applyEuler(o.e);
      }
    },
  };
}

function formaDna() {
  const g = gerador();
  const altura = 5.2;
  const voltas = 3.2;
  const raio = 1.0;
  const fita = (t, fase) => {
    const a = t * voltas * Math.PI * 2 + fase;
    return new THREE.Vector3(Math.cos(a) * raio, (t - 0.5) * altura, Math.sin(a) * raio);
  };
  for (let i = 0; i < 15000; i++) {
    const t = Math.random();
    const lado = i % 2;
    const p = fita(t, lado ? Math.PI : 0).add(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 0.09));
    g.add(p.x, p.y, p.z, lado ? COR.azul.clone().lerp(COR.ciano, 0.5) : COR.ciano, 0.85);
  }
  const pares = 40;
  const coresPares = [[COR.laranja, COR.ciano], [COR.verde, COR.violeta]];
  const segmentos = [];
  for (let k = 0; k < pares; k++) {
    const t = (k + 0.5) / pares;
    const a = fita(t, 0);
    const b = fita(t, Math.PI);
    const [c1, c2] = coresPares[k % 2];
    for (let i = 0; i < 170; i++) {
      const u = Math.random();
      const p = a.clone().lerp(b, u);
      g.add(p.x, p.y, p.z, u < 0.5 ? c1 : c2, 0.75);
    }
    segmentos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  while (g.quantos() < TOTAL) {
    const r = 1.4 + Math.random() * 1.2;
    const a = Math.random() * Math.PI * 2;
    g.add(Math.cos(a) * r, (Math.random() - 0.5) * altura * 1.1, Math.sin(a) * r, COR.azul, 0.12);
  }
  const linhas = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(segmentos, 3));
  linhas.add(new THREE.LineSegments(geo, materialLinha(COR.branco, 0.35)));
  return {
    chave: 'dna', codigo: 'BIO-05', titulo: 'DNA',
    descricao: 'Dupla hélice com quarenta pares de bases ligando as duas fitas.',
    dados: [['Partículas', TOTAL.toLocaleString('pt-BR')], ['Pares de bases', '40'], ['Voltas', '3,2'], ['Fitas', '2']],
    posicoes: g.posicoes, cores: g.cores, linhas, animar() {},
  };
}

function formaCidade() {
  const g = gerador();
  const base = -1.7;
  const predios = [];
  const ruido = (x, z) => Math.sin(x * 1.7) * Math.cos(z * 1.3) * 0.5 + Math.sin(x * 0.6 + z * 0.9) * 0.5;
  for (let i = -5; i <= 5; i++) {
    for (let j = -5; j <= 5; j++) {
      const x = i * 0.46;
      const z = j * 0.46;
      const centro = Math.exp(-(x * x + z * z) / 3.2);
      const h = 0.15 + centro * 3.0 * (0.55 + 0.45 * (ruido(x, z) * 0.5 + 0.5)) + Math.random() * 0.25;
      const lado = 0.28 + Math.random() * 0.1;
      predios.push({ x, z, h, lado });
    }
  }
  const arestas = [];
  for (const p of predios) {
    const s = p.lado / 2;
    const cantos = [[-s, -s], [s, -s], [s, s], [-s, s]];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = cantos[k];
      const [bx, bz] = cantos[(k + 1) % 4];
      arestas.push([p.x + ax, base, p.z + az, p.x + bx, base, p.z + bz]);
      arestas.push([p.x + ax, base + p.h, p.z + az, p.x + bx, base + p.h, p.z + bz]);
      arestas.push([p.x + ax, base, p.z + az, p.x + ax, base + p.h, p.z + az]);
    }
  }
  const comprimento = arestas.reduce((soma, a) => soma + Math.hypot(a[3] - a[0], a[4] - a[1], a[5] - a[2]), 0);
  for (const a of arestas) {
    const qtd = Math.round((Math.hypot(a[3] - a[0], a[4] - a[1], a[5] - a[2]) / comprimento) * 10000);
    for (let i = 0; i < qtd; i++) {
      const t = Math.random();
      const y = THREE.MathUtils.lerp(a[1], a[4], t);
      g.add(THREE.MathUtils.lerp(a[0], a[3], t), y, THREE.MathUtils.lerp(a[2], a[5], t), COR.ciano.clone().lerp(COR.branco, (y - base) / 3.4), 0.5);
    }
  }
  // janelas acesas nas fachadas
  for (let i = 0; i < 4000; i++) {
    const p = predios[Math.floor(Math.random() * predios.length)];
    const s = p.lado / 2;
    const face = Math.floor(Math.random() * 4);
    const u = (Math.random() - 0.5) * p.lado;
    const y = base + Math.random() * p.h;
    const [x, z] = [[p.x + u, p.z - s], [p.x + s, p.z + u], [p.x + u, p.z + s], [p.x - s, p.z + u]][face];
    g.add(x, y, z, Math.random() < 0.25 ? COR.laranja : COR.ciano, 0.45);
  }
  // chão em grade
  while (g.quantos() < TOTAL) {
    const x = (Math.random() - 0.5) * 6;
    const z = (Math.random() - 0.5) * 6;
    const naLinha = Math.abs(x / 0.46 - Math.round(x / 0.46)) < 0.06 || Math.abs(z / 0.46 - Math.round(z / 0.46)) < 0.06;
    if (naLinha || Math.random() < 0.08) g.add(x, base, z, COR.azul, naLinha ? 0.4 : 0.15);
  }
  const linhas = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(arestas.flat(), 3));
  linhas.add(new THREE.LineSegments(geo, materialLinha(COR.ciano, 0.2)));
  // plano de varredura subindo e descendo pela cidade
  const varredura = new THREE.Group();
  const lamina = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({
    color: COR.verde, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  lamina.rotation.x = -Math.PI / 2;
  const contorno = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
    [[-3, -3], [3, -3], [3, 3], [-3, 3]].map(([x, z]) => new THREE.Vector3(x, 0, z))), materialLinha(COR.verde, 0.7));
  varredura.add(lamina, contorno);
  linhas.add(varredura);
  const maisAlto = Math.max(...predios.map((p) => p.h));
  return {
    chave: 'cidade', codigo: 'URB-06', titulo: 'CIDADE',
    descricao: 'Mapa urbano volumétrico de 121 quadras, com varredura de altura.',
    dados: [['Partículas', TOTAL.toLocaleString('pt-BR')], ['Quadras', String(predios.length)], ['Torre mais alta', `${Math.round(maisAlto * 100)} m`], ['Varredura', 'ATIVA']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    animar(t) {
      varredura.position.y = base + (0.5 - 0.5 * Math.cos(t * 0.8)) * 3.3;
    },
  };
}

// ---------------- partículas com transformação entre formas ----------------
function criarNuvem() {
  const geo = new THREE.BufferGeometry();
  const vazio = new Float32Array(TOTAL * 3);
  const direcao = new Float32Array(TOTAL * 3);
  const semente = new Float32Array(TOTAL);
  for (let i = 0; i < TOTAL; i++) {
    const d = new THREE.Vector3().randomDirection().multiplyScalar(0.4 + Math.random() * 1.6);
    direcao.set([d.x, d.y, d.z], i * 3);
    semente[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(vazio.slice(), 3));
  geo.setAttribute('destino', new THREE.BufferAttribute(vazio.slice(), 3));
  geo.setAttribute('cor', new THREE.BufferAttribute(vazio.slice(), 3));
  geo.setAttribute('corDestino', new THREE.BufferAttribute(vazio.slice(), 3));
  geo.setAttribute('direcao', new THREE.BufferAttribute(direcao, 3));
  geo.setAttribute('semente', new THREE.BufferAttribute(semente, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTempo: { value: 0 }, uMorph: { value: 1 }, uExplosao: { value: 0 }, uAtracao: { value: 0 },
      uAtrator: { value: new THREE.Vector3() }, uTamanho: { value: 0.075 }, uPixel: { value: 1 }, uOpacidade: { value: 1 },
    },
    vertexShader: `
      uniform float uTempo, uMorph, uExplosao, uAtracao, uTamanho, uPixel;
      uniform vec3 uAtrator;
      attribute vec3 destino, cor, corDestino, direcao;
      attribute float semente;
      varying vec3 vCor;
      void main() {
        // cada partícula sai um pouco antes ou depois, e faz um arco no caminho
        float m = smoothstep(0.0, 1.0, clamp(uMorph * 1.6 - semente * 0.6, 0.0, 1.0));
        vec3 p = mix(position, destino, m) + direcao * sin(m * 3.14159) * 0.6;
        p += direcao * uExplosao;
        p += vec3(sin(uTempo * 0.8 + semente * 6.28), cos(uTempo * 0.7 + semente * 9.0), sin(uTempo * 0.9 + semente * 3.0)) * 0.12 * uExplosao;
        p = mix(p, uAtrator + direcao * 0.35, uAtracao * (0.45 + 0.55 * semente));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.2, uTamanho * uPixel * (0.7 + semente * 0.8) * (300.0 / -mv.z));
        float cintila = 0.78 + 0.22 * sin(uTempo * 2.6 + semente * 50.0);
        // o lado de trás da projeção fica mais apagado: dá profundidade e não estoura o brilho
        float centro = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
        float atras = clamp((centro - mv.z) / 2.5, 0.0, 1.0);
        vCor = mix(cor, corDestino, m) * cintila * (1.0 - atras * 0.72) * 0.72;
      }`,
    fragmentShader: `
      uniform float uOpacidade;
      varying vec3 vCor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vCor, a * a * uOpacidade);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, material);
}

// ---------------- mesa de projeção ----------------
function criarMesa() {
  const mesa = new THREE.Group();
  mesa.position.y = -2.55;
  for (const [r, o] of [[0.75, 0.9], [1.3, 0.5], [2.3, 0.35], [3.15, 0.55], [3.35, 0.25]]) mesa.add(circulo(r, 160, COR.ciano, o));
  const marcas = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const r2 = i % 10 === 0 ? 2.95 : 3.05;
    marcas.push(Math.cos(a) * r2, 0, Math.sin(a) * r2, Math.cos(a) * 3.15, 0, Math.sin(a) * 3.15);
  }
  const geoMarcas = new THREE.BufferGeometry();
  geoMarcas.setAttribute('position', new THREE.Float32BufferAttribute(marcas, 3));
  const anelMarcas = new THREE.LineSegments(geoMarcas, materialLinha(COR.ciano, 0.45));
  mesa.add(anelMarcas);
  const emissor = brilho(COR.ciano, 1.1);
  emissor.material.opacity = 0.55;
  emissor.position.y = 0.05;
  mesa.add(emissor);
  // facho de luz da projeção
  const facho = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 0.75, 5.6, 72, 1, true), new THREE.ShaderMaterial({
    uniforms: { uTempo: { value: 0 }, uCor: { value: COR.ciano } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTempo; uniform vec3 uCor; varying vec2 vUv;
      void main(){
        float sobe = pow(1.0 - vUv.y, 1.8);
        float faixas = 0.82 + 0.18 * sin(vUv.y * 90.0 - uTempo * 5.0);
        float raios = 0.75 + 0.25 * sin(vUv.x * 6.2832 * 24.0 + uTempo * 0.6);
        float a = sobe * faixas * raios * 0.075;
        gl_FragColor = vec4(uCor * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  facho.position.y = 2.8;
  mesa.add(facho);
  // poeira subindo no facho
  const qtd = 900;
  const pos = new Float32Array(qtd * 3);
  for (let i = 0; i < qtd; i++) {
    const t = Math.random();
    const r = Math.sqrt(Math.random()) * (0.75 + t * 2.5);
    const a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * r, t * 5.6, Math.sin(a) * r], i * 3);
  }
  const geoPoeira = new THREE.BufferGeometry();
  geoPoeira.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const poeira = new THREE.Points(geoPoeira, new THREE.PointsMaterial({
    color: COR.ciano, size: 0.03, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  mesa.add(poeira);
  // chão polar
  const chao = [];
  for (const r of [4.5, 6, 8, 10.5]) {
    for (let i = 0; i < 128; i++) {
      const a1 = (i / 128) * Math.PI * 2;
      const a2 = ((i + 1) / 128) * Math.PI * 2;
      chao.push(Math.cos(a1) * r, -0.02, Math.sin(a1) * r, Math.cos(a2) * r, -0.02, Math.sin(a2) * r);
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    chao.push(Math.cos(a) * 3.5, -0.02, Math.sin(a) * 3.5, Math.cos(a) * 10.5, -0.02, Math.sin(a) * 10.5);
  }
  const geoChao = new THREE.BufferGeometry();
  geoChao.setAttribute('position', new THREE.Float32BufferAttribute(chao, 3));
  mesa.add(new THREE.LineSegments(geoChao, materialLinha(COR.azul, 0.16)));
  return { mesa, anelMarcas, facho, poeira, emissor };
}

function criarEstrelas() {
  const qtd = 1200;
  const pos = new Float32Array(qtd * 3);
  for (let i = 0; i < qtd; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(45 + Math.random() * 40);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: '#8fb8ff', size: 0.1, transparent: true, opacity: 0.3, depthWrite: false, fog: false }));
}

// mão desenhada em neon na frente da cena (presa à câmera)
function criarMaoVisual() {
  const grupo = new THREE.Group();
  const geoLinhas = new THREE.BufferGeometry();
  geoLinhas.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LIGACOES_MAO.length * 6), 3));
  const linhas = new THREE.LineSegments(geoLinhas, new THREE.LineBasicMaterial({ color: COR.ciano, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  const geoPontos = new THREE.BufferGeometry();
  geoPontos.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 3), 3));
  const pontos = new THREE.Points(geoPontos, new THREE.PointsMaterial({ color: COR.branco, size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const anel = circulo(0.16, 48, COR.verde, 0.9);
  anel.rotation.x = Math.PI / 2;
  grupo.add(linhas, pontos, anel);
  grupo.visible = false;
  grupo.renderOrder = 10;
  return { grupo, linhas, pontos, anel };
}

// ---------------- HUD ----------------
const CSS = `
.holo{ position:fixed; inset:0; z-index:90; background:#01060a; overflow:hidden; color:#e9f7f9; font-family:'Rajdhani',sans-serif; }
.holo canvas.holo-cena{ position:absolute; inset:0; width:100%; height:100%; display:block; cursor:grab; touch-action:none; }
.holo canvas.holo-cena:active{ cursor:grabbing; }
.holo::after{ content:""; position:absolute; inset:0; pointer-events:none;
  background: radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,4,8,0.75) 100%), repeating-linear-gradient(to bottom, rgba(143,243,247,0.03) 0 1px, transparent 1px 3px); }
.holo-topo{ position:absolute; top:0; left:0; right:0; z-index:2; display:flex; align-items:center; gap:18px; padding:18px 26px;
  background:linear-gradient(180deg, rgba(1,8,14,0.85), transparent); pointer-events:none; }
.holo-topo > *{ pointer-events:auto; }
.holo-marca h1{ margin:0; font-family:'Orbitron',sans-serif; font-weight:900; font-size:18px; letter-spacing:5px; color:#e9f7f9; text-shadow:0 0 18px rgba(77,232,240,0.6); }
.holo-marca small{ display:block; font-family:'Share Tech Mono',monospace; font-size:10.5px; letter-spacing:2.5px; color:#5f8791; margin-top:3px; }
.holo-topo .holo-espaco{ flex:1; }
.holo-relogio{ font-family:'Share Tech Mono',monospace; font-size:20px; letter-spacing:2px; color:#8ff3f7; }
.holo-btn{ white-space:nowrap; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; color:#4de8f0; background:rgba(4,16,24,0.7);
  border:1px solid rgba(77,232,240,0.38); border-radius:3px; padding:10px 16px; cursor:pointer; transition:background .2s, box-shadow .2s; }
.holo-btn:hover{ background:rgba(77,232,240,0.12); box-shadow:0 0 18px rgba(77,232,240,0.35); }
.holo-btn.ativo{ color:#01060a; background:#4de8f0; }
.holo-lado{ position:absolute; top:92px; z-index:2; width:250px; display:flex; flex-direction:column; gap:10px; }
.holo-esq{ left:22px; } .holo-dir{ right:22px; }
.holo-caixa{ position:relative; background:linear-gradient(160deg, rgba(14,34,48,0.72), rgba(6,18,26,0.55)); border:1px solid rgba(77,232,240,0.18);
  border-radius:4px; backdrop-filter:blur(8px); padding:12px 14px; }
.holo-caixa::before{ content:""; position:absolute; top:-1px; left:-1px; width:14px; height:14px; border-top:2px solid #4de8f0; border-left:2px solid #4de8f0; }
.holo-caixa h2{ margin:0 0 10px; font-family:'Orbitron',sans-serif; font-size:10.5px; letter-spacing:3.5px; color:#8ff3f7; }
.holo-formas{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.holo-formas button{ width:100%; display:grid; grid-template-columns:auto 1fr; gap:2px 10px; align-items:center; text-align:left; cursor:pointer;
  background:rgba(2,10,16,0.6); border:1px solid rgba(77,232,240,0.14); border-radius:3px; padding:8px 10px; color:#a9c6cd; transition:all .2s; }
.holo-formas button:hover{ border-color:rgba(77,232,240,0.5); color:#e9f7f9; }
.holo-formas button.ativo{ border-color:#4de8f0; color:#e9f7f9; box-shadow:0 0 16px rgba(77,232,240,0.25) inset; }
.holo-formas .cod{ grid-row:span 2; font-family:'Share Tech Mono',monospace; font-size:10px; color:#4de8f0; writing-mode:vertical-rl; transform:rotate(180deg); letter-spacing:1px; }
.holo-formas b{ font-family:'Orbitron',sans-serif; font-size:11.5px; letter-spacing:2.5px; font-weight:700; }
.holo-formas small{ font-size:12.5px; color:#5f8791; line-height:1.2; }
.holo-dados{ display:grid; grid-template-columns:auto 1fr; gap:5px 12px; margin:0; font-family:'Share Tech Mono',monospace; font-size:11.5px; }
.holo-dados dt{ color:#5f8791; letter-spacing:1px; } .holo-dados dd{ margin:0; text-align:right; color:#e9f7f9; }
.holo-desc{ margin:10px 0 0; font-size:14px; line-height:1.35; color:#a9c6cd; }
.holo-gesto{ font-family:'Orbitron',sans-serif; font-size:12px; letter-spacing:2.5px; color:#4de8f0; text-shadow:0 0 12px rgba(77,232,240,0.6); min-height:1.2em; }
.holo-acoes{ display:flex; gap:8px; flex-wrap:wrap; }
.holo-acoes .holo-btn{ flex:1; padding:9px 8px; font-size:10px; }
.holo-titulo{ position:absolute; left:50%; top:74px; transform:translateX(-50%); z-index:2; text-align:center; pointer-events:none; }
.holo-titulo span{ display:block; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:4px; color:#4de8f0; }
.holo-titulo strong{ display:block; font-family:'Orbitron',sans-serif; font-weight:900; font-size:clamp(22px,3.4vw,40px); letter-spacing:10px; color:#e9f7f9;
  text-shadow:0 0 26px rgba(77,232,240,0.7); animation:holo-revela .9s cubic-bezier(.2,.8,.2,1) both; }
@keyframes holo-revela{ from{ opacity:0; letter-spacing:30px; filter:blur(8px); } to{ opacity:1; filter:none; } }
.holo-guia{ position:absolute; left:50%; bottom:26px; transform:translateX(-50%); z-index:2; display:flex; gap:8px; flex-wrap:wrap; justify-content:center; max-width:calc(100% - 300px); }
.holo-guia span{ font-family:'Share Tech Mono',monospace; font-size:10.5px; letter-spacing:1.5px; color:#a9c6cd; padding:7px 11px; border:1px solid rgba(77,232,240,0.16);
  border-radius:20px; background:rgba(2,10,16,0.65); transition:all .2s; white-space:nowrap; }
.holo-guia span.ativo{ color:#01060a; background:#4de8f0; border-color:#4de8f0; box-shadow:0 0 18px rgba(77,232,240,0.6); }
.holo-camera{ position:absolute; right:22px; bottom:22px; z-index:2; width:220px; aspect-ratio:4/3; border:1px solid rgba(77,232,240,0.3); border-radius:4px; overflow:hidden; background:#000; }
.holo-camera video{ width:100%; height:100%; object-fit:cover; transform:scaleX(-1); filter:saturate(0.4) contrast(1.15) brightness(0.8); }
.holo-camera p{ position:absolute; left:8px; bottom:6px; margin:0; font-family:'Share Tech Mono',monospace; font-size:9.5px; letter-spacing:1.5px; color:#8ff3f7; text-shadow:0 0 6px #000; }
.holo-aviso{ position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:3; font-family:'Share Tech Mono',monospace; font-size:13px; letter-spacing:3px; color:#4de8f0; text-align:center; pointer-events:none; }
@media (max-width: 900px){
  .holo-lado{ width:auto; left:12px; right:12px; top:auto; bottom:14px; }
  .holo-dir, .holo-camera, .holo-titulo, .holo-guia, .holo-relogio, .holo-longo{ display:none; }
  .holo-formas{ flex-direction:row; overflow-x:auto; }
  .holo-formas button{ min-width:120px; }
  .holo-formas small{ display:none; }
  .holo-topo{ padding:12px 14px; }
  .holo-marca small{ display:none; }
}
@media (prefers-reduced-motion: reduce){ .holo-titulo strong{ animation:none; } }
`;

function montarHud(raiz) {
  if (!document.getElementById('holo-estilo')) {
    const estilo = document.createElement('style');
    estilo.id = 'holo-estilo';
    estilo.textContent = CSS;
    document.head.append(estilo);
  }
  raiz.classList.add('holo');
  raiz.innerHTML = `
    <canvas class="holo-cena" aria-label="Projeção holográfica 3D"></canvas>
    <div class="holo-topo">
      <div class="holo-marca"><h1>J.A.R.V.I.S.</h1><small>LABORATÓRIO HOLOGRÁFICO · PROJEÇÃO VOLUMÉTRICA</small></div>
      <div class="holo-espaco"></div>
      <div class="holo-relogio" data-h="relogio"></div>
      <button class="holo-btn" type="button" data-h="voltar">◂ <span class="holo-longo">VOLTAR AO </span>CONSOLE</button>
    </div>
    <aside class="holo-lado holo-esq">
      <section class="holo-caixa"><h2>PROJEÇÕES</h2><ul class="holo-formas" data-h="formas"></ul></section>
    </aside>
    <aside class="holo-lado holo-dir">
      <section class="holo-caixa"><h2>TELEMETRIA</h2><dl class="holo-dados" data-h="dados"></dl><p class="holo-desc" data-h="desc"></p></section>
      <section class="holo-caixa"><h2>CONTROLE</h2><div class="holo-gesto" data-h="gesto">—</div>
        <dl class="holo-dados" data-h="controle" style="margin-top:8px"></dl>
        <div class="holo-acoes" style="margin-top:10px">
          <button class="holo-btn" type="button" data-h="desmontar">DESMONTAR</button>
          <button class="holo-btn" type="button" data-h="centralizar">CENTRALIZAR</button>
        </div>
      </section>
    </aside>
    <div class="holo-titulo"><span data-h="codigo"></span><strong data-h="titulo"></strong></div>
    <div class="holo-guia" data-h="guia">
      <span data-g="punho">✊ PUNHO · GIRAR</span><span data-g="pinca">🤏 PINÇA · ZOOM</span><span data-g="aberta">🖐 ABERTA · DESMONTAR</span>
      <span data-g="dupla">👐 DUAS MÃOS · ESCALA</span><span data-g="deslize">↔ DESLIZAR · TROCAR</span>
    </div>
    <div class="holo-camera"><video playsinline muted></video><p data-h="camera">CÂMERA · INICIANDO</p></div>
    <div class="holo-aviso" data-h="aviso">INICIALIZANDO PROJETOR…</div>`;
  const h = {};
  for (const el of raiz.querySelectorAll('[data-h]')) h[el.dataset.h] = el;
  L.hud = h;
  L.video = raiz.querySelector('.holo-camera video');
  h.voltar.addEventListener('click', () => L.aoVoltar?.());
  h.desmontar.addEventListener('click', () => desmontar(!L.desmontadoPorComando));
  h.centralizar.addEventListener('click', centralizar);
  return raiz.querySelector('canvas');
}

function desenharListaFormas() {
  L.hud.formas.replaceChildren(...L.formas.map((f, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === L.indice ? 'ativo' : '';
    b.innerHTML = `<span class="cod">${f.codigo}</span><b>${f.titulo}</b><small>${f.descricao.split(':')[0].split(',')[0]}</small>`;
    b.addEventListener('click', () => mostrar(i));
    li.append(b);
    return li;
  }));
}

function atualizarHud() {
  const f = L.formas[L.indice];
  if (!f) return;
  const h = L.hud;
  h.relogio.textContent = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const grau = (r) => `${Math.round(THREE.MathUtils.radToDeg(r) % 360)}°`;
  h.dados.innerHTML = f.dados.map(([k, v]) => `<dt>${k.toUpperCase()}</dt><dd>${v}</dd>`).join('');
  const maos = L.maos.length;
  h.controle.innerHTML = [
    ['MÃOS', L.detector ? (maos ? `${maos} DETECTADA${maos > 1 ? 'S' : ''}` : 'AGUARDANDO') : 'CARREGANDO'],
    ['ESCALA', `${L.escala.toFixed(2)}×`],
    ['ROTAÇÃO', `${grau(L.rot.x)} / ${grau(L.rot.y)}`],
    ['ESTADO', L.explosao > 0.3 ? 'DESMONTADO' : 'MONTADO'],
    ['QUADROS', `${L.fps} FPS`],
    ['QUALIDADE', L.economia ? 'ECONÔMICA' : 'MÁXIMA'],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  h.gesto.textContent = NOMES_GESTO[L.duas ? 'dupla' : L.gesto] || '—';
  for (const s of h.guia.children) s.classList.toggle('ativo', s.dataset.g === (L.duas ? 'dupla' : L.gesto) || (s.dataset.g === 'deslize' && performance.now() - L.trocaEm < 700));
  h.desmontar.textContent = L.desmontadoPorComando ? 'MONTAR' : 'DESMONTAR';
  h.desmontar.classList.toggle('ativo', L.desmontadoPorComando);
}

function mostrarTitulo(f) {
  L.hud.codigo.textContent = `${f.codigo} · PROJEÇÃO ATIVA`;
  const novo = L.hud.titulo.cloneNode(false);
  novo.textContent = f.titulo;
  L.hud.titulo.replaceWith(novo);
  L.hud.titulo = novo;
  L.hud.desc.textContent = f.descricao;
}

// ---------------- mãos (MediaPipe) ----------------
async function iniciarCamera(stream) {
  try {
    L.stream = stream || await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    L.streamProprio = !stream;
    L.video.srcObject = L.stream;
    await L.video.play().catch(() => {});
    L.hud.camera.textContent = 'CÂMERA · CARREGANDO RASTREAMENTO';
    return true;
  } catch (erro) {
    L.hud.camera.textContent = 'CÂMERA BLOQUEADA · USE O MOUSE';
    return false;
  }
}

async function iniciarMaos() {
  if (L.detector) return;
  const { FilesetResolver, HandLandmarker } = await import(`${VISAO}/vision_bundle.mjs`);
  const arquivos = await FilesetResolver.forVisionTasks(`${VISAO}/wasm`);
  const opcoes = (delegate) => ({
    baseOptions: { modelAssetPath: MODELO_MAOS, delegate },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5,
  });
  try {
    L.detector = await HandLandmarker.createFromOptions(arquivos, opcoes('GPU'));
  } catch {
    L.detector = await HandLandmarker.createFromOptions(arquivos, opcoes('CPU'));
  }
  L.hud.camera.textContent = 'RASTREAMENTO DE MÃOS · ATIVO';
}

function lerMao(pts) {
  const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
  const palma = d(0, 9) || 1e-3;
  const estendido = (ponta, junta) => d(0, ponta) > d(0, junta) * 1.12;
  const dedos = [estendido(8, 6), estendido(12, 10), estendido(16, 14), estendido(20, 18)].filter(Boolean).length;
  const centro = [0, 5, 9, 13, 17].reduce((s, i) => ({ x: s.x + pts[i].x / 5, y: s.y + pts[i].y / 5 }), { x: 0, y: 0 });
  // pinça: polegar e indicador juntos com o indicador esticado (no punho o indicador fica dobrado)
  const pinca = d(4, 8) / palma < 0.32 && d(0, 8) > palma * 1.15;
  let gesto = 'nenhum';
  if (pinca) gesto = 'pinca';
  else if (dedos <= 1) gesto = 'punho';
  else if (dedos >= 4) gesto = 'aberta';
  const pontaPinca = { x: (pts[4].x + pts[8].x) / 2, y: (pts[4].y + pts[8].y) / 2 };
  return { gesto, centro, palma, pts, pontaPinca };
}

const raio = new THREE.Raycaster();
const plano = new THREE.Plane();
function pontoNoMundo(norm) {
  // a câmera aparece espelhada para a pessoa: x da imagem vira (1 - x)
  raio.setFromCamera(new THREE.Vector2((1 - norm.x) * 2 - 1, -(norm.y * 2 - 1)), L.camera);
  plano.setFromNormalAndCoplanarPoint(L.camera.getWorldDirection(new THREE.Vector3()).negate(), L.projecao.getWorldPosition(new THREE.Vector3()));
  const alvo = new THREE.Vector3();
  return raio.ray.intersectPlane(plano, alvo) ? alvo : null;
}

function processarMaos(agora) {
  if (!L.detector || !L.video || L.video.readyState < 2 || L.video.currentTime === L.ultimoTempoVideo) return;
  L.ultimoTempoVideo = L.video.currentTime;
  let resultado;
  try {
    resultado = L.detector.detectForVideo(L.video, agora);
  } catch {
    return;
  }
  const novas = (resultado.landmarks || []).map(lerMao);
  // um gesto só vale depois de aparecer em 3 quadros seguidos
  novas.forEach((m, i) => {
    const antes = L.maos[i];
    m.contagem = antes && antes.gestoBruto === m.gesto ? antes.contagem + 1 : 1;
    m.gestoBruto = m.gesto;
    m.gesto = m.contagem >= 3 ? m.gesto : (antes ? antes.gesto : 'nenhum');
  });
  const anteriores = L.maos;
  L.maos = novas;
  if (novas.length) L.ultimaMaoEm = agora;
  desenharMaos();

  // duas mãos abertas ou em pinça: afastar amplia, aproximar reduz
  if (novas.length === 2 && novas.every((m) => m.gesto === 'aberta' || m.gesto === 'pinca')) {
    const dist = Math.hypot(novas[0].centro.x - novas[1].centro.x, novas[0].centro.y - novas[1].centro.y);
    if (!L.duas) L.duas = { dist, escala: L.escalaAlvo };
    L.escalaAlvo = THREE.MathUtils.clamp(L.duas.escala * (dist / L.duas.dist), 0.35, 2.8);
    L.gesto = 'dupla';
    L.explosaoAlvo = L.desmontadoPorComando ? 2.2 : 0;
    L.atracaoAlvo = 0;
    return;
  }
  L.duas = null;
  const m = novas[0];
  const antes = anteriores[0];
  if (!m) {
    L.gesto = 'nenhum';
    L.historico = [];
    L.explosaoAlvo = L.desmontadoPorComando ? 2.2 : 0;
    L.atracaoAlvo = 0;
    return;
  }
  L.gesto = m.gesto;
  if (m.gesto === 'punho' && antes) {
    const dx = (1 - m.centro.x) - (1 - antes.centro.x);
    const dy = m.centro.y - antes.centro.y;
    L.rot.vy = dx * 7;
    L.rot.vx = dy * 5;
  }
  if (m.gesto === 'pinca' && antes && antes.gesto === 'pinca') {
    L.escalaAlvo = THREE.MathUtils.clamp(L.escalaAlvo * (1 - (m.pontaPinca.y - antes.pontaPinca.y) * 3.2), 0.35, 2.8);
  }
  if (m.gesto === 'aberta') {
    L.explosaoAlvo = 2.2;
    L.atracaoAlvo = 0.82;
    const p = pontoNoMundo(m.centro);
    if (p) L.nuvem.material.uniforms.uAtrator.value.copy(L.nuvem.worldToLocal(p));
    // deslize rápido para o lado troca a projeção
    L.historico.push({ t: agora, x: 1 - m.centro.x });
    L.historico = L.historico.filter((h) => agora - h.t < 320);
    const dx = L.historico.length > 2 ? L.historico[L.historico.length - 1].x - L.historico[0].x : 0;
    if (Math.abs(dx) > 0.3 && agora - L.trocaEm > 1400) {
      L.trocaEm = agora;
      L.historico = [];
      mostrar(L.indice + (dx > 0 ? 1 : -1));
    }
  } else {
    L.historico = [];
    L.explosaoAlvo = L.desmontadoPorComando ? 2.2 : 0;
    L.atracaoAlvo = 0;
  }
}

function desenharMaos() {
  const dist = 6;
  const altura = 2 * Math.tan(THREE.MathUtils.degToRad(L.camera.fov / 2)) * dist;
  const largura = altura * L.camera.aspect;
  L.maosVisuais.forEach((v, i) => {
    const m = L.maos[i];
    v.grupo.visible = !!m;
    if (!m) return;
    const p = (pt) => [((1 - pt.x) - 0.5) * largura, -(pt.y - 0.5) * altura, -dist];
    const pontos = v.pontos.geometry.attributes.position;
    m.pts.forEach((pt, k) => pontos.setXYZ(k, ...p(pt)));
    pontos.needsUpdate = true;
    const linhas = v.linhas.geometry.attributes.position;
    LIGACOES_MAO.forEach(([a, b], k) => {
      linhas.setXYZ(k * 2, ...p(m.pts[a]));
      linhas.setXYZ(k * 2 + 1, ...p(m.pts[b]));
    });
    linhas.needsUpdate = true;
    v.linhas.material.color.set(CORES_GESTO[m.gesto] || CORES_GESTO.nenhum);
    v.anel.visible = m.gesto === 'pinca' || m.gesto === 'aberta';
    v.anel.position.set(...p(m.gesto === 'pinca' ? m.pontaPinca : m.centro));
    v.anel.material.color.set(CORES_GESTO[m.gesto]);
  });
}

// ---------------- mouse e teclado ----------------
function ligarControlesManuais(canvas) {
  canvas.addEventListener('pointerdown', (e) => {
    L.arraste = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!L.arraste) return;
    L.rot.vy = (e.clientX - L.arraste.x) * 0.006;
    L.rot.vx = (e.clientY - L.arraste.y) * 0.004;
    L.arraste = { x: e.clientX, y: e.clientY };
  });
  const soltar = () => { L.arraste = null; };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    L.escalaAlvo = THREE.MathUtils.clamp(L.escalaAlvo * (1 - e.deltaY * 0.0012), 0.35, 2.8);
  }, { passive: false });
  canvas.addEventListener('dblclick', () => desmontar(!L.desmontadoPorComando));
  addEventListener('keydown', (e) => {
    if (!L.aberto || e.target.closest?.('input, textarea')) return;
    if (e.key === 'ArrowRight') mostrar(L.indice + 1);
    else if (e.key === 'ArrowLeft') mostrar(L.indice - 1);
    else if (e.key === 'Escape') L.aoVoltar?.();
    else if (e.key === ' ') {
      e.preventDefault();
      desmontar(!L.desmontadoPorComando);
    }
  });
}

// ---------------- cena ----------------
async function montarCena(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor('#01060a');
  const cena = new THREE.Scene();
  cena.fog = new THREE.FogExp2('#01060a', 0.035);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 1.2, 11);
  camera.lookAt(0, 0.1, 0);
  cena.add(camera);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(cena, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.75, 0.45, 0.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  Object.assign(L, { renderer, cena, camera, composer, bloom });

  cena.add(criarEstrelas());
  const mesa = criarMesa();
  L.mesa = mesa;
  cena.add(mesa.mesa);
  L.projecao = new THREE.Group();
  L.projecao.position.y = 0.35;
  cena.add(L.projecao);
  L.nuvem = criarNuvem();
  L.projecao.add(L.nuvem);
  L.maosVisuais = [criarMaoVisual(), criarMaoVisual()];
  for (const v of L.maosVisuais) camera.add(v.grupo);

  L.formas = [formaTerra(), formaSaturno(), formaReator(), formaAtomo(), formaDna(), formaCidade()];
  const geo = L.nuvem.geometry;
  const f = L.formas[0];
  // começa vindo de uma esfera espalhada, para a primeira projeção "montar" na frente da pessoa
  const espalhada = new Float32Array(TOTAL * 3);
  for (let i = 0; i < TOTAL; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(5 + Math.random() * 6);
    espalhada.set([v.x, v.y, v.z], i * 3);
  }
  geo.attributes.position.array.set(espalhada);
  geo.attributes.cor.array.set(f.cores);
  geo.attributes.destino.array.set(f.posicoes);
  geo.attributes.corDestino.array.set(f.cores);
  for (const nome of ['position', 'cor', 'destino', 'corDestino']) geo.attributes[nome].needsUpdate = true;
  L.morph = 0;
  L.linhas = f.linhas;
  L.projecao.add(L.linhas);
  ajustarTamanho();
  addEventListener('resize', ajustarTamanho);
}

function ajustarTamanho() {
  if (!L.renderer) return;
  const w = L.raiz.clientWidth || innerWidth;
  const h = L.raiz.clientHeight || innerHeight;
  L.renderer.setSize(w, h, false);
  L.composer.setSize(w, h);
  L.camera.aspect = w / h;
  // em tela em pé a câmera se afasta para caber a projeção
  L.camera.position.z = w / h < 1 ? 15 : 11;
  L.camera.updateProjectionMatrix();
  L.nuvem.material.uniforms.uPixel.value = L.renderer.getPixelRatio() * (h / 900);
}

function quadro() {
  if (!L.aberto) return;
  L.quadro = requestAnimationFrame(quadro);
  const delta = L.relogio.getDelta();
  const dt = Math.min(delta, 0.05);
  const t = L.relogio.elapsedTime;
  const agora = performance.now();
  L.fps = Math.round(L.fps * 0.9 + (1 / Math.max(delta, 1e-3)) * 0.1);
  processarMaos(agora);

  // giro com inércia; parado, gira sozinho bem devagar
  const ocioso = !L.arraste && agora - L.ultimaMaoEm > 1500;
  L.rot.y += L.rot.vy + (ocioso ? dt * 0.12 : 0);
  L.rot.x = THREE.MathUtils.clamp(L.rot.x + L.rot.vx, -1.2, 1.2);
  L.rot.vy *= 0.9;
  L.rot.vx *= 0.9;
  L.projecao.rotation.set(L.rot.x, L.rot.y, 0);
  L.escala = THREE.MathUtils.lerp(L.escala, L.escalaAlvo, 0.12);
  L.projecao.scale.setScalar(L.escala);
  L.explosao = THREE.MathUtils.lerp(L.explosao, L.explosaoAlvo, L.explosaoAlvo > L.explosao ? 0.05 : 0.12);
  L.atracao = THREE.MathUtils.lerp(L.atracao, L.atracaoAlvo, 0.08);
  L.morph = Math.min(1, L.morph + Math.min(delta, 0.25) / 2.2);   // a transformação dura ~2 s mesmo com poucos quadros

  const u = L.nuvem.material.uniforms;
  u.uTempo.value = t;
  u.uMorph.value = L.morph;
  u.uExplosao.value = L.explosao;
  u.uAtracao.value = L.atracao;
  // as linhas da forma somem quando ela desmonta e acendem quando a transformação termina
  // (animações de piscar usam userData.pulso, para não brigar com esse apagar)
  L.formas[L.indice].animar(t);
  const visLinhas = Math.max(0, Math.min(1, (L.morph - 0.55) / 0.45)) * (1 - Math.min(1, L.explosao / 1.2));
  L.linhas.traverse((o) => {
    if (o.material) {
      o.material.userData.base ??= o.material.opacity;
      o.material.opacity = o.material.userData.base * visLinhas * (o.material.userData.pulso ?? 1);
    }
  });

  L.mesa.anelMarcas.rotation.y = t * 0.15;
  L.mesa.facho.material.uniforms.uTempo.value = t;
  L.mesa.emissor.scale.setScalar(1.05 + Math.sin(t * 2.4) * 0.1);
  const poeira = L.mesa.poeira.geometry.attributes.position;
  for (let i = 0; i < poeira.count; i++) {
    let y = poeira.getY(i) + dt * (0.25 + (i % 7) * 0.05);
    if (y > 5.6) y = 0;
    poeira.setY(i, y);
  }
  poeira.needsUpdate = true;

  // sem aceleração de vídeo (ou placa fraca) o bloom pesa demais: depois de 3 s lentos, desliga e baixa a resolução
  if (!L.economia) {
    if (L.fps >= 24) L.lentoDesde = 0;
    else if (!L.lentoDesde) L.lentoDesde = agora;
    else if (agora - L.lentoDesde > 3000) {
      L.economia = true;
      L.renderer.setPixelRatio(1);
      ajustarTamanho();
    }
  }
  if (L.economia) L.renderer.render(L.cena, L.camera);
  else L.composer.render();
  if (Math.floor(t * 5) !== L.ultimoHud) {
    L.ultimoHud = Math.floor(t * 5);
    atualizarHud();
  }
}

// ---------------- API usada pelo console ----------------
export async function abrir({ raiz, stream = null, aoVoltar = null } = {}) {
  L.aoVoltar = aoVoltar;
  if (L.aberto) return estadoAtual();
  raiz.hidden = false;
  L.raiz = raiz;
  if (!L.pronto) {
    const canvas = montarHud(raiz);
    ligarControlesManuais(canvas);
    await montarCena(canvas);
    desenharListaFormas();
    mostrarTitulo(L.formas[0]);
    L.pronto = true;
  }
  L.hud.aviso.textContent = '';
  L.aberto = true;
  L.relogio.getDelta();
  ajustarTamanho();
  quadro();
  if (await iniciarCamera(stream)) {
    iniciarMaos().catch((erro) => {
      L.hud.camera.textContent = 'RASTREAMENTO INDISPONÍVEL · USE O MOUSE';
      console.warn('Mãos:', erro);
    });
  }
  return estadoAtual();
}

export function fechar() {
  if (!L.aberto) return;
  L.aberto = false;
  cancelAnimationFrame(L.quadro);
  if (L.streamProprio && L.stream) L.stream.getTracks().forEach((tr) => tr.stop());
  L.stream = null;
  if (L.video) L.video.srcObject = null;
  L.maos = [];
  if (L.raiz) L.raiz.hidden = true;
}

export function mostrar(alvo) {
  if (!L.pronto) return 'O laboratório ainda não abriu.';
  let i = typeof alvo === 'number' ? alvo : L.formas.findIndex((f) => normalizar(f.titulo).includes(normalizar(alvo)) || f.chave === normalizar(alvo));
  if (i < 0) return `Não tenho a projeção "${alvo}". Tenho: ${L.formas.map((f) => f.titulo).join(', ')}.`;
  i = (i + L.formas.length) % L.formas.length;
  if (i === L.indice && L.morph >= 1) return `Já estou exibindo ${L.formas[i].titulo}.`;
  const geo = L.nuvem.geometry;
  // de onde as partículas estão agora até a nova forma
  const m = L.morph;
  const pos = geo.attributes.position.array;
  const dest = geo.attributes.destino.array;
  const cor = geo.attributes.cor.array;
  const corDest = geo.attributes.corDestino.array;
  for (let k = 0; k < pos.length; k++) {
    pos[k] += (dest[k] - pos[k]) * m;
    cor[k] += (corDest[k] - cor[k]) * m;
  }
  const f = L.formas[i];
  dest.set(f.posicoes);
  corDest.set(f.cores);
  for (const nome of ['position', 'cor', 'destino', 'corDestino']) geo.attributes[nome].needsUpdate = true;
  L.morph = 0;
  L.projecao.remove(L.linhas);
  L.linhas = f.linhas;
  L.projecao.add(L.linhas);
  L.indice = i;
  desenharListaFormas();
  mostrarTitulo(f);
  return `Exibindo ${f.titulo}: ${f.descricao}`;
}

export function desmontar(sim = true) {
  L.desmontadoPorComando = !!sim;
  L.explosaoAlvo = sim ? 2.2 : 0;
  L.atracaoAlvo = 0;
  return sim ? 'Projeção desmontada.' : 'Projeção montada de novo.';
}

export function girar(graus = 90) {
  L.rot.y += THREE.MathUtils.degToRad(graus);
  return `Girei ${graus} graus.`;
}

export function centralizar() {
  Object.assign(L.rot, { x: 0.18, y: 0, vx: 0, vy: 0 });
  L.escalaAlvo = 1;
  desmontar(false);
  return 'Projeção centralizada.';
}

export function estadoAtual() {
  const f = L.formas[L.indice];
  return { aberto: L.aberto, forma: f?.titulo, formas: L.formas.map((x) => x.titulo), maos: L.maos.length, rastreamento: !!L.detector };
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
}
