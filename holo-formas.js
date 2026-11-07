/*
 * holo-formas.js — as projeções novas do laboratório (holo.js), feitas de partículas:
 * Lua, Sistema Solar, Galáxia, Buraco Negro, Turbina, Drone, Molécula, Coração e Terreno.
 *
 * Cada uma recebe o kit do laboratório ({ gerador, q, total, projecao, nuvem }) e devolve o
 * mesmo formato das projeções de holo.js: posições e cores das partículas, linhas extras,
 * rótulos presos a pontos da projeção, telemetria e animação. As versões "foto real"
 * ficam em holo-real.js.
 */
import * as THREE from 'three';
import { COR, materialLinha, circulo, brilho, texturaBrilho } from './cena.js';

const VERMELHO = new THREE.Color('#ff5a4c');
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;

// ---------------- coisas que a foto real também usa ----------------
// fase da Lua de hoje, a partir de uma lua nova conhecida e do mês sinódico
export function faseDaLua(d = new Date()) {
  const sinodico = 29.530588853;
  const dias = (d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5;
  const fase = (((dias % sinodico) + sinodico) % sinodico) / sinodico;
  const nomes = ['NOVA', 'CRESCENTE', 'QUARTO CRESCENTE', 'GIBOSA CRESCENTE', 'CHEIA', 'GIBOSA MINGUANTE', 'QUARTO MINGUANTE', 'MINGUANTE'];
  return { fase, iluminacao: (1 - Math.cos(fase * Math.PI * 2)) / 2, nome: nomes[Math.round(fase * 8) % 8], idade: fase * sinodico };
}

// de onde vem a luz do sol para quem olha a Lua daqui de baixo (hemisfério sul: o crescente acende à esquerda);
// perto da lua nova a luz fica um pouco de lado, para o crescente fininho continuar aparecendo
export function solDaFase(fase) {
  const perto = Math.min(fase, 1 - fase);
  const ajustada = perto < 0.1 ? (fase < 0.5 ? 0.1 : 0.9) : fase;
  const a = ajustada * Math.PI * 2;
  return new THREE.Vector3(-Math.sin(a), 0.12, -Math.cos(a)).normalize();
}

export const PLANETAS = [
  // nome, órbita, raio, cor, voltas por segundo (só para a animação)
  ['MERCÚRIO', 1.05, 0.055, '#b9a993', 0.42],
  ['VÊNUS', 1.38, 0.09, '#e8c27a', 0.31],
  ['TERRA', 1.72, 0.095, '#4f9de8', 0.26],
  ['MARTE', 2.05, 0.07, '#d0603a', 0.21],
  ['JÚPITER', 2.72, 0.24, '#d9b38c', 0.11],
  ['SATURNO', 3.3, 0.2, '#e6d09a', 0.085],
  ['URANO', 3.78, 0.14, '#9fe3e8', 0.06],
  ['NETUNO', 4.18, 0.135, '#4f6fe8', 0.048],
];

// relevo do terreno: ruído suave em várias escalas, igual nos dois visuais
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function ruidoValor(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const TERRENO = { lado: 6, base: -1.65, agua: 0.42, altura: 2.1 };
export function alturaTerreno(x, z) {
  let h = 0;
  let amp = 0.55;
  let freq = 0.42;
  for (let i = 0; i < 5; i++) {
    h += ruidoValor(x * freq + 17.3, z * freq + 4.1) * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  // uma serra no meio e as bordas mais baixas, como uma maquete
  const borda = Math.max(Math.abs(x), Math.abs(z)) / (TERRENO.lado / 2);
  const serra = Math.exp(-Math.pow((x * 0.55 + z * 0.35) - 0.3, 2) * 0.9) * 0.55;
  return Math.max(0, (h + serra - 0.25) * TERRENO.altura * (1 - Math.pow(borda, 4)));
}

// cafeína (C8H10N4O2): anel de seis e anel de cinco fundidos, dois oxigênios, três metilas
export function moleculaCafeina() {
  const atomos = [];
  const ligacoes = [];
  const add = (el, x, y, z = 0) => atomos.push({ el, p: new THREE.Vector3(x, y, z) }) - 1;
  const ligar = (a, b, dupla = false) => ligacoes.push([a, b, dupla]);
  const hex = (graus) => [Math.cos(THREE.MathUtils.degToRad(graus)) * 1.4, Math.sin(THREE.MathUtils.degToRad(graus)) * 1.4];
  const N1 = add('N', ...hex(150));
  const C2 = add('C', ...hex(210));
  const N3 = add('N', ...hex(270));
  const C4 = add('C', ...hex(330));
  const C5 = add('C', ...hex(30));
  const C6 = add('C', ...hex(90));
  const centro5 = new THREE.Vector2(1.212 + 0.9635, 0);
  const pent = (graus) => [centro5.x + Math.cos(THREE.MathUtils.degToRad(graus)) * 1.191, Math.sin(THREE.MathUtils.degToRad(graus)) * 1.191];
  const N7 = add('N', ...pent(72));
  const C8 = add('C', ...pent(0));
  const N9 = add('N', ...pent(-72));
  [[N1, C2], [C2, N3], [N3, C4], [C5, C6], [C6, N1], [C5, N7], [N7, C8], [N9, C4]].forEach(([a, b]) => ligar(a, b));
  ligar(C4, C5, true);
  ligar(C8, N9, true);
  const fora = (i, origem, dist) => {
    const p = atomos[i].p;
    const d = new THREE.Vector3(p.x - origem.x, p.y - origem.y, 0).normalize();
    return p.clone().addScaledVector(d, dist);
  };
  const zero = new THREE.Vector2(0, 0);
  const O2 = add('O', ...fora(C2, zero, 1.23).toArray());
  const O6 = add('O', ...fora(C6, zero, 1.23).toArray());
  ligar(C2, O2, true);
  ligar(C6, O6, true);
  const H8 = add('H', ...fora(C8, centro5, 1.08).toArray());
  ligar(C8, H8);
  const metila = (n, origem) => {
    const c = add('C', ...fora(n, origem, 1.47).toArray());
    ligar(n, c);
    const d = atomos[c].p.clone().sub(atomos[n].p).normalize();
    const p = new THREE.Vector3(-d.y, d.x, 0);
    const z = new THREE.Vector3(0, 0, 1);
    for (let k = 0; k < 3; k++) {
      const f = (k / 3) * Math.PI * 2 + 0.4;
      const dir = d.clone().multiplyScalar(0.334).addScaledVector(p, Math.cos(f) * 0.943).addScaledVector(z, Math.sin(f) * 0.943);
      ligar(c, add('H', ...atomos[c].p.clone().addScaledVector(dir, 1.09).toArray()));
    }
  };
  metila(N1, zero);
  metila(N3, zero);
  metila(N7, centro5);
  // centraliza e põe na escala do laboratório
  const centro = atomos.reduce((s, a) => s.add(a.p), new THREE.Vector3()).divideScalar(atomos.length);
  for (const a of atomos) a.p.sub(centro).multiplyScalar(0.6);
  return { atomos, ligacoes };
}
export const RAIO_ATOMO = { C: 0.22, N: 0.21, O: 0.21, H: 0.13 };

// coração: superfície implícita clássica, com o eixo z da fórmula virando o y da cena
export function campoCoracao(x, y, z) {
  const X = x / 1.25;
  const Y = z / 1.25;
  const Z = (y + 0.25) / 1.25;
  const a = X * X + 2.25 * Y * Y + Z * Z - 1;
  return a * a * a - X * X * Z * Z * Z - 0.1125 * Y * Y * Z * Z * Z;
}
// curvas dos vasos que saem do topo do coração
export function vasosCoracao() {
  const curva = (pts) => new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return {
    aorta: curva([[0.1, 0.75, 0.05], [0.15, 1.45, 0.1], [0.0, 1.85, 0.05], [-0.42, 1.92, -0.05], [-0.72, 1.55, -0.15], [-0.78, 0.95, -0.3]]),
    pulmonar: curva([[-0.15, 0.75, 0.32], [-0.25, 1.3, 0.42], [-0.6, 1.5, 0.3], [-1.05, 1.4, 0.1]]),
    cava: curva([[0.72, 0.55, -0.12], [0.78, 1.15, -0.18], [0.82, 1.8, -0.2]]),
    coronariaE: curva([[-0.1, 0.62, 0.62], [-0.45, 0.25, 0.88], [-0.55, -0.35, 0.72], [-0.3, -0.95, 0.38]]),
    coronariaD: curva([[0.25, 0.6, 0.6], [0.7, 0.2, 0.62], [0.82, -0.3, 0.32], [0.55, -0.8, 0.1]]),
  };
}
export function batimento(t) {
  const f = (t * 1.2) % 1;   // 72 batimentos por minuto
  return Math.exp(-Math.pow((f - 0.06) / 0.045, 2)) + 0.55 * Math.exp(-Math.pow((f - 0.24) / 0.05, 2));
}

// ---------------- auxiliares de partículas ----------------
function esfera(g, quantos, centro, raio, cor, brilhoBase = 0.8, variacao = 0.35) {
  const ouro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < quantos; i++) {
    const y = 1 - (i / Math.max(1, quantos - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const f = i * ouro;
    g.add(centro.x + Math.cos(f) * r * raio, centro.y + y * raio, centro.z + Math.sin(f) * r * raio, cor, brilhoBase + Math.random() * variacao);
  }
}

function segmento(g, quantos, a, b, raio, cor, b0 = 0.7) {
  const v = new THREE.Vector3();
  for (let i = 0; i < quantos; i++) {
    v.copy(a).lerp(b, Math.random()).add(new THREE.Vector3().randomDirection().multiplyScalar(raio * Math.sqrt(Math.random())));
    g.add(v.x, v.y, v.z, cor, b0 + Math.random() * 0.3);
  }
}

function anelLinhas(raio, eixo, cor, opacidade) {
  const c = circulo(raio, 160, cor, opacidade);
  if (eixo === 'x') c.rotation.z = Math.PI / 2;
  if (eixo === 'z') c.rotation.x = Math.PI / 2;
  return c;
}

function pontosSoltos(posicoes, cor, tamanho, opacidade = 0.9) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posicoes, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: cor, size: tamanho, map: texturaBrilho(), transparent: true, opacity: opacidade, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
}

// ---------------- Lua ----------------
export function formaLua({ gerador, q, total, projecao }) {
  const R = 1.9;
  const g = gerador();
  const crateras = Array.from({ length: 90 }, () => ({ c: new THREE.Vector3().randomDirection(), r: 0.035 + Math.pow(Math.random(), 3) * 0.28 }));
  // mares: as manchas escuras do lado que fica virado para a Terra (+z)
  const mares = [[-0.35, 0.35, 0.86, 0.36], [0.25, 0.42, 0.87, 0.27], [0.45, 0.05, 0.89, 0.24], [-0.55, -0.15, 0.82, 0.3], [0.05, -0.35, 0.93, 0.22], [-0.2, 0.05, 0.98, 0.2]]
    .map(([x, y, z, r]) => ({ c: new THREE.Vector3(x, y, z).normalize(), r }));
  const tranquilidade = mares[1].c.clone().multiplyScalar(R);
  const ouro = Math.PI * (3 - Math.sqrt(5));
  const n = q(52000);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    p.set(Math.cos(i * ouro) * rr, y, Math.sin(i * ouro) * rr);
    let b = 0.85;
    let raio = R;
    for (const m of mares) if (p.angleTo(m.c) < m.r) b *= 0.5;
    for (const c of crateras) {
      const d = p.angleTo(c.c);
      if (d < c.r) {
        b *= d > c.r * 0.78 ? 1.35 : 0.72;
        raio -= (1 - d / c.r) * c.r * 0.12;
      }
    }
    if (Math.random() > 0.15 + b * 0.75) continue;
    g.add(p.x * raio, p.y * raio, p.z * raio, Math.random() < 0.75 ? COR.branco : COR.ciano, b * (0.75 + Math.random() * 0.4));
  }
  while (g.quantos() < total) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(R * (1.04 + Math.random() * 0.06));
    g.add(v.x, v.y, v.z, COR.ciano, 0.12 + Math.random() * 0.1);
  }
  const linhas = new THREE.Group();
  for (const lat of [-0.5, 0, 0.5]) {
    const c = circulo(R * Math.cos(lat) * 1.012, 160, COR.ciano, 0.08);
    c.position.y = R * Math.sin(lat) * 1.012;
    linhas.add(c);
  }
  const fase = faseDaLua();
  const solVista = solDaFase(fase.fase);
  const q2 = new THREE.Quaternion();
  const sol = new THREE.Vector3();
  return {
    chave: 'lua', codigo: 'LUA-07', titulo: 'LUA', solAtivo: true,
    // o lado aceso segue a fase de hoje para quem olha, mesmo com a projeção girando
    sol: () => sol.copy(solVista).applyQuaternion(q2.copy(projecao.quaternion).invert()),
    descricao: `Crateras, mares e a fase de hoje: ${fase.nome.toLowerCase()}, ${Math.round(fase.iluminacao * 100)}% iluminada.`,
    dados: [['Partículas', fmt(total)], ['Fase', fase.nome], ['Iluminação', `${Math.round(fase.iluminacao * 100)}%`], ['Distância', '384.400 km']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    opcoesReal: { fase },
    rotulos: [
      { titulo: 'MAR DA TRANQUILIDADE', valor: 'APOLLO 11 · 1969', ponto: () => tranquilidade, frente: true },
      { titulo: `FASE · ${fase.nome}`, valor: `${fase.idade.toFixed(1).replace('.', ',')} DIAS`, ponto: () => new THREE.Vector3(0, R * 1.02, 0), frente: false },
    ],
    animar() {},
  };
}

// ---------------- Sistema Solar ----------------
export function formaSistemaSolar({ gerador, q, total }) {
  const g = gerador();
  const centro = new THREE.Vector3();
  esfera(g, q(7000), centro, 0.6, COR.ouro, 0.9);
  for (let i = 0; i < q(4200); i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(0.6 * Math.cbrt(Math.random()));
    g.add(v.x, v.y, v.z, COR.laranja.clone().lerp(COR.branco, Math.random() * 0.6), 1.1);
  }
  for (let i = 0; i < q(2400); i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(0.62 + Math.pow(Math.random(), 2) * 0.55);
    g.add(v.x, v.y, v.z, COR.laranja, 0.25);
  }
  // órbitas e cinturão de asteroides
  for (const [, orbita] of PLANETAS) {
    for (let i = 0; i < q(1300); i++) {
      const a = Math.random() * Math.PI * 2;
      g.add(Math.cos(a) * orbita, (Math.random() - 0.5) * 0.012, Math.sin(a) * orbita, COR.ciano, 0.22);
    }
  }
  for (let i = 0; i < q(3200); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.32 + gauss() * 0.1;
    g.add(Math.cos(a) * r, gauss() * 0.04, Math.sin(a) * r, COR.branco, 0.2 + Math.random() * 0.2);
  }
  while (g.quantos() < total) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.8 + Math.pow(Math.random(), 0.6) * 4;
    g.add(Math.cos(a) * r, gauss() * 0.05, Math.sin(a) * r, COR.azul, 0.08);
  }

  // os planetas ficam fora da nuvem para poderem girar em volta do Sol
  const linhas = new THREE.Group();
  const planetas = PLANETAS.map(([nome, orbita, raio, cor, voltas], i) => {
    const pivo = new THREE.Group();
    pivo.rotation.y = i * 2.1 + 0.6;
    const pos = [];
    const qtd = Math.round(Math.max(260, raio * raio * 26000));
    const ouro = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < qtd; k++) {
      const y = 1 - (k / (qtd - 1)) * 2;
      const rr = Math.sqrt(1 - y * y);
      pos.push(orbita + Math.cos(k * ouro) * rr * raio, y * raio, Math.sin(k * ouro) * rr * raio);
    }
    if (nome === 'SATURNO') {
      for (let k = 0; k < 900; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = raio * (1.4 + Math.random() * 0.8);
        pos.push(orbita + Math.cos(a) * r, Math.sin(a) * r * 0.35, Math.sin(a) * r * 0.94);
      }
    }
    const c = new THREE.Color(cor).lerp(COR.ciano, 0.25);
    pivo.add(pontosSoltos(pos, c, 0.05));
    const halo = brilho(c, raio * 3.2);
    halo.position.x = orbita;
    halo.material.opacity = 0.35;
    pivo.add(halo);
    linhas.add(pivo);
    return { nome, orbita, pivo, voltas };
  });
  linhas.add(brilho(COR.laranja, 3.2));
  for (const [, orbita] of PLANETAS) linhas.add(circulo(orbita, 200, COR.ciano, 0.1));
  const ondeEsta = (p) => new THREE.Vector3(Math.cos(p.pivo.rotation.y) * p.orbita, 0.12, -Math.sin(p.pivo.rotation.y) * p.orbita);
  return {
    chave: 'solar', codigo: 'SOL-08', titulo: 'SISTEMA SOLAR',
    descricao: 'O Sol e os oito planetas girando nas órbitas, com o cinturão de asteroides entre Marte e Júpiter.',
    dados: [['Partículas', fmt(total)], ['Planetas', '8'], ['Luas', '290+'], ['Idade', '4,6 bilhões de anos']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    rotulos: [
      { titulo: 'SOL', valor: '5.500 °C NA SUPERFÍCIE', ponto: () => new THREE.Vector3(0, 0.62, 0), frente: false },
      { titulo: 'TERRA', valor: '1 UA · 150 MI KM', ponto: () => ondeEsta(planetas[2]), frente: false },
      { titulo: 'JÚPITER', valor: '95 LUAS', ponto: () => ondeEsta(planetas[4]), frente: false },
    ],
    animar(t) {
      for (const [i, p] of planetas.entries()) p.pivo.rotation.y = i * 2.1 + 0.6 + t * p.voltas * 0.6;
    },
  };
}

// ---------------- Galáxia ----------------
export function formaGalaxia({ gerador, q, total }) {
  const g = gerador();
  // bojo central, achatado e quente
  for (let i = 0; i < q(6500); i++) {
    const v = new THREE.Vector3(gauss(), gauss() * 0.45, gauss()).multiplyScalar(0.55);
    g.add(v.x, v.y, v.z, COR.ouro.clone().lerp(COR.branco, Math.random() * 0.5), 0.85 + Math.random() * 0.3);
  }
  // barra e quatro braços em espiral logarítmica
  const bracos = 4;
  for (let i = 0; i < q(14000); i++) {
    const braco = i % bracos;
    const t = Math.pow(Math.random(), 0.8);
    const r = 0.55 + t * 3.4;
    const a = (braco / bracos) * Math.PI * 2 + Math.log(r / 0.55) / 0.32;
    const espalha = 0.08 + r * 0.09;
    const x = Math.cos(a) * r + gauss() * espalha;
    const z = Math.sin(a) * r + gauss() * espalha;
    const cor = Math.random() < 0.06 ? COR.violeta : COR.ciano.clone().lerp(COR.azul, t);
    g.add(x, gauss() * 0.07 * (1 - t * 0.6), z, cor, 0.6 + (1 - t) * 0.4);
  }
  for (let i = 0; i < q(1800); i++) {
    const x = (Math.random() - 0.5) * 1.6;
    g.add(x, gauss() * 0.05, gauss() * 0.12, COR.ouro, 0.7);
  }
  // disco difuso e halo de estrelas velhas
  for (let i = 0; i < q(2600); i++) {
    const r = -Math.log(1 - Math.random() * 0.98) * 1.1;
    const a = Math.random() * Math.PI * 2;
    g.add(Math.cos(a) * r, gauss() * 0.05, Math.sin(a) * r, COR.azul, 0.25);
  }
  while (g.quantos() < total) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1 + Math.random() * 3.6);
    v.y *= 0.55;
    g.add(v.x, v.y, v.z, COR.branco, 0.06 + Math.random() * 0.06);
  }
  const linhas = new THREE.Group();
  linhas.add(brilho(COR.ouro, 2.6));
  linhas.add(circulo(3.9, 200, COR.ciano, 0.08));
  // "você está aqui", no braço de Órion
  const aqui = new THREE.Vector3(Math.cos(2.3) * 2.6, 0.05, Math.sin(2.3) * 2.6);
  const marca = circulo(0.12, 48, COR.laranja, 0.9);
  marca.position.copy(aqui);
  const ponto = brilho(COR.laranja, 0.25);
  ponto.position.copy(aqui);
  linhas.add(marca, ponto);
  return {
    chave: 'galaxia', codigo: 'GAL-09', titulo: 'VIA LÁCTEA',
    descricao: 'Galáxia espiral barrada com quatro braços, bojo central e o nosso Sol no braço de Órion.',
    dados: [['Partículas', fmt(total)], ['Estrelas', '~200 bilhões'], ['Diâmetro', '100 mil anos-luz'], ['Braços', '4']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    rotulos: [
      { titulo: 'VOCÊ ESTÁ AQUI', valor: 'BRAÇO DE ÓRION · SOL', ponto: () => aqui, frente: false },
      { titulo: 'SAGITÁRIO A*', valor: '4 MILHÕES DE SÓIS', ponto: () => new THREE.Vector3(0, 0.25, 0), frente: false },
    ],
    animar(t) {
      marca.scale.setScalar(1 + ((t * 0.8) % 1) * 1.8);
      marca.material.userData.pulso = 1 - ((t * 0.8) % 1);
    },
  };
}

