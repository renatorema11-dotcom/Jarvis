/*
 * holo-cad-nucleo.js — o "motor" da oficina (holo-cad.js): tudo que é geometria e cálculo,
 * sem tela nem mãos.
 *
 *  - parâmetros com fórmulas (largura/2, sqrt(area)…), lidos por um analisador próprio, sem eval;
 *  - esboço 2D num plano (linha, retângulo, círculo, arco, polígono) → perfis fechados com furos;
 *  - recursos: extrusão (juntar/cortar/interseção; distância, até a face ou passante), revolução,
 *    furo (simples, escareado, rebaixado, roscado M3–M12 com rosca desenhada), primitivas,
 *    arredondar e chanfro, padrão retangular e circular, espelhar e casca;
 *  - materiais reais (densidade, aparência, tensão de escoamento), massa e centro de gravidade;
 *  - biblioteca: parafusos, porcas e arruelas M3–M12, rolamentos e perfil 20×20;
 *  - reconhecimento de traço livre: um rabisco vira linha, retângulo ou círculo perfeitos.
 *
 * Unidades: milímetros. Na peça, Y é para cima (a mesa é o plano XZ).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------- materiais ----------------
export const MATERIAIS = {
  aco: { nome: 'AÇO 1020', densidade: 7.87, cor: '#8f979e', metal: 1, rugosidade: 0.34, escoamento: 350 },
  aluminio: { nome: 'ALUMÍNIO 6061', densidade: 2.7, cor: '#c9d0d6', metal: 1, rugosidade: 0.26, escoamento: 276 },
  latao: { nome: 'LATÃO', densidade: 8.5, cor: '#d4a94e', metal: 1, rugosidade: 0.22, escoamento: 200 },
  titanio: { nome: 'TITÂNIO Ti-6Al-4V', densidade: 4.43, cor: '#a19e95', metal: 1, rugosidade: 0.3, escoamento: 880 },
  abs: { nome: 'ABS', densidade: 1.04, cor: '#e9e5dc', metal: 0, rugosidade: 0.55, escoamento: 40 },
  pla: { nome: 'PLA', densidade: 1.24, cor: '#3d7be0', metal: 0, rugosidade: 0.45, escoamento: 50 },
};

// roscas métricas grossas: passo, broca do macho e diâmetro nominal
export const ROSCAS = {
  M3: { passo: 0.5, broca: 2.5, nominal: 3 }, M4: { passo: 0.7, broca: 3.3, nominal: 4 }, M5: { passo: 0.8, broca: 4.2, nominal: 5 },
  M6: { passo: 1, broca: 5, nominal: 6 }, M8: { passo: 1.25, broca: 6.8, nominal: 8 }, M10: { passo: 1.5, broca: 8.5, nominal: 10 },
  M12: { passo: 1.75, broca: 10.2, nominal: 12 },
};

// ---------------- parâmetros e fórmulas ----------------
const FUNCOES = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: (g) => Math.sin(THREE.MathUtils.degToRad(g)), cos: (g) => Math.cos(THREE.MathUtils.degToRad(g)), tan: (g) => Math.tan(THREE.MathUtils.degToRad(g)),
  raiz: Math.sqrt, sen: (g) => Math.sin(THREE.MathUtils.degToRad(g)),
};

// avalia "largura/2 + 3" com os parâmetros dados; aceita vírgula decimal e ignora "mm" e "°"
export function avaliarExpr(texto, vars = {}) {
  if (typeof texto === 'number') return texto;
  const s = String(texto ?? '').trim().replace(/(\d),(\d)/g, '$1.$2').replace(/mm\b|°|graus?\b/gi, '');
  if (!s) throw new Error('vazio');
  const tokens = s.match(/\d+(\.\d+)?(e[+-]?\d+)?|[A-Za-z_À-ú][\wÀ-ú]*|[-+*/^()]/g) || [];
  if (tokens.join('') !== s.replace(/\s+/g, '')) throw new Error(`símbolo inválido em "${texto}"`);
  let i = 0;
  const ver = () => tokens[i];
  const comer = (t) => {
    if (tokens[i] !== t) throw new Error(`esperava "${t}" em "${texto}"`);
    i++;
  };
  const chaves = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k.toLowerCase(), v]));
  function primario() {
    const t = ver();
    if (t === undefined) throw new Error(`fórmula incompleta: "${texto}"`);
    if (t === '(') {
      comer('(');
      const v = expr();
      comer(')');
      return v;
    }
    i++;
    if (/^\d/.test(t)) return Number(t);
    const nome = t.toLowerCase();
    if (FUNCOES[nome]) {
      comer('(');
      const v = expr();
      comer(')');
      return FUNCOES[nome](v);
    }
    if (nome === 'pi') return Math.PI;
    if (nome in chaves) return chaves[nome];
    throw new Error(`parâmetro "${t}" não existe`);
  }
  function unario() {
    if (ver() === '-') { i++; return -unario(); }
    if (ver() === '+') { i++; return unario(); }
    return primario();
  }
  function potencia() {
    const b = unario();
    if (ver() === '^') { i++; return b ** potencia(); }
    return b;
  }
  function termo() {
    let v = potencia();
    while (ver() === '*' || ver() === '/') {
      const op = tokens[i++];
      const d = potencia();
      v = op === '*' ? v * d : v / d;
    }
    return v;
  }
  function expr() {
    let v = termo();
    while (ver() === '+' || ver() === '-') {
      const op = tokens[i++];
      const d = termo();
      v = op === '+' ? v + d : v - d;
    }
    return v;
  }
  const v = expr();
  if (i !== tokens.length) throw new Error(`sobrou "${tokens.slice(i).join('')}" em "${texto}"`);
  if (!Number.isFinite(v)) throw new Error(`resultado inválido em "${texto}"`);
  return v;
}

// parâmetros na ordem: cada um pode usar os de cima
export function valoresParametros(lista = []) {
  const vars = {};
  const erros = {};
  for (const p of lista) {
    try {
      vars[p.nome] = avaliarExpr(p.expr, vars);
    } catch (e) {
      erros[p.nome] = e.message;
    }
  }
  return { vars, erros };
}

// ---------------- planos de esboço ----------------
export const PLANOS = {
  xz: { nome: 'TOPO (XZ)', o: [0, 0, 0], n: [0, 1, 0], x: [1, 0, 0] },
  xy: { nome: 'FRENTE (XY)', o: [0, 0, 0], n: [0, 0, 1], x: [1, 0, 0] },
  yz: { nome: 'LATERAL (YZ)', o: [0, 0, 0], n: [1, 0, 0], x: [0, 0, -1] },
};

// plano numa face: a origem é a projeção da origem da peça, e o eixo X fica "deitado"
export function planoDaFace(ponto, normal) {
  const n = new THREE.Vector3(...normal).normalize();
  const cima = new THREE.Vector3(0, 1, 0);
  let x = new THREE.Vector3().crossVectors(cima, n);
  if (x.lengthSq() < 1e-4) x.set(1, 0, 0);
  else x.normalize();
  const o = n.clone().multiplyScalar(new THREE.Vector3(...ponto).dot(n));
  const r = (v) => v.toArray().map((c) => +c.toFixed(4));
  return { o: r(o), n: r(n), x: r(x) };
}

export function basePlano(plano) {
  const o = new THREE.Vector3(...plano.o);
  const n = new THREE.Vector3(...plano.n).normalize();
  const x = new THREE.Vector3(...plano.x).normalize();
  const y = new THREE.Vector3().crossVectors(n, x);
  return { o, n, x, y, matriz: new THREE.Matrix4().makeBasis(x, y, n).setPosition(o) };
}

