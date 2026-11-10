/*
 * holo-cad-desenho.js — folha de desenho técnico A4 da oficina (holo-cad.js).
 *
 * Gera a folha em paisagem (150 dpi) como numa prancha de verdade: margem, vistas no
 * 1º diedro (frente; vista superior embaixo dela; lateral esquerda à direita), uma
 * perspectiva isométrica sombreada, linhas ocultas tracejadas, cotas gerais, notas de
 * furos e roscas e o carimbo com nome, material, massa, escala e data.
 *
 * As vistas são renderizadas num WebGL separado (criado e descartado aqui), com linhas
 * grossas (LineSegments2) e teste de profundidade para separar arestas visíveis e ocultas.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { arestasLimpas } from './holo-cad-nucleo.js';

const DPI = 150;
const MM = DPI / 25.4;          // pixels por milímetro da folha
const W = Math.round(297 * MM);
const H = Math.round(210 * MM);
const ESCALAS = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05];
const rotuloEscala = (e) => (e >= 1 ? `${e}:1` : `1:${Math.round(1 / e)}`);
const fmt = (n) => String(+n.toFixed(1)).replace('.', ',');

// direção da câmera e "cima" de cada vista (a peça tem Y para cima)
const VISTAS = {
  frente: { dir: new THREE.Vector3(0, 0, 1), cima: new THREE.Vector3(0, 1, 0), eixos: ['x', 'y'] },
  topo: { dir: new THREE.Vector3(0, 1, 0), cima: new THREE.Vector3(0, 0, -1), eixos: ['x', 'z'] },
  esquerda: { dir: new THREE.Vector3(-1, 0, 0), cima: new THREE.Vector3(0, 1, 0), eixos: ['z', 'y'] },
  iso: { dir: new THREE.Vector3(1, 0.82, 1).normalize(), cima: new THREE.Vector3(0, 1, 0) },
};

function renderizarVista(renderer, geo, caixa, vista, escala, sombreada) {
  const centro = caixa.getCenter(new THREE.Vector3());
  const tam = caixa.getSize(new THREE.Vector3());
  const raio = tam.length() / 2 + 2;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, raio * 4);
  cam.up.copy(vista.cima);
  cam.position.copy(centro).addScaledVector(vista.dir, raio * 2);
  cam.lookAt(centro);
  cam.updateMatrixWorld();
  // tamanho da vista na folha: projeção da caixa
  const cantos = [];
  for (const x of [caixa.min.x, caixa.max.x]) for (const y of [caixa.min.y, caixa.max.y]) for (const z of [caixa.min.z, caixa.max.z]) cantos.push(new THREE.Vector3(x, y, z));
  const inv = cam.matrixWorldInverse;
  const b2 = new THREE.Box2();
  for (const c of cantos) {
    const p = c.clone().applyMatrix4(inv);
    b2.expandByPoint(new THREE.Vector2(p.x, p.y));
  }
  const margem = 4 / escala;
  b2.expandByScalar(margem);
  cam.left = b2.min.x;
  cam.right = b2.max.x;
  cam.bottom = b2.min.y;
  cam.top = b2.max.y;
  cam.updateProjectionMatrix();
  const largura = Math.max(8, Math.round((b2.max.x - b2.min.x) * escala * MM));
  const altura = Math.max(8, Math.round((b2.max.y - b2.min.y) * escala * MM));
  renderer.setSize(largura, altura, false);
  const cena = new THREE.Scene();
  const malha = new THREE.Mesh(geo, sombreada
    ? new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    : new THREE.MeshBasicMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  cena.add(malha);
  if (sombreada) {
    cena.add(new THREE.HemisphereLight('#ffffff', '#8a8f96', 1.6));
    const sol = new THREE.DirectionalLight('#ffffff', 1.6);
    sol.position.copy(vista.dir).multiplyScalar(10).add(new THREE.Vector3(-4, 8, 2));
    cena.add(sol);
  }
  const arestas = arestasLimpas(geo, 20);
  const linhas = new LineSegmentsGeometry().fromEdgesGeometry(arestas);
  const visivel = new LineSegments2(linhas, new LineMaterial({ color: '#111111', linewidth: 2.2, resolution: new THREE.Vector2(largura, altura) }));
  cena.add(visivel);
  if (!sombreada) {
    const oculta = new LineSegments2(linhas, new LineMaterial({
      color: '#7a7f86', linewidth: 1.2, dashed: true, dashSize: 2.2 / escala, gapSize: 1.4 / escala, resolution: new THREE.Vector2(largura, altura),
      depthFunc: THREE.GreaterDepth, depthWrite: false, transparent: true,
    }));
    oculta.computeLineDistances();
    oculta.renderOrder = 2;
    cena.add(oculta);
  }
  renderer.setClearColor('#ffffff', 0);
  renderer.render(cena, cam);
  const img = document.createElement('canvas');
  img.width = largura;
  img.height = altura;
  img.getContext('2d').drawImage(renderer.domElement, 0, 0);
  arestas.dispose();
  linhas.dispose();
  malha.material.dispose();
  // projeção de um ponto da peça para pixels da imagem da vista
  const projetar = (p) => {
    const q = p.clone().applyMatrix4(inv);
    return [((q.x - b2.min.x) / (b2.max.x - b2.min.x)) * largura, ((b2.max.y - q.y) / (b2.max.y - b2.min.y)) * altura];
  };
  return { img, largura, altura, projetar };
}

function seta(g, x1, y1, x2, y2) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const t = 11;
  for (const [x, y, a] of [[x1, y1, ang], [x2, y2, ang + Math.PI]]) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a + 0.3) * t, y + Math.sin(a + 0.3) * t);
    g.lineTo(x + Math.cos(a - 0.3) * t, y + Math.sin(a - 0.3) * t);
    g.closePath();
    g.fill();
  }
}

// cota entre dois pontos da folha, afastada "desloc" pixels na direção perpendicular
function cota(g, a, b, desloc, texto) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const a2 = [a[0] + nx * desloc, a[1] + ny * desloc];
  const b2 = [b[0] + nx * desloc, b[1] + ny * desloc];
  g.strokeStyle = '#1a4f8a';
  g.fillStyle = '#1a4f8a';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(a[0] + nx * 4, a[1] + ny * 4);
  g.lineTo(a2[0] + nx * 8, a2[1] + ny * 8);
  g.moveTo(b[0] + nx * 4, b[1] + ny * 4);
  g.lineTo(b2[0] + nx * 8, b2[1] + ny * 8);
  g.moveTo(a2[0], a2[1]);
  g.lineTo(b2[0], b2[1]);
  g.stroke();
  seta(g, a2[0], a2[1], b2[0], b2[1]);
  g.save();
  g.translate((a2[0] + b2[0]) / 2 + nx * 14, (a2[1] + b2[1]) / 2 + ny * 14);
  let ang = Math.atan2(dy, dx);
  if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
  g.rotate(ang);
  g.font = '600 22px "Share Tech Mono", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const largura = g.measureText(texto).width + 10;
  g.fillStyle = '#ffffff';
  g.fillRect(-largura / 2, -13, largura, 26);
  g.fillStyle = '#1a4f8a';
  g.fillText(texto, 0, 1);
  g.restore();
}

// símbolo do 1º diedro (tronco de cone)
function simboloDiedro(g, x, y) {
  g.strokeStyle = '#111';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y - 10);
  g.lineTo(x + 26, y - 16);
  g.lineTo(x + 26, y + 16);
  g.lineTo(x, y + 10);
  g.closePath();
  g.stroke();
  g.beginPath();
  g.arc(x + 52, y, 16, 0, Math.PI * 2);
  g.arc(x + 52, y, 9, 0, Math.PI * 2);
  g.stroke();
}

/*
 * opcoes: { geometria (mm), nome, material, massa (g), volume (cm³), notas: [texto], autor }
 * devolve o canvas da folha pronta
 */