// ---------------- Buraco Negro ----------------
export function formaBuracoNegro({ gerador, q, total }) {
  const g = gerador();
  const quente = (t) => COR.branco.clone().lerp(COR.ouro, Math.min(1, t * 2)).lerp(COR.laranja, Math.max(0, t * 1.4 - 0.4));
  // disco de acreção: mais denso e mais quente perto do horizonte
  for (let i = 0; i < q(17000); i++) {
    const t = Math.pow(Math.random(), 1.7);
    const r = 1.0 + t * 2.6;
    const a = Math.random() * Math.PI * 2;
    g.add(Math.cos(a) * r, gauss() * 0.03 * (1 + t * 2), Math.sin(a) * r, quente(t), 1.15 - t * 0.6);
  }
  // a parte de trás do disco, entortada pela gravidade, aparece como um anel em pé
  for (let i = 0; i < q(4200); i++) {
    const t = Math.pow(Math.random(), 1.5);
    const r = 0.92 + t * 0.75;
    const a = Math.random() * Math.PI * 2;
    g.add(Math.cos(a) * r, Math.sin(a) * r, gauss() * 0.03 - 0.05, quente(t * 0.7), 0.85 - t * 0.4);
  }
  // esfera de fótons, bem fina
  esfera(g, q(2600), new THREE.Vector3(), 0.86, COR.branco, 0.55, 0.3);
  // jatos nos polos
  for (let i = 0; i < q(2400); i++) {
    const h = Math.pow(Math.random(), 0.7) * 3.2 * (i % 2 ? 1 : -1);
    const r = 0.04 + Math.abs(h) * 0.07;
    const a = Math.random() * Math.PI * 2;
    g.add(Math.cos(a) * r * Math.random(), h, Math.sin(a) * r * Math.random(), COR.violeta.clone().lerp(COR.ciano, Math.random()), 0.7 - Math.abs(h) * 0.15);
  }
  while (g.quantos() < total) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(3.8 + Math.random() * 2.5);
    g.add(v.x, v.y, v.z, COR.branco, 0.07);
  }
  const linhas = new THREE.Group();
  const giro = new THREE.Group();
  for (const r of [1.0, 1.9, 3.6]) giro.add(circulo(r, 200, COR.laranja, r === 1 ? 0.5 : 0.14));
  const tracos = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    tracos.push(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05, Math.cos(a + 0.18) * 1.85, 0, Math.sin(a + 0.18) * 1.85);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tracos, 3));
  giro.add(new THREE.LineSegments(geo, materialLinha(COR.ouro, 0.18)));
  linhas.add(giro);
  return {
    chave: 'buraco', codigo: 'BHL-10', titulo: 'BURACO NEGRO',
    descricao: 'Horizonte de eventos, disco de acreção girando a quase a velocidade da luz e jatos nos polos.',
    dados: [['Partículas', fmt(total)], ['Massa', '6,5 bilhões de sóis'], ['Disco', '1 bilhão °C'], ['Luz que escapa', 'NENHUMA']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    rotulos: [
      { titulo: 'HORIZONTE DE EVENTOS', valor: 'PONTO SEM VOLTA', ponto: () => new THREE.Vector3(0, 0.88, 0), frente: false },
      { titulo: 'DISCO DE ACREÇÃO', valor: '0,3 × VELOCIDADE DA LUZ', ponto: () => new THREE.Vector3(2.3, 0, 0.6), frente: false },
    ],
    animar(t) {
      giro.rotation.y = t * 0.9;
    },
  };
}