export const doPlano = (base, u, v) => base.o.clone().addScaledVector(base.x, u).addScaledVector(base.y, v);

// ---------------- entidades do esboço ----------------
const V2 = (p) => new THREE.Vector2(p[0], p[1]);

// arco de a até b com abertura "ang" (graus, com sinal: positivo = anti-horário)
export function geometriaArco(e) {
  const a = V2(e.a);
  const b = V2(e.b);
  const ang = THREE.MathUtils.degToRad(e.ang || 180);
  const corda = a.distanceTo(b);
  if (corda < 1e-6 || Math.abs(ang) < 1e-3) return { centro: a.clone(), raio: 0, ini: 0, fim: 0, pontos: [a, b] };
  const raio = corda / (2 * Math.sin(Math.abs(ang) / 2));
  const meio = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const perp = new THREE.Vector2(-dir.y, dir.x);
  const h = Math.sqrt(Math.max(0, raio * raio - (corda / 2) ** 2)) * (Math.abs(ang) > Math.PI ? -1 : 1);
  const centro = meio.clone().addScaledVector(perp, ang > 0 ? h : -h);
  const ini = Math.atan2(a.y - centro.y, a.x - centro.x);
  const n = Math.max(6, Math.ceil(Math.abs(ang) / (Math.PI / 24)));
  const pontos = [];
  for (let i = 0; i <= n; i++) {
    const t = ini + (ang * i) / n;
    pontos.push(new THREE.Vector2(centro.x + Math.cos(t) * raio, centro.y + Math.sin(t) * raio));
  }
  pontos[0].copy(a);
  pontos[n].copy(b);
  return { centro, raio, ini, fim: ini + ang, pontos };
}

// abertura de um arco que sai tangente à direção "tan" no ponto a e termina em b
export function anguloTangente(a, b, tan) {
  const ab = new THREE.Vector2(b[0] - a[0], b[1] - a[1]);
  const t = V2(tan).normalize();
  const cruz = t.x * ab.y - t.y * ab.x;
  const ang = 2 * Math.atan2(cruz, t.dot(ab));
  return THREE.MathUtils.radToDeg(ang);
}

// pontos (contorno fechado) de uma entidade fechada
function contornoFechado(e) {
  if (e.t === 'circ') {
    const n = Math.max(32, Math.min(128, Math.round(e.r * 2)));
    return Array.from({ length: n }, (_, i) => new THREE.Vector2(e.c[0] + Math.cos((i / n) * Math.PI * 2) * e.r, e.c[1] + Math.sin((i / n) * Math.PI * 2) * e.r));
  }
  if (e.t === 'poli') {
    const n = Math.max(3, Math.round(e.n || 6));
    const rot = THREE.MathUtils.degToRad(e.rot || 0) + Math.PI / 2;
    return Array.from({ length: n }, (_, i) => new THREE.Vector2(e.c[0] + Math.cos(rot + (i / n) * Math.PI * 2) * e.r, e.c[1] + Math.sin(rot + (i / n) * Math.PI * 2) * e.r));
  }
  if (e.t === 'ret') {
    const x0 = Math.min(e.a[0], e.b[0]);
    const x1 = Math.max(e.a[0], e.b[0]);
    const y0 = Math.min(e.a[1], e.b[1]);
    const y1 = Math.max(e.a[1], e.b[1]);
    const pts = [new THREE.Vector2(x0, y0), new THREE.Vector2(x1, y0), new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y1)];
    return e.raio > 0 ? arredondarCantos(pts, e.raio) : pts;
  }
  return null;
}

// pontos de controle de uma entidade (para encaixe e para desenhar)
export function pontosEntidade(e) {
  if (e.t === 'linha') return [V2(e.a), V2(e.b)];
  if (e.t === 'arco') return geometriaArco(e).pontos;
  const c = contornoFechado(e);
  return c ? [...c, c[0].clone()] : [];
}

export function extremos(e) {
  if (e.t === 'linha' || e.t === 'arco') return [V2(e.a), V2(e.b)];
  if (e.t === 'circ' || e.t === 'poli') return [V2(e.c)];
  if (e.t === 'ret') return [V2(e.a), V2(e.b), new THREE.Vector2(e.a[0], e.b[1]), new THREE.Vector2(e.b[0], e.a[1])];
  return [];
}

const areaAssinada = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

function dentro(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

// junta linhas e arcos ponta com ponta até fechar; devolve os laços fechados do esboço
export function lacosDoEsboco(esboco) {
  const lacos = [];
  const abertos = [];
  for (const e of esboco.ents || []) {
    if (e.construcao) continue;
    const fechado = contornoFechado(e);
    if (fechado) lacos.push(fechado);
    else if (e.t === 'linha' || e.t === 'arco') abertos.push(pontosEntidade(e));
  }
  const tol = 0.05;
  const usados = new Set();
  for (let i = 0; i < abertos.length; i++) {
    if (usados.has(i)) continue;
    const cadeia = abertos[i].map((p) => p.clone());
    usados.add(i);
    let fechou = false;
    for (let passo = 0; passo < abertos.length; passo++) {
      const fim = cadeia[cadeia.length - 1];
      if (cadeia.length > 2 && fim.distanceTo(cadeia[0]) < tol) {
        fechou = true;
        break;
      }
      let achou = false;
      for (let j = 0; j < abertos.length; j++) {
        if (usados.has(j)) continue;
        const s = abertos[j];
        if (s[0].distanceTo(fim) < tol) cadeia.push(...s.slice(1).map((p) => p.clone()));
        else if (s[s.length - 1].distanceTo(fim) < tol) cadeia.push(...s.slice(0, -1).reverse().map((p) => p.clone()));
        else continue;
        usados.add(j);
        achou = true;
        break;
      }
      if (!achou) break;
    }
    if (!fechou && cadeia.length > 2 && cadeia[cadeia.length - 1].distanceTo(cadeia[0]) < tol) fechou = true;
    if (fechou) {
      cadeia.pop();
      if (cadeia.length >= 3) lacos.push(cadeia);
    }
  }
  return lacos;
}

// laços → formas (THREE.Shape) com furos, pelo aninhamento (par = material, ímpar = furo)
export function formasDosLacos(lacos) {
  const info = lacos.map((pts) => ({ pts: areaAssinada(pts) < 0 ? [...pts].reverse() : pts, area: Math.abs(areaAssinada(pts)) }))
    .filter((l) => l.area > 1e-4)
    .sort((a, b) => b.area - a.area);
  for (const l of info) {
    l.pais = info.filter((o) => o !== l && o.area > l.area && dentro(l.pts[0], o.pts));
    l.nivel = l.pais.length;
  }
  const formas = [];
  for (const l of info) {
    if (l.nivel % 2 !== 0) continue;
    const forma = new THREE.Shape(l.pts);
    for (const f of info) {
      if (f.nivel === l.nivel + 1 && f.pais.includes(l)) forma.holes.push(new THREE.Path([...f.pts].reverse()));
    }
    formas.push(forma);
  }
  return formas;
}

// arredonda todos os cantos de um contorno com o raio dado (limitado pela metade das arestas)
export function arredondarCantos(pts, raio, seg = 6) {
  if (!(raio > 0)) return pts;
  const n = pts.length;
  const saida = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const da = a.clone().sub(p);
    const db = b.clone().sub(p);
    const la = da.length();
    const lb = db.length();
    da.normalize();
    db.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(da.dot(db), -1, 1));
    if (ang > Math.PI - 0.05 || ang < 0.05) {
      saida.push(p.clone());
      continue;
    }
    const recuo = Math.min(raio / Math.tan(ang / 2), la * 0.49, lb * 0.49);
    const r = recuo * Math.tan(ang / 2);
    const p1 = p.clone().addScaledVector(da, recuo);
    const p2 = p.clone().addScaledVector(db, recuo);
    const bis = da.clone().add(db).normalize();
    const centro = p.clone().addScaledVector(bis, r / Math.sin(ang / 2));
    const a1 = Math.atan2(p1.y - centro.y, p1.x - centro.x);
    const a2 = Math.atan2(p2.y - centro.y, p2.x - centro.x);
    let delta = a2 - a1;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    for (let k = 0; k <= seg; k++) {
      const t = a1 + (delta * k) / seg;
      saida.push(new THREE.Vector2(centro.x + Math.cos(t) * r, centro.y + Math.sin(t) * r));
    }
  }
  return saida;
}

