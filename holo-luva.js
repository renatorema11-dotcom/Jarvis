/*
 * holo-luva.js — a luva que veste a mão rastreada no laboratório (holo.js).
 *
 * Em vez de pontos e linhas, uma luva de verdade que se molda à mão: cada dedo é um tubo
 * contínuo que segue a curva das juntas (afinando até a ponta arredondada), a palma é uma placa
 * com borda arredondada que liga os dedos, e o punho fecha no pulso. Nas costas da mão vão
 * placas articuladas em cada falange e nos nós dos dedos; na palma, sensores nas pontas e um
 * emblema de HUD que gira.
 *
 * Quatro estilos: HOLOGRAMA (vidro ciano com borda acesa), ARMADURA (metal vermelho com
 * placas douradas), NANO (casca violeta de células que correm, com partículas) e CARBONO
 * (fibra escura com trilhas de LED verde). No visual "foto real" os estilos viram materiais
 * físicos com reflexo do ambiente.
 *
 * Efeitos de toque: faíscas quando a pinça fecha, os nós dos dedos acendem no punho e ondas
 * na superfície que a luva toca (criarOndas, no espaço do mundo).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const ESTILOS_LUVA = {
  holo: { nome: 'HOLOGRAMA', cor: '#4de8f0', cor2: '#8ff3f7', acento: '#5dfca0' },
  armadura: { nome: 'ARMADURA', cor: '#c0392b', cor2: '#d9a441', acento: '#f2c46b' },
  nano: { nome: 'NANO', cor: '#2a1650', cor2: '#a26bff', acento: '#d4b8ff' },
  carbono: { nome: 'CARBONO', cor: '#16191c', cor2: '#2a2f34', acento: '#5dfca0' },
};
export const ORDEM_ESTILOS = ['holo', 'armadura', 'nano', 'carbono'];

// cadeias de cada dedo e o raio (em frações do tamanho da palma) na base e na ponta
const DEDOS = [
  { pts: [1, 2, 3, 4], r0: 0.15, r1: 0.088 },
  { pts: [5, 6, 7, 8], r0: 0.106, r1: 0.079 },
  { pts: [9, 10, 11, 12], r0: 0.11, r1: 0.081 },
  { pts: [13, 14, 15, 16], r0: 0.102, r1: 0.076 },
  { pts: [17, 18, 19, 20], r0: 0.09, r1: 0.067 },
];
const POR_SEG = 6;        // anéis por falange
const TAMPA = 5;          // anéis da ponta arredondada
const ANEIS = 3 * POR_SEG + 1 + TAMPA;
const RADIAL = 14;
const CONTORNO = 32;      // pontos do contorno da palma depois de suavizar

// ---------------- material: um shader para os quatro estilos ----------------
const VERT = `
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 mv = modelViewMatrix * p;
    vN = normalize(normalMatrix * n);
    vV = normalize(-mv.xyz);
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = `
  uniform float uEstilo, uTempo, uTipo, uPunho, uForca, uReal, uToque;
  uniform vec3 uCor, uCor2, uAcento, uDorso;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  float hexa(vec2 p) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(g);
    return 0.5 - max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x);
  }
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(vV);
    float fr = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 2.2);
    vec3 L = normalize(vec3(-0.35, 0.75, 0.55));
    float dif = max(dot(n, L), 0.0);
    vec3 r = reflect(-v, n);
    float spec = pow(max(dot(r, L), 0.0), 48.0);
    float ceu = smoothstep(-0.3, 0.9, r.y);
    // tipo: 0 dedos, 1 palma, 2 punho, 3 placas, 4 nós dos dedos
    float eDedo = 1.0 - step(0.5, uTipo);
    float ePunho = step(1.5, uTipo) * (1.0 - step(2.5, uTipo));
    float ePlaca = step(2.5, uTipo);
    float eNo = step(3.5, uTipo);
    float bordaPunho = ePunho * smoothstep(0.12, 0.0, min(vUv.y, 1.0 - vUv.y));
    vec3 cor;
    float alfa = 1.0;
    if (uEstilo < 0.5) {
      // HOLOGRAMA: vidro ciano, borda acesa, varredura e duas costuras ao longo dos dedos
      float varre = 0.72 + 0.28 * sin(vUv.x * 70.0 - uTempo * 7.0);
      float costura = eDedo * smoothstep(0.03, 0.0, abs(abs(vUv.y - 0.5) - 0.25));
      cor = uCor * (0.1 + fr * 1.7 + costura * 0.6 + bordaPunho * 1.2 + ePlaca * 0.35) * varre;
      cor += uAcento * eNo * uPunho * 2.0;
      alfa = clamp(0.18 + fr * 0.75 + ePlaca * 0.15, 0.0, 1.0);
    } else if (uEstilo < 1.5) {
      // ARMADURA: metal vermelho polido, placas e nós dourados, sulcos entre os gomos
      vec3 base = mix(uCor, uCor2, max(ePlaca, bordaPunho));
      vec3 env = mix(vec3(0.05, 0.04, 0.04), vec3(1.0, 0.94, 0.88), ceu);
      float sulco = eDedo * smoothstep(0.0, 0.05, abs(fract(vUv.x * 12.0) - 0.5) - 0.44);
      cor = base * (0.1 + 0.5 * dif) + base * env * 0.6 + vec3(spec * 1.4) + base * fr * 0.4;
      cor *= 1.0 - sulco * 0.55;
      cor += uAcento * eNo * uPunho * 2.4;
    } else if (uEstilo < 2.5) {
      // NANO: casca escura de células hexagonais que acendem em ondas
      vec2 q = vUv * vec2(26.0, 10.0);
      float h = hexa(q);
      float onda = 0.5 + 0.5 * sin(vUv.x * 18.0 - uTempo * 4.0 + vUv.y * 6.2832);
      float celula = smoothstep(0.07, 0.0, h);
      cor = uCor * (0.25 + 0.6 * dif) + uCor2 * celula * (0.25 + 0.9 * onda) + uCor2 * fr * 0.9 + vec3(spec * 0.5);
      cor += uAcento * (eNo * uPunho * 2.2 + bordaPunho * 0.8);
    } else {
      // CARBONO: fibra trançada escura, verniz e trilhas de LED verde nas costas dos dedos
      vec2 q = vec2(vUv.x * 44.0, vUv.y * 22.0);
      float trama = step(0.5, fract(q.x * 0.5 + floor(q.y) * 0.5));
      float fio = 0.6 + 0.4 * abs(sin(q.x * 3.14159 + q.y * 1.5708));
      vec3 base = mix(uCor, uCor2, trama * fio);
      cor = base * (0.4 + 0.9 * dif) + vec3(spec * 0.7) + base * ceu * 0.35 + vec3(fr * 0.1);
      float trilha = eDedo * smoothstep(0.04, 0.0, min(vUv.y, 1.0 - vUv.y));
      float pulso = smoothstep(0.7, 1.0, fract(vUv.x * 3.0 - uTempo * 1.3));
      cor += uAcento * (trilha * (0.35 + 1.8 * pulso) + bordaPunho * 0.9 + eNo * (0.25 + uPunho * 2.4));
    }
    cor += uAcento * uToque * fr * 0.8;
    if (uReal > 0.5 && uEstilo < 0.5) cor = mix(cor, cor * vec3(1.15, 1.2, 1.25), 0.4);
    gl_FragColor = vec4(cor * uForca, alfa);
  }`;

function materialLuva(tipo) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uEstilo: { value: 0 }, uTempo: { value: 0 }, uTipo: { value: tipo }, uPunho: { value: 0 }, uForca: { value: 1 }, uReal: { value: 0 }, uToque: { value: 0 },
      uCor: { value: new THREE.Color() }, uCor2: { value: new THREE.Color() }, uAcento: { value: new THREE.Color() }, uDorso: { value: new THREE.Vector3(0, 0, -1) },
    },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, toneMapped: false,
  });
}

// trama de carbono para o material físico (foto real)
let texturaCarbono = null;
function carbono() {
  if (texturaCarbono) return texturaCarbono;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#15181b';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const claro = (x + y) % 2 === 0;
      const grad = claro ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
      grad.addColorStop(0, '#1d2125');
      grad.addColorStop(0.5, claro ? '#3a4047' : '#2b3036');
      grad.addColorStop(1, '#1d2125');
      g.fillStyle = grad;
      g.fillRect(x * 8 + 0.5, y * 8 + 0.5, 7, 7);
    }
  }
  texturaCarbono = new THREE.CanvasTexture(c);
  texturaCarbono.wrapS = texturaCarbono.wrapT = THREE.RepeatWrapping;
  texturaCarbono.repeat.set(6, 3);
  texturaCarbono.colorSpace = THREE.SRGBColorSpace;
  return texturaCarbono;
}

function materiaisReais(estilo) {
  const e = ESTILOS_LUVA[estilo];
  const fisico = (o) => new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, envMapIntensity: 1.1, ...o });
  if (estilo === 'armadura') {
    const pele = fisico({ color: '#a8231a', metalness: 0.85, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
    const ouro = fisico({ color: e.cor2, metalness: 1, roughness: 0.24, emissive: new THREE.Color(e.acento), emissiveIntensity: 0 });
    return { dedos: pele, palma: pele, punho: ouro, placas: ouro.clone(), nos: ouro.clone() };
  }
  if (estilo === 'nano') {
    const pele = fisico({ color: '#2a1650', metalness: 0.6, roughness: 0.35, iridescence: 0.7, iridescenceIOR: 1.6, emissive: new THREE.Color('#5a2dd6'), emissiveIntensity: 0.12 });
    const no = pele.clone();
    return { dedos: pele, palma: pele, punho: pele, placas: pele, nos: no };
  }
  if (estilo === 'carbono') {
    const pele = fisico({ color: '#ffffff', map: carbono(), metalness: 0.25, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.12 });
    const no = fisico({ color: '#1b1f22', metalness: 0.5, roughness: 0.3, emissive: new THREE.Color(e.acento), emissiveIntensity: 0.25 });
    return { dedos: pele, palma: pele, punho: pele, placas: no.clone(), nos: no };
  }
  return null;   // o holograma continua sendo o shader, mais claro
}

// ---------------- geometrias que se refazem a cada quadro ----------------
function geometriaDedos() {
  const nv = DEDOS.length * ANEIS * (RADIAL + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const uv = new Float32Array(nv * 2);
  const indices = [];
  for (let d = 0; d < DEDOS.length; d++) {
    const base = d * ANEIS * (RADIAL + 1);
    for (let a = 0; a < ANEIS; a++) {
      for (let k = 0; k <= RADIAL; k++) {
        const i = base + a * (RADIAL + 1) + k;
        uv[i * 2] = a / (ANEIS - 1);
        uv[i * 2 + 1] = k / RADIAL;
        if (a < ANEIS - 1 && k < RADIAL) {
          const p = i;
          const q = i + RADIAL + 1;
          indices.push(p, q, p + 1, p + 1, q, q + 1);
        }
      }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(indices);
  return g;
}

function geometriaPalma() {
  const aneis = 5;
  const nv = aneis * CONTORNO + 2;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const uv = new Float32Array(nv * 2);
  const indices = [];
  for (let a = 0; a < aneis; a++) {
    for (let k = 0; k < CONTORNO; k++) {
      const i = a * CONTORNO + k;
      uv[i * 2] = k / CONTORNO;
      uv[i * 2 + 1] = a / (aneis - 1);
      if (a < aneis - 1) {
        const k2 = (k + 1) % CONTORNO;
        const p = a * CONTORNO + k;
        const q = (a + 1) * CONTORNO + k;
        const p2 = a * CONTORNO + k2;
        const q2 = (a + 1) * CONTORNO + k2;
        indices.push(p, q, p2, p2, q, q2);
      }
    }
  }
  const topo = aneis * CONTORNO;
  const fundo = topo + 1;
  uv.set([0.5, 0, 0.5, 1], topo * 2);
  for (let k = 0; k < CONTORNO; k++) {
    const k2 = (k + 1) % CONTORNO;
    indices.push(topo, k2, k);
    indices.push(fundo, (aneis - 1) * CONTORNO + k, (aneis - 1) * CONTORNO + k2);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(indices);
  return g;
}

function geometriaPunho() {
  const aneis = 6;
  const seg = 28;
  const nv = aneis * (seg + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const uv = new Float32Array(nv * 2);
  const indices = [];
  for (let a = 0; a < aneis; a++) {
    for (let k = 0; k <= seg; k++) {
      const i = a * (seg + 1) + k;
      uv[i * 2] = k / seg;
      uv[i * 2 + 1] = a / (aneis - 1);
      if (a < aneis - 1 && k < seg) indices.push(i, i + seg + 1, i + 1, i + 1, i + seg + 1, i + seg + 2);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.userData = { aneis, seg };
  return g;
}

// Catmull-Rom uniforme entre p1 e p2
function catmull(p0, p1, p2, p3, t, alvo) {
  const t2 = t * t;
  const t3 = t2 * t;
  for (const e of ['x', 'y', 'z']) {
    alvo[e] = 0.5 * (2 * p1[e] + (-p0[e] + p2[e]) * t + (2 * p0[e] - 5 * p1[e] + 4 * p2[e] - p3[e]) * t2 + (-p0[e] + 3 * p1[e] - 3 * p2[e] + p3[e]) * t3);
  }
  return alvo;
}

// suaviza um contorno fechado (Chaikin)
function chaikin(pts, vezes) {
  let atual = pts;
  for (let v = 0; v < vezes; v++) {
    const novo = [];
    for (let i = 0; i < atual.length; i++) {
      const a = atual[i];
      const b = atual[(i + 1) % atual.length];
      novo.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75));
    }
    atual = novo;
  }
  return atual;
}

function texturaFaisca() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
let faiscaTex = null;

function arco(raio, largura, inicio, tamanho) {
  return new THREE.RingGeometry(raio, raio + largura, 48, 1, inicio, tamanho);
}

// ---------------- a luva ----------------
export function criarLuva() {
  const grupo = new THREE.Group();
  grupo.visible = false;
  grupo.renderOrder = 10;
  const mats = { dedos: materialLuva(0), palma: materialLuva(1), punho: materialLuva(2), placas: materialLuva(3), nos: materialLuva(4) };
  const shaders = Object.values(mats);

  const geoDedos = geometriaDedos();
  const geoPalma = geometriaPalma();
  const geoPunho = geometriaPunho();
  const dedos = new THREE.Mesh(geoDedos, mats.dedos);
  const palma = new THREE.Mesh(geoPalma, mats.palma);
  const punho = new THREE.Mesh(geoPunho, mats.punho);
  const placaGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.28);
  const placas = new THREE.InstancedMesh(placaGeo, mats.placas, 16);
  const nos = new THREE.InstancedMesh(placaGeo, mats.nos, 4);
  for (const o of [dedos, palma, punho, placas, nos]) o.frustumCulled = false;

  // partículas do estilo nano (usam os próprios vértices da luva)
  const matNano = new THREE.ShaderMaterial({
    uniforms: { uTempo: { value: 0 }, uTam: { value: 1 }, uCor: { value: new THREE.Color('#d4b8ff') } },
    vertexShader: `
      uniform float uTempo, uTam;
      varying float vBrilho;
      void main() {
        vec3 p = position;
        float fase = p.x * 91.0 + p.y * 57.0 + p.z * 33.0;
        vBrilho = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTempo * 5.0 + fase), 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uTam * (0.6 + vBrilho) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uCor;
      varying float vBrilho;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uCor * a * vBrilho * 1.6, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const nanoDedos = new THREE.Points(geoDedos, matNano);
  const nanoPalma = new THREE.Points(geoPalma, matNano);
  nanoDedos.frustumCulled = nanoPalma.frustumCulled = false;

  // emblema de HUD que gira no centro da mão, do lado que está virado para quem olha
  const hud = new THREE.Group();
  const matHud = new THREE.MeshBasicMaterial({ color: '#4de8f0', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const aneis = [
    new THREE.Mesh(arco(1, 0.07, 0, Math.PI * 1.3), matHud),
    new THREE.Mesh(arco(1.2, 0.035, 0.4, Math.PI * 0.7), matHud),
    new THREE.Mesh(arco(1.2, 0.035, Math.PI * 1.25, Math.PI * 0.55), matHud),
    new THREE.Mesh(arco(0.78, 0.025, 0, Math.PI * 2), matHud),
    new THREE.Mesh(new THREE.CircleGeometry(0.42, 6), matHud),
  ];
  aneis[4].material = matHud.clone();
  aneis[4].material.opacity = 0.35;
  hud.add(...aneis);

  // sensores nas pontas dos dedos (lado da palma) e anel da pinça
  if (!faiscaTex) faiscaTex = texturaFaisca();
  const matPonto = new THREE.SpriteMaterial({ map: faiscaTex, color: '#8ff3f7', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const sensores = DEDOS.map(() => new THREE.Sprite(matPonto));
  const pincaAnel = new THREE.Mesh(arco(1, 0.12, 0, Math.PI * 2), matHud.clone());
  const pincaPonto = new THREE.Sprite(matPonto.clone());

  // faíscas da pinça
  const MAX_F = 64;
  const geoFaisca = new THREE.BufferGeometry();
  geoFaisca.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_F * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geoFaisca.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_F * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const matFaisca = new THREE.PointsMaterial({ size: 0.05, map: faiscaTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const faiscas = new THREE.Points(geoFaisca, matFaisca);
  faiscas.frustumCulled = false;
  const particulas = Array.from({ length: MAX_F }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), vida: 0 }));

  grupo.add(punho, palma, dedos, placas, nos, nanoDedos, nanoPalma, hud, ...sensores, pincaAnel, pincaPonto, faiscas);

  const P = Array.from({ length: 21 }, () => new THREE.Vector3());
  const tmp = {
    a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(), bi: new THREE.Vector3(),
    m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(),
  };
  const centros = Array.from({ length: ANEIS }, () => new THREE.Vector3());
  const raios = new Float32Array(ANEIS);
  const dorso = new THREE.Vector3();
  const dirPonta = new THREE.Vector3();
  const cor = new THREE.Color();
  let estilo = 'holo';
  let real = false;
  let reais = null;
  let punhoForca = 0;
  let pulsoPinca = 0;
  let gestoAntes = 'nenhum';
  let ultimoT = 0;
  let toque = 0;

  function aplicarMateriais() {
    const e = ESTILOS_LUVA[estilo];
    const valor = ORDEM_ESTILOS.indexOf(estilo);
    const holo = estilo === 'holo';
    for (const m of shaders) {
      m.uniforms.uEstilo.value = valor;
      m.uniforms.uCor.value.set(e.cor);
      m.uniforms.uCor2.value.set(e.cor2);
      m.uniforms.uAcento.value.set(e.acento);
      m.uniforms.uReal.value = real ? 1 : 0;
      m.transparent = holo;
      m.blending = holo ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.depthWrite = !holo;
      m.needsUpdate = true;
    }
    reais = real && !holo ? materiaisReais(estilo) : null;
    const conjunto = reais || mats;
    dedos.material = conjunto.dedos;
    palma.material = conjunto.palma;
    punho.material = conjunto.punho;
    placas.material = conjunto.placas;
    nos.material = conjunto.nos;
    nanoDedos.visible = nanoPalma.visible = estilo === 'nano';
    matHud.color.set(holo ? e.cor : e.acento);
    matPonto.color.set(e.acento);
  }
  aplicarMateriais();

  function atualizarDedos(S) {
    const pos = geoDedos.attributes.position.array;
    const nor = geoDedos.attributes.normal.array;
    DEDOS.forEach((dedo, d) => {
      const c = dedo.pts.map((k) => P[k]);
      // pontos fantasmas nas pontas da curva
      const antes = tmp.a.copy(c[0]).multiplyScalar(2).sub(c[1]);
      const depois = tmp.b.copy(c[3]).multiplyScalar(2).sub(c[2]);
      const ext = [antes, c[0], c[1], c[2], c[3], depois];
      let a = 0;
      for (let seg = 0; seg < 3; seg++) {
        for (let i = 0; i < POR_SEG; i++) {
          catmull(ext[seg], ext[seg + 1], ext[seg + 2], ext[seg + 3], i / POR_SEG, centros[a]);
          const s = (seg + i / POR_SEG) / 3;
          raios[a] = (dedo.r0 + (dedo.r1 - dedo.r0) * s) * S * (1 + 0.07 * Math.exp(-(((s - 1 / 3) * 14) ** 2)) + 0.05 * Math.exp(-(((s - 2 / 3) * 14) ** 2)));
          a++;
        }
      }
      centros[a].copy(c[3]);
      raios[a] = dedo.r1 * S;
      const rPonta = raios[a];
      a++;
      dirPonta.copy(c[3]).sub(c[2]).normalize();
      for (let i = 1; i <= TAMPA; i++) {
        const fi = (i / TAMPA) * Math.PI / 2;
        centros[a].copy(c[3]).addScaledVector(dirPonta, rPonta * Math.sin(fi) * 0.95);
        raios[a] = rPonta * Math.cos(fi) + 1e-5;
        a++;
      }
      // anéis com referencial que acompanha a curva (o ângulo zero aponta para as costas da mão)
      const base = d * ANEIS * (RADIAL + 1);
      for (let r = 0; r < ANEIS; r++) {
        const ant = centros[Math.max(0, r - 1)];
        const prox = centros[Math.min(ANEIS - 1, r + 1)];
        const T = tmp.t.subVectors(prox, ant);
        if (r >= ANEIS - TAMPA) T.copy(dirPonta);
        T.normalize();
        const B = tmp.bi.crossVectors(T, dorso);
        if (B.lengthSq() < 1e-6) B.set(1, 0, 0);
        B.normalize();
        const N = tmp.n.crossVectors(B, T).normalize();
        const tampa = r > ANEIS - TAMPA - 1 ? (r - (ANEIS - TAMPA - 1)) / TAMPA : 0;
        const fi = tampa * Math.PI / 2;
        for (let k = 0; k <= RADIAL; k++) {
          const th = (k / RADIAL) * Math.PI * 2;
          const cx = Math.cos(th);
          const sx = Math.sin(th);
          const dx = N.x * cx + B.x * sx;
          const dy = N.y * cx + B.y * sx;
          const dz = N.z * cx + B.z * sx;
          const i = (base + r * (RADIAL + 1) + k) * 3;
          pos[i] = centros[r].x + dx * raios[r];
          pos[i + 1] = centros[r].y + dy * raios[r];
          pos[i + 2] = centros[r].z + dz * raios[r];
          const cf = Math.cos(fi);
          const sf = Math.sin(fi);
          nor[i] = dx * cf + T.x * sf;
          nor[i + 1] = dy * cf + T.y * sf;
          nor[i + 2] = dz * cf + T.z * sf;
        }
      }
    });
    geoDedos.attributes.position.needsUpdate = true;
    geoDedos.attributes.normal.needsUpdate = true;
  }

  const contornoBase = Array.from({ length: 8 }, () => new THREE.Vector3());
  const centroPalma = new THREE.Vector3();
  function atualizarPalma(S) {
    const xh = tmp.x.subVectors(P[5], P[17]);
    const largura = xh.length();
    xh.divideScalar(largura || 1);
    const pulsoT = tmp.a.copy(P[0]).addScaledVector(xh, largura * 0.34);
    const pulsoM = tmp.b.copy(P[0]).addScaledVector(xh, -largura * 0.33);
    contornoBase[0].copy(pulsoM);
    contornoBase[1].copy(pulsoT);
    contornoBase[2].copy(P[1]).lerp(P[2], 0.6);
    contornoBase[3].copy(P[5]);
    contornoBase[4].copy(P[9]);
    contornoBase[5].copy(P[13]);
    contornoBase[6].copy(P[17]);
    contornoBase[7].copy(P[17]).lerp(pulsoM, 0.5).addScaledVector(xh, -largura * 0.06);
    const contorno = chaikin(contornoBase, 2);
    centroPalma.set(0, 0, 0);
    for (const p of contorno) centroPalma.add(p);
    centroPalma.divideScalar(contorno.length);
    const esp = 0.24 * S;
    const camadas = [[0.86, 0.5], [0.97, 0.36], [1.02, 0], [0.97, -0.36], [0.86, -0.5]];
    const pos = geoPalma.attributes.position;
    camadas.forEach(([escala, alt], a) => {
      contorno.forEach((p, k) => {
        tmp.c.subVectors(p, centroPalma).multiplyScalar(escala).add(centroPalma).addScaledVector(dorso, esp * alt);
        pos.setXYZ(a * CONTORNO + k, tmp.c.x, tmp.c.y, tmp.c.z);
      });
    });
    tmp.c.copy(centroPalma).addScaledVector(dorso, esp * 0.64);
    pos.setXYZ(camadas.length * CONTORNO, tmp.c.x, tmp.c.y, tmp.c.z);
    tmp.c.copy(centroPalma).addScaledVector(dorso, -esp * 0.58);
    pos.setXYZ(camadas.length * CONTORNO + 1, tmp.c.x, tmp.c.y, tmp.c.z);
    pos.needsUpdate = true;
    geoPalma.computeVertexNormals();
    return { largura, esp };
  }

  function atualizarPunho(S, largura, esp) {
    const eixo = tmp.a.subVectors(P[0], P[9]).normalize();
    const xh = tmp.x.subVectors(P[5], P[17]).normalize();
    const zh = tmp.z.copy(dorso);
    const { aneis: na, seg } = geoPunho.userData;
    const pos = geoPunho.attributes.position.array;
    const nor = geoPunho.attributes.normal.array;
    const comprimento = 0.46 * S;
    const perfil = [[0.02, 1.08], [0.1, 1.12], [0.3, 1.04], [0.7, 1.02], [0.9, 1.1], [1, 1.04]];
    for (let a = 0; a < na; a++) {
      const [t, inchar] = perfil[a];
      const c = tmp.c.copy(P[0]).addScaledVector(eixo, comprimento * t - 0.05 * S);
      const rx = largura * 0.44 * inchar;
      const rz = Math.max(esp * 0.95, largura * 0.27) * inchar;
      for (let k = 0; k <= seg; k++) {
        const th = (k / seg) * Math.PI * 2;
        const i = (a * (seg + 1) + k) * 3;
        pos[i] = c.x + xh.x * Math.cos(th) * rx + zh.x * Math.sin(th) * rz;
        pos[i + 1] = c.y + xh.y * Math.cos(th) * rx + zh.y * Math.sin(th) * rz;
        pos[i + 2] = c.z + xh.z * Math.cos(th) * rx + zh.z * Math.sin(th) * rz;
        tmp.n.copy(xh).multiplyScalar(Math.cos(th) / rx).addScaledVector(zh, Math.sin(th) / rz).normalize();
        nor[i] = tmp.n.x;
        nor[i + 1] = tmp.n.y;
        nor[i + 2] = tmp.n.z;
      }
    }
    geoPunho.attributes.position.needsUpdate = true;
    geoPunho.attributes.normal.needsUpdate = true;
  }

  // coloca uma placa: centro, eixo ao longo do comprimento, normal para fora e escalas
  function placa(malha, i, centro, ao, fora, sx, sy, sz) {
    tmp.y.copy(ao).normalize();
    tmp.z.copy(fora).addScaledVector(tmp.y, -fora.dot(tmp.y)).normalize();
    tmp.x.crossVectors(tmp.y, tmp.z);
    tmp.m.makeBasis(tmp.x, tmp.y, tmp.z);
    tmp.q.setFromRotationMatrix(tmp.m);
    tmp.m.compose(centro, tmp.q, tmp.s.set(sx, sy, sz));
    malha.setMatrixAt(i, tmp.m);
  }

  function atualizarPlacas(S, largura, esp) {
    let i = 0;
    DEDOS.forEach((dedo) => {
      for (let seg = 0; seg < 3; seg++) {
        const a = P[dedo.pts[seg]];
        const b = P[dedo.pts[seg + 1]];
        const comp = a.distanceTo(b);
        const r = (dedo.r0 + (dedo.r1 - dedo.r0) * ((seg + 0.5) / 3)) * S;
        tmp.c.addVectors(a, b).multiplyScalar(0.5).addScaledVector(dorso, r * 0.86);
        tmp.t.subVectors(b, a);
        placa(placas, i++, tmp.c, tmp.t, dorso, r * 1.15, comp * 0.58, r * 0.32);
      }
    });
    // placa grande nas costas da mão
    tmp.c.copy(centroPalma).addScaledVector(dorso, esp * 0.6);
    tmp.t.subVectors(P[9], P[0]);
    placa(placas, i++, tmp.c, tmp.t, dorso, largura * 0.52, S * 0.42, S * 0.05);
    placas.instanceMatrix.needsUpdate = true;
    // nós dos dedos
    [1, 2, 3, 4].forEach((d, j) => {
      const dedo = DEDOS[d];
      const r = dedo.r0 * S;
      tmp.c.copy(P[dedo.pts[0]]).addScaledVector(dorso, r * 1.02);
      tmp.t.subVectors(P[dedo.pts[1]], P[dedo.pts[0]]);
      placa(nos, j, tmp.c, tmp.t, dorso, r * 1.4, r * 1.05, r * 0.45);
    });
    nos.instanceMatrix.needsUpdate = true;
  }

  function soltarFaiscas(onde, S, base) {
    let n = 0;
    for (const f of particulas) {
      if (f.vida > 0 || n >= 26) continue;
      f.p.copy(onde);
      f.v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(S * (1.6 + Math.random() * 2.6));
      f.vida = 0.35 + Math.random() * 0.4;
      f.cor = base;
      n++;
    }
  }

  function atualizarFaiscas(dt, S) {
    const pos = geoFaisca.attributes.position.array;
    const cores = geoFaisca.attributes.color.array;
    particulas.forEach((f, i) => {
      if (f.vida > 0) {
        f.vida -= dt;
        f.v.multiplyScalar(Math.exp(-dt * 4));
        f.v.y -= S * 3 * dt;
        f.p.addScaledVector(f.v, dt);
      }
      const brilho = Math.max(0, Math.min(1, f.vida * 2.2));
      pos[i * 3] = f.p.x;
      pos[i * 3 + 1] = f.p.y;
      pos[i * 3 + 2] = f.p.z;
      const c = f.cor || cor;
      cores[i * 3] = c.r * brilho * 1.6;
      cores[i * 3 + 1] = c.g * brilho * 1.6;
      cores[i * 3 + 2] = c.b * brilho * 1.6;
    });
    geoFaisca.attributes.position.needsUpdate = true;
    geoFaisca.attributes.color.needsUpdate = true;
    matFaisca.size = S * 0.09;
  }

  return {
    grupo,
    get estilo() { return estilo; },
    definirEstilo(novo, visualReal = real) {
      if (!ESTILOS_LUVA[novo]) return false;
      estilo = novo;
      real = visualReal;
      aplicarMateriais();
      return true;
    },
    // um toque na superfície (vindo da oficina) faz a luva brilhar um instante
    tocar() { toque = 1; },
    // mapear(ponto normalizado) -> posição no espaço da câmera; ambiente: textura de reflexo (foto real)
    atualizar(mao, mapear, t, opcoes = {}) {
      const dt = Math.min(0.05, Math.max(0.001, t - (ultimoT || t)));
      ultimoT = t;
      const visualReal = !!opcoes.real;
      if (visualReal !== real) {
        real = visualReal;
        aplicarMateriais();
      }
      if (reais && opcoes.ambiente) {
        for (const m of new Set(Object.values(reais))) {
          if (m.envMap !== opcoes.ambiente) {
            m.envMap = opcoes.ambiente;
            m.needsUpdate = true;
          }
        }
      }
      if (mao) mao.pts.forEach((pt, k) => P[k].copy(mapear(pt)));
      const S = mao ? Math.max(1e-3, P[0].distanceTo(P[9])) : 0.5;
      atualizarFaiscas(dt, S);
      grupo.visible = !!mao || particulas.some((f) => f.vida > 0);
      const partes = [dedos, palma, punho, placas, nos, hud, pincaAnel, pincaPonto, ...sensores];
      for (const o of partes) o.visible = !!mao;
      nanoDedos.visible = nanoPalma.visible = !!mao && estilo === 'nano';
      if (!mao) {
        gestoAntes = 'nenhum';
        return;
      }
      // costas da mão: pela quiralidade (o desenho é espelhado na tela, como num espelho)
      dorso.subVectors(P[5], P[0]).cross(tmp.a.subVectors(P[17], P[0])).normalize();
      if (mao.lado.startsWith('esquerda')) dorso.negate();
      const e = ESTILOS_LUVA[estilo];
      const gesto = mao.gesto;
      cor.set(estilo === 'holo' ? (opcoes.corGesto || e.cor) : e.acento);
      punhoForca = THREE.MathUtils.lerp(punhoForca, gesto === 'punho' ? 1 : 0, 1 - Math.exp(-dt * 10));
      toque = Math.max(0, toque - dt * 2.5);
      for (const m of shaders) {
        m.uniforms.uTempo.value = t;
        m.uniforms.uPunho.value = punhoForca;
        m.uniforms.uToque.value = toque;
        m.uniforms.uDorso.value.copy(dorso);
        if (estilo === 'holo') m.uniforms.uCor.value.copy(cor);
      }
      if (reais) {
        reais.nos.emissiveIntensity = (estilo === 'carbono' ? 0.25 : 0) + punhoForca * 2.2;
      }
      matNano.uniforms.uTempo.value = t;
      matNano.uniforms.uTam.value = S * 0.05;

      atualizarDedos(S);
      const { largura, esp } = atualizarPalma(S);
      atualizarPunho(S, largura, esp);
      atualizarPlacas(S, largura, esp);

      // emblema do lado que está virado para quem olha (a câmera fica em +z)
      const lado = dorso.z > 0 ? 1 : -1;
      hud.position.copy(centroPalma).addScaledVector(dorso, lado * esp * 0.66);
      tmp.n.copy(dorso).multiplyScalar(lado);
      hud.quaternion.setFromUnitVectors(tmp.z.set(0, 0, 1), tmp.n);
      hud.scale.setScalar(S * 0.3);
      aneis[0].rotation.z = t * 1.6;
      aneis[1].rotation.z = -t * 2.3;
      aneis[2].rotation.z = -t * 2.3;
      aneis[3].scale.setScalar(1 + Math.sin(t * 3) * 0.05);
      aneis[4].rotation.z = t * 0.5;
      matHud.opacity = 0.55 + punhoForca * 0.4;
      // sensores nas pontas, do lado da palma
      DEDOS.forEach((dedo, i) => {
        const k = dedo.pts[3];
        sensores[i].position.copy(P[k]).addScaledVector(dorso, -dedo.r1 * S * 0.75);
        sensores[i].scale.setScalar(S * (gesto === 'aponta' && k === 8 ? 0.42 : 0.2));
      });
      // pinça: anel fechando, ponto aceso e faíscas quando fecha
      const pinca = gesto === 'pinca';
      if (pinca && gestoAntes !== 'pinca') soltarFaiscas(tmp.c.addVectors(P[4], P[8]).multiplyScalar(0.5), S, new THREE.Color(e.acento));
      if (gesto === 'punho' && gestoAntes !== 'punho') soltarFaiscas(P[9], S * 0.6, new THREE.Color(e.acento));
      gestoAntes = gesto;
      pulsoPinca = THREE.MathUtils.lerp(pulsoPinca, pinca ? 1 : 0, 0.3);
      pincaAnel.visible = pincaPonto.visible = pulsoPinca > 0.03;
      tmp.c.addVectors(P[4], P[8]).multiplyScalar(0.5);
      pincaAnel.position.copy(tmp.c);
      pincaPonto.position.copy(tmp.c);
      pincaAnel.scale.setScalar(S * 0.09 * (2.6 - pulsoPinca * 0.9 + Math.sin(t * 9) * 0.15));
      pincaAnel.material.color.copy(cor);
      pincaAnel.material.opacity = 0.9 * pulsoPinca;
      pincaPonto.scale.setScalar(S * 0.5 * pulsoPinca);
    },
  };
}

// ---------------- ondas na superfície tocada (no espaço do mundo) ----------------
export function criarOndas(quantas = 10) {
  const grupo = new THREE.Group();
  const geo = new THREE.RingGeometry(0.82, 1, 64);
  const ondas = Array.from({ length: quantas }, () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: '#4de8f0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    m.visible = false;
    m.renderOrder = 6;
    grupo.add(m);
    return { m, vida: 0, tam: 1 };
  });
  const z = new THREE.Vector3(0, 0, 1);
  let proxima = 0;
  return {
    grupo,
    emitir(ponto, normal, cor = '#4de8f0', tamanho = 0.3) {
      const o = ondas[proxima];
      proxima = (proxima + 1) % ondas.length;
      o.m.position.copy(ponto).addScaledVector(normal, 0.004);
      o.m.quaternion.setFromUnitVectors(z, normal);
      o.m.material.color.set(cor);
      o.m.visible = true;
      o.vida = 1;
      o.tam = tamanho;
    },
    atualizar(dt) {
      for (const o of ondas) {
        if (o.vida <= 0) continue;
        o.vida -= dt * 1.4;
        const t = 1 - Math.max(0, o.vida);
        o.m.scale.setScalar(o.tam * (0.15 + t * 1.1));
        o.m.material.opacity = Math.max(0, o.vida) * 0.9;
        if (o.vida <= 0) o.m.visible = false;
      }
    },
  };
}