// ---------------- Turbina (motor a jato) ----------------
export function perfilNacele() {
  // raio da carenagem ao longo do eixo do motor (x)
  return [[-2.25, 1.18], [-2.1, 1.28], [-1.6, 1.32], [-0.6, 1.3], [0.6, 1.2], [1.5, 1.02], [1.95, 0.92]];
}
export function formaTurbina({ gerador, q, total }) {
  const g = gerador();
  const perfil = perfilNacele();
  const raioEm = (x) => {
    for (let i = 0; i < perfil.length - 1; i++) {
      const [x1, r1] = perfil[i];
      const [x2, r2] = perfil[i + 1];
      if (x <= x2) return THREE.MathUtils.lerp(r1, r2, (x - x1) / (x2 - x1));
    }
    return perfil[perfil.length - 1][1];
  };
  // carenagem: casca de partículas, mais rala, para ver o miolo
  for (let i = 0; i < q(9000); i++) {
    const x = -2.25 + Math.random() * 4.2;
    const a = Math.random() * Math.PI * 2;
    const r = raioEm(x);
    g.add(x, Math.cos(a) * r, Math.sin(a) * r, COR.ciano.clone().lerp(COR.azul, 0.4), 0.45);
  }
  // fan com 22 pás torcidas
  for (let i = 0; i < q(7600); i++) {
    const pa = i % 22;
    const r = 0.28 + Math.random() * 0.92;
    const torcao = 0.75 - r * 0.45;
    const largura = (Math.random() - 0.5) * 0.24;
    const a = (pa / 22) * Math.PI * 2 + largura * 0.9 / r;
    g.add(-1.85 + largura * torcao, Math.cos(a) * r, Math.sin(a) * r, COR.branco, 0.8);
  }
  // cone do fan (spinner)
  for (let i = 0; i < q(1500); i++) {
    const t = Math.random();
    const r = Math.sqrt(t) * 0.3;
    const a = Math.random() * Math.PI * 2;
    g.add(-2.3 + t * 0.45, Math.cos(a) * r, Math.sin(a) * r, COR.branco, 0.9);
  }
  // compressor: discos de palhetas cada vez menores
  for (let d = 0; d < 7; d++) {
    const x = -1.35 + d * 0.2;
    const rMax = 0.82 - d * 0.04;
    for (let i = 0; i < q(520); i++) {
      const pa = i % 34;
      const r = 0.32 + Math.random() * (rMax - 0.32);
      const a = (pa / 34) * Math.PI * 2 + d * 0.3;
      g.add(x + (Math.random() - 0.5) * 0.05, Math.cos(a) * r, Math.sin(a) * r, COR.ciano, 0.65);
    }
  }
  // eixo, câmara de combustão e turbina
  for (let i = 0; i < q(1200); i++) {
    const a = Math.random() * Math.PI * 2;
    g.add(-1.8 + Math.random() * 3.4, Math.cos(a) * 0.13, Math.sin(a) * 0.13, COR.azul, 0.6);
  }
  for (let i = 0; i < q(2600); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.38 + Math.random() * 0.3;
    g.add(0.05 + Math.random() * 0.55, Math.cos(a) * r, Math.sin(a) * r, COR.laranja, 0.85);
  }
  for (let d = 0; d < 4; d++) {
    for (let i = 0; i < q(420); i++) {
      const pa = i % 40;
      const r = 0.3 + Math.random() * 0.45;
      const a = (pa / 40) * Math.PI * 2;
      g.add(0.85 + d * 0.16, Math.cos(a) * r, Math.sin(a) * r, COR.laranja.clone().lerp(COR.ouro, 0.5), 0.7);
    }
  }
  // cone de escape e jato quente saindo
  for (let i = 0; i < q(1600); i++) {
    const t = Math.random();
    const r = THREE.MathUtils.lerp(0.42, 0.08, t);
    const a = Math.random() * Math.PI * 2;
    g.add(1.55 + t * 0.75, Math.cos(a) * r, Math.sin(a) * r, COR.ouro, 0.7);
  }
  while (g.quantos() < total) {
    const t = Math.random();
    const r = Math.sqrt(Math.random()) * (0.75 + t * 0.6);
    const a = Math.random() * Math.PI * 2;
    g.add(2.0 + t * 1.6, Math.cos(a) * r, Math.sin(a) * r, t < 0.35 ? COR.laranja : COR.ciano, 0.32 * (1 - t));
  }
  const linhas = new THREE.Group();
  for (const [x, r] of perfil.filter((_, i) => i % 2 === 0)) {
    const c = anelLinhas(r * 1.01, 'x', COR.ciano, 0.32);
    c.position.x = x;
    linhas.add(c);
  }
  // pás do fan desenhadas em linha, girando
  const fan = new THREE.Group();
  fan.position.x = -1.85;
  const pas = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    pas.push(0, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0, Math.cos(a + 0.22) * 1.18, Math.sin(a + 0.22) * 1.18);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pas, 3));
  fan.add(new THREE.LineSegments(geo, materialLinha(COR.branco, 0.55)));
  linhas.add(fan);
  const chama = brilho(COR.laranja, 1.4);
  chama.position.x = 2.35;
  linhas.add(chama);
  return {
    chave: 'turbina', codigo: 'ENG-11', titulo: 'TURBINA',
    descricao: 'Motor a jato turbofan em corte: fan de 22 pás, compressor, câmara de combustão, turbina e escape.',
    dados: [['Partículas', fmt(total)], ['Empuxo', '45.000 lbf'], ['Rotação N1', '4.800 RPM'], ['By-pass', '10:1']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    rotulos: [
      { titulo: 'FAN', valor: '22 PÁS DE TITÂNIO', ponto: () => new THREE.Vector3(-1.85, 1.0, 0.2), frente: false },
      { titulo: 'CÂMARA DE COMBUSTÃO', valor: () => `${fmt(1680 + Math.sin(performance.now() / 700) * 25)} °C`, ponto: () => new THREE.Vector3(0.35, 0.55, 0.2), frente: false },
    ],
    animar(t) {
      fan.rotation.x = t * 9;
      chama.scale.setScalar(1.3 + Math.sin(t * 23) * 0.08 + Math.sin(t * 37) * 0.06);
    },
  };
}