// desloca um contorno para dentro (d < 0) ou para fora, pela média das normais das arestas
export function deslocarContorno(pts, d) {
  const sentido = areaAssinada(pts) > 0 ? 1 : -1;
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const e1 = p.clone().sub(a).normalize();
    const e2 = b.clone().sub(p).normalize();
    const n1 = new THREE.Vector2(e1.y, -e1.x).multiplyScalar(sentido);
    const n2 = new THREE.Vector2(e2.y, -e2.x).multiplyScalar(sentido);
    const bis = n1.clone().add(n2);
    const len = bis.length();
    if (len < 1e-6) return p.clone().addScaledVector(n1, d);
    bis.divideScalar(len);
    const cosMeio = Math.max(0.25, bis.dot(n1));
    return p.clone().addScaledVector(bis, d / cosMeio);
  });
}

// ---------------- primitivas (da oficina antiga, continuam valendo) ----------------
function geoEngrenagem({ diametro, dentes, espessura, furo }) {
  const n = Math.max(6, Math.round(dentes));
  const externo = diametro / 2;
  const modulo = diametro / (n + 2);
  const raiz = Math.max(externo - modulo * 2.25, externo * 0.4);
  const passo = (Math.PI * 2) / n;
  const forma = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const c = i * passo;
    const pontos = [[raiz, c - passo * 0.5], [raiz, c - passo * 0.26], [externo, c - passo * 0.12], [externo, c + passo * 0.12], [raiz, c + passo * 0.26]];
    pontos.forEach(([r, a], k) => {
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0 && k === 0) forma.moveTo(x, y);
      else forma.lineTo(x, y);
    });
  }
  forma.closePath();
  if (furo > 0) {
    const buraco = new THREE.Path();
    buraco.absarc(0, 0, Math.min(furo / 2, raiz * 0.8), 0, Math.PI * 2, true);
    forma.holes.push(buraco);
  }
  const geo = new THREE.ExtrudeGeometry(forma, { depth: espessura, bevelEnabled: false, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function geoTubo({ diametro, interno, altura }) {
  const ro = diametro / 2;
  const ri = Math.min(interno / 2, ro - 0.5);
  const perfil = [[ri, 0], [ro, 0], [ro, altura], [ri, altura], [ri, 0]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(perfil, 72);
}

export const PRIMITIVAS = {
  bloco: { nome: 'BLOCO', icone: '▭', medidas: { largura: 40, profundidade: 30, altura: 20 },
    geo: (m) => new THREE.BoxGeometry(m.largura, m.altura, m.profundidade).translate(0, m.altura / 2, 0) },
  cilindro: { nome: 'CILINDRO', icone: '◯', medidas: { diametro: 30, altura: 20 },
    geo: (m) => new THREE.CylinderGeometry(m.diametro / 2, m.diametro / 2, m.altura, 72).translate(0, m.altura / 2, 0) },
  tubo: { nome: 'TUBO', icone: '◎', medidas: { diametro: 40, interno: 28, altura: 20 }, geo: geoTubo },
  esfera: { nome: 'ESFERA', icone: '●', medidas: { diametro: 30 },
    geo: (m) => new THREE.SphereGeometry(m.diametro / 2, 48, 32).translate(0, m.diametro / 2, 0) },
  cone: { nome: 'CONE', icone: '△', medidas: { base: 30, topo: 8, altura: 30 },
    geo: (m) => new THREE.CylinderGeometry(Math.max(0.01, m.topo / 2), m.base / 2, m.altura, 72).translate(0, m.altura / 2, 0) },
  sextavado: { nome: 'SEXTAVADO', icone: '⬡', medidas: { largura: 24, altura: 10 },
    geo: (m) => new THREE.CylinderGeometry(m.largura / Math.sqrt(3), m.largura / Math.sqrt(3), m.altura, 6).translate(0, m.altura / 2, 0) },
  engrenagem: { nome: 'ENGRENAGEM', icone: '⚙', medidas: { diametro: 50, dentes: 18, espessura: 8, furo: 8 }, geo: geoEngrenagem },
  rasgo: { nome: 'RASGO', icone: '▬', medidas: { comprimento: 30, largura: 8, profundidade: 5 },
    geo: (m) => new THREE.BoxGeometry(m.comprimento, m.profundidade + 0.4, m.largura).translate(0, -m.profundidade / 2 + 0.2, 0) },
};
export const ROTULO_MEDIDA = {
  largura: 'LARGURA', profundidade: 'PROFUND.', altura: 'ALTURA', diametro: 'DIÂMETRO', interno: 'Ø INTERNO', base: 'Ø BASE', topo: 'Ø TOPO',
  dentes: 'DENTES', espessura: 'ESPESSURA', furo: 'Ø FURO', comprimento: 'COMPRIM.',
};

// ---------------- utilidades de geometria ----------------
export function limpar(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const nome of Object.keys(g.attributes)) if (nome !== 'position' && nome !== 'normal') g.deleteAttribute(nome);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  return g;
}

// volume com sinal (mm³) e centro de gravidade pelo método dos tetraedros
export function propriedadesMassa(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const n = idx ? idx.count : pos.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centro = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < n; i += 3) {
    const ia = idx ? idx.getX(i) : i;
    const ib = idx ? idx.getX(i + 1) : i + 1;
    const ic = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    const v = a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    volume += v;
    centro.x += v * (a.x + b.x + c.x) / 4;
    centro.y += v * (a.y + b.y + c.y) / 4;
    centro.z += v * (a.z + b.z + c.z) / 4;
  }
  if (Math.abs(volume) > 1e-9) centro.divideScalar(volume);
  return { volume, centro };
}

// garante as faces viradas para fora (volume positivo)
export function orientarParaFora(geo) {
  const { volume } = propriedadesMassa(geo);
  if (volume >= 0) return geo;
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const nome of Object.keys(g.attributes)) {
    const at = g.attributes[nome];
    for (let i = 0; i < at.count; i += 3) {
      for (let k = 0; k < at.itemSize; k++) {
        const t = at.array[(i + 1) * at.itemSize + k];
        at.array[(i + 1) * at.itemSize + k] = at.array[(i + 2) * at.itemSize + k];
        at.array[(i + 2) * at.itemSize + k] = t;
      }
    }
  }
  if (g.attributes.normal) {
    const nr = g.attributes.normal.array;
    for (let i = 0; i < nr.length; i++) nr[i] = -nr[i];
  }
  return g;
}

// aplica uma matriz (que pode espelhar) mantendo as faces para fora
export function transformar(geo, m) {
  const g = geo.clone().applyMatrix4(m);
  return m.determinant() < 0 ? orientarParaFora(g) : g;
}