export function gerarFolha({ geometria, nome = 'Peça', material = '—', massa = 0, volume = 0, notas = [], autor = 'Renato' }) {
  geometria.computeBoundingBox();
  const caixa = geometria.boundingBox.clone();
  const tam = caixa.getSize(new THREE.Vector3());
  const folha = document.createElement('canvas');
  folha.width = W;
  folha.height = H;
  const g = folha.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  // margens (10 mm, 20 mm à esquerda para arquivar) e carimbo
  const m = 10 * MM;
  const esq = 20 * MM;
  g.strokeStyle = '#111';
  g.lineWidth = 3;
  g.strokeRect(esq, m, W - esq - m, H - 2 * m);
  const cw = 180 * MM;
  const ch = 42 * MM;
  const cx = W - m - cw;
  const cy = H - m - ch;
  // área útil das vistas (acima do carimbo)
  const areaL = W - esq - m - 20 * MM;
  const areaA = H - 2 * m - ch - 16 * MM;
  const gap = 22 * MM;
  let escala = ESCALAS[ESCALAS.length - 1];
  for (const e of ESCALAS) {
    const largura = (tam.x + tam.z) * e * MM + gap;
    const altura = (tam.y + tam.z) * e * MM + gap;
    if (largura <= areaL * 0.86 && altura <= areaA) {
      escala = e;
      break;
    }
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  try {
    const frente = renderizarVista(renderer, geometria, caixa, VISTAS.frente, escala, false);
    const topo = renderizarVista(renderer, geometria, caixa, VISTAS.topo, escala, false);
    const esquerda = renderizarVista(renderer, geometria, caixa, VISTAS.esquerda, escala, false);
    const escalaIso = escala * 0.75;
    const iso = renderizarVista(renderer, geometria, caixa, VISTAS.iso, escalaIso, true);
    // 1º diedro: frente no alto à esquerda, superior embaixo dela, lateral esquerda à direita da frente
    const x0 = esq + 22 * MM;
    const y0 = m + 16 * MM;
    const pos = {
      frente: [x0, y0],
      topo: [x0, y0 + frente.altura + gap * 0.6],
      esquerda: [x0 + frente.largura + gap * 0.6, y0],
    };
    g.drawImage(frente.img, ...pos.frente);
    g.drawImage(topo.img, ...pos.topo);
    g.drawImage(esquerda.img, ...pos.esquerda);
    const isoX = Math.max(pos.esquerda[0] + esquerda.largura + gap * 0.6, W - m - iso.largura - 10 * MM);
    if (isoX + iso.largura < W - m) g.drawImage(iso.img, isoX, y0);
    // linhas de centro dos furos redondos na vista de topo seriam aqui; marcamos o centro da peça
    g.setLineDash([18, 6, 4, 6]);
    g.strokeStyle = '#c0392b';
    g.lineWidth = 1;
    const centro = caixa.getCenter(new THREE.Vector3());
    const pT = topo.projetar(centro);
    g.beginPath();
    g.moveTo(pos.topo[0] + pT[0] - 30, pos.topo[1] + pT[1]);
    g.lineTo(pos.topo[0] + pT[0] + 30, pos.topo[1] + pT[1]);
    g.moveTo(pos.topo[0] + pT[0], pos.topo[1] + pT[1] - 30);
    g.lineTo(pos.topo[0] + pT[0], pos.topo[1] + pT[1] + 30);
    g.stroke();
    g.setLineDash([]);
    // cotas gerais
    const P = (v, nomeVista) => {
      const vista = { frente, topo, esquerda }[nomeVista];
      const p = vista.projetar(v);
      return [pos[nomeVista][0] + p[0], pos[nomeVista][1] + p[1]];
    };
    const { min, max } = caixa;
    cota(g, P(new THREE.Vector3(min.x, max.y, max.z), 'frente'), P(new THREE.Vector3(max.x, max.y, max.z), 'frente'), -28, `${fmt(tam.x)}`);
    cota(g, P(new THREE.Vector3(max.x, min.y, max.z), 'frente'), P(new THREE.Vector3(max.x, max.y, max.z), 'frente'), -28, `${fmt(tam.y)}`);
    cota(g, P(new THREE.Vector3(max.x, max.y, min.z), 'topo'), P(new THREE.Vector3(max.x, max.y, max.z), 'topo'), -28, `${fmt(tam.z)}`);
    // rótulos das vistas
    g.fillStyle = '#111';
    g.font = '600 20px "Share Tech Mono", monospace';
    g.textAlign = 'left';
    g.fillText('VISTA FRONTAL', pos.frente[0], pos.frente[1] - 10);
    g.fillText('VISTA SUPERIOR', pos.topo[0], pos.topo[1] - 10);
    g.fillText('VISTA LATERAL ESQUERDA', pos.esquerda[0], pos.esquerda[1] - 10);
    if (isoX + iso.largura < W - m) g.fillText(`PERSPECTIVA ISOMÉTRICA (${rotuloEscala(escalaIso).replace(/(\d+)$/, (n) => n)})`, isoX, y0 - 10);
    // notas
    const notasY = cy - 8 * MM - notas.length * 28;
    g.font = '20px "Share Tech Mono", monospace';
    ['NOTAS:', ...notas.map((n, i) => `${i + 1}. ${n}`), `${notas.length + 1}. COTAS EM MILÍMETROS. TOLERÂNCIA GERAL ISO 2768-m.`]
      .forEach((t, i) => g.fillText(t, esq + 12 * MM, notasY + i * 28));
  } finally {
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
  // carimbo
  g.lineWidth = 2.5;
  g.strokeStyle = '#111';
  g.strokeRect(cx, cy, cw, ch);
  const linhasC = [cy + ch * 0.36, cy + ch * 0.68];
  g.lineWidth = 1.4;
  g.beginPath();
  for (const y of linhasC) {
    g.moveTo(cx, y);
    g.lineTo(cx + cw, y);
  }
  const cols = [cx + cw * 0.5, cx + cw * 0.72];
  for (const x of cols) {
    g.moveTo(x, linhasC[0]);
    g.lineTo(x, cy + ch);
  }
  g.stroke();
  g.fillStyle = '#111';
  g.textAlign = 'left';
  g.font = '700 30px "Orbitron", sans-serif';
  g.fillText(String(nome).toUpperCase().slice(0, 34), cx + 14, cy + ch * 0.25);
  g.font = '15px "Share Tech Mono", monospace';
  g.fillStyle = '#555';
  g.fillText('J.A.R.V.I.S. · OFICINA HOLOGRÁFICA', cx + cw - 330, cy + 22);
  const campo = (rot, val, x, y) => {
    g.fillStyle = '#666';
    g.font = '14px "Share Tech Mono", monospace';
    g.fillText(rot, x + 10, y + 20);
    g.fillStyle = '#111';
    g.font = '600 21px "Share Tech Mono", monospace';
    g.fillText(val, x + 10, y + 46);
  };
  campo('MATERIAL', String(material).toUpperCase(), cx, linhasC[0]);
  campo('MASSA', `${fmt(massa)} g · ${fmt(volume)} cm³`, cols[0], linhasC[0]);
  campo('ESCALA', rotuloEscala(escala), cols[1], linhasC[0]);
  campo('DESENHO', String(autor).toUpperCase(), cx, linhasC[1]);
  campo('DATA', new Date().toLocaleDateString('pt-BR'), cols[0], linhasC[1]);
  campo('FOLHA', 'A4 · 1/1', cols[1], linhasC[1]);
  simboloDiedro(g, cols[1] + 118, linhasC[1] + 30);
  return folha;
}