// ---------------- Drone ----------------
export const DRONE = {
  motores: [0, 1, 2, 3].map((i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    return new THREE.Vector3(Math.cos(a) * 1.55, 0.06, Math.sin(a) * 1.55);
  }),
  helice: 0.62,
};
export function formaDrone({ gerador, q, total }) {
  const g = gerador();
  // corpo: elipsoide achatado
  const ouro = Math.PI * (3 - Math.sqrt(5));
  const nCorpo = q(6500);
  for (let i = 0; i < nCorpo; i++) {
    const y = 1 - (i / (nCorpo - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    g.add(Math.cos(i * ouro) * rr * 0.55, y * 0.17, Math.sin(i * ouro) * rr * 0.8, COR.ciano.clone().lerp(COR.branco, 0.3), 0.8);
  }
  for (const m of DRONE.motores) {
    segmento(g, q(1700), new THREE.Vector3(m.x * 0.25, 0, m.z * 0.25), m, 0.05, COR.ciano, 0.6);
    // motor
    for (let i = 0; i < q(700); i++) {
      const a = Math.random() * Math.PI * 2;
      g.add(m.x + Math.cos(a) * 0.13, m.y - 0.06 + Math.random() * 0.16, m.z + Math.sin(a) * 0.13, COR.branco, 0.85);
    }
    // hélice girando: um disco borrado
    for (let i = 0; i < q(1900); i++) {
      const r = Math.sqrt(Math.random()) * DRONE.helice;
      const a = Math.random() * Math.PI * 2;
      g.add(m.x + Math.cos(a) * r, m.y + 0.13, m.z + Math.sin(a) * r, COR.ciano, 0.18 + (r / DRONE.helice) * 0.25);
    }
    // pernas
    segmento(g, q(320), new THREE.Vector3(m.x * 0.45, -0.1, m.z * 0.45), new THREE.Vector3(m.x * 0.5, -0.6, m.z * 0.5), 0.02, COR.azul, 0.5);
  }
  // câmera no gimbal, na frente e embaixo
  esfera(g, q(1200), new THREE.Vector3(0, -0.28, 0.62), 0.13, COR.branco, 0.85);
  esfera(g, q(260), new THREE.Vector3(0, -0.28, 0.75), 0.05, COR.laranja, 1);
  while (g.quantos() < total) {
    const r = Math.sqrt(Math.random()) * 2.4;
    const a = Math.random() * Math.PI * 2;
    // ar empurrado pelas hélices, descendo
    g.add(Math.cos(a) * r, -0.3 - Math.random() * 1.6, Math.sin(a) * r, COR.azul, 0.08);
  }
  const linhas = new THREE.Group();
  const rotores = DRONE.motores.map((m, i) => {
    const r = new THREE.Group();
    r.position.set(m.x, m.y + 0.14, m.z);
    const pa = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-DRONE.helice, 0, 0), new THREE.Vector3(DRONE.helice, 0, 0)]), materialLinha(COR.branco, 0.7));
    r.add(pa, circulo(DRONE.helice, 64, COR.ciano, 0.25));
    linhas.add(r);
    const led = brilho(i < 2 ? COR.verde : COR.laranja, 0.28);
    led.position.set(m.x, m.y - 0.1, m.z);
    linhas.add(led);
    return { r, sentido: i % 2 ? 1 : -1 };
  });
  return {
    chave: 'drone', codigo: 'DRN-12', titulo: 'DRONE',
    descricao: 'Quadricóptero com quatro rotores, câmera estabilizada em gimbal e luzes de navegação.',
    dados: [['Partículas', fmt(total)], ['Rotores', '4 · 7.200 RPM'], ['Autonomia', '38 min'], ['Alcance', '15 km']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    rotulos: [
      { titulo: 'GIMBAL', valor: 'CÂMERA 4K · 3 EIXOS', ponto: () => new THREE.Vector3(0, -0.3, 0.72), frente: false },
      { titulo: 'ROTOR 1', valor: () => `${fmt(7180 + Math.sin(performance.now() / 300) * 60)} RPM`, ponto: () => DRONE.motores[0].clone().setY(0.2), frente: false },
    ],
    animar(t) {
      for (const r of rotores) r.r.rotation.y = t * 40 * r.sentido;
    },
  };
}