// hélice da rosca desenhada (linhas)
export function helice(raio, passo, comprimento) {
  const voltas = Math.max(1, comprimento / passo);
  const n = Math.ceil(voltas * 24);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * voltas * Math.PI * 2;
    pts.push(Math.cos(t) * raio, -(i / n) * comprimento, Math.sin(t) * raio);
  }
  return pts;
}

// gira um contorno fechado (raio, altura) em torno do eixo Y; ângulo < 2π fecha as pontas com tampas
export function revolverLaco(rh, ang, segs) {
  const n = rh.length;
  const S = Math.max(3, segs);
  const pos = [];
  for (let k = 0; k <= S; k++) {
    const fi = (ang * k) / S;
    for (const p of rh) pos.push(p.x * Math.sin(fi), p.y, p.x * Math.cos(fi));
  }
  const idx = [];
  for (let k = 0; k < S; k++) {
    for (let j = 0; j < n; j++) {
      const a = k * n + j;
      const b = k * n + ((j + 1) % n);
      const c = (k + 1) * n + j;
      const d = (k + 1) * n + ((j + 1) % n);
      idx.push(a, b, d, a, d, c);
    }
  }
  if (ang < Math.PI * 2 - 1e-3) {
    const ccw = areaAssinada(rh) > 0 ? rh : [...rh].reverse();
    const mapa = ccw === rh ? (i) => i : (i) => n - 1 - i;
    for (const [i0, i1, i2] of THREE.ShapeUtils.triangulateShape(ccw, [])) {
      idx.push(mapa(i0), mapa(i2), mapa(i1));
      idx.push(S * n + mapa(i0), S * n + mapa(i1), S * n + mapa(i2));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return orientarParaFora(g.toNonIndexed());
}

// ---------------- geometria de cada recurso ----------------
// ctx: { vars, esbocos (id → esboço), modificadores (id → [mods]), caixa (Box3 da peça até aqui), geoDe(id) }
const num = (v, vars, padrao = 0) => {
  try { return avaliarExpr(v, vars); } catch { return padrao; }
};

// extrusão própria: as paredes sobem retas e, se pedido, o topo e/ou a base fecham com arredondado
// (quarto de círculo) ou chanfro (45°), tudo numa malha só, fechada e com as faces para fora.
// (o chanfro do ExtrudeGeometry só faz os dois lados juntos, e unir duas extrusões confunde o CSG)
function extrudarPerfil(forma, d, topo, base) {
  const limparLaco = (pts) => {
    const l = pts.map((p) => new THREE.Vector2(p.x, p.y));
    if (l.length > 2 && l[0].distanceTo(l[l.length - 1]) < 1e-6) l.pop();
    return l;
  };
  let externo = limparLaco(forma.getPoints(48));
  if (THREE.ShapeUtils.isClockWise(externo)) externo.reverse();
  const furos = forma.holes.map((h) => {
    const l = limparLaco(h.getPoints(48));
    return THREE.ShapeUtils.isClockWise(l) ? l : l.reverse();
  });
  // anéis na altura: (z, recuo para dentro do material)
  const aneis = [];
  const curva = (c, z0, sobe) => {
    const pts = [];
    for (let k = 1; k <= c.seg; k++) {
      const fi = (k / c.seg) * Math.PI / 2;
      const recuo = c.seg === 1 ? c.r : c.r * (1 - Math.cos(fi));
      const dz = c.seg === 1 ? c.r : c.r * Math.sin(fi);
      pts.push([z0 + (sobe ? dz : -dz), recuo]);
    }
    return pts;
  };
  if (base) aneis.push(...curva(base, base.r, false).reverse(), [base.r, 0]);
  else aneis.push([0, 0]);
  if (topo) aneis.push([d - topo.r, 0], ...curva(topo, d - topo.r, true));
  else aneis.push([d, 0]);
  const lacos = [externo, ...furos];
  const pos = [];
  const idx = [];
  const inicio = [];
  for (const laco of lacos) {
    inicio.push(pos.length / 3);
    const n = laco.length;
    for (const [z, recuo] of aneis) {
      // externo anda no sentido anti-horário: recuo para dentro = deslocar para "dentro" (negativo)
      const anel = recuo > 1e-6 ? deslocarContorno(laco, -recuo * (laco === externo ? 1 : -1)) : laco;
      for (const q of anel) pos.push(q.x, q.y, z);
    }
    const base0 = inicio[inicio.length - 1];
    for (let k = 0; k < aneis.length - 1; k++) {
      for (let i = 0; i < n; i++) {
        const a = base0 + k * n + i;
        const b = base0 + k * n + ((i + 1) % n);
        const c = base0 + (k + 1) * n + i;
        const e = base0 + (k + 1) * n + ((i + 1) % n);
        idx.push(a, b, e, a, e, c);
      }
    }
  }
  // tampas: o contorno do anel de cima e o do anel de baixo, triangulados com os furos
  const ultimo = aneis.length - 1;
  const tampa = (anel, paraCima) => {
    const pontos = lacos.map((l) => l.map((_, i) => new THREE.Vector2(pos[(inicio[lacos.indexOf(l)] + anel * l.length + i) * 3], pos[(inicio[lacos.indexOf(l)] + anel * l.length + i) * 3 + 1])));
    const tris = THREE.ShapeUtils.triangulateShape(pontos[0], pontos.slice(1));
    const mapa = [];
    lacos.forEach((l, j) => l.forEach((_, i) => mapa.push(inicio[j] + anel * l.length + i)));
    const todos = pontos.flat();
    for (const [i0, i1, i2] of tris) {
      const area = (todos[i1].x - todos[i0].x) * (todos[i2].y - todos[i0].y) - (todos[i2].x - todos[i0].x) * (todos[i1].y - todos[i0].y);
      const ccw = area > 0;
      if (ccw === paraCima) idx.push(mapa[i0], mapa[i1], mapa[i2]);
      else idx.push(mapa[i0], mapa[i2], mapa[i1]);
    }
  };
  tampa(ultimo, true);
  tampa(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return orientarParaFora(g.toNonIndexed());
}

function extrudirFormas(formas, profundidade, mods) {
  const pega = (onde) => mods.find((m) => m.arestas === onde || m.arestas === 'todas');
  const cantos = (m) => (m ? { r: Math.min(m.raio, profundidade * 0.45), seg: m.tipo === 'chanfro' ? 1 : 6 } : null);
  let topo = cantos(pega('topo'));
  let base = cantos(pega('base'));
  if (topo && base) {
    topo.r = Math.min(topo.r, profundidade * 0.45);
    base.r = Math.min(base.r, profundidade * 0.45);
  }
  if (topo && !(topo.r > 0.05)) topo = null;
  if (base && !(base.r > 0.05)) base = null;
  return formas.map((f) => extrudarPerfil(f, profundidade, topo, base));
}

function geoExtrusao(rec, ctx) {
  const esb = ctx.esbocos[rec.esboco];
  if (!esb) throw new Error('o esboço deste recurso não existe mais');
  const mods = ctx.modificadores[rec.id] || [];
  const verticais = mods.find((m) => m.arestas === 'verticais' || m.arestas === 'todas');
  let lacos = lacosDoEsboco(esb);
  if (verticais) lacos = lacos.map((l) => arredondarCantos(l, verticais.raio));
  const formas = formasDosLacos(lacos);
  if (!formas.length) throw new Error('o esboço não tem um perfil fechado');
  const base = basePlano(esb.plano);
  let d = Math.max(0.1, num(rec.distancia, ctx.vars, 10));
  let inicio = 0;
  let direcao = rec.direcao || 'normal';
  if (rec.fim === 'passante') {
    const diag = ctx.caixa && !ctx.caixa.isEmpty() ? ctx.caixa.getSize(new THREE.Vector3()).length() : 200;
    d = diag * 2 + 40;
    direcao = 'simetrica';
  } else if (rec.fim === 'face' && rec.face) {
    const n = new THREE.Vector3(...rec.face.n);
    const distancia = new THREE.Vector3(...rec.face.p).sub(base.o).dot(base.n);
    d = Math.max(0.1, Math.abs(distancia));
    direcao = distancia >= 0 ? 'normal' : 'inversa';
    void n;
  }
  if (direcao === 'inversa') inicio = -d;
  if (direcao === 'simetrica') inicio = -d / 2;
  const cantosTampa = rec.fim === 'passante' ? [] : mods;
  const geos = extrudirFormas(formas, d, cantosTampa.filter((m) => m.arestas !== 'verticais'))
    .map((g) => g.translate(0, 0, inicio).applyMatrix4(base.matriz));
  return { geos, op: rec.operacao || 'juntar' };
}

function geoRevolucao(rec, ctx) {
  const esb = ctx.esbocos[rec.esboco];
  if (!esb) throw new Error('o esboço deste recurso não existe mais');
  const base = basePlano(esb.plano);
  // eixo no esboço: o eixo horizontal (u), o vertical (v) ou uma linha de construção
  let p0 = new THREE.Vector2(0, 0);
  let dir = new THREE.Vector2(0, 1);
  if (rec.eixo === 'x') dir = new THREE.Vector2(1, 0);
  const linha = (esb.ents || []).find((e) => e.id === rec.eixo && e.t === 'linha');
  if (linha) {
    p0 = V2(linha.a);
    dir = V2(linha.b).sub(p0).normalize();
  }
  const perp = new THREE.Vector2(-dir.y, dir.x);
  const ang = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(num(rec.angulo, ctx.vars, 360), 1, 360));
  const lacos = lacosDoEsboco(esb).filter((l) => !(linha && l.length === 2));
  if (!lacos.length) throw new Error('o esboço não tem um perfil fechado');
  const geos = [];
  for (const laco of lacos) {
    // lado do eixo em que o perfil está
    const lado = Math.sign(laco.reduce((s, p) => s + p.clone().sub(p0).dot(perp), 0)) || 1;
    let rh = laco.map((p) => {
      const q = p.clone().sub(p0);
      return new THREE.Vector2(Math.max(0, q.dot(perp) * lado), q.dot(dir));
    });
    if (areaAssinada(rh) < 0) rh = rh.reverse();
    const g = revolverLaco(rh, ang, Math.max(8, Math.round((72 * ang) / (Math.PI * 2))));
    // eixo Y do torno → eixo do esboço; Z do torno → lado do perfil
    const A = base.x.clone().multiplyScalar(dir.x).addScaledVector(base.y, dir.y).normalize();
    const R = base.x.clone().multiplyScalar(perp.x * lado).addScaledVector(base.y, perp.y * lado).normalize();
    const X = new THREE.Vector3().crossVectors(A, R);
    const origem = doPlano(base, p0.x, p0.y);
    geos.push(transformar(g, new THREE.Matrix4().makeBasis(X, A, R).setPosition(origem)));
  }
  return { geos, op: rec.operacao || 'juntar' };
}

// perfil do furo em (raio, altura), com a boca em y = 0 e o furo descendo
export function perfilFuro(rec, vars, caixa) {
  const rosca = ROSCAS[rec.rosca];
  const estilo = rec.estilo || 'simples';
  const d = estilo === 'roscado' && rosca ? rosca.broca : Math.max(0.3, num(rec.diametro, vars, 8));
  const r = d / 2;
  const diag = caixa && !caixa.isEmpty() ? caixa.getSize(new THREE.Vector3()).length() : 200;
  const prof = rec.passante ? diag * 2 + 20 : Math.max(0.2, num(rec.profundidade, vars, 10));
  const pts = [[0, 0.4]];
  if (estilo === 'escareado') {
    const re = Math.max(r + 0.2, num(rec.escDiam, vars, d * 2) / 2);
    const h = (re - r) / Math.tan(THREE.MathUtils.degToRad(num(rec.escAng, vars, 90) / 2));
    pts.push([re + 0.4, 0.4], [re, 0], [r, -h]);
  } else if (estilo === 'rebaixado') {
    const rr = Math.max(r + 0.2, num(rec.rebDiam, vars, d * 1.8) / 2);
    const hr = Math.min(prof * 0.9, Math.max(0.2, num(rec.rebProf, vars, d * 0.6)));
    pts.push([rr, 0.4], [rr, -hr], [r, -hr]);
  } else {
    pts.push([r, 0.4]);
  }
  pts.push([r, -prof]);
  if (!rec.passante) pts.push([0, -prof - r * 0.6]);   // ponta da broca (118°)
  else pts.push([0, -prof]);
  return { pontos: pts.map(([x, y]) => new THREE.Vector2(x, y)), raio: r, prof };
}

function matrizFuro(rec) {
  const p = new THREE.Vector3(...rec.ponto);
  const fora = new THREE.Vector3(...rec.dir).normalize().negate();   // dir aponta para dentro da peça
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), fora);
  return new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
}

