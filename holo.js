/*
 * holo.js — Laboratório holográfico do Jarvis.
 *
 * Uma tela inteira com três modos, trocados no alto da tela:
 *   PROJEÇÕES  15 projeções 3D de partículas (Terra, Lua, Sistema Solar, Galáxia,
 *              Buraco Negro, Reator Arc, Turbina, Drone, Átomo, DNA, Molécula,
 *              Coração, Cidade, Terreno...) sobre uma mesa de projeção
 *   APPS       os programas do PC num mural (holo-apps.js), abertos com a mão
 *   CRIAR      um ateliê para desenhar no ar e criar formas (holo-criar.js)
 * O dedo apontado vira um cursor que clica em qualquer botão (pinça ou segurar parado).
 * Nas projeções, as mãos controlam como o Tony Stark faz:
 *   punho fechado + mover  -> gira a projeção
 *   pinça + subir/descer   -> zoom
 *   mão aberta             -> desmonta; as partículas seguem a mão
 *   duas mãos              -> afastar/aproximar amplia ou reduz
 *   deslizar a mão rápido  -> troca de projeção
 * Também funciona com mouse/teclado e com a voz (ferramenta "holograma"). O que a pessoa
 * faz aqui vira avisos para o Jarvis (aoEvento), e capturar() tira uma foto da cena.
 *
 * Dois visuais, trocados por um botão: HOLOGRAMA (partículas, como no cinema, numa
 * sala com piso que reflete e luz volumétrica) e FOTO REAL (objetos de verdade,
 * em holo-real.js). A Terra usa o sol de agora e a posição real da ISS.
 *
 * Carregado só quando o laboratório abre (import dinâmico no index.html, que
 * define o importmap de "three").
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COR, placaFraca, materialLinha, circulo, brilho, texturaBrilho, criarSala, criarLente, ambienteEstudio, criarSom } from './cena.js';
import { criarReal } from './holo-real.js';
import { formaLua, formaSistemaSolar, formaGalaxia, formaBuracoNegro, formaTurbina, formaDrone, formaMolecula, formaCoracao, formaTerreno } from './holo-formas.js';
import { criarMuralApps } from './holo-apps.js';
import { criarAtelie } from './holo-criar.js';

// ---------------- CONFIG ----------------
const VISAO = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const MODELO_MAOS = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
// toda projeção usa o mesmo tanto de partículas, para uma virar a outra; o total depende da placa de vídeo
const TOTAL_NORMAL = 60000;
const TOTAL_LEVE = 20000;
const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
const MARCADOR = { nome: 'Campo Mourão · PR', lat: -24.05, lon: -52.38 };
// ----------------------------------------

const LIGACOES_MAO = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const CORES_GESTO = { punho: '#ffa24c', pinca: '#5dfca0', aberta: '#4de8f0', aponta: '#b794ff', nenhum: '#8ff3f7' };
const NOMES_GESTO = {
  projecoes: { punho: 'PUNHO · GIRAR', pinca: 'PINÇA · ZOOM', aberta: 'MÃO ABERTA · DESMONTAR', aponta: 'DEDO · TOCAR', dupla: 'DUAS MÃOS · ESCALA', nenhum: '—' },
  apps: { punho: 'PUNHO', pinca: 'PINÇA · ABRIR', aberta: 'MÃO ABERTA · PÁGINA', aponta: 'DEDO · MIRAR', dupla: 'DUAS MÃOS', nenhum: '—' },
  criar: { punho: 'PUNHO · GIRAR', pinca: 'PINÇA · CRIAR / PEGAR', aberta: 'MÃO ABERTA', aponta: 'DEDO · DESENHAR', dupla: 'DUAS MÃOS · ESCALA', nenhum: '—' },
};
const GUIAS = {
  projecoes: [['punho', '✊ PUNHO · GIRAR'], ['pinca', '🤏 PINÇA · ZOOM'], ['aberta', '🖐 ABERTA · DESMONTAR'], ['aponta', '☝ DEDO · TOCAR / MIRAR'], ['dupla', '👐 DUAS MÃOS · ESCALA'], ['deslize', '↔ DESLIZAR · TROCAR']],
  apps: [['aponta', '☝ DEDO · MIRAR'], ['pinca', '🤏 PINÇA · ABRIR'], ['segurar', '⏱ SEGURAR PARADO · ABRIR'], ['deslize', '↔ MÃO ABERTA · PÁGINA']],
  criar: [['aponta', '☝ DEDO · DESENHAR'], ['pinca', '🤏 PINÇA · CRIAR / PEGAR'], ['punho', '✊ PUNHO · GIRAR'], ['dupla', '👐 DUAS MÃOS · ESCALA']],
};
const NOME_MODO = { projecoes: 'projeções', apps: 'apps', criar: 'criar' };

// ---------------- estado ----------------
const L = {
  pronto: false,
  aberto: false,
  raiz: null,
  aoVoltar: null,
  quadro: 0,
  ultimoQuadro: 0,
  tempo: 0,
  modo: 'holo',         // 'holo' (holograma de cinema) ou 'real' (foto real)
  modoLab: 'projecoes', // 'projecoes', 'apps' (mural de apps do PC) ou 'criar' (ateliê)
  fatorModo: 1,         // quanto da projeção aparece no modo atual
  cursor: { x: 0, y: 0, mao: false, alvo: null, desde: 0, carga: 0, travaAte: 0, feito: null },
  mural: null,
  atelie: null,
  apps: null,
  aoEvento: null,
  diario: [],
  kit: null,
  palmaRef: 0,
  rotCriar: { x: 0.25, y: 0, vx: 0, vy: 0 },
  escalaCriar: 1,
  escalaCriarAlvo: 1,
  mouseCria: null,
  som: criarSom(),
  sala: null,
  estrelas: null,
  raios: null,
  raiosEm: 0,
  neblina: null,
  luzSol: null,
  luzCeu: null,
  lente: null,
  intro: 1,
  camZ: 11,
  ponteiro: { x: 0, y: 0 },
  paralaxe: { x: 0, y: 0 },
  opNuvem: 1,
  solAtivo: 0,
  proximoGlitch: 0,
  glitchAte: 0,
  dedoForca: 0,
  dedoAlvo: 0,
  gestoAntes: 'nenhum',
  rotulosDom: [],
  clima: '',
  aoTrocarVisual: null,
  economia: false,
  placaFraca: false,
  economiaDesde: 0,
  tentativasEconomia: 0,
  lentoDesde: 0,
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

let TOTAL = TOTAL_NORMAL;
let Q = TOTAL / 26000;
const q = (n) => Math.round(n * Q);   // as formas foram pensadas para 26 mil partículas

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
  esferaFibonacci(q(64000), (x, y, z) => {
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
    fragmentShader: 'uniform vec3 uCor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(1.0 - abs(dot(vN, vV)), 0.0), 4.0) * 0.3; gl_FragColor = vec4(uCor * f, f); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  }));
  linhas.add(halo);

  // o que aparece nos dois visuais: o marcador da cidade e a ISS de verdade
  const comuns = new THREE.Group();

  const [mx, my, mz] = pos(THREE.MathUtils.degToRad(MARCADOR.lat), THREE.MathUtils.degToRad(MARCADOR.lon), R);
  const normal = new THREE.Vector3(mx, my, mz).normalize();
  const topoMarcador = normal.clone().multiplyScalar(R * 1.28);
  const haste = new THREE.Line(new THREE.BufferGeometry().setFromPoints([normal.clone().multiplyScalar(R), topoMarcador]), materialLinha(COR.laranja, 0.9));
  const pulso = circulo(0.14, 48, COR.laranja, 0.9);
  pulso.position.copy(normal.clone().multiplyScalar(R * 1.012));
  pulso.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  const ponta = brilho(COR.laranja, 0.3);
  ponta.position.copy(topoMarcador);
  comuns.add(haste, pulso, ponta);

  // a ISS: posição real a cada poucos segundos; o plano da órbita sai de duas posições seguidas
  const RAIO_ISS = R * 1.16;
  const estacao = brilho(COR.branco, 0.26);
  estacao.visible = false;
  const anelIss = circulo(RAIO_ISS, 180, COR.ciano, 0.32);
  anelIss.visible = false;
  comuns.add(estacao, anelIss);
  const iss = { dados: null, alvo: new THREE.Vector3(), anterior: null };
  const atualizarIss = async () => {
    try {
      const d = await fetch(ISS_URL).then((r) => r.json());
      if (typeof d.latitude !== 'number') return;
      iss.dados = d;
      const novo = new THREE.Vector3(...pos(THREE.MathUtils.degToRad(d.latitude), THREE.MathUtils.degToRad(d.longitude), RAIO_ISS));
      if (!estacao.visible) estacao.position.copy(novo);
      estacao.visible = true;
      if (iss.anterior && iss.anterior.distanceTo(novo) > 0.002) {
        anelIss.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), iss.anterior.clone().cross(novo).normalize());
        anelIss.visible = true;
      }
      iss.anterior = novo.clone();
      iss.alvo.copy(novo);
    } catch {
      // sem internet a estação só não aparece
    }
  };

  // o sol de agora: ponto da Terra onde ele está a pino (aproximação boa para ver dia e noite)
  const direcaoSol = new THREE.Vector3(1, 0, 0);
  const atualizarSol = () => {
    const d = new Date();
    const dia = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
    const declinacao = THREE.MathUtils.degToRad(-23.44 * Math.cos((2 * Math.PI / 365) * (dia + 10)));
    const horas = d.getUTCHours() + d.getUTCMinutes() / 60;
    const lon = THREE.MathUtils.degToRad(-15 * (horas - 12));
    direcaoSol.set(...pos(declinacao, lon, 1)).normalize();
  };
  atualizarSol();
  const eDia = () => normal.dot(direcaoSol) > 0;

  return {
    chave: 'terra', codigo: 'GEO-01', titulo: 'TERRA', solAtivo: true,
    sol: () => direcaoSol,
    descricao: `Continentes de verdade, dia e noite conforme o sol de agora, a ISS na posição real e marcador em ${MARCADOR.nome}.`,
    dados: () => [
      ['Partículas', TOTAL.toLocaleString('pt-BR')],
      ['Em Campo Mourão', eDia() ? 'DIA' : 'NOITE'],
      ['ISS', iss.dados ? `${Math.round(iss.dados.altitude)} km` : 'LOCALIZANDO'],
      ['Velocidade', iss.dados ? `${Math.round(iss.dados.velocity).toLocaleString('pt-BR')} km/h` : '—'],
    ],
    posicoes: g.posicoes, cores: g.cores, linhas, comuns,
    opcoesReal: { giro, sol: () => direcaoSol },
    rotulos: [
      { titulo: 'CAMPO MOURÃO', valor: () => L.clima || `${Math.abs(MARCADOR.lat).toFixed(1)}°S ${Math.abs(MARCADOR.lon).toFixed(1)}°O`, ponto: () => topoMarcador, frente: true },
      { titulo: 'ISS', valor: () => (iss.dados ? `${Math.round(iss.dados.altitude)} KM · ${Math.round(iss.dados.velocity).toLocaleString('pt-BR')} KM/H` : ''), ponto: () => estacao.position, frente: true, visivel: () => !!iss.dados },
    ],
    aoEntrar() {
      atualizarSol();
      atualizarIss();
      clearInterval(L.relogioIss);
      L.relogioIss = setInterval(() => {
        if (!L.aberto) return;
        atualizarSol();
        atualizarIss();
      }, 5000);
    },
    aoSair() {
      clearInterval(L.relogioIss);
    },
    animar(t) {
      const s = 1 + ((t * 0.9) % 1) * 2.2;
      pulso.scale.setScalar(s);
      pulso.material.userData.pulso = 1 - ((t * 0.9) % 1);
      if (estacao.visible) estacao.position.lerp(iss.alvo, 0.04);
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
  esferaFibonacci(q(8000), (x, y, z) => {
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
    posicoes: g.posicoes, cores: g.cores, linhas,
    rotulos: [
      { titulo: 'ANEL B', valor: 'O MAIS DENSO', ponto: () => new THREE.Vector3(Math.cos(3.6) * 2.5, 0, Math.sin(3.6) * 2.5).applyEuler(inclina), frente: false },
      { titulo: 'DIVISÃO DE CASSINI', valor: '4.800 KM', ponto: () => new THREE.Vector3(Math.cos(0.5) * 2.96, 0, Math.sin(0.5) * 2.96).applyEuler(inclina), frente: false },
    ],
    animar() {},
  };
}

function formaReator() {
  const g = gerador();
  const polar = (r, a, z, cor, b) => g.add(Math.cos(a) * r, Math.sin(a) * r, z, cor, b);
  // núcleo
  for (let i = 0; i < q(3200); i++) {
    const r = Math.pow(Math.random(), 0.7) * 0.55;
    polar(r, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25, COR.branco, 1.1 - r);
  }
  // anel interno
  for (let i = 0; i < q(2600); i++) polar(1.0 + Math.random() * 0.2, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.18, COR.ciano, 0.9);
  // dez bobinas
  for (let b = 0; b < 10; b++) {
    const centro = (b / 10) * Math.PI * 2;
    for (let i = 0; i < q(1250); i++) {
      const r = 1.38 + Math.random() * 0.78;
      const a = centro + (Math.random() - 0.5) * THREE.MathUtils.degToRad(24);
      polar(r, a, (Math.random() - 0.5) * 0.32, COR.ciano.clone().lerp(COR.branco, Math.random() * 0.4), 0.55 + (r - 1.38) * 0.4);
    }
  }
  // carcaça
  for (let i = 0; i < q(3000); i++) polar(2.32 + Math.random() * 0.2, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4, COR.azul.clone().lerp(COR.ciano, 0.5), 0.7);
  // triângulo central
  const vertices = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2 + Math.PI / 2);
  for (let i = 0; i < q(1500); i++) {
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
    rotulos: [
      { titulo: 'NÚCLEO', valor: () => `${(3 + Math.sin(performance.now() / 900) * 0.04).toFixed(2)} GJ/S`, ponto: () => new THREE.Vector3(0.1, 0.1, 0.25), frente: false },
      { titulo: 'BOBINA 03', valor: () => `CARGA ${Math.round(97 + Math.sin(performance.now() / 1300) * 2)}%`, ponto: () => new THREE.Vector3(Math.cos(0.6) * 1.8, Math.sin(0.6) * 1.8, 0.2), frente: false },
    ],
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
    for (let k = 0; k < q(120); k++) {
      const p = new THREE.Vector3().randomDirection().multiplyScalar(Math.cbrt(Math.random()) * 0.15).add(c);
      g.add(p.x, p.y, p.z, cor, 0.9);
    }
  });
  // como o símbolo do átomo: três elipses a 60° uma da outra, com uma leve inclinação para dar volume
  const orbitas = [0, 1, 2].map((i) => new THREE.Euler(0.35, 0.3, (i * Math.PI) / 3));
  const elipse = (a, alvo) => alvo.set(Math.cos(a) * 2.7, Math.sin(a) * 1.05, 0);
  const v = new THREE.Vector3();
  for (const e of orbitas) {
    for (let k = 0; k < q(3200); k++) {
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
    rotulos: [
      { titulo: 'NÚCLEO', valor: '20 PRÓTONS · 20 NÊUTRONS', ponto: () => new THREE.Vector3(0.2, 0.25, 0.2), frente: false },
      { titulo: 'ELÉTRON', valor: 'ÓRBITA 1', ponto: () => eletrons[0].eletron.position, frente: false },
    ],
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
  for (let i = 0; i < q(15000); i++) {
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
    for (let i = 0; i < q(170); i++) {
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
    posicoes: g.posicoes, cores: g.cores, linhas,
    rotulos: [
      { titulo: 'PAR A–T', valor: 'ADENINA · TIMINA', ponto: () => fita(0.72, 0), frente: false },
      { titulo: 'PAR G–C', valor: 'GUANINA · CITOSINA', ponto: () => fita(0.3, Math.PI), frente: false },
    ],
    animar() {},
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
    const qtd = Math.round((Math.hypot(a[3] - a[0], a[4] - a[1], a[5] - a[2]) / comprimento) * q(10000));
    for (let i = 0; i < qtd; i++) {
      const t = Math.random();
      const y = THREE.MathUtils.lerp(a[1], a[4], t);
      g.add(THREE.MathUtils.lerp(a[0], a[3], t), y, THREE.MathUtils.lerp(a[2], a[5], t), COR.ciano.clone().lerp(COR.branco, (y - base) / 3.4), 0.5);
    }
  }
  // janelas acesas nas fachadas
  for (let i = 0; i < q(4000); i++) {
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
  const torre = predios.reduce((a, b) => (b.h > a.h ? b : a));
  const maisAlto = torre.h;
  return {
    chave: 'cidade', codigo: 'URB-06', titulo: 'CIDADE',
    descricao: 'Mapa urbano volumétrico de 121 quadras, com varredura de altura.',
    dados: [['Partículas', TOTAL.toLocaleString('pt-BR')], ['Quadras', String(predios.length)], ['Torre mais alta', `${Math.round(maisAlto * 100)} m`], ['Varredura', 'ATIVA']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    opcoesReal: { predios, base },
    rotulos: [
      { titulo: 'TORRE CENTRAL', valor: `${Math.round(maisAlto * 100)} M`, ponto: () => new THREE.Vector3(torre.x, base + torre.h, torre.z), frente: false },
    ],
    animar(t) {
      varredura.position.y = base + (0.5 - 0.5 * Math.cos(t * 0.8)) * 3.3;
    },
  };
}

// ---------------- catálogo ----------------
// a lista do painel; cada projeção só é gerada na primeira vez que aparece
const CATALOGO = [
  { chave: 'terra', codigo: 'GEO-01', titulo: 'TERRA', resumo: 'Continentes de verdade', grupo: 'ESPAÇO', criar: formaTerra, apelidos: ['globo', 'planeta terra', 'mundo'] },
  { chave: 'lua', codigo: 'LUA-07', titulo: 'LUA', resumo: 'Crateras e a fase de hoje', grupo: 'ESPAÇO', criar: formaLua },
  { chave: 'saturno', codigo: 'AST-02', titulo: 'SATURNO', resumo: 'Faixas e anéis', grupo: 'ESPAÇO', criar: formaSaturno },
  { chave: 'solar', codigo: 'SOL-08', titulo: 'SISTEMA SOLAR', resumo: 'O Sol e oito planetas', grupo: 'ESPAÇO', criar: formaSistemaSolar, apelidos: ['planetas', 'sol'] },
  { chave: 'galaxia', codigo: 'GAL-09', titulo: 'VIA LÁCTEA', resumo: 'Galáxia espiral', grupo: 'ESPAÇO', criar: formaGalaxia, apelidos: ['galaxia', 'estrelas'] },
  { chave: 'buraco', codigo: 'BHL-10', titulo: 'BURACO NEGRO', resumo: 'Disco de acreção', grupo: 'ESPAÇO', criar: formaBuracoNegro },
  { chave: 'reator', codigo: 'ARC-03', titulo: 'REATOR ARC', resumo: 'Núcleo de energia', grupo: 'TECNOLOGIA', criar: formaReator, apelidos: ['reator arc', 'arc'] },
  { chave: 'turbina', codigo: 'ENG-11', titulo: 'TURBINA', resumo: 'Motor a jato em corte', grupo: 'TECNOLOGIA', criar: formaTurbina, apelidos: ['motor', 'jato', 'motor a jato'] },
  { chave: 'drone', codigo: 'DRN-12', titulo: 'DRONE', resumo: 'Quadricóptero', grupo: 'TECNOLOGIA', criar: formaDrone, apelidos: ['quadricoptero'] },
  { chave: 'atomo', codigo: 'ATM-04', titulo: 'ÁTOMO', resumo: 'Modelo atômico', grupo: 'CIÊNCIA', criar: formaAtomo },
  { chave: 'dna', codigo: 'BIO-05', titulo: 'DNA', resumo: 'Dupla hélice', grupo: 'CIÊNCIA', criar: formaDna },
  { chave: 'molecula', codigo: 'MOL-13', titulo: 'MOLÉCULA', resumo: 'Cafeína', grupo: 'CIÊNCIA', criar: formaMolecula, apelidos: ['cafeina'] },
  { chave: 'coracao', codigo: 'CRD-14', titulo: 'CORAÇÃO', resumo: 'Batendo a 72 BPM', grupo: 'CIÊNCIA', criar: formaCoracao },
  { chave: 'cidade', codigo: 'URB-06', titulo: 'CIDADE', resumo: 'Mapa urbano', grupo: 'LUGARES', criar: formaCidade },
  { chave: 'terreno', codigo: 'TOP-15', titulo: 'TERRENO', resumo: 'Relevo e curvas de nível', grupo: 'LUGARES', criar: formaTerreno, apelidos: ['relevo', 'montanha', 'mapa topografico'] },
];

function forma(i) {
  L.formas[i] ??= CATALOGO[i].criar(L.kit);
  return L.formas[i];
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
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 14);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTempo: { value: 0 }, uMorph: { value: 1 }, uExplosao: { value: 0 }, uAtracao: { value: 0 },
      uAtrator: { value: new THREE.Vector3() }, uTamanho: { value: 0.075 * Math.sqrt(26000 / TOTAL) }, uPixel: { value: 1 }, uOpacidade: { value: 1 },
      uGlitch: { value: 0 }, uSol: { value: new THREE.Vector3(1, 0, 0) }, uSolAtivo: { value: 0 }, uDedo: { value: new THREE.Vector3(99, 99, 99) }, uDedoForca: { value: 0 },
    },
    vertexShader: `
      uniform float uTempo, uMorph, uExplosao, uAtracao, uTamanho, uPixel, uGlitch, uSolAtivo, uDedoForca;
      uniform vec3 uAtrator, uSol, uDedo;
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
        // o dedo empurra o holograma e abre uma onda em volta
        vec3 dv = p - uDedo;
        float dd = dot(dv, dv);
        p += normalize(dv + vec3(0.0001)) * uDedoForca * exp(-dd * 2.4) * (0.55 + 0.2 * sin(sqrt(dd) * 12.0 - uTempo * 9.0));
        // falha de projeção de vez em quando: faixas horizontais escorregam
        float faixa = step(0.82, fract(p.y * 3.0 + uTempo * 11.0));
        p.x += uGlitch * faixa * (semente - 0.5) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.2, uTamanho * uPixel * (0.7 + semente * 0.8) * (300.0 / -mv.z));
        float cintila = 0.78 + 0.22 * sin(uTempo * 2.6 + semente * 50.0);
        // faixas de interferência e uma linha de varredura subindo, como num projetor de verdade
        float bandas = 0.84 + 0.16 * sin(p.y * 26.0 - uTempo * 3.4);
        float varre = smoothstep(0.03, 0.0, abs(fract(p.y * 0.11 - uTempo * 0.09) - 0.5));
        // o lado de trás da projeção fica mais apagado: dá profundidade e não estoura o brilho
        float centro = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
        float atras = clamp((centro - mv.z) / 2.5, 0.0, 1.0);
        // na Terra, o lado da noite fica escuro de verdade
        float dia = smoothstep(-0.12, 0.3, dot(normalize(destino + vec3(0.0001)), uSol));
        float luz = mix(1.0, 0.16 + 0.84 * dia, uSolAtivo * m);
        vCor = mix(cor, corDestino, m) * cintila * bandas * (1.0 + varre * 1.4) * (1.0 - atras * 0.72) * 0.72 * luz;
      }`,
    fragmentShader: `
      uniform float uOpacidade;
      varying vec3 vCor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vCor, a * a * uOpacidade);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, material);
}

// ---------------- mesa de projeção ----------------
function criarMesa() {
  const mesa = new THREE.Group();
  mesa.position.y = -2.55;

  // a mesa em si, de metal: aparece nos dois visuais
  const perfil = [[2.92, 0], [2.97, 0.11], [3.42, 0.11], [3.54, 0.04], [3.54, 0]].map(([r, y]) => new THREE.Vector2(r, y));
  const metal = new THREE.Mesh(new THREE.LatheGeometry(perfil, 128), new THREE.MeshStandardMaterial({ color: '#39424c', metalness: 1, roughness: 0.36 }));
  mesa.add(metal);
  const fundo = new THREE.Mesh(new THREE.CircleGeometry(2.96, 96), new THREE.MeshStandardMaterial({ color: '#0b1016', metalness: 0.9, roughness: 0.28 }));
  fundo.rotation.x = -Math.PI / 2;
  fundo.position.y = 0.05;
  mesa.add(fundo);

  // marcas no piso em volta da mesa
  const chao = [];
  for (const r of [4.6, 6.2, 8.4, 11]) {
    for (let i = 0; i < 128; i++) {
      const a1 = (i / 128) * Math.PI * 2;
      const a2 = ((i + 1) / 128) * Math.PI * 2;
      chao.push(Math.cos(a1) * r, 0.01, Math.sin(a1) * r, Math.cos(a2) * r, 0.01, Math.sin(a2) * r);
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    chao.push(Math.cos(a) * 3.7, 0.01, Math.sin(a) * 3.7, Math.cos(a) * 11, 0.01, Math.sin(a) * 11);
  }
  const geoChao = new THREE.BufferGeometry();
  geoChao.setAttribute('position', new THREE.Float32BufferAttribute(chao, 3));
  mesa.add(new THREE.LineSegments(geoChao, materialLinha(COR.azul, 0.07)));

  // o que só existe com o projetor ligado (visual holograma)
  const holoMesa = new THREE.Group();
  mesa.add(holoMesa);
  const aneis = new THREE.Group();
  aneis.position.y = 0.12;
  for (const [r, o] of [[0.75, 0.9], [1.3, 0.5], [2.3, 0.35], [2.88, 0.6]]) aneis.add(circulo(r, 160, COR.ciano, o));
  holoMesa.add(aneis);
  const marcas = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const r2 = i % 10 === 0 ? 2.58 : 2.68;
    marcas.push(Math.cos(a) * r2, 0.12, Math.sin(a) * r2, Math.cos(a) * 2.8, 0.12, Math.sin(a) * 2.8);
  }
  const geoMarcas = new THREE.BufferGeometry();
  geoMarcas.setAttribute('position', new THREE.Float32BufferAttribute(marcas, 3));
  const anelMarcas = new THREE.LineSegments(geoMarcas, materialLinha(COR.ciano, 0.45));
  holoMesa.add(anelMarcas);

  const emissor = brilho(COR.ciano, 1.1);
  emissor.material.opacity = 0.55;
  emissor.position.y = 0.16;
  holoMesa.add(emissor);

  // lentes em volta da mesa, de onde saem os raios da projeção
  const emissoresPos = [];
  const emissores = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * 2.45, 0.14, Math.sin(a) * 2.45);
    const b = brilho(COR.ciano, 0.22);
    b.position.copy(p);
    holoMesa.add(b);
    emissores.push(b);
    emissoresPos.push(new THREE.Vector3(p.x, p.y + mesa.position.y, p.z));
  }

  // poça de luz: o holograma ilumina a mesa e o piso
  const pocaPlano = new THREE.Mesh(new THREE.CircleGeometry(7.2, 64), new THREE.MeshBasicMaterial({
    map: texturaBrilho(), color: COR.ciano, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  pocaPlano.rotation.x = -Math.PI / 2;
  pocaPlano.position.y = 0.03;
  holoMesa.add(pocaPlano);
  const luz = new THREE.PointLight(COR.ciano, 22, 16, 1.5);
  luz.position.y = 1.6;
  holoMesa.add(luz);

  // facho de luz da projeção
  const facho = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 0.7, 5.6, 72, 1, true), new THREE.ShaderMaterial({
    uniforms: { uTempo: { value: 0 }, uCor: { value: COR.ciano }, uForca: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTempo, uForca; uniform vec3 uCor; varying vec2 vUv;
      void main(){
        float sobe = pow(max(1.0 - vUv.y, 0.0), 1.8);
        float faixas = 0.82 + 0.18 * sin(vUv.y * 90.0 - uTempo * 5.0);
        float raios = 0.75 + 0.25 * sin(vUv.x * 6.2832 * 24.0 + uTempo * 0.6);
        float a = sobe * faixas * raios * 0.075 * uForca;
        gl_FragColor = vec4(uCor * a, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  facho.position.y = 2.9;
  holoMesa.add(facho);

  // poeira subindo no facho
  const qtd = 900;
  const pos = new Float32Array(qtd * 3);
  for (let i = 0; i < qtd; i++) {
    const t = Math.random();
    const r = Math.sqrt(Math.random()) * (0.75 + t * 2.3);
    const a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * r, 0.1 + t * 5.6, Math.sin(a) * r], i * 3);
  }
  const geoPoeira = new THREE.BufferGeometry();
  geoPoeira.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const poeira = new THREE.Points(geoPoeira, new THREE.PointsMaterial({
    color: COR.ciano, size: 0.03, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  holoMesa.add(poeira);

  return { mesa, holoMesa, anelMarcas, facho, poeira, emissor, emissores, emissoresPos, luz, pocaPlano };
}

// raios finos saindo das lentes da mesa até pontos da projeção
function criarRaios() {
  const n = 44;
  const geo = new THREE.BufferGeometry();
  const cores = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) cores.set([0.3, 0.85, 0.95, 0.015, 0.05, 0.06], i * 6);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  const raios = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  raios.frustumCulled = false;
  return raios;
}

const apoio = new THREE.Vector3();
function atualizarRaios(agora) {
  if (agora - L.raiosEm < 140) return;
  L.raiosEm = agora;
  const P = L.formas[L.indice].posicoes;
  const pos = L.raios.geometry.attributes.position;
  const n = pos.count / 2;
  for (let i = 0; i < n; i++) {
    const e = L.mesa.emissoresPos[i % L.mesa.emissoresPos.length];
    const k = Math.floor(Math.random() * TOTAL) * 3;
    L.projecao.localToWorld(apoio.set(P[k], P[k + 1], P[k + 2]));
    pos.setXYZ(i * 2, e.x, e.y, e.z);
    pos.setXYZ(i * 2 + 1, apoio.x, apoio.y, apoio.z);
  }
  pos.needsUpdate = true;
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
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: '#cfe0ff', size: 0.16, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
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
.holo-formas{ list-style:none; margin:0; padding:0 4px 0 0; display:flex; flex-direction:column; gap:5px; max-height:calc(100vh - 190px); overflow-y:auto; scrollbar-width:thin; scrollbar-color:rgba(77,232,240,0.35) transparent; }
.holo-formas .holo-grupo{ margin:6px 0 1px; font-family:'Share Tech Mono',monospace; font-size:9.5px; letter-spacing:2.5px; color:#5f8791; }
.holo-formas .holo-grupo:first-child{ margin-top:0; }
.holo-formas button{ width:100%; display:grid; grid-template-columns:auto 1fr; gap:1px 10px; align-items:center; text-align:left; cursor:pointer;
  background:rgba(2,10,16,0.6); border:1px solid rgba(77,232,240,0.14); border-radius:3px; padding:6px 10px; color:#a9c6cd; transition:all .2s; }
.holo-formas button:hover, .holo-formas button.mirado{ border-color:rgba(77,232,240,0.5); color:#e9f7f9; }
.holo-formas button.ativo{ border-color:#4de8f0; color:#e9f7f9; box-shadow:0 0 16px rgba(77,232,240,0.25) inset; }
.holo-formas .cod{ grid-row:span 2; font-family:'Share Tech Mono',monospace; font-size:10px; color:#4de8f0; writing-mode:vertical-rl; transform:rotate(180deg); letter-spacing:1px; }
.holo-formas b{ font-family:'Orbitron',sans-serif; font-size:11.5px; letter-spacing:2.5px; font-weight:700; }
.holo-formas small{ font-size:12px; color:#5f8791; line-height:1.15; }
.holo-modos{ display:flex; gap:3px; padding:3px; border:1px solid rgba(77,232,240,0.22); border-radius:4px; background:rgba(2,10,16,0.65); }
.holo-modos button{ font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; color:#a9c6cd; background:transparent; border:0; border-radius:3px; padding:8px 13px; cursor:pointer; transition:all .2s; }
.holo-modos button:hover, .holo-modos button.mirado{ color:#e9f7f9; background:rgba(77,232,240,0.12); }
.holo-modos button.ativo{ color:#01060a; background:#4de8f0; box-shadow:0 0 14px rgba(77,232,240,0.5); }
.holo-btn.mirado{ background:rgba(77,232,240,0.16); box-shadow:0 0 18px rgba(77,232,240,0.4); }
.holo-cursor{ position:absolute; left:0; top:0; width:46px; height:46px; margin:-23px 0 0 -23px; z-index:6; pointer-events:none; opacity:0; transition:opacity .2s; will-change:transform; }
.holo-cursor.visivel{ opacity:1; }
.holo-cursor svg{ width:100%; height:100%; transform:rotate(-90deg); overflow:visible; }
.holo-cursor circle{ fill:none; stroke-width:2; }
.holo-cursor .fundo{ stroke:rgba(77,232,240,0.4); }
.holo-cursor .carga{ stroke:#4de8f0; stroke-width:3.5; stroke-dasharray:113.1; stroke-dashoffset:calc(113.1 * (1 - var(--carga, 0))); filter:drop-shadow(0 0 4px #4de8f0); }
.holo-cursor i{ position:absolute; left:50%; top:50%; width:8px; height:8px; margin:-4px; border-radius:50%; background:#e9f7f9; box-shadow:0 0 10px #4de8f0, 0 0 20px #4de8f0; transition:transform .15s; }
.holo-cursor.pinca i{ transform:scale(1.8); background:#5dfca0; box-shadow:0 0 12px #5dfca0, 0 0 24px #5dfca0; }
.holo-cursor.pinca .fundo{ stroke:rgba(93,252,160,0.6); }
.holo[data-modo="apps"] .holo-titulo, .holo[data-modo="apps"] .holo-dir{ display:none; }
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
.holo-rotulos{ position:absolute; inset:0; z-index:1; pointer-events:none; overflow:hidden; }
.holo-rotulo{ position:absolute; left:0; top:0; padding:5px 9px 6px; background:rgba(2,12,18,0.62); border-left:2px solid #4de8f0; backdrop-filter:blur(4px); white-space:nowrap; transition:opacity .25s; will-change:transform; }
.holo-rotulo b{ display:block; font-family:'Orbitron',sans-serif; font-size:9.5px; letter-spacing:2px; color:#e9f7f9; }
.holo-rotulo span{ display:block; font-family:'Share Tech Mono',monospace; font-size:9.5px; letter-spacing:1px; color:#8ff3f7; margin-top:2px; }
.holo-rotulo-linha{ position:absolute; left:0; top:0; height:1px; background:linear-gradient(90deg, #4de8f0, rgba(77,232,240,0.35)); transform-origin:0 50%; transition:opacity .25s; will-change:transform; }
.holo-rotulo-linha::before{ content:""; position:absolute; left:-3px; top:-3px; width:5px; height:5px; border:1px solid #8ff3f7; transform:rotate(45deg); }
.holo-flash{ position:absolute; inset:0; z-index:4; background:#000; opacity:0; pointer-events:none; transition:opacity .22s; }
.holo-flash.ativo{ opacity:1; }
.holo-btn.quieto{ opacity:0.55; }
.holo-aviso{ position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:3; font-family:'Share Tech Mono',monospace; font-size:13px; letter-spacing:3px; color:#4de8f0; text-align:center; pointer-events:none; }
@media (max-width: 900px){
  .holo-lado{ width:auto; left:12px; right:12px; top:auto; bottom:14px; }
  .holo-dir, .holo-camera, .holo-titulo, .holo-guia, .holo-relogio, .holo-longo, .holo-rotulos{ display:none; }
  .holo-formas{ flex-direction:row; overflow-x:auto; }
  .holo-formas button{ min-width:120px; }
  .holo-formas small{ display:none; }
  .holo-topo{ padding:12px 14px; gap:8px; }
  .holo-marca small{ display:none; }
  .holo-marca h1{ font-size:14px; letter-spacing:3px; }
  .holo-topo .holo-btn{ padding:8px 10px; letter-spacing:1px; font-size:10px; }
  .holo-modos{ position:absolute; top:60px; left:50%; transform:translateX(-50%); }
  .holo-formas .holo-grupo{ display:none; }
  .holo-formas{ max-height:none; }
}
@media (max-width: 440px){
  .holo-marca{ display:none; }
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
      <nav class="holo-modos" data-h="modos" aria-label="Modo do laboratório">
        <button type="button" data-mira data-modo="projecoes">◈ <span class="holo-longo">PROJEÇÕES</span></button>
        <button type="button" data-mira data-modo="apps">▦ <span class="holo-longo">APPS</span></button>
        <button type="button" data-mira data-modo="criar">✎ <span class="holo-longo">CRIAR</span></button>
      </nav>
      <div class="holo-espaco"></div>
      <div class="holo-relogio" data-h="relogio"></div>
      <button class="holo-btn" type="button" data-mira data-h="som" aria-label="Ligar ou desligar o som">SOM</button>
      <button class="holo-btn" type="button" data-mira data-h="visual"></button>
      <button class="holo-btn" type="button" data-mira data-h="voltar">◂ <span class="holo-longo">VOLTAR AO </span>CONSOLE</button>
    </div>
    <div class="holo-rotulos" data-h="rotulos"></div>
    <aside class="holo-lado holo-esq" data-h="esq">
      <section class="holo-caixa"><h2>PROJEÇÕES</h2><ul class="holo-formas" data-h="formas"></ul></section>
    </aside>
    <aside class="holo-lado holo-dir">
      <section class="holo-caixa"><h2>TELEMETRIA</h2><dl class="holo-dados" data-h="dados"></dl><p class="holo-desc" data-h="desc"></p></section>
      <section class="holo-caixa"><h2>CONTROLE</h2><div class="holo-gesto" data-h="gesto">—</div>
        <dl class="holo-dados" data-h="controle" style="margin-top:8px"></dl>
        <div class="holo-acoes" style="margin-top:10px">
          <button class="holo-btn" type="button" data-mira data-h="desmontar">DESMONTAR</button>
          <button class="holo-btn" type="button" data-mira data-h="centralizar">CENTRALIZAR</button>
        </div>
      </section>
    </aside>
    <div class="holo-titulo"><span data-h="codigo"></span><strong data-h="titulo"></strong></div>
    <div class="holo-guia" data-h="guia"></div>
    <div class="holo-camera"><video playsinline muted></video><p data-h="camera">CÂMERA · INICIANDO</p></div>
    <div class="holo-cursor" data-h="cursor"><svg viewBox="0 0 46 46"><circle class="fundo" cx="23" cy="23" r="18"/><circle class="carga" cx="23" cy="23" r="18"/></svg><i></i></div>
    <div class="holo-flash" data-h="flash"></div>
    <div class="holo-aviso" data-h="aviso">INICIALIZANDO PROJETOR…</div>`;
  const h = {};
  for (const el of raiz.querySelectorAll('[data-h]')) h[el.dataset.h] = el;
  L.hud = h;
  L.video = raiz.querySelector('.holo-camera video');
  h.voltar.addEventListener('click', () => {
    L.som.clique();
    L.aoVoltar?.();
  });
  h.visual.addEventListener('click', () => {
    L.som.clique();
    definirVisual(L.modo === 'real' ? 'holo' : 'real');
  });
  h.som.addEventListener('click', () => {
    const ligado = L.som.alternar();
    h.som.classList.toggle('quieto', !ligado);
    if (ligado) L.som.ligarZumbido();
    else L.som.desligarZumbido();
  });
  h.som.classList.toggle('quieto', !L.som.ligado);
  h.desmontar.addEventListener('click', () => desmontar(!L.desmontadoPorComando));
  h.centralizar.addEventListener('click', centralizar);
  h.modos.addEventListener('click', (e) => {
    const b = e.target.closest('[data-modo]');
    if (b) modo(b.dataset.modo);
  });
  desenharGuia();
  return raiz.querySelector('canvas');
}

function desenharListaFormas() {
  const itens = [];
  CATALOGO.forEach((c, i) => {
    if (c.grupo !== CATALOGO[i - 1]?.grupo) {
      const cab = document.createElement('li');
      cab.className = 'holo-grupo';
      cab.textContent = c.grupo;
      itens.push(cab);
    }
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mira = '';
    b.className = i === L.indice ? 'ativo' : '';
    b.innerHTML = `<span class="cod">${c.codigo}</span><b>${c.titulo}</b><small>${c.resumo}</small>`;
    b.addEventListener('click', () => {
      L.som.clique();
      mostrar(i);
    });
    li.append(b);
    itens.push(li);
  });
  L.hud.formas.replaceChildren(...itens);
  L.hud.formas.querySelector('button.ativo')?.scrollIntoView({ block: 'nearest' });
}

function desenharGuia() {
  L.hud.guia.replaceChildren(...GUIAS[L.modoLab].map(([g, texto]) => {
    const s = document.createElement('span');
    s.dataset.g = g;
    s.textContent = texto;
    return s;
  }));
}

function atualizarHud() {
  const f = L.formas[L.indice];
  if (!f) return;
  const h = L.hud;
  h.relogio.textContent = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const grau = (r) => `${Math.round(THREE.MathUtils.radToDeg(r) % 360)}°`;
  const dados = L.modoLab === 'apps' ? L.mural.dados() : L.modoLab === 'criar' ? L.atelie.dados() : (typeof f.dados === 'function' ? f.dados() : f.dados);
  h.dados.innerHTML = dados.map(([k, v]) => `<dt>${k.toUpperCase()}</dt><dd>${v}</dd>`).join('');
  const maos = L.maos.length;
  h.controle.innerHTML = [
    ['MODO', NOME_MODO[L.modoLab].toUpperCase()],
    ['MÃOS', L.detector ? (maos ? `${maos} DETECTADA${maos > 1 ? 'S' : ''}` : 'AGUARDANDO') : 'CARREGANDO'],
    ['ESCALA', `${L.escala.toFixed(2)}×`],
    ['ROTAÇÃO', `${grau(L.rot.x)} / ${grau(L.rot.y)}`],
    ['ESTADO', L.explosao > 0.3 ? 'DESMONTADO' : 'MONTADO'],
    ['QUADROS', `${L.fps} FPS`],
    ['VISUAL', L.modo === 'real' ? 'FOTO REAL' : 'HOLOGRAMA'],
    ['QUALIDADE', L.economia ? 'ECONÔMICA' : 'MÁXIMA'],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  h.gesto.textContent = NOMES_GESTO[L.modoLab][L.duas ? 'dupla' : L.gesto] || '—';
  for (const s of h.guia.children) {
    s.classList.toggle('ativo', s.dataset.g === (L.duas ? 'dupla' : L.gesto) || (s.dataset.g === 'deslize' && performance.now() - L.trocaEm < 700)
      || (s.dataset.g === 'segurar' && L.cursor.carga > 0.05));
  }
  h.desmontar.textContent = L.desmontadoPorComando ? 'MONTAR' : 'DESMONTAR';
  h.desmontar.classList.toggle('ativo', L.desmontadoPorComando);
}

function montarRotulos(f) {
  const criar = (classe) => {
    const d = document.createElement('div');
    d.className = classe;
    return d;
  };
  L.rotulosDom = (f.rotulos || []).map((r) => {
    const linha = criar('holo-rotulo-linha');
    const caixa = criar('holo-rotulo');
    const titulo = document.createElement('b');
    const valor = document.createElement('span');
    titulo.textContent = r.titulo;
    caixa.append(titulo, valor);
    return { r, linha, caixa, valor };
  });
  L.hud.rotulos.replaceChildren(...L.rotulosDom.flatMap((i) => [i.linha, i.caixa]));
}

const pontoRotulo = new THREE.Vector3();
const centroProj = new THREE.Vector3();
function atualizarRotulos() {
  if (!L.rotulosDom.length) return;
  const w = L.raiz.clientWidth;
  const h = L.raiz.clientHeight;
  const geral = L.modoLab === 'projecoes' && L.intro > 0.85 && L.morph >= 1 && L.explosao < 0.3;
  L.projecao.getWorldPosition(centroProj);
  for (const item of L.rotulosDom) {
    const { r, linha, caixa, valor } = item;
    pontoRotulo.copy(typeof r.ponto === 'function' ? r.ponto() : r.ponto);
    L.projecao.localToWorld(pontoRotulo);
    // em objetos redondos, o rótulo some quando o ponto passa para trás
    let mostra = geral && (!r.visivel || r.visivel());
    if (r.frente) {
      const fora = apoio.copy(pontoRotulo).sub(centroProj);
      const ate = pontoRotulo.clone().sub(L.camera.position).negate();
      if (fora.dot(ate) < 0) mostra = false;
    }
    pontoRotulo.project(L.camera);
    const x = (pontoRotulo.x + 1) / 2 * w;
    const y = (1 - pontoRotulo.y) / 2 * h;
    if (x < 280 || x > w - 280 || y < 60 || y > h - 60) mostra = false;
    caixa.style.opacity = linha.style.opacity = mostra ? 1 : 0;
    if (!mostra) continue;
    const lado = x >= w / 2 ? 1 : -1;
    const bx = x + lado * 58;
    const by = y - 42;
    const texto = typeof r.valor === 'function' ? r.valor() : r.valor;
    if (valor.textContent !== texto) valor.textContent = texto;
    caixa.style.transform = `translate(${bx}px, ${by}px) translate(${lado > 0 ? 0 : -100}%, -50%)`;
    const dx = bx - x;
    const dy = by - y;
    linha.style.width = `${Math.hypot(dx, dy)}px`;
    linha.style.transform = `translate(${x}px, ${y}px) rotate(${Math.atan2(dy, dx)}rad)`;
  }
}

function mostrarTitulo(f) {
  const [codigo, titulo, descricao] = L.modoLab === 'criar'
    ? ['CRIAÇÃO · MÃOS LIVRES', 'ATELIÊ', 'Aponte o dedo para desenhar no ar. Escolha uma forma e faça pinça para criar; afaste os dedos para aumentar. Pinça perto de algo pega e move. Punho gira tudo, duas mãos ampliam.']
    : L.modoLab === 'apps'
      ? ['PROGRAMAS DO PC', 'APPS', 'Aponte para um app e faça pinça, ou segure parado um instante, para abrir no computador. Mão aberta deslizando troca de página.']
      : [`${f.codigo} · PROJEÇÃO ATIVA`, f.titulo, f.descricao];
  L.hud.codigo.textContent = codigo;
  const novo = L.hud.titulo.cloneNode(false);
  novo.textContent = titulo;
  L.hud.titulo.replaceWith(novo);
  L.hud.titulo = novo;
  L.hud.desc.textContent = descricao;
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
  else if (dedos === 1 && estendido(8, 6)) gesto = 'aponta';
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

// o dedo apontado (ou a pinça) vira um cursor na tela: mira qualquer botão marcado com data-mira;
// pinça fecha = clique na hora, e segurar parado em cima também clica
function atualizarCursorMao(m, antes, agora) {
  const c = L.cursor;
  const ativo = !!m && (m.gesto === 'aponta' || m.gesto === 'pinca' || (L.modoLab === 'apps' && m.gesto === 'nenhum'));
  if (!ativo) {
    c.mao = false;
    mirar(null, agora);
    return;
  }
  const ponto = m.gesto === 'pinca' ? m.pontaPinca : m.pts[8];
  const w = L.raiz.clientWidth;
  const h = L.raiz.clientHeight;
  // com um pouco de ganho a mão não precisa ir até a borda da câmera para chegar na borda da tela
  const x = THREE.MathUtils.clamp(w / 2 + ((1 - ponto.x) * w - w / 2) * 1.35, 0, w);
  const y = THREE.MathUtils.clamp(h / 2 + (ponto.y * h - h / 2) * 1.35, 0, h);
  c.x = c.mao ? c.x + (x - c.x) * 0.5 : x;
  c.y = c.mao ? c.y + (y - c.y) * 0.5 : y;
  c.mao = true;
  const caixa = L.raiz.getBoundingClientRect();
  let alvo = document.elementFromPoint(caixa.left + c.x, caixa.top + c.y)?.closest('[data-mira]') || null;
  if (alvo && (!L.raiz.contains(alvo) || alvo.closest('[hidden]'))) alvo = null;
  if (L.modoLab === 'criar' && L.atelie.ocupado()) alvo = null;
  mirar(alvo, agora);
  if (!alvo) return;
  // segurar parado clica uma vez só: para repetir no mesmo botão, tira o dedo e volta (ou faz pinça)
  c.carga = alvo === c.feito ? 0 : Math.min(1, Math.max(0, agora - c.desde) / Number(alvo.dataset.esperar || 850));
  alvo.style.setProperty('--carga', c.carga.toFixed(3));
  const pincou = m.gesto === 'pinca' && antes?.gesto !== 'pinca';
  if ((pincou || c.carga >= 1) && agora > c.travaAte) {
    c.travaAte = agora + 700;
    c.feito = alvo;
    c.carga = 0;
    alvo.click();
  }
}

function mirar(alvo, agora) {
  const c = L.cursor;
  if (alvo === c.alvo) return;
  c.alvo?.classList.remove('mirado');
  c.alvo?.style.removeProperty('--carga');
  c.alvo = alvo;
  c.desde = agora;
  c.carga = 0;
  c.feito = null;
  alvo?.classList.add('mirado');
}

function desenharCursor() {
  const c = L.cursor;
  const el = L.hud.cursor;
  el.classList.toggle('visivel', c.mao);
  if (!c.mao) return;
  el.style.transform = `translate(${c.x}px, ${c.y}px)`;
  el.style.setProperty('--carga', c.alvo ? c.carga.toFixed(3) : 0);
  el.classList.toggle('pinca', L.gesto === 'pinca');
}

// ponto do ateliê embaixo de uma posição da tela; a mão mais perto da câmera traz o ponto para a frente
function pontoNaCriacao(ndc, palma = 0) {
  const g = L.atelie.grupo;
  raio.setFromCamera(ndc, L.camera);
  const dir = L.camera.getWorldDirection(new THREE.Vector3());
  plano.setFromNormalAndCoplanarPoint(dir.clone().negate(), g.getWorldPosition(new THREE.Vector3()));
  const alvo = new THREE.Vector3();
  if (!raio.ray.intersectPlane(plano, alvo)) return null;
  if (palma) {
    if (!L.palmaRef) L.palmaRef = palma;
    alvo.addScaledVector(dir, -THREE.MathUtils.clamp((palma / L.palmaRef - 1) * 3.5, -2.2, 2.2));
  }
  return g.worldToLocal(alvo);
}

const ndcDaTela = (x, y) => new THREE.Vector2((x / L.raiz.clientWidth) * 2 - 1, -((y / L.raiz.clientHeight) * 2 - 1));

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
  L.dedoAlvo = 0;
  const m = novas[0];
  const antes = anteriores[0];
  atualizarCursorMao(novas.length === 2 ? null : m, antes, agora);
  const criando = L.modoLab === 'criar';

  // duas mãos abertas ou em pinça: afastar amplia, aproximar reduz
  if (novas.length === 2 && novas.every((x) => x.gesto === 'aberta' || x.gesto === 'pinca')) {
    const chave = criando ? 'escalaCriarAlvo' : 'escalaAlvo';
    const dist = Math.hypot(novas[0].centro.x - novas[1].centro.x, novas[0].centro.y - novas[1].centro.y);
    if (!L.duas) L.duas = { dist, escala: L[chave] };
    L[chave] = THREE.MathUtils.clamp(L.duas.escala * (dist / L.duas.dist), 0.35, 2.8);
    L.gesto = 'dupla';
    L.explosaoAlvo = L.desmontadoPorComando ? 2.2 : 0;
    L.atracaoAlvo = 0;
    L.atelie?.soltar();
    return;
  }
  L.duas = null;
  if (!m) {
    L.gesto = 'nenhum';
    L.gestoAntes = 'nenhum';
    L.historico = [];
    L.explosaoAlvo = L.desmontadoPorComando ? 2.2 : 0;
    L.atracaoAlvo = 0;
    L.atelie?.soltar();
    return;
  }
  L.gesto = m.gesto;
  if (m.gesto !== L.gestoAntes) {
    if (m.gesto === 'punho' || (m.gesto === 'pinca' && !criando)) L.som.agarrar();
    if (L.modoLab === 'projecoes') {
      if (m.gesto === 'aberta') L.som.desmontar();
      if (L.gestoAntes === 'aberta') L.som.montar();
    }
    L.gestoAntes = m.gesto;
  }
  const rot = criando ? L.rotCriar : L.rot;
  if (m.gesto === 'punho' && antes && L.modoLab !== 'apps') {
    rot.vy = ((1 - m.centro.x) - (1 - antes.centro.x)) * 7;
    rot.vx = (m.centro.y - antes.centro.y) * 5;
  }
  if (L.modoLab === 'apps') {
    // mão aberta deslizando para o lado troca a página do mural
    if (m.gesto === 'aberta') {
      L.historico.push({ t: agora, x: 1 - m.centro.x });
      L.historico = L.historico.filter((h) => agora - h.t < 320);
      const dx = L.historico.length > 2 ? L.historico[L.historico.length - 1].x - L.historico[0].x : 0;
      if (Math.abs(dx) > 0.3 && agora - L.trocaEm > 1000) {
        L.trocaEm = agora;
        L.historico = [];
        L.mural.pagina(dx > 0 ? -1 : 1);
      }
    } else {
      L.historico = [];
    }
    return;
  }
  if (criando) {
    if (L.cursor.alvo || !L.cursor.mao) {
      L.atelie.soltar();
      return;
    }
    const p = pontoNaCriacao(ndcDaTela(L.cursor.x, L.cursor.y), m.palma);
    if (p) L.atelie.entrada(m.gesto, p);
    return;
  }
  if (m.gesto === 'aponta' && !L.cursor.alvo) {
    const ponta = pontoNoMundo(m.pts[8]);
    if (ponta) L.nuvem.material.uniforms.uDedo.value.copy(L.nuvem.worldToLocal(ponta));
    L.dedoAlvo = 1;
  }
  if (m.gesto === 'pinca' && antes && antes.gesto === 'pinca' && !L.cursor.alvo) {
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
  L.raiz.addEventListener('pointermove', (e) => {
    L.ponteiro.x = (e.clientX / innerWidth - 0.5) * 2;
    L.ponteiro.y = (e.clientY / innerHeight - 0.5) * 2;
  });
  // no ateliê o botão esquerdo desenha, cria ou move (conforme a ferramenta); no vazio, gira
  const pontoDoMouse = (e) => {
    const caixa = L.raiz.getBoundingClientRect();
    return pontoNaCriacao(ndcDaTela(e.clientX - caixa.left, e.clientY - caixa.top));
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (L.modoLab === 'criar' && e.button === 0) {
      const gesto = L.atelie.ferramenta() === 'desenhar' ? 'aponta' : 'pinca';
      const p = pontoDoMouse(e);
      if (p) L.atelie.entrada(gesto, p);
      if (L.atelie.ocupado()) {
        L.mouseCria = { gesto };
        return;
      }
      L.atelie.soltar();
    }
    L.arraste = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (L.mouseCria) {
      const p = pontoDoMouse(e);
      if (p) L.atelie.entrada(L.mouseCria.gesto, p);
      return;
    }
    if (!L.arraste) return;
    const rot = L.modoLab === 'criar' ? L.rotCriar : L.rot;
    rot.vy = (e.clientX - L.arraste.x) * 0.006;
    rot.vx = (e.clientY - L.arraste.y) * 0.004;
    L.arraste = { x: e.clientX, y: e.clientY };
  });
  const soltar = () => {
    if (L.mouseCria) L.atelie.soltar();
    L.mouseCria = null;
    L.arraste = null;
  };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const chave = L.modoLab === 'criar' ? 'escalaCriarAlvo' : 'escalaAlvo';
    L[chave] = THREE.MathUtils.clamp(L[chave] * (1 - e.deltaY * 0.0012), 0.35, 2.8);
  }, { passive: false });
  canvas.addEventListener('dblclick', () => { if (L.modoLab === 'projecoes') desmontar(!L.desmontadoPorComando); });
  addEventListener('keydown', (e) => {
    if (!L.aberto || e.target.closest?.('input, textarea')) return;
    if (e.key === 'ArrowRight') (L.modoLab === 'apps' ? L.mural.pagina(1) : mostrar(L.indice + 1));
    else if (e.key === 'ArrowLeft') (L.modoLab === 'apps' ? L.mural.pagina(-1) : mostrar(L.indice - 1));
    else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && L.modoLab === 'criar') L.atelie.desfazer();
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
  const fraca = placaFraca(renderer);
  TOTAL = fraca ? TOTAL_LEVE : TOTAL_NORMAL;
  Q = TOTAL / 26000;
  L.economia = fraca;
  L.placaFraca = fraca;
  renderer.setPixelRatio(fraca ? 1 : Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor('#01040a');
  const cena = new THREE.Scene();
  L.neblina = new THREE.FogExp2('#02060a', 0.016);
  cena.fog = L.neblina;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  camera.position.set(0, 1.2, 11);
  camera.lookAt(0, 0.1, 0);
  camera.layers.enable(1);   // a mão em neon fica na camada 1, que o reflexo do piso não enxerga
  cena.add(camera);
  const alvo = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: fraca ? 0 : 4 });
  const composer = new EffectComposer(renderer, alvo);
  composer.addPass(new RenderPass(cena, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.75, 0.45, 0.2);
  composer.addPass(bloom);
  L.lente = criarLente();
  composer.addPass(L.lente);
  composer.addPass(new OutputPass());
  Object.assign(L, { renderer, cena, camera, composer, bloom });
  ambienteEstudio(renderer, cena, 0.55);

  L.sala = criarSala({ resolucao: fraca ? 256 : 1024 });
  L.sala.usarReflexo(!fraca);
  cena.add(L.sala.grupo);
  L.estrelas = criarEstrelas();
  L.estrelas.visible = false;
  cena.add(L.estrelas);
  L.mesa = criarMesa();
  cena.add(L.mesa.mesa);
  L.raios = criarRaios();
  cena.add(L.raios);
  L.luzSol = new THREE.DirectionalLight('#fff4e6', 1.6);
  L.luzSol.position.set(-6, 9, 7);
  L.luzCeu = new THREE.HemisphereLight('#a9c8ff', '#0a0f14', 0.22);
  cena.add(L.luzSol, L.luzCeu);

  L.projecao = new THREE.Group();
  L.projecao.position.y = 0.35;
  cena.add(L.projecao);
  L.nuvem = criarNuvem();
  L.projecao.add(L.nuvem);
  L.maosVisuais = [criarMaoVisual(), criarMaoVisual()];
  for (const v of L.maosVisuais) {
    v.grupo.traverse((o) => o.layers.set(1));
    camera.add(v.grupo);
  }

  L.kit = { gerador, q, total: TOTAL, projecao: L.projecao, nuvem: L.nuvem };
  L.formas = CATALOGO.map(() => null);
  L.atelie = criarAtelie({ cena, raiz: L.raiz, som: L.som, aoEvento: avisar });
  L.mural = criarMuralApps({
    raiz: L.raiz, som: L.som, aoEvento: avisar,
    listar: () => (L.apps?.listar ? L.apps.listar() : Promise.reject(new Error('sem acesso ao PC'))),
    abrir: (app) => (L.apps?.abrir ? L.apps.abrir(app) : Promise.resolve({ ok: false, mensagem: 'Sem acesso ao Jarvis PC.' })),
  });
  const geo = L.nuvem.geometry;
  const f = forma(0);
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
  if (f.comuns) L.projecao.add(f.comuns);
  ajustarTamanho();
  addEventListener('resize', ajustarTamanho);
}

function ajustarTamanho() {
  if (!L.renderer) return;
  const w = L.raiz.clientWidth || innerWidth;
  const h = L.raiz.clientHeight || innerHeight;
  L.renderer.setSize(w, h, false);
  L.composer.setPixelRatio(L.renderer.getPixelRatio());
  L.composer.setSize(w, h);
  L.camera.aspect = w / h;
  // em tela em pé a câmera se afasta para caber a projeção
  L.camZ = w / h < 1 ? 15 : 11;
  L.camera.updateProjectionMatrix();
  L.nuvem.material.uniforms.uPixel.value = L.renderer.getPixelRatio() * (h / 900);
}

function definirEconomia(sim) {
  L.economia = sim;
  L.lentoDesde = 0;
  if (sim) {
    L.economiaDesde = performance.now();
    L.tentativasEconomia += 1;
  }
  L.renderer.setPixelRatio(sim ? 1 : Math.min(devicePixelRatio, 1.5));
  L.sala.usarReflexo(!sim);
  L.raios.visible = !sim && L.modo === 'holo' && L.modoLab === 'projecoes';
  ajustarTamanho();
}

function obterReal(f) {
  if (f.real) return f.real;
  const r = criarReal(f.chave, f.opcoesReal || {});
  r.grupo.visible = false;
  r.carregado = false;
  L.projecao.add(r.grupo);
  f.real = r;
  L.hud.aviso.textContent = 'MATERIALIZANDO MODELO…';
  r.pronto.then(() => {
    r.carregado = true;
    L.hud.aviso.textContent = '';
  }).catch((erro) => {
    console.warn('Holo:', erro);
    L.hud.aviso.textContent = '';
    r.falhou = true;
    L.hud.camera.textContent = 'TEXTURAS INDISPONÍVEIS · MOSTRANDO HOLOGRAMA';
  });
  return r;
}

// liga e desliga o que cada visual precisa
function aplicarModo() {
  const real = L.modo === 'real';
  const f = L.formas[L.indice];
  const projetando = L.modoLab === 'projecoes';
  const r = real ? obterReal(f) : null;
  // o espaço só some a sala quando a projeção está na frente; nos apps e no ateliê fica a sala
  const espaco = !!r && r.ambiente === 'espaco' && projetando;
  L.sala.grupo.visible = !espaco;
  L.mesa.mesa.visible = !espaco;
  L.estrelas.visible = espaco;
  L.mesa.holoMesa.visible = !real;
  L.raios.visible = !real && !L.economia && projetando;
  L.linhas.visible = !real;
  L.luzSol.visible = real;
  L.luzCeu.visible = real && !espaco;
  L.luzSol.position.set(-6, 9, 7);
  L.cena.fog = espaco ? null : L.neblina;
  // no espaço só o sol ilumina: a luz de estúdio da sala deixaria a noite dos planetas acesa
  L.cena.environmentIntensity = real ? (espaco ? 0 : 0.38) : 0.45;
  L.renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  L.renderer.toneMappingExposure = 0.95;
  L.bloom.strength = real ? 0.22 : 0.42;
  L.bloom.threshold = real ? 1 : 0.42;
  for (const outra of L.formas) if (outra && outra !== f && outra.real) outra.real.grupo.visible = false;
  if ((!real || !projetando) && f.real) f.real.grupo.visible = false;
  L.atelie.aplicarVisual(real);
  L.raiz.dataset.visual = L.modo;
  const rotuloBotao = real ? '◐ <span class="holo-longo">VISUAL </span>HOLOGRAMA' : '◉ <span class="holo-longo">VISUAL </span>FOTO REAL';
  L.hud.visual.innerHTML = rotuloBotao;
}

function quadro(agora) {
  if (!L.aberto) return;
  L.quadro = requestAnimationFrame(quadro);
  if (!agora) agora = performance.now();
  const delta = Math.min(1, Math.max(0.001, (agora - (L.ultimoQuadro || agora - 16)) / 1000));
  L.ultimoQuadro = agora;
  L.tempo += delta;
  const dt = Math.min(delta, 0.05);
  const t = L.tempo;
  L.fps = Math.round(L.fps * 0.9 + (1 / delta) * 0.1);
  processarMaos(performance.now());

  // giro com inércia; parado, a projeção gira sozinha bem devagar (o ateliê fica parado)
  const criando = L.modoLab === 'criar';
  const rot = criando ? L.rotCriar : L.rot;
  const ocioso = !L.arraste && performance.now() - L.ultimaMaoEm > 1500 && !criando;
  rot.y += rot.vy + (ocioso ? dt * 0.1 : 0);
  rot.x = THREE.MathUtils.clamp(rot.x + rot.vx, -1.2, 1.2);
  rot.vy *= 0.9;
  rot.vx *= 0.9;
  L.projecao.rotation.set(L.rot.x, L.rot.y, 0);
  L.escala = THREE.MathUtils.lerp(L.escala, L.escalaAlvo, 0.12);
  L.projecao.scale.setScalar(L.escala);
  L.atelie.grupo.rotation.set(L.rotCriar.x, L.rotCriar.y, 0);
  L.escalaCriar = THREE.MathUtils.lerp(L.escalaCriar, L.escalaCriarAlvo, 0.12);
  L.atelie.grupo.scale.setScalar(L.escalaCriar);
  L.fatorModo = THREE.MathUtils.lerp(L.fatorModo, { projecoes: 1, apps: 0.18, criar: 0 }[L.modoLab], 0.08);
  L.explosao = THREE.MathUtils.lerp(L.explosao, L.explosaoAlvo, L.explosaoAlvo > L.explosao ? 0.05 : 0.12);
  L.atracao = THREE.MathUtils.lerp(L.atracao, L.atracaoAlvo, 0.08);
  L.dedoForca = THREE.MathUtils.lerp(L.dedoForca, L.dedoAlvo, 0.15);
  L.morph = Math.min(1, L.morph + Math.min(delta, 0.25) / 2.2);   // a transformação dura ~2 s mesmo com poucos quadros

  // câmera: chega de longe ao abrir e acompanha o movimento do mouse ou da mão, como olhar pela janela
  L.intro = Math.min(1, L.intro + delta / 2.8);
  const e = 1 - Math.pow(1 - L.intro, 3);
  const mao = L.maos[0];
  const alvoX = mao ? (0.5 - mao.centro.x) * 2 : L.ponteiro.x;
  const alvoY = mao ? (mao.centro.y - 0.5) * 2 : L.ponteiro.y;
  L.paralaxe.x += (alvoX - L.paralaxe.x) * 0.035;
  L.paralaxe.y += (alvoY - L.paralaxe.y) * 0.035;
  L.camera.position.set(
    L.paralaxe.x * 1.25 + Math.sin(t * 0.23) * 0.06,
    THREE.MathUtils.lerp(7, 1.2, e) - L.paralaxe.y * 0.5 + Math.sin(t * 0.31) * 0.04,
    THREE.MathUtils.lerp(L.camZ + 12, L.camZ, e),
  );
  L.camera.lookAt(0, 0.15, 0);

  const f = L.formas[L.indice];
  const u = L.nuvem.material.uniforms;
  u.uTempo.value = t;
  u.uMorph.value = L.morph;
  u.uExplosao.value = L.explosao;
  u.uAtracao.value = L.atracao;
  u.uDedoForca.value = L.dedoForca;
  L.solAtivo = THREE.MathUtils.lerp(L.solAtivo, f.solAtivo ? 1 : 0, 0.06);
  u.uSolAtivo.value = L.solAtivo;
  if (f.sol) u.uSol.value.copy(f.sol());

  // falha de projeção rápida de tempos em tempos (só no holograma)
  if (agora > L.proximoGlitch) {
    L.glitchAte = agora + 80 + Math.random() * 110;
    L.proximoGlitch = agora + 3500 + Math.random() * 7000;
  }
  const falha = agora < L.glitchAte;
  u.uGlitch.value = falha ? 1 : 0;
  L.mesa.facho.material.uniforms.uForca.value = falha ? 0.55 : 1;

  f.animar(t);
  // visual foto real: o objeto de verdade aparece quando as partículas terminam de chegar;
  // ao desmontar, ele volta a virar partículas
  const real = L.modo === 'real' ? obterReal(f) : null;
  const mostrarReal = !!real && real.carregado && !real.falhou && L.morph >= 1 && L.explosao < 0.12 && L.modoLab === 'projecoes';
  if (real) {
    real.grupo.visible = mostrarReal;
    if (mostrarReal) real.animar(t, { camera: L.camera, projecao: L.projecao, luzSol: L.luzSol });
  }
  L.opNuvem = THREE.MathUtils.lerp(L.opNuvem, mostrarReal ? 0 : 1, mostrarReal ? 0.1 : 0.25);
  u.uOpacidade.value = L.opNuvem * L.fatorModo;
  L.nuvem.visible = L.opNuvem * L.fatorModo > 0.01;

  // as linhas da forma somem quando ela desmonta e acendem quando a transformação termina
  // (animações de piscar usam userData.pulso, para não brigar com esse apagar)
  const visLinhas = Math.max(0, Math.min(1, (L.morph - 0.55) / 0.45)) * (1 - Math.min(1, L.explosao / 1.2)) * L.fatorModo;
  const aplicar = (o) => {
    if (o.material) {
      o.material.userData.base ??= o.material.opacity;
      o.material.opacity = o.material.userData.base * visLinhas * (o.material.userData.pulso ?? 1);
    }
  };
  L.linhas.traverse(aplicar);
  if (f.comuns) f.comuns.traverse(aplicar);

  L.sala.animar(delta);
  L.atelie.animar(t);
  desenharCursor();
  if (L.modo === 'holo') {
    L.mesa.anelMarcas.rotation.y = t * 0.15;
    L.mesa.facho.material.uniforms.uTempo.value = t;
    L.mesa.emissor.scale.setScalar(1.05 + Math.sin(t * 2.4) * 0.1);
    L.mesa.emissores.forEach((b, i) => { b.material.opacity = 0.55 + 0.45 * Math.sin(t * 2 + i * 1.7); });
    L.mesa.luz.intensity = (falha ? 12 : 22) + Math.sin(t * 3.1) * 2;
    const poeira = L.mesa.poeira.geometry.attributes.position;
    for (let i = 0; i < poeira.count; i++) {
      let y = poeira.getY(i) + dt * (0.25 + (i % 7) * 0.05);
      if (y > 5.7) y = 0.1;
      poeira.setY(i, y);
    }
    poeira.needsUpdate = true;
    if (L.raios.visible) atualizarRaios(agora);
  }
  L.lente.uniforms.uTempo.value = t % 10;

  // placa fraca: depois de 4 s lentos, desliga o bloom e o reflexo e baixa a resolução. Como a lentidão pode
  // ser passageira, depois de um tempo tenta voltar; se pesar de novo, fica no modo econômico de vez.
  if (!L.economia && L.intro >= 1) {
    if (L.fps >= 20 || delta > 0.4) L.lentoDesde = 0;
    else if (!L.lentoDesde) L.lentoDesde = agora;
    else if (agora - L.lentoDesde > 4000) definirEconomia(true);
  } else if (L.economia && !L.placaFraca && L.tentativasEconomia < 2 && agora - L.economiaDesde > 25000 && L.fps >= 45) {
    definirEconomia(false);
  }
  if (L.economia) L.renderer.render(L.cena, L.camera);
  else L.composer.render();
  atualizarRotulos();
  if (Math.floor(t * 5) !== L.ultimoHud) {
    L.ultimoHud = Math.floor(t * 5);
    atualizarHud();
  }
}

// ---------------- API usada pelo console ----------------
export async function abrir({ raiz, stream = null, aoVoltar = null, visual = 'holo', clima = '', aoTrocarVisual = null, aoEvento = null, apps = null } = {}) {
  L.aoVoltar = aoVoltar;
  L.aoTrocarVisual = aoTrocarVisual;
  L.aoEvento = aoEvento;
  L.apps = apps;
  L.clima = clima;
  if (L.aberto) return estadoAtual();
  raiz.hidden = false;
  L.raiz = raiz;
  L.modo = visual === 'real' ? 'real' : 'holo';
  if (!L.pronto) {
    const canvas = montarHud(raiz);
    ligarControlesManuais(canvas);
    await montarCena(canvas);
    desenharListaFormas();
    mostrarTitulo(L.formas[0]);
    montarRotulos(L.formas[0]);
    for (const b of L.hud.modos.children) b.classList.toggle('ativo', b.dataset.modo === L.modoLab);
    L.raiz.dataset.modo = L.modoLab;
    L.pronto = true;
  }
  L.hud.aviso.textContent = '';
  aplicarModo();
  L.aberto = true;
  L.intro = 0;
  L.ultimoQuadro = 0;
  ajustarTamanho();
  L.som.ligarSistema();
  L.som.ligarZumbido();
  L.formas[L.indice].aoEntrar?.();
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
  L.som.desligarZumbido();
  L.formas[L.indice]?.aoSair?.();
  if (L.streamProprio && L.stream) L.stream.getTracks().forEach((tr) => tr.stop());
  L.stream = null;
  if (L.video) L.video.srcObject = null;
  L.maos = [];
  L.cursor.mao = false;
  L.atelie?.soltar();
  if (L.raiz) L.raiz.hidden = true;
}

export function mostrar(alvo) {
  if (!L.pronto) return 'O laboratório ainda não abriu.';
  const procurado = normalizar(alvo);
  let i = typeof alvo === 'number' ? alvo : CATALOGO.findIndex((c) => [c.titulo, c.chave, ...(c.apelidos || [])].some((n) => normalizar(n) === procurado));
  if (i < 0 && typeof alvo !== 'number') i = CATALOGO.findIndex((c) => normalizar(c.titulo).includes(procurado) || (c.apelidos || []).some((n) => normalizar(n).includes(procurado)));
  if (i < 0) return `Não tenho a projeção "${alvo}". Tenho: ${CATALOGO.map((c) => c.titulo).join(', ')}.`;
  i = (i + CATALOGO.length) % CATALOGO.length;
  if (L.modoLab !== 'projecoes') modo('projecoes');
  if (i === L.indice && L.morph >= 1) return `Já estou exibindo ${CATALOGO[i].titulo}.`;
  L.som.transformar();
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
  const antiga = L.formas[L.indice];
  const f = forma(i);
  dest.set(f.posicoes);
  corDest.set(f.cores);
  for (const nome of ['position', 'cor', 'destino', 'corDestino']) geo.attributes[nome].needsUpdate = true;
  L.morph = 0;
  antiga.aoSair?.();
  if (antiga.comuns) L.projecao.remove(antiga.comuns);
  if (antiga.real) antiga.real.grupo.visible = false;
  L.projecao.remove(L.linhas);
  L.linhas = f.linhas;
  L.projecao.add(L.linhas);
  if (f.comuns) L.projecao.add(f.comuns);
  L.indice = i;
  L.opNuvem = 1;
  aplicarModo();
  f.aoEntrar?.();
  desenharListaFormas();
  mostrarTitulo(f);
  montarRotulos(f);
  avisar(`trocou a projeção para ${f.titulo}`);
  return `Exibindo ${f.titulo}: ${f.descricao}`;
}

export function desmontar(sim = true) {
  if (L.desmontadoPorComando !== !!sim) {
    if (sim) L.som.desmontar();
    else L.som.montar();
    avisar(sim ? 'desmontou a projeção em partículas' : 'montou a projeção de novo');
  }
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

// troca entre o holograma de cinema ('holo') e a foto real ('real'), com um corte rápido para o preto
export function definirVisual(modo, { avisarConsole = true } = {}) {
  const novo = modo === 'real' ? 'real' : 'holo';
  if (!L.pronto) {
    L.modo = novo;
    return novo;
  }
  if (novo === L.modo) return novo;
  L.som.transformar();
  L.hud.flash.classList.add('ativo');
  setTimeout(() => {
    L.modo = novo;
    L.opNuvem = 1;
    aplicarModo();
    L.hud.flash.classList.remove('ativo');
  }, 240);
  if (avisarConsole) L.aoTrocarVisual?.(novo);
  avisar(`trocou o visual do laboratório para ${novo === 'real' ? 'foto real' : 'holograma'}`);
  return novo;
}

// troca o modo do laboratório: projeções, mural de apps ou ateliê de criação
export function modo(novo) {
  if (!GUIAS[novo]) return 'Os modos do laboratório são projeções, apps e criar.';
  if (!L.pronto) {
    L.modoLab = novo;
    return `Modo ${NOME_MODO[novo]}.`;
  }
  if (novo === L.modoLab) return `Já estou no modo ${NOME_MODO[novo]}.`;
  // cada modo guarda o próprio giro: a projeção e a criação não se misturam
  L.modoLab = novo;
  L.som.transformar();
  L.arraste = null;
  L.palmaRef = 0;
  L.historico = [];
  mirar(null, performance.now());
  L.atelie.ativar(novo === 'criar');
  if (novo === 'apps') L.mural.mostrar();
  else L.mural.esconder();
  L.hud.esq.hidden = novo !== 'projecoes';
  if (novo !== 'projecoes') {
    L.desmontadoPorComando = false;
    L.explosaoAlvo = 0;
    L.atracaoAlvo = 0;
  }
  L.raiz.dataset.modo = novo;
  for (const b of L.hud.modos.children) b.classList.toggle('ativo', b.dataset.modo === novo);
  aplicarModo();
  desenharGuia();
  mostrarTitulo(L.formas[L.indice]);
  const f = L.formas[L.indice];
  avisar(novo === 'apps' ? 'abriu o mural de apps do laboratório' : novo === 'criar' ? 'entrou no ateliê para criar com as mãos' : `voltou para as projeções (${f.titulo})`);
  return novo === 'apps' ? 'Mural de apps aberto: ele aponta e faz pinça para abrir um programa.'
    : novo === 'criar' ? 'Ateliê aberto: ele desenha no ar com o dedo e cria formas com a pinça.'
      : `De volta às projeções, exibindo ${f.titulo}.`;
}

export async function abrirApp(nome) {
  if (!L.pronto) return 'O laboratório ainda não abriu.';
  if (L.modoLab !== 'apps') modo('apps');
  return L.mural.abrirPorNome(nome);
}

export function criarForma(tipo, cor) {
  if (!L.pronto) return 'O laboratório ainda não abriu.';
  if (L.modoLab !== 'criar') modo('criar');
  return L.atelie.criar(tipo, cor);
}

export function desfazerCriacao() {
  return L.atelie ? L.atelie.desfazer() : 'O ateliê ainda não abriu.';
}

export function limparCriacao() {
  return L.atelie ? L.atelie.limpar() : 'O ateliê ainda não abriu.';
}

// foto da cena como está agora, com a câmera do Renato no canto, para o Jarvis "ver" o laboratório
export function capturar() {
  if (!L.aberto) return null;
  if (L.economia) L.renderer.render(L.cena, L.camera);
  else L.composer.render();
  const tela = L.renderer.domElement;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * tela.height) / tela.width);
  const g = c.getContext('2d');
  g.drawImage(tela, 0, 0, c.width, c.height);
  if (L.video?.videoWidth) {
    const w = 260;
    const h = (w * L.video.videoHeight) / L.video.videoWidth;
    g.save();
    g.translate(c.width - 14, c.height - h - 14);
    g.scale(-1, 1);
    g.drawImage(L.video, 0, 0, w, h);
    g.restore();
    g.strokeStyle = '#4de8f0';
    g.strokeRect(c.width - 14 - w, c.height - h - 14, w, h);
  }
  return c.toDataURL('image/jpeg', 0.82);
}

// o que está acontecendo no laboratório, em texto, para o Jarvis
export function descrever() {
  if (!L.aberto) return 'O laboratório holográfico está fechado.';
  const f = L.formas[L.indice];
  const partes = [`Laboratório holográfico aberto no modo ${NOME_MODO[L.modoLab]}, visual ${L.modo === 'real' ? 'foto real' : 'holograma'}.`];
  if (L.modoLab === 'projecoes') partes.push(`Projeção: ${f.titulo}${L.explosao > 0.3 ? ' (desmontada em partículas)' : ''} — ${f.descricao}`);
  if (L.modoLab === 'apps') partes.push(`Na frente: ${L.mural.resumo()}.`);
  if (L.modoLab === 'criar') partes.push(`No ateliê: ${L.atelie.resumo()}. Ferramenta ${L.atelie.ferramenta()}.`);
  const gesto = NOMES_GESTO[L.modoLab][L.duas ? 'dupla' : L.gesto];
  partes.push(L.maos.length ? `O Renato está com ${L.maos.length === 2 ? 'as duas mãos' : 'uma mão'} na frente da câmera${gesto && gesto !== '—' ? `, gesto ${gesto.toLowerCase()}` : ''}.` : 'Nenhuma mão na frente da câmera agora.');
  if (L.cursor.alvo) partes.push(`O cursor da mão está em cima de "${(L.cursor.alvo.title || L.cursor.alvo.textContent || '').trim().slice(0, 40)}".`);
  if (L.diario.length) partes.push(`Últimas ações: ${L.diario.slice(-6).map((d) => d.texto).join('; ')}.`);
  return partes.join(' ');
}

// registra uma ação da pessoa no laboratório e avisa o console (que repassa para o Jarvis)
function avisar(texto) {
  L.diario.push({ t: Date.now(), texto });
  if (L.diario.length > 20) L.diario.shift();
  L.aoEvento?.(texto);
}

export function estadoAtual() {
  const f = L.formas[L.indice];
  return { aberto: L.aberto, forma: f?.titulo, formas: CATALOGO.map((c) => c.titulo), maos: L.maos.length, rastreamento: !!L.detector, visual: L.modo, modo: L.modoLab };
}


function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
}