// ---------------- Molécula de cafeína ----------------
const COR_ELEMENTO = { C: COR.ciano, N: COR.azul, O: COR.laranja, H: COR.branco };
export function formaMolecula({ gerador, q, total }) {
  const g = gerador();
  const { atomos, ligacoes } = moleculaCafeina();
  for (const a of atomos) esfera(g, q(a.el === 'H' ? 420 : 1100), a.p, RAIO_ATOMO[a.el], COR_ELEMENTO[a.el], 0.85);
  const linhasLig = [];
  for (const [i, j, dupla] of ligacoes) {
    const a = atomos[i].p;
    const b = atomos[j].p;
    const desvio = dupla ? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(0.06) : null;
    for (const s of dupla ? [1, -1] : [0]) {
      const d = desvio ? desvio.clone().multiplyScalar(s) : new THREE.Vector3();
      segmento(g, q(380), a.clone().add(d), b.clone().add(d), 0.025, COR.branco, 0.55);
      linhasLig.push(...a.clone().add(d).toArray(), ...b.clone().add(d).toArray());
    }
  }
  // nuvem de elétrons em volta de cada átomo
  while (g.quantos() < total) {
    const a = atomos[Math.floor(Math.random() * atomos.length)];
    const v = new THREE.Vector3().randomDirection().multiplyScalar(RAIO_ATOMO[a.el] * (1.3 + Math.random() * 1.6)).add(a.p);
    g.add(v.x, v.y, v.z, COR_ELEMENTO[a.el], 0.1);
  }
  const linhas = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(linhasLig, 3));
  linhas.add(new THREE.LineSegments(geo, materialLinha(COR.branco, 0.3)));
  const oxigenio = atomos.find((a) => a.el === 'O').p;
  return {
    chave: 'molecula', codigo: 'MOL-13', titulo: 'MOLÉCULA',
    descricao: 'Cafeína (C₈H₁₀N₄O₂): anéis de carbono e nitrogênio, dois oxigênios e três grupos metila.',
    dados: [['Partículas', fmt(total)], ['Fórmula', 'C₈H₁₀N₄O₂'], ['Átomos', String(atomos.length)], ['Massa', '194,19 g/mol']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    rotulos: [
      { titulo: 'CAFEÍNA', valor: 'ESTIMULANTE NATURAL', ponto: () => new THREE.Vector3(0, 0.3, 0.3), frente: false },
      { titulo: 'OXIGÊNIO', valor: 'LIGAÇÃO DUPLA C=O', ponto: () => oxigenio, frente: false },
    ],
    animar() {},
  };
}