function geoFuro(rec, ctx) {
  const { pontos } = perfilFuro(rec, ctx.vars, ctx.caixa);
  // a lista sai do eixo, desce pelo contorno e volta ao eixo: o torno fecha o sólido
  const g = revolverLaco(pontos, Math.PI * 2, 48);
  return { geos: [g.applyMatrix4(matrizFuro(rec))], op: 'cortar' };
}

// linha da rosca (cosmética), no espaço da peça
export function roscaDoFuro(rec, vars) {
  const rosca = ROSCAS[rec.rosca];
  if (rec.estilo !== 'roscado' || !rosca) return null;
  const comp = rec.passante ? num(rec.profundidadeRosca, vars, 0) || 20 : Math.max(1, num(rec.profundidadeRosca, vars, 0) || num(rec.profundidade, vars, 10) * 0.85);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(helice(rosca.nominal / 2, rosca.passo, comp), 3));
  return g.applyMatrix4(matrizFuro(rec));
}

function geoPrimitiva(rec, ctx) {
  const tipo = PRIMITIVAS[rec.forma];
  if (!tipo) throw new Error(`primitiva desconhecida: ${rec.forma}`);
  const m = {};
  for (const [k, v] of Object.entries({ ...tipo.medidas, ...rec.m })) m[k] = Math.max(k === 'dentes' ? 6 : 0.1, num(v, ctx.vars, tipo.medidas[k]));
  const g = limpar(tipo.geo(m));
  const pos = (rec.pos || [0, 0, 0]).map((v) => num(v, ctx.vars, 0));
  const giro = new THREE.Euler(...(rec.rot || [0, rec.giro || 0, 0]).map((v) => THREE.MathUtils.degToRad(num(v, ctx.vars, 0))));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(giro), new THREE.Vector3(1, 1, 1)));
  return { geos: [g], op: rec.operacao || (rec.forma === 'rasgo' ? 'cortar' : 'juntar') };
}

// cópias de um recurso (padrão e espelho) aplicam a mesma operação dele
function copias(rec, ctx, matrizes) {
  const alvo = ctx.porId[rec.alvo];
  if (!alvo) throw new Error('o recurso de origem não existe mais');
  const original = ctx.geoDe(alvo);
  const geos = [];
  for (const m of matrizes) for (const g of original.geos) geos.push(transformar(g, m));
  return { geos, op: original.op, matrizes, origem: alvo.id };
}

const EIXOS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

function geoPadraoRet(rec, ctx) {
  const n1 = Math.max(1, Math.round(num(rec.n1, ctx.vars, 3)));
  const n2 = Math.max(1, Math.round(num(rec.n2, ctx.vars, 1)));
  const d1 = num(rec.d1, ctx.vars, 20);
  const d2 = num(rec.d2, ctx.vars, 20);
  const e1 = EIXOS[rec.dir1] || EIXOS.x;
  const e2 = EIXOS[rec.dir2] || EIXOS.z;
  const ms = [];
  for (let i = 0; i < n1; i++) {
    for (let j = 0; j < n2; j++) {
      if (!i && !j) continue;
      ms.push(new THREE.Matrix4().makeTranslation(e1.clone().multiplyScalar(i * d1).addScaledVector(e2, j * d2)));
    }
  }
  return copias(rec, ctx, ms);
}

function geoPadraoCirc(rec, ctx) {
  const n = Math.max(2, Math.round(num(rec.n, ctx.vars, 6)));
  const total = num(rec.angulo, ctx.vars, 360);
  const passo = THREE.MathUtils.degToRad(Math.abs(total - 360) < 1e-6 ? 360 / n : total / Math.max(1, n - 1));
  const eixo = EIXOS[rec.eixo] || EIXOS.y;
  const centro = new THREE.Vector3(...(rec.centro || [0, 0, 0]).map((v) => num(v, ctx.vars, 0)));
  const ms = [];
  for (let i = 1; i < n; i++) {
    ms.push(new THREE.Matrix4().makeTranslation(centro).multiply(new THREE.Matrix4().makeRotationAxis(eixo, passo * i)).multiply(new THREE.Matrix4().makeTranslation(centro.clone().negate())));
  }
  return copias(rec, ctx, ms);
}

function geoEspelhar(rec, ctx) {
  const escala = { yz: [-1, 1, 1], xy: [1, 1, -1], xz: [1, -1, 1] }[rec.plano || 'yz'] || [-1, 1, 1];
  const desloc = num(rec.desloc, ctx.vars, 0);
  const m = new THREE.Matrix4().makeScale(...escala);
  if (desloc) {
    const t = new THREE.Vector3(...escala.map((s) => (s < 0 ? 2 * desloc : 0)));
    m.premultiply(new THREE.Matrix4().makeTranslation(t));
  }
  return copias(rec, ctx, [m]);
}

// casca: esvazia o primeiro corpo deixando paredes com a espessura dada e a face de cima aberta
function geoCasca(rec, ctx) {
  const t = Math.max(0.2, num(rec.espessura, ctx.vars, 2));
  const baseRec = ctx.recursos.find((r) => !r.suprimido && (r.tipo === 'extrusao' || r.tipo === 'primitiva') && (r.operacao || 'juntar') === 'juntar');
  if (!baseRec) throw new Error('a casca precisa de um corpo feito por extrusão ou primitiva');
  const aberta = rec.face !== 'fechada';
  if (baseRec.tipo === 'primitiva') {
    const m = {};
    const tipo = PRIMITIVAS[baseRec.forma];
    for (const [k, v] of Object.entries({ ...tipo.medidas, ...baseRec.m })) m[k] = num(v, ctx.vars, tipo.medidas[k]);
    let g;
    const alt = (m.altura || m.espessura || 20) - t + (aberta ? 1 : -t);
    if (baseRec.forma === 'bloco') g = new THREE.BoxGeometry(m.largura - 2 * t, alt, m.profundidade - 2 * t).translate(0, t + alt / 2, 0);
    else if (baseRec.forma === 'cilindro' || baseRec.forma === 'tubo') g = new THREE.CylinderGeometry(m.diametro / 2 - t, m.diametro / 2 - t, alt, 72).translate(0, t + alt / 2, 0);
    else if (baseRec.forma === 'esfera') g = new THREE.SphereGeometry(m.diametro / 2 - t, 48, 32).translate(0, m.diametro / 2, 0);
    else throw new Error(`não sei fazer casca de ${tipo.nome.toLowerCase()}`);
    g = limpar(g);
    const pos = (baseRec.pos || [0, 0, 0]).map((v) => num(v, ctx.vars, 0));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(num(baseRec.giro || 0, ctx.vars, 0)), 0)), new THREE.Vector3(1, 1, 1)));
    return { geos: [g], op: 'cortar' };
  }
  const esb = ctx.esbocos[baseRec.esboco];
  const lacos = lacosDoEsboco(esb).map((l) => deslocarContorno(areaAssinada(l) < 0 ? [...l].reverse() : l, -t));
  const formas = formasDosLacos(lacos);
  if (!formas.length) throw new Error('a parede ficou mais grossa que a peça');
  const base = basePlano(esb.plano);
  const d = Math.max(0.1, num(baseRec.distancia, ctx.vars, 10));
  const sinal = baseRec.direcao === 'inversa' ? -1 : 1;
  const ini = baseRec.direcao === 'simetrica' ? -d / 2 : sinal < 0 ? -d : 0;
  const alt = d - t + (aberta ? 1 : -t);
  const z0 = sinal < 0 ? ini - (aberta ? 1 : -t) : ini + t;
  const g = new THREE.ExtrudeGeometry(formas, { depth: alt, bevelEnabled: false, curveSegments: 48 }).translate(0, 0, z0).applyMatrix4(base.matriz);
  return { geos: [g], op: 'cortar' };
}

export const GERADORES = {
  extrusao: geoExtrusao, revolucao: geoRevolucao, furo: geoFuro, primitiva: geoPrimitiva,
  padrao_ret: geoPadraoRet, padrao_circ: geoPadraoCirc, espelhar: geoEspelhar, casca: geoCasca,
};

// ---------------- biblioteca de peças prontas ----------------
const ISO = {
  M3: { s: 5.5, k: 2, m: 2.4, d1: 3.2, d2: 7, h: 0.5 },
  M4: { s: 7, k: 2.8, m: 3.2, d1: 4.3, d2: 9, h: 0.8 },
  M5: { s: 8, k: 3.5, m: 4.7, d1: 5.3, d2: 10, h: 1 },
  M6: { s: 10, k: 4, m: 5.2, d1: 6.4, d2: 12, h: 1.6 },
  M8: { s: 13, k: 5.3, m: 6.8, d1: 8.4, d2: 16, h: 1.6 },
  M10: { s: 16, k: 6.4, m: 8.4, d1: 10.5, d2: 20, h: 2 },
  M12: { s: 18, k: 7.5, m: 10.8, d1: 13, d2: 24, h: 2.5 },
};
const ROLAMENTOS = { 608: [8, 22, 7], 6000: [10, 26, 8], 6200: [10, 30, 9], 6201: [12, 32, 10], 6202: [15, 35, 11] };

export const BIBLIOTECA = {
  parafuso: { nome: 'PARAFUSO SEXTAVADO', icone: '⛭', tamanhos: Object.keys(ISO), comprimento: true },
  porca: { nome: 'PORCA SEXTAVADA', icone: '⬡', tamanhos: Object.keys(ISO) },
  arruela: { nome: 'ARRUELA LISA', icone: '◎', tamanhos: Object.keys(ISO) },
  rolamento: { nome: 'ROLAMENTO', icone: '◉', tamanhos: Object.keys(ROLAMENTOS) },
  perfil: { nome: 'PERFIL 20×20', icone: '▣', tamanhos: ['20x20'], comprimento: true },
};