// ---------------- Coração ----------------
export function formaCoracao({ gerador, q, total, nuvem }) {
  const g = gerador();
  // acha a superfície em cada direção: do lado de fora para dentro até entrar no coração
  const v = new THREE.Vector3();
  const ponto = (dir) => {
    let fora = 2.4;
    let dentro = 0;
    if (campoCoracao(dir.x * 0.05, dir.y * 0.05 + 0.1, dir.z * 0.05) > 0) return null;
    for (let r = 2.4; r > 0.05; r -= 0.06) {
      if (campoCoracao(dir.x * r, dir.y * r + 0.1, dir.z * r) <= 0) {
        dentro = r;
        fora = r + 0.06;
        break;
      }
    }
    if (!dentro) return null;
    for (let k = 0; k < 10; k++) {
      const m = (fora + dentro) / 2;
      if (campoCoracao(dir.x * m, dir.y * m + 0.1, dir.z * m) <= 0) dentro = m;
      else fora = m;
    }
    return v.set(dir.x * dentro, dir.y * dentro + 0.1, dir.z * dentro);
  };
  const corDe = (y) => VERMELHO.clone().lerp(COR.laranja, THREE.MathUtils.clamp((y + 1) / 2.5, 0, 1));
  let tentativas = 0;
  while (g.quantos() < q(15000) && tentativas < q(40000)) {
    tentativas++;
    const p = ponto(new THREE.Vector3().randomDirection());
    if (p) g.add(p.x, p.y, p.z, corDe(p.y), 0.7 + Math.random() * 0.35);
  }
  // músculo por dentro, mais apagado
  for (let i = 0; i < q(3500); i++) {
    const p = ponto(new THREE.Vector3().randomDirection());
    if (p) {
      const s = 0.4 + Math.random() * 0.5;
      g.add(p.x * s, (p.y - 0.1) * s + 0.1, p.z * s, VERMELHO, 0.25);
    }
  }
  const vasos = vasosCoracao();
  const tubo = (curva, raio, cor, qtd) => {
    for (let i = 0; i < qtd; i++) {
      const t = Math.random();
      const c = curva.getPoint(t);
      const d = new THREE.Vector3().randomDirection().multiplyScalar(raio);
      g.add(c.x + d.x, c.y + d.y, c.z + d.z, cor, 0.75);
    }
  };
  tubo(vasos.aorta, 0.2, VERMELHO, q(3600));
  tubo(vasos.pulmonar, 0.17, COR.azul.clone().lerp(COR.violeta, 0.4), q(2400));
  tubo(vasos.cava, 0.16, COR.azul, q(1600));
  tubo(vasos.coronariaE, 0.035, COR.ouro, q(700));
  tubo(vasos.coronariaD, 0.035, COR.ouro, q(600));
  g.completar(0.05);

  const linhas = new THREE.Group();
  for (const nome of ['coronariaE', 'coronariaD']) {
    linhas.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vasos[nome].getPoints(40)), materialLinha(COR.ouro, 0.6)));
  }
  // eletrocardiograma ao lado do coração
  const ecgPts = 160;
  const ecgGeo = new THREE.BufferGeometry();
  ecgGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ecgPts * 3), 3));
  const ecg = new THREE.Line(ecgGeo, materialLinha(COR.verde, 0.85));
  ecg.position.set(1.75, -0.9, 0);
  linhas.add(ecg);
  const onda = (f) => {
    f = ((f % 1) + 1) % 1;
    return Math.exp(-Math.pow((f - 0.1) / 0.03, 2)) * 0.12 - Math.exp(-Math.pow((f - 0.17) / 0.01, 2)) * 0.1
      + Math.exp(-Math.pow((f - 0.2) / 0.012, 2)) * 0.75 - Math.exp(-Math.pow((f - 0.23) / 0.012, 2)) * 0.2
      + Math.exp(-Math.pow((f - 0.45) / 0.05, 2)) * 0.2;
  };
  let bpm = 72;
  return {
    chave: 'coracao', codigo: 'CRD-14', titulo: 'CORAÇÃO',
    descricao: 'Coração humano batendo a 72 por minuto, com aorta, artéria pulmonar, veia cava e coronárias.',
    dados: () => [['Partículas', fmt(total)], ['Frequência', `${bpm} BPM`], ['Débito', '5 L/min'], ['Câmaras', '4']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    rotulos: [
      { titulo: 'AORTA', valor: '120/80 mmHg', ponto: () => vasos.aorta.getPoint(0.45), frente: false },
      { titulo: 'VENTRÍCULO ESQUERDO', valor: () => `${bpm} BPM`, ponto: () => new THREE.Vector3(-0.55, -0.35, 0.65), frente: false },
    ],
    animar(t) {
      const b = batimento(t);
      const s = 1 + b * 0.045;
      nuvem.scale.setScalar(s);
      linhas.scale.setScalar(s);
      bpm = Math.round(72 + Math.sin(t * 0.13) * 3);
      const pos = ecgGeo.attributes.position;
      for (let i = 0; i < ecgPts; i++) {
        const x = i / (ecgPts - 1);
        pos.setXYZ(i, x * 1.6, onda(t * 1.2 - (1 - x) * 1.3), 0);
      }
      pos.needsUpdate = true;
    },
    aoSair() {
      nuvem.scale.setScalar(1);
      linhas.scale.setScalar(1);
    },
  };
}

// ---------------- Terreno ----------------
export function formaTerreno({ gerador, q, total }) {
  const g = gerador();
  const { lado, base, agua } = TERRENO;
  const corDe = (h) => {
    if (h < agua) return COR.azul;
    if (h < 0.9) return COR.verde.clone().lerp(COR.ciano, 0.5);
    if (h < 1.5) return COR.ciano;
    return COR.branco;
  };
  let pico = { h: 0, x: 0, z: 0 };
  for (let i = 0; i < q(17000); i++) {
    const x = (Math.random() - 0.5) * lado;
    const z = (Math.random() - 0.5) * lado;
    const h = alturaTerreno(x, z);
    if (h > pico.h) pico = { h, x, z };
    // curvas de nível a cada 0,2 ficam mais acesas
    const curva = Math.abs(h / 0.2 - Math.round(h / 0.2)) < 0.07 && h > agua;
    g.add(x, base + Math.max(h, agua * 0.98), z, curva ? COR.branco : corDe(h), curva ? 1 : 0.45);
  }
  // grade do chão e lâmina d'água
  for (let i = 0; i < q(2400); i++) {
    const x = (Math.random() - 0.5) * lado;
    const z = (Math.random() - 0.5) * lado;
    if (alturaTerreno(x, z) < agua) g.add(x, base + agua, z, COR.azul.clone().lerp(COR.ciano, 0.3), 0.55);
  }
  while (g.quantos() < total) {
    const x = (Math.random() - 0.5) * lado;
    const z = (Math.random() - 0.5) * lado;
    const naGrade = Math.abs(x / 0.5 - Math.round(x / 0.5)) < 0.05 || Math.abs(z / 0.5 - Math.round(z / 0.5)) < 0.05;
    if (naGrade) g.add(x, base, z, COR.azul, 0.25);
  }
  const linhas = new THREE.Group();
  const borda = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
    [[-3, -3], [3, -3], [3, 3], [-3, 3]].map(([x, z]) => new THREE.Vector3(x, base, z))), materialLinha(COR.ciano, 0.5));
  linhas.add(borda);
  const varre = new THREE.Mesh(new THREE.PlaneGeometry(0.03, lado), new THREE.MeshBasicMaterial({ color: COR.verde, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  varre.rotation.x = -Math.PI / 2;
  const varredura = new THREE.Group();
  varredura.add(varre);
  varredura.position.y = base + 0.02;
  linhas.add(varredura);
  const topo = new THREE.Vector3(pico.x, base + pico.h, pico.z);
  return {
    chave: 'terreno', codigo: 'TOP-15', titulo: 'TERRENO',
    descricao: 'Mapa topográfico em relevo: serra, vales, lago e curvas de nível, com varredura de altitude.',
    dados: [['Partículas', fmt(total)], ['Área', '36 km²'], ['Pico', `${fmt(pico.h * 1350)} m`], ['Curvas de nível', 'A CADA 270 m']],
    posicoes: g.posicoes, cores: g.cores, linhas,
    opcoesReal: {},
    rotulos: [
      { titulo: 'PICO', valor: `${fmt(pico.h * 1350)} M`, ponto: () => topo, frente: false },
      { titulo: 'LAGO', valor: 'NÍVEL 0', ponto: () => new THREE.Vector3(-2, base + agua, 2), frente: false },
    ],
    animar(t) {
      varredura.position.x = Math.sin(t * 0.6) * (lado / 2 - 0.1);
    },
  };
}