const prisma6 = (s, h) => new THREE.CylinderGeometry(s / Math.sqrt(3), s / Math.sqrt(3), h, 6).rotateY(Math.PI / 6);

// peça da biblioteca: partes (geometria + material), eixo (local) e nome
export function pecaBiblioteca(tipo, tamanho, comprimento) {
  if (tipo === 'parafuso') {
    const t = ISO[tamanho] || ISO.M8;
    const d = ROSCAS[tamanho]?.nominal || 8;
    const L = Math.max(4, comprimento || (d <= 6 ? 20 : 30));
    const cabeca = prisma6(t.s, t.k).translate(0, L + t.k / 2, 0);
    const corpo = new THREE.CylinderGeometry(d / 2, d / 2, L, 32).translate(0, L / 2, 0);
    const rosca = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(helice(d / 2 + 0.02, ROSCAS[tamanho]?.passo || 1.25, Math.min(L, 2 * d + 6)), 3));
    rosca.translate(0, Math.min(L, 2 * d + 6), 0);
    return { nome: `Parafuso ${tamanho}×${L}`, partes: [limpar(cabeca), limpar(corpo)], linhas: [rosca], eixos: [{ p: [0, 0, 0], d: [0, 1, 0] }], material: 'aco' };
  }
  if (tipo === 'porca') {
    const t = ISO[tamanho] || ISO.M8;
    const d = ROSCAS[tamanho]?.nominal || 8;
    const corpo = new THREE.LatheGeometry([[d / 2, 0], [t.s / Math.sqrt(3), 0], [t.s / Math.sqrt(3), t.m], [d / 2, t.m], [d / 2, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 6).rotateY(Math.PI / 6);
    return { nome: `Porca ${tamanho}`, partes: [limpar(corpo)], linhas: [], eixos: [{ p: [0, 0, 0], d: [0, 1, 0] }], material: 'aco' };
  }
  if (tipo === 'arruela') {
    const t = ISO[tamanho] || ISO.M8;
    const corpo = new THREE.LatheGeometry([[t.d1 / 2, 0], [t.d2 / 2, 0], [t.d2 / 2, t.h], [t.d1 / 2, t.h], [t.d1 / 2, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 48);
    return { nome: `Arruela ${tamanho}`, partes: [limpar(corpo)], linhas: [], eixos: [{ p: [0, 0, 0], d: [0, 1, 0] }], material: 'aco' };
  }
  if (tipo === 'rolamento') {
    const [di, de, b] = ROLAMENTOS[tamanho] || ROLAMENTOS[608];
    const ri = di / 2;
    const re = de / 2;
    const meio = (ri + re) / 2;
    const folga = (re - ri) * 0.18;
    const anel = (a, c) => new THREE.LatheGeometry([[a, 0], [c, 0], [c, b], [a, b], [a, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 48);
    const interno = anel(ri, meio - folga);
    const externo = anel(meio + folga, re);
    const vedacao = anel(meio - folga, meio + folga).scale(1, 0.12, 1).translate(0, b * 0.84, 0);
    const n = Math.max(7, Math.round((Math.PI * 2 * meio) / (folga * 2.6)));
    const esferas = Array.from({ length: n }, (_, i) => new THREE.SphereGeometry(folga * 1.05, 12, 8).translate(Math.cos((i / n) * Math.PI * 2) * meio, b / 2, Math.sin((i / n) * Math.PI * 2) * meio));
    return {
      nome: `Rolamento ${tamanho} (${di}×${de}×${b})`, partes: [limpar(interno), limpar(externo), limpar(mergeGeometries(esferas.map(limpar))), limpar(vedacao)],
      linhas: [], eixos: [{ p: [0, 0, 0], d: [0, 1, 0] }], material: 'aco', cores: [null, null, '#d8dde2', '#1d2328'],
    };
  }
  // perfil estrutural 20×20 com rasgos em T nos quatro lados e furo central
  const L = Math.max(10, comprimento || 100);
  const forma = new THREE.Shape();
  const contorno = [];
  const lado = (ang) => {
    const pts = [[-10, -10], [-3.1, -10], [-3.1, -8.2], [-5.5, -6.2], [5.5, -6.2], [3.1, -8.2], [3.1, -10]];
    return pts.map(([x, y]) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)]);
  };
  for (let k = 0; k < 4; k++) contorno.push(...lado((k * Math.PI) / 2));
  contorno.forEach(([x, y], i) => (i ? forma.lineTo(x, y) : forma.moveTo(x, y)));
  forma.closePath();
  const furo = new THREE.Path();
  furo.absarc(0, 0, 2.1, 0, Math.PI * 2, true);
  forma.holes.push(furo);
  const g = new THREE.ExtrudeGeometry(forma, { depth: L, bevelEnabled: false, curveSegments: 24 }).rotateX(-Math.PI / 2);
  return { nome: `Perfil 20×20 × ${L}`, partes: [limpar(g)], linhas: [], eixos: [{ p: [0, 0, 0], d: [0, 1, 0] }], material: 'aluminio' };
}

// ---------------- traço livre → forma perfeita ----------------
function simplificar(pts, tol) {
  if (pts.length < 3) return pts;
  let maior = 0;
  let idx = 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const ab = b.clone().sub(a);
  const len = ab.length() || 1e-6;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(ab.x * (a.y - pts[i].y) - ab.y * (a.x - pts[i].x)) / len;
    if (d > maior) {
      maior = d;
      idx = i;
    }
  }
  if (maior <= tol) return [a, b];
  return [...simplificar(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplificar(pts.slice(idx), tol)];
}

// pontos (u, v) em mm → { tipo, entidades }
export function reconhecerTraco(pontos, passo = 5) {
  const pts = pontos.map((p) => V2(p));
  if (pts.length < 4) return null;
  let comprimento = 0;
  for (let i = 1; i < pts.length; i++) comprimento += pts[i].distanceTo(pts[i - 1]);
  if (comprimento < passo * 1.5) return null;
  const caixa = new THREE.Box2().setFromPoints(pts);
  const tam = caixa.getSize(new THREE.Vector2());
  const enc = (n) => Math.round(n / passo) * passo;
  const fechado = pts[0].distanceTo(pts[pts.length - 1]) < Math.max(comprimento * 0.18, passo);
  if (!fechado) {
    const s = simplificar(pts, Math.max(1.5, comprimento * 0.06));
    const linhas = [];
    for (let i = 1; i < s.length; i++) {
      const a = [enc(s[i - 1].x), enc(s[i - 1].y)];
      const b = [enc(s[i].x), enc(s[i].y)];
      if (Math.abs(a[0] - b[0]) < passo * 0.6) b[0] = a[0];
      if (Math.abs(a[1] - b[1]) < passo * 0.6) b[1] = a[1];
      if (a[0] !== b[0] || a[1] !== b[1]) linhas.push({ t: 'linha', a, b });
    }
    for (let i = 1; i < linhas.length; i++) linhas[i].a = [...linhas[i - 1].b];
    return linhas.length ? { tipo: linhas.length === 1 ? 'linha' : 'polilinha', ents: linhas } : null;
  }
  const centro = pts.reduce((s, p) => s.add(p), new THREE.Vector2()).divideScalar(pts.length);
  const raios = pts.map((p) => p.distanceTo(centro));
  const media = raios.reduce((s, r) => s + r, 0) / raios.length;
  const desvio = Math.sqrt(raios.reduce((s, r) => s + (r - media) ** 2, 0) / raios.length) / media;
  const s = simplificar([...pts, pts[0]], Math.max(2, comprimento * 0.05));
  const cantos = s.length - 1;
  if (desvio < 0.11 && cantos > 4) {
    return { tipo: 'circulo', ents: [{ t: 'circ', c: [enc(centro.x), enc(centro.y)], r: Math.max(passo / 2, enc(media * 2) / 2) }] };
  }
  if (cantos <= 5) {
    const a = [enc(caixa.min.x), enc(caixa.min.y)];
    const b = [enc(caixa.max.x), enc(caixa.max.y)];
    if (a[0] === b[0]) b[0] += passo;
    if (a[1] === b[1]) b[1] += passo;
    if (cantos === 3) {
      const tri = s.slice(0, 3).map((p) => [enc(p.x), enc(p.y)]);
      return { tipo: 'triangulo', ents: tri.map((p, i) => ({ t: 'linha', a: p, b: tri[(i + 1) % 3] })) };
    }
    void tam;
    return { tipo: 'retangulo', ents: [{ t: 'ret', a, b }] };
  }
  const poli = s.slice(0, -1).map((p) => [enc(p.x), enc(p.y)]);
  return { tipo: 'poligono', ents: poli.map((p, i) => ({ t: 'linha', a: p, b: poli[(i + 1) % poli.length] })) };
}

// ---------------- descrição curta de cada recurso (árvore e voz) ----------------
const fmt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(+n.toFixed(2)).replace('.', ',') : String(v);
};
export function resumoRecurso(r, esbocos = {}) {
  if (r.tipo === 'esboco') {
    const n = (r.ents || []).length;
    return `${n} ${n === 1 ? 'entidade' : 'entidades'}`;
  }
  if (r.tipo === 'extrusao') {
    const fim = r.fim === 'passante' ? 'passante' : r.fim === 'face' ? 'até a face' : `${fmt(r.distancia)} mm`;
    return `${fim}${r.operacao === 'cortar' ? ' · corte' : r.operacao === 'intersecao' ? ' · interseção' : ''}`;
  }
  if (r.tipo === 'revolucao') return `${fmt(r.angulo)}°${r.operacao === 'cortar' ? ' · corte' : ''}`;
  if (r.tipo === 'furo') {
    const base = r.estilo === 'roscado' ? `${r.rosca} roscado` : `Ø${fmt(r.diametro)}${r.estilo === 'escareado' ? ' escareado' : r.estilo === 'rebaixado' ? ' rebaixado' : ''}`;
    return `${base} · ${r.passante ? 'passante' : `${fmt(r.profundidade)} mm`}`;
  }
  if (r.tipo === 'primitiva') return `${PRIMITIVAS[r.forma]?.nome.toLowerCase() || r.forma} ${Object.values(r.m || {}).map(fmt).join('×')}`;
  if (r.tipo === 'arredondar') return `R${fmt(r.raio)} · ${r.arestas || 'todas'}`;
  if (r.tipo === 'chanfro') return `${fmt(r.raio)} mm · ${r.arestas || 'todas'}`;
  if (r.tipo === 'padrao_ret') return `${fmt(r.n1)}×${fmt(r.n2)} · ${fmt(r.d1)}/${fmt(r.d2)} mm`;
  if (r.tipo === 'padrao_circ') return `${fmt(r.n)}× em ${fmt(r.angulo)}°`;
  if (r.tipo === 'espelhar') return `plano ${String(r.plano || 'yz').toUpperCase()}`;
  if (r.tipo === 'casca') return `parede ${fmt(r.espessura)} mm`;
  void esbocos;
  return '';
}

export const ICONES = {
  esboco: '▱', extrusao: '⇧', revolucao: '↻', furo: '⊙', primitiva: '◇', arredondar: '◜', chanfro: '◸',
  padrao_ret: '⁙', padrao_circ: '⁂', espelhar: '⇋', casca: '▢',
};
export const NOMES_TIPO = {
  esboco: 'Esboço', extrusao: 'Extrusão', revolucao: 'Revolução', furo: 'Furo', primitiva: 'Primitiva', arredondar: 'Arredondar',
  chanfro: 'Chanfro', padrao_ret: 'Padrão retangular', padrao_circ: 'Padrão circular', espelhar: 'Espelhar', casca: 'Casca',
};

// ---------------- arestas de verdade (sem as diagonais da triangulação) ----------------
// As operações booleanas deixam "junções em T": uma aresta de um triângulo encosta no meio da
// aresta do vizinho. O EdgesGeometry desenha essas arestas soltas como se fossem quinas. Aqui elas
// são pareadas pela reta em que estão; se os dois lados forem coplanares, a aresta não aparece.
export function arestasLimpas(geo, anguloGraus = 28) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const n = idx ? idx.count : pos.count;
  const limite = Math.cos(THREE.MathUtils.degToRad(anguloGraus));
  const chaveV = (v) => `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
  const arestas = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const v = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k));
    a.copy(v[0]);
    b.copy(v[1]);
    c.copy(v[2]);
    normal.subVectors(c, b).cross(a.clone().sub(b));
    if (normal.lengthSq() < 1e-12) continue;
    normal.normalize();
    for (let k = 0; k < 3; k++) {
      const p = v[k];
      const q = v[(k + 1) % 3];
      const kp = chaveV(p);
      const kq = chaveV(q);
      if (kp === kq) continue;
      const chave = kp < kq ? `${kp}|${kq}` : `${kq}|${kp}`;
      const e = arestas.get(chave);
      if (e) e.normais.push(normal.clone());
      else arestas.set(chave, { p, q, normais: [normal.clone()] });
    }
  }
  const saida = [];
  const soltas = [];
  for (const e of arestas.values()) {
    if (e.normais.length === 2) {
      if (e.normais[0].dot(e.normais[1]) < limite) saida.push(e.p, e.q);
    } else if (e.normais.length === 1) {
      soltas.push(e);
    } else {
      saida.push(e.p, e.q);
    }
  }
  // arestas soltas: agrupa pela reta (direção sem sinal + ponto mais perto da origem)
  const retas = new Map();
  for (const e of soltas) {
    const d = e.q.clone().sub(e.p).normalize();
    const s = Math.abs(d.x) > 1e-6 ? Math.sign(d.x) : Math.abs(d.y) > 1e-6 ? Math.sign(d.y) : Math.sign(d.z);
    d.multiplyScalar(s);
    const p0 = e.p.clone().sub(d.clone().multiplyScalar(e.p.dot(d)));
    const chave = `${Math.round(d.x * 500)},${Math.round(d.y * 500)},${Math.round(d.z * 500)}|${Math.round(p0.x * 50)},${Math.round(p0.y * 50)},${Math.round(p0.z * 50)}`;
    const t0 = e.p.dot(d);
    const t1 = e.q.dot(d);
    e.ini = Math.min(t0, t1);
    e.fim = Math.max(t0, t1);
    e.sentido = Math.sign(t1 - t0);
    if (!retas.has(chave)) retas.set(chave, []);
    retas.get(chave).push(e);
  }
  for (const lista of retas.values()) {
    for (const e of lista) {
      let suave = false;
      for (const f of lista) {
        if (f === e || f.sentido === e.sentido) continue;
        if (Math.min(e.fim, f.fim) - Math.max(e.ini, f.ini) < 1e-4) continue;
        if (e.normais[0].dot(f.normais[0]) >= limite) {
          suave = true;
          break;
        }
      }
      if (!suave) saida.push(e.p, e.q);
    }
  }
  return new THREE.BufferGeometry().setFromPoints(saida);
}
