/*
 * holo-cad.js — a oficina do laboratório holográfico (holo.js): projetar peças 3D com as mãos,
 * como num programa de CAD.
 *
 * A peça é uma lista de recursos em milímetros (bloco, cilindro, tubo, esfera, cone, sextavado,
 * engrenagem, e os que tiram material: furo e rasgo). Com a pinça você desenha o recurso na mesa
 * (arrastar define o tamanho, com encaixe de 1, 5 ou 10 mm) ou pega um recurso e arrasta; as
 * medidas também podem ser digitadas ou ajustadas nos botões − e +. Os furos e rasgos são feitos
 * com operações booleanas de verdade (three-bvh-csg, carregada só quando a oficina abre).
 * Mostra cotas, volume e massa, salva no navegador e exporta STL para impressão 3D.
 */
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const CHAVE = 'jarvis.peca';
const RAIO_GRADE = 80;   // mm
const ROTULO = { largura: 'LARGURA', profundidade: 'PROFUND.', altura: 'ALTURA', diametro: 'DIÂMETRO', interno: 'Ø INTERNO', base: 'Ø BASE', topo: 'Ø TOPO', dentes: 'DENTES', espessura: 'ESPESSURA', furo: 'Ø FURO', profundidadeFuro: 'PROFUND.', comprimento: 'COMPRIM.' };

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

export const TIPOS = {
  bloco: { nome: 'BLOCO', icone: '▭', soma: true, redondo: false, medidas: { largura: 40, profundidade: 30, altura: 20 },
    geo: (m) => new THREE.BoxGeometry(m.largura, m.altura, m.profundidade).translate(0, m.altura / 2, 0) },
  cilindro: { nome: 'CILINDRO', icone: '◯', soma: true, redondo: true, medidas: { diametro: 30, altura: 20 },
    geo: (m) => new THREE.CylinderGeometry(m.diametro / 2, m.diametro / 2, m.altura, 72).translate(0, m.altura / 2, 0) },
  tubo: { nome: 'TUBO', icone: '◎', soma: true, redondo: true, medidas: { diametro: 40, interno: 28, altura: 20 }, geo: geoTubo },
  esfera: { nome: 'ESFERA', icone: '●', soma: true, redondo: true, medidas: { diametro: 30 },
    geo: (m) => new THREE.SphereGeometry(m.diametro / 2, 48, 32).translate(0, m.diametro / 2, 0) },
  cone: { nome: 'CONE', icone: '△', soma: true, redondo: true, medidas: { base: 30, topo: 8, altura: 30 },
    geo: (m) => new THREE.CylinderGeometry(Math.max(0.01, m.topo / 2), m.base / 2, m.altura, 72).translate(0, m.altura / 2, 0) },
  sextavado: { nome: 'SEXTAVADO', icone: '⬡', soma: true, redondo: true, medidas: { largura: 24, altura: 10 },
    geo: (m) => new THREE.CylinderGeometry(m.largura / Math.sqrt(3), m.largura / Math.sqrt(3), m.altura, 6).translate(0, m.altura / 2, 0) },
  engrenagem: { nome: 'ENGRENAGEM', icone: '⚙', soma: true, redondo: true, medidas: { diametro: 50, dentes: 18, espessura: 8, furo: 8 }, geo: geoEngrenagem },
  furo: { nome: 'FURO', icone: '⊙', soma: false, redondo: true, medidas: { diametro: 8, profundidadeFuro: 30 },
    geo: (m) => new THREE.CylinderGeometry(m.diametro / 2, m.diametro / 2, m.profundidadeFuro + 0.4, 48).translate(0, -m.profundidadeFuro / 2 + 0.2, 0) },
  rasgo: { nome: 'RASGO', icone: '▬', soma: false, redondo: false, medidas: { comprimento: 30, largura: 8, profundidadeFuro: 5 },
    geo: (m) => new THREE.BoxGeometry(m.comprimento, m.profundidadeFuro + 0.4, m.largura).translate(0, -m.profundidadeFuro / 2 + 0.2, 0) },
};

const resumoRecurso = (r) => {
  const m = r.m;
  const t = TIPOS[r.tipo];
  if (r.tipo === 'bloco') return `${m.largura}×${m.profundidade}×${m.altura}`;
  if (r.tipo === 'engrenagem') return `Ø${m.diametro} · ${m.dentes} dentes`;
  if (r.tipo === 'rasgo') return `${m.comprimento}×${m.largura}×${m.profundidadeFuro}`;
  if (r.tipo === 'furo') return `Ø${m.diametro} × ${m.profundidadeFuro}`;
  if (r.tipo === 'sextavado') return `${m.largura} × ${m.altura}`;
  if (r.tipo === 'cone') return `Ø${m.base}→Ø${m.topo} × ${m.altura}`;
  return Object.values(m).join(' × ') + (t.redondo ? '' : '');
};

const CSS = `
.holo-oficina[hidden]{ display:none; }
.holo-oficina .holo-caixa{ max-height:calc(100vh - 120px); overflow-y:auto; scrollbar-width:thin; scrollbar-color:rgba(77,232,240,0.35) transparent; display:flex; flex-direction:column; gap:7px; }
.holo-oficina h3{ margin:4px 0 0; font-family:'Share Tech Mono',monospace; font-size:9.5px; letter-spacing:2.5px; color:#5f8791; font-weight:400; }
.holo-of-ferramentas{ display:grid; grid-template-columns:repeat(5, 1fr); gap:4px; }
.holo-of-ferramentas button{ min-height:40px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; padding:3px 0;
  background:rgba(2,10,16,0.6); border:1px solid rgba(77,232,240,0.16); border-radius:3px; color:#a9c6cd; cursor:pointer; transition:all .2s;
  font-family:'Share Tech Mono',monospace; font-size:7.5px; letter-spacing:.5px; }
.holo-of-ferramentas button b{ font-size:15px; font-weight:400; color:#8ff3f7; line-height:1; }
.holo-of-ferramentas button.menos b{ color:#ffa24c; }
.holo-of-ferramentas button:hover, .holo-of-ferramentas button.mirado{ border-color:rgba(77,232,240,0.6); color:#e9f7f9; }
.holo-of-ferramentas button.ativo{ border-color:#4de8f0; color:#e9f7f9; box-shadow:0 0 14px rgba(77,232,240,0.3) inset; }
.holo-of-linha{ display:grid; grid-template-columns:1fr 30px 62px 30px; gap:4px; align-items:center; font-family:'Share Tech Mono',monospace; font-size:10px; color:#a9c6cd; letter-spacing:1px; }
.holo-of-linha button{ height:28px; background:rgba(2,10,16,0.7); border:1px solid rgba(77,232,240,0.25); border-radius:3px; color:#8ff3f7; cursor:pointer; font-size:15px; line-height:1; }
.holo-of-linha button:hover, .holo-of-linha button.mirado{ background:rgba(77,232,240,0.16); border-color:#4de8f0; }
.holo-of-linha input{ width:100%; height:28px; box-sizing:border-box; background:rgba(0,6,10,0.75); border:1px solid rgba(77,232,240,0.3); border-radius:3px;
  color:#e9f7f9; font-family:'Share Tech Mono',monospace; font-size:12px; text-align:center; -moz-appearance:textfield; }
.holo-of-linha input::-webkit-inner-spin-button{ -webkit-appearance:none; }
.holo-of-linha input:focus{ outline:none; border-color:#4de8f0; box-shadow:0 0 10px rgba(77,232,240,0.35); }
.holo-of-passos{ display:flex; gap:4px; align-items:center; font-family:'Share Tech Mono',monospace; font-size:9.5px; color:#5f8791; letter-spacing:1.5px; }
.holo-of-passos button{ flex:1; height:26px; background:rgba(2,10,16,0.6); border:1px solid rgba(77,232,240,0.16); border-radius:3px; color:#a9c6cd; cursor:pointer; font-family:inherit; font-size:10px; }
.holo-of-passos button.ativo{ border-color:#4de8f0; color:#01060a; background:#4de8f0; }
.holo-of-historico{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:3px; max-height:132px; overflow-y:auto; }
.holo-of-historico button{ width:100%; display:flex; justify-content:space-between; gap:8px; padding:5px 8px; background:rgba(2,10,16,0.55); border:1px solid rgba(77,232,240,0.12);
  border-radius:3px; color:#a9c6cd; cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:1px; text-align:left; }
.holo-of-historico button.ativo{ border-color:#ffa24c; color:#fff; box-shadow:0 0 12px rgba(255,162,76,0.25) inset; }
.holo-of-historico button.menos span:first-child{ color:#ffa24c; }
.holo-of-dica{ margin:0; font-size:12px; line-height:1.3; color:#8ff3f7; }
.holo-cotas{ position:absolute; inset:0; z-index:1; pointer-events:none; overflow:hidden; }
.holo-cota{ position:absolute; left:0; top:0; transform-origin:0 0; padding:2px 6px; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:1px; color:#01060a;
  background:#ffa24c; border-radius:2px; white-space:nowrap; box-shadow:0 0 12px rgba(255,162,76,0.5); will-change:transform; }
.holo-cota.tamanho{ background:#5dfca0; box-shadow:0 0 12px rgba(93,252,160,0.5); }
`;

export function criarOficina({ cena, raiz, som, aoEvento }) {
  if (!document.getElementById('holo-oficina-estilo')) {
    const estilo = document.createElement('style');
    estilo.id = 'holo-oficina-estilo';
    estilo.textContent = CSS;
    document.head.append(estilo);
  }
  const grupo = new THREE.Group();
  // a bancada flutua acima da mesa de projeção, na altura dos olhos
  grupo.position.y = -1.35;
  grupo.visible = false;
  cena.add(grupo);
  const peca = new THREE.Group();   // tudo em milímetros; o grupo de cima ajusta a escala
  grupo.add(peca);

  // ---------- materiais ----------
  const mat = {
    holo: new THREE.MeshBasicMaterial({ color: '#4de8f0', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    real: new THREE.MeshPhysicalMaterial({ color: '#b9c3cd', metalness: 1, roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.2 }),
    arestaHolo: new THREE.LineBasicMaterial({ color: new THREE.Color('#8ff3f7').multiplyScalar(1.4), transparent: true, opacity: 0.95, toneMapped: false }),
    arestaReal: new THREE.LineBasicMaterial({ color: '#1c2228', transparent: true, opacity: 0.16 }),
    menos: new THREE.MeshBasicMaterial({ color: '#ffa24c', wireframe: true, transparent: true, opacity: 0.55, depthWrite: false }),
    fantasma: new THREE.LineBasicMaterial({ color: new THREE.Color('#ffa24c').multiplyScalar(1.5), transparent: true, opacity: 1, toneMapped: false, depthTest: false }),
    novo: new THREE.LineBasicMaterial({ color: new THREE.Color('#5dfca0').multiplyScalar(1.5), transparent: true, opacity: 1, toneMapped: false, depthTest: false }),
    cota: new THREE.LineBasicMaterial({ color: '#ffa24c', transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }),
    grade: new THREE.LineBasicMaterial({ color: '#4de8f0', transparent: true, opacity: 0.16, depthWrite: false }),
    gradeForte: new THREE.LineBasicMaterial({ color: '#4de8f0', transparent: true, opacity: 0.38, depthWrite: false }),
  };

  // ---------- grade em mm, recortada num círculo ----------
  const fraca = [];
  const forte = [];
  for (let x = -RAIO_GRADE; x <= RAIO_GRADE; x += 5) {
    const z = Math.sqrt(RAIO_GRADE * RAIO_GRADE - x * x);
    const alvoLista = x % 50 === 0 ? forte : x % 10 === 0 ? fraca : null;
    if (!alvoLista) continue;
    alvoLista.push(x, 0, -z, x, 0, z, -z, 0, x, z, 0, x);
  }
  const linhas = (pts, m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, m);
  };
  const grade = new THREE.Group();
  grade.add(linhas(fraca, mat.grade), linhas(forte, mat.gradeForte));
  const eixos = new THREE.Group();
  eixos.add(linhas([0, 0.05, 0, 30, 0.05, 0], new THREE.LineBasicMaterial({ color: '#ff6b6b', toneMapped: false })),
    linhas([0, 0.05, 0, 0, 0.05, 30], new THREE.LineBasicMaterial({ color: '#6b9bff', toneMapped: false })),
    linhas([0, 0, 0, 0, 30, 0], new THREE.LineBasicMaterial({ color: '#6bff9b', toneMapped: false })));
  grade.add(eixos);
  peca.add(grade);

  const solido = new THREE.Mesh(new THREE.BufferGeometry(), mat.holo);
  const arestas = new THREE.LineSegments(new THREE.BufferGeometry(), mat.arestaHolo);
  const fantasma = new THREE.LineSegments(new THREE.BufferGeometry(), mat.fantasma);
  fantasma.renderOrder = 5;
  const cotas3d = new THREE.LineSegments(new THREE.BufferGeometry(), mat.cota);
  cotas3d.renderOrder = 5;
  peca.add(solido, arestas, fantasma, cotas3d);
  const separados = new THREE.Group();   // enquanto a biblioteca booleana não chega
  peca.add(separados);

  const estado = {
    recursos: [], selecionado: null, ferramenta: 'bloco', passo: 5, real: false,
    defaults: Object.fromEntries(Object.entries(TIPOS).map(([k, t]) => [k, { ...t.medidas }])),
    arraste: null, gestoAntes: 'nenhum', desfazer: [], escalaVista: 0.04, zoom: 1, info: null, proximoId: 1,
  };
  let csg = null;
  let carregandoCsg = null;
  const carregarCsg = () => {
    carregandoCsg ||= import('three-bvh-csg').then((m) => {
      csg = { ...m, avaliador: new m.Evaluator() };
      csg.avaliador.attributes = ['position', 'normal'];
      csg.avaliador.useGroups = false;
      recalcular();
    }).catch((erro) => {
      console.warn('Oficina: operações booleanas indisponíveis', erro);
    });
    return carregandoCsg;
  };

  // ---------- geometria da peça ----------
  function geoDoRecurso(r) {
    const g = TIPOS[r.tipo].geo(r.m);
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...r.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(r.giro || 0), 0)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    return g;
  }

  function recalcular() {
    separados.clear();
    let geometria = null;
    if (csg) {
      let resultado = null;
      for (const r of estado.recursos) {
        const pincel = new csg.Brush(geoDoRecurso(r));
        pincel.updateMatrixWorld();
        if (!resultado) {
          if (TIPOS[r.tipo].soma) resultado = pincel;
          continue;
        }
        try {
          resultado = csg.avaliador.evaluate(resultado, pincel, TIPOS[r.tipo].soma ? csg.ADDITION : csg.SUBTRACTION);
        } catch (erro) {
          console.warn('Oficina: recurso ignorado', erro);
        }
      }
      geometria = resultado ? resultado.geometry.clone() : null;
    } else {
      for (const r of estado.recursos) {
        const malha = new THREE.Mesh(geoDoRecurso(r), TIPOS[r.tipo].soma ? solido.material : mat.menos);
        separados.add(malha);
      }
    }
    solido.geometry.dispose();
    arestas.geometry.dispose();
    solido.geometry = geometria || new THREE.BufferGeometry();
    arestas.geometry = geometria ? new THREE.EdgesGeometry(geometria, 24) : new THREE.BufferGeometry();
    // dimensões, volume e massa
    const caixa = new THREE.Box3();
    if (geometria) {
      geometria.computeBoundingBox();
      caixa.copy(geometria.boundingBox);
    } else {
      for (const r of estado.recursos) {
        const g = geoDoRecurso(r);
        g.computeBoundingBox();
        caixa.union(g.boundingBox);
      }
    }
    const tam = caixa.isEmpty() ? new THREE.Vector3() : caixa.getSize(new THREE.Vector3());
    let volume = 0;
    if (geometria && csg?.computeMeshVolume) volume = Math.abs(csg.computeMeshVolume(new THREE.Mesh(geometria)));
    estado.info = { tam, volume, triangulos: geometria ? Math.round((geometria.index ? geometria.index.count : geometria.attributes.position.count) / 3) : 0 };
    const maior = Math.max(80, tam.x, tam.z, tam.y * 1.4);
    estado.escalaAlvo = 3.9 / maior;
    desenharSelecao();
  }

  // ---------- seleção, fantasma e cotas ----------
  const cotasDom = document.createElement('div');
  cotasDom.className = 'holo-cotas';
  raiz.append(cotasDom);
  let cotas = [];   // { ponto (mm), texto, classe }

  function desenharSelecao(previa = null) {
    const r = previa || estado.recursos.find((x) => x.id === estado.selecionado);
    fantasma.geometry.dispose();
    cotas3d.geometry.dispose();
    cotas = [];
    if (!r) {
      fantasma.geometry = new THREE.BufferGeometry();
      cotas3d.geometry = new THREE.BufferGeometry();
      cotasDom.replaceChildren();
      return;
    }
    const g = geoDoRecurso(r);
    fantasma.geometry = new THREE.EdgesGeometry(g, 24);
    fantasma.material = previa ? mat.novo : mat.fantasma;
    g.computeBoundingBox();
    const b = g.boundingBox;
    const t = TIPOS[r.tipo];
    const d = 6;   // afastamento das linhas de cota, em mm
    const pts = [];
    const cota = (a, c, texto) => {
      pts.push(...a.toArray(), ...c.toArray());
      // tracinhos nas pontas
      const n = new THREE.Vector3().subVectors(c, a).normalize().cross(new THREE.Vector3(0, 1, 0));
      if (n.lengthSq() < 0.01) n.set(1, 0, 0);
      n.multiplyScalar(2);
      pts.push(...a.clone().add(n).toArray(), ...a.clone().sub(n).toArray(), ...c.clone().add(n).toArray(), ...c.clone().sub(n).toArray());
      cotas.push({ ponto: a.clone().add(c).multiplyScalar(0.5), texto, classe: previa ? 'tamanho' : '' });
    };
    const m = r.m;
    const yb = b.min.y;
    if (!t.redondo) {
      const larg = r.tipo === 'rasgo' ? m.comprimento : m.largura;
      const prof = r.tipo === 'rasgo' ? m.largura : m.profundidade;
      cota(new THREE.Vector3(b.min.x, yb, b.max.z + d), new THREE.Vector3(b.max.x, yb, b.max.z + d), `${larg} mm`);
      cota(new THREE.Vector3(b.max.x + d, yb, b.min.z), new THREE.Vector3(b.max.x + d, yb, b.max.z), `${prof} mm`);
    } else {
      const diam = m.diametro ?? m.largura ?? m.base;
      const cx = (b.min.x + b.max.x) / 2;
      const cz = (b.min.z + b.max.z) / 2;
      cota(new THREE.Vector3(cx - diam / 2, b.max.y + 1, cz), new THREE.Vector3(cx + diam / 2, b.max.y + 1, cz), `${r.tipo === 'sextavado' ? '' : 'Ø'}${diam} mm`);
    }
    const alt = m.altura ?? m.espessura ?? m.profundidadeFuro ?? m.diametro;
    cota(new THREE.Vector3(b.max.x + d, b.min.y, b.max.z + d), new THREE.Vector3(b.max.x + d, b.max.y, b.max.z + d), `${alt} mm`);
    const geoCota = new THREE.BufferGeometry();
    geoCota.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    cotas3d.geometry = geoCota;
    cotasDom.replaceChildren(...cotas.map((c) => {
      const el = document.createElement('div');
      el.className = `holo-cota ${c.classe}`;
      el.textContent = c.texto;
      c.el = el;
      return el;
    }));
  }

  // ---------- desfazer e guardar ----------
  const fotografar = () => JSON.stringify({ recursos: estado.recursos, proximoId: estado.proximoId });
  function marcar() {
    estado.desfazer.push(fotografar());
    if (estado.desfazer.length > 40) estado.desfazer.shift();
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ recursos: estado.recursos, proximoId: estado.proximoId, passo: estado.passo })); } catch {}
  }
  function carregar() {
    try {
      const dados = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      if (!dados?.recursos) return;
      estado.recursos = dados.recursos.filter((r) => TIPOS[r.tipo]).map((r) => ({ ...r, m: { ...TIPOS[r.tipo].medidas, ...r.m } }));
      estado.proximoId = dados.proximoId || estado.recursos.length + 1;
      estado.passo = [1, 5, 10].includes(dados.passo) ? dados.passo : 5;
    } catch {}
  }

  function adicionarRecurso(tipo, m = {}, pos = [0, 0, 0], giro = 0) {
    marcar();
    const r = { id: estado.proximoId++, tipo, m: { ...estado.defaults[tipo], ...m }, pos, giro };
    estado.recursos.push(r);
    estado.selecionado = r.id;
    recalcular();
    desenharPainel();
    salvar();
    aoEvento?.(`criou um ${TIPOS[tipo].nome.toLowerCase()} de ${resumoRecurso(r)} mm na oficina`);
    return r;
  }

  // ---------- painel ----------
  const painel = document.createElement('aside');
  painel.className = 'holo-lado holo-esq holo-oficina';
  painel.hidden = true;
  painel.innerHTML = `
    <section class="holo-caixa"><h2>OFICINA · PEÇA 3D</h2>
      <div class="holo-of-ferramentas" data-o="ferramentas"></div>
      <p class="holo-of-dica" data-o="dica"></p>
      <h3 data-o="tituloMedidas">MEDIDAS</h3>
      <div data-o="medidas" style="display:grid;gap:4px"></div>
      <div class="holo-of-passos">PASSO<button type="button" data-mira data-passo="1">1</button><button type="button" data-mira data-passo="5">5</button><button type="button" data-mira data-passo="10">10 mm</button></div>
      <h3>HISTÓRICO DA PEÇA</h3>
      <ol class="holo-of-historico" data-o="historico"></ol>
      <div class="holo-acoes">
        <button class="holo-btn" type="button" data-mira data-acao="desfazer">↶ DESFAZER</button>
        <button class="holo-btn" type="button" data-mira data-acao="apagar">✕ APAGAR</button>
      </div>
      <div class="holo-acoes">
        <button class="holo-btn" type="button" data-mira data-acao="exemplo">★ EXEMPLO</button>
        <button class="holo-btn" type="button" data-mira data-acao="stl">⇩ STL</button>
      </div>
    </section>`;
  raiz.append(painel);
  const o = {};
  for (const x of painel.querySelectorAll('[data-o]')) o[x.dataset.o] = x;
  o.ferramentas.replaceChildren(...[['selecionar', { nome: 'MOVER', icone: '✥', soma: true }], ...Object.entries(TIPOS)].map(([chave, t]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mira = '';
    b.dataset.ferramenta = chave;
    if (!t.soma) b.className = 'menos';
    const icone = document.createElement('b');
    icone.textContent = t.icone;
    b.append(icone, document.createTextNode(t.nome.length > 8 ? `${t.nome.slice(0, 7)}.` : t.nome));
    return b;
  }));

  function linhaMedida(rotulo, valor, aoMudar, passo) {
    const linha = document.createElement('div');
    linha.className = 'holo-of-linha';
    const nome = document.createElement('span');
    nome.textContent = rotulo;
    const menos = document.createElement('button');
    menos.type = 'button';
    menos.dataset.mira = '';
    menos.dataset.esperar = '600';
    menos.textContent = '−';
    const campo = document.createElement('input');
    campo.type = 'number';
    campo.value = valor;
    campo.step = passo;
    const mais = menos.cloneNode(true);
    mais.textContent = '+';
    const aplicar = (novo) => {
      campo.value = novo;
      aoMudar(novo);
    };
    menos.addEventListener('click', () => aplicar(+(Number(campo.value) - passo).toFixed(2)));
    mais.addEventListener('click', () => aplicar(+(Number(campo.value) + passo).toFixed(2)));
    campo.addEventListener('change', () => aplicar(Number(campo.value) || 0));
    linha.append(nome, menos, campo, mais);
    return linha;
  }

  function desenharPainel() {
    for (const b of o.ferramentas.children) b.classList.toggle('ativo', b.dataset.ferramenta === estado.ferramenta);
    for (const b of painel.querySelectorAll('[data-passo]')) b.classList.toggle('ativo', Number(b.dataset.passo) === estado.passo);
    const sel = estado.recursos.find((r) => r.id === estado.selecionado);
    const dicas = {
      selecionar: 'Faça pinça em cima de uma parte da peça para selecionar e arrastar. Punho gira a vista.',
      furo: 'Faça pinça em cima da peça onde quer o furo.',
      rasgo: 'Faça pinça em cima da peça e arraste para traçar o rasgo.',
    };
    o.dica.textContent = dicas[estado.ferramenta] || `Faça pinça na mesa e arraste para desenhar o ${TIPOS[estado.ferramenta].nome.toLowerCase()} (encaixe de ${estado.passo} mm).`;
    const linhas = [];
    if (sel) {
      o.tituloMedidas.textContent = `MEDIDAS · ${TIPOS[sel.tipo].nome} ${sel.id}`;
      for (const [k, val] of Object.entries(sel.m)) {
        linhas.push(linhaMedida(ROTULO[k] || k.toUpperCase(), val, (novo) => editar(sel, (r) => { r.m[k] = Math.max(k === 'dentes' ? 6 : 0.5, novo); }), k === 'dentes' ? 1 : estado.passo));
      }
      ['X', 'Y', 'Z'].forEach((eixo, i) => linhas.push(linhaMedida(`POSIÇÃO ${eixo}`, sel.pos[i], (novo) => editar(sel, (r) => { r.pos[i] = novo; }), estado.passo)));
      linhas.push(linhaMedida('GIRO °', sel.giro || 0, (novo) => editar(sel, (r) => { r.giro = novo; }), 15));
    } else if (TIPOS[estado.ferramenta]) {
      o.tituloMedidas.textContent = `MEDIDAS · PRÓXIMO ${TIPOS[estado.ferramenta].nome}`;
      for (const [k, val] of Object.entries(estado.defaults[estado.ferramenta])) {
        linhas.push(linhaMedida(ROTULO[k] || k.toUpperCase(), val, (novo) => { estado.defaults[estado.ferramenta][k] = Math.max(0.5, novo); }, k === 'dentes' ? 1 : estado.passo));
      }
    } else {
      o.tituloMedidas.textContent = 'MEDIDAS · NADA SELECIONADO';
    }
    o.medidas.replaceChildren(...linhas);
    o.historico.replaceChildren(...estado.recursos.map((r) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.mira = '';
      b.className = `${r.id === estado.selecionado ? 'ativo' : ''} ${TIPOS[r.tipo].soma ? '' : 'menos'}`;
      const a = document.createElement('span');
      a.textContent = `${r.id}. ${TIPOS[r.tipo].nome}`;
      const c = document.createElement('span');
      c.textContent = resumoRecurso(r);
      b.append(a, c);
      b.addEventListener('click', () => {
        estado.selecionado = r.id === estado.selecionado ? null : r.id;
        som.clique();
        desenharSelecao();
        desenharPainel();
      });
      li.append(b);
      return li;
    }));
  }

  function editar(r, mudar) {
    marcar();
    mudar(r);
    recalcular();
    salvar();
    const rotulo = o.historico.querySelector('.ativo span:last-child');
    if (rotulo) rotulo.textContent = resumoRecurso(r);
  }

  painel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ferramenta) {
      som.clique();
      estado.ferramenta = b.dataset.ferramenta;
      if (estado.ferramenta !== 'selecionar') estado.selecionado = null;
      desenharSelecao();
      desenharPainel();
    }
    if (b.dataset.passo) {
      som.clique();
      estado.passo = Number(b.dataset.passo);
      salvar();
      desenharPainel();
    }
    const acao = b.dataset.acao;
    if (acao === 'desfazer') api.desfazer();
    if (acao === 'apagar') api.apagar();
    if (acao === 'exemplo') api.exemplo();
    if (acao === 'stl') api.exportar();
  });

  // ---------- entrada: raio (no mundo) e gesto ----------
  const inversa = new THREE.Matrix4();
  const raioLocal = new THREE.Ray();
  const raycaster = new THREE.Raycaster();
  const planoMesa = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const encaixar = (n) => Math.round(n / estado.passo) * estado.passo;

  function noPlano(raio, y) {
    planoMesa.constant = -y;
    const p = new THREE.Vector3();
    return raio.intersectPlane(planoMesa, p) ? p : null;
  }

  function naPeca(raioMundo) {
    raycaster.ray.copy(raioMundo);
    const alvos = solido.geometry.attributes.position ? [solido] : separados.children;
    const hit = raycaster.intersectObjects(alvos, false)[0];
    if (!hit) return null;
    hit.point = peca.worldToLocal(hit.point.clone());
    return hit;
  }

  function recursoEm(raio) {
    raycaster.ray.copy(raio);
    let melhor = null;
    for (const r of estado.recursos) {
      const malha = new THREE.Mesh(geoDoRecurso(r));
      const hit = raycaster.intersectObject(malha, false)[0];
      if (hit && (!melhor || hit.distance < melhor.distance)) melhor = { r, distance: hit.distance, ponto: hit.point };
      malha.geometry.dispose();
    }
    return melhor;
  }

  function previaDe(a, b, alturaBase) {
    const tipo = estado.ferramenta;
    const m = { ...estado.defaults[tipo] };
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    let pos = [a.x, alturaBase, a.z];
    let giro = 0;
    if (tipo === 'bloco') {
      m.largura = Math.max(estado.passo, encaixar(Math.abs(dx)));
      m.profundidade = Math.max(estado.passo, encaixar(Math.abs(dz)));
      pos = [encaixar(a.x + dx / 2), alturaBase, encaixar(a.z + dz / 2)];
    } else if (tipo === 'rasgo') {
      m.comprimento = Math.max(estado.passo, encaixar(Math.hypot(dx, dz)));
      pos = [a.x + dx / 2, alturaBase, a.z + dz / 2];
      giro = Math.round(THREE.MathUtils.radToDeg(-Math.atan2(dz, dx)) / 15) * 15;
    } else if (tipo !== 'furo') {
      const d = Math.max(estado.passo * 2, encaixar(Math.hypot(dx, dz) * 2));
      if ('diametro' in m) m.diametro = d;
      else if ('base' in m) m.base = d;
      else if ('largura' in m) m.largura = d;
      if (tipo === 'tubo') m.interno = Math.min(m.interno, d - 2 * estado.passo);
    }
    return { id: 0, tipo, m, pos, giro };
  }

  function entrada(gesto, raioMundo) {
    const antes = estado.gestoAntes;
    estado.gestoAntes = gesto;
    grupo.updateMatrixWorld();
    inversa.copy(peca.matrixWorld).invert();
    raioLocal.copy(raioMundo).applyMatrix4(inversa);
    raioLocal.direction.normalize();
    const comeca = gesto === 'pinca' && antes !== 'pinca';
    const solta = gesto !== 'pinca' && antes === 'pinca';
    if (comeca) {
      if (estado.ferramenta === 'selecionar') {
        const alvo = recursoEm(raioLocal);
        estado.selecionado = alvo?.r.id ?? null;
        if (alvo) {
          marcar();
          const p = noPlano(raioLocal, alvo.r.pos[1]) || alvo.ponto;
          estado.arraste = { tipo: 'mover', r: alvo.r, desvio: [alvo.r.pos[0] - p.x, alvo.r.pos[2] - p.z] };
          som.agarrar();
        }
        desenharSelecao();
        desenharPainel();
        return;
      }
      const hit = naPeca(raioMundo);
      const subtrai = !TIPOS[estado.ferramenta].soma;
      if (subtrai && !hit) return;
      const altura = hit && (subtrai || hit.face?.normal?.y > 0.6) ? +hit.point.y.toFixed(2) : 0;
      const a = hit && (subtrai || hit.face?.normal?.y > 0.6) ? hit.point.clone() : noPlano(raioLocal, 0);
      if (!a) return;
      a.x = encaixar(a.x);
      a.z = encaixar(a.z);
      estado.arraste = { tipo: 'criar', a, altura };
      estado.selecionado = null;
      som.agarrar();
      desenharSelecao(previaDe(a, a, altura));
      return;
    }
    if (gesto === 'pinca' && estado.arraste) {
      const ar = estado.arraste;
      if (ar.tipo === 'mover') {
        const p = noPlano(raioLocal, ar.r.pos[1]);
        if (p) {
          ar.r.pos[0] = encaixar(p.x + ar.desvio[0]);
          ar.r.pos[2] = encaixar(p.z + ar.desvio[1]);
          desenharSelecao();
          ar.mudou = true;
        }
      } else {
        const b = noPlano(raioLocal, ar.altura);
        if (b) {
          ar.b = b;
          desenharSelecao(previaDe(ar.a, b, ar.altura));
        }
      }
      return;
    }
    if (solta && estado.arraste) {
      const ar = estado.arraste;
      estado.arraste = null;
      som.soltar();
      if (ar.tipo === 'mover') {
        if (ar.mudou) {
          recalcular();
          salvar();
          aoEvento?.(`moveu o ${TIPOS[ar.r.tipo].nome.toLowerCase()} ${ar.r.id} da peça`);
        } else {
          estado.desfazer.pop();
        }
        desenharPainel();
        return;
      }
      const previa = previaDe(ar.a, ar.b || ar.a, ar.altura);
      adicionarRecurso(previa.tipo, previa.m, previa.pos.map((n) => +n.toFixed(2)), previa.giro);
    }
  }

  // ---------- visual ----------
  function aplicarVisual(real) {
    estado.real = real;
    solido.material = real ? mat.real : mat.holo;
    arestas.material = real ? mat.arestaReal : mat.arestaHolo;
    mat.grade.opacity = real ? 0.1 : 0.16;
    mat.gradeForte.opacity = real ? 0.22 : 0.38;
  }

  const ponto = new THREE.Vector3();
  function atualizar(camera, rot, zoom) {
    if (!grupo.visible) return;
    estado.escalaVista = THREE.MathUtils.lerp(estado.escalaVista, (estado.escalaAlvo || 0.04) * zoom, 0.1);
    peca.scale.setScalar(estado.escalaVista);
    grupo.rotation.set(rot.x, rot.y, 0);
    const w = raiz.clientWidth;
    const h = raiz.clientHeight;
    for (const c of cotas) {
      ponto.copy(c.ponto);
      peca.localToWorld(ponto);
      ponto.project(camera);
      const x = (ponto.x + 1) / 2 * w;
      const y = (1 - ponto.y) / 2 * h;
      c.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }

  carregar();
  recalcular();
  desenharPainel();

  const api = {
    grupo,
    painel,
    ativar(sim) {
      grupo.visible = sim;
      painel.hidden = !sim;
      cotasDom.hidden = !sim;
      if (sim) carregarCsg();
      else estado.arraste = null;
    },
    entrada,
    soltar() {
      if (estado.gestoAntes === 'pinca') entrada('nenhum', new THREE.Ray());
      estado.gestoAntes = 'nenhum';
    },
    ocupado: () => !!estado.arraste,
    atualizar,
    aplicarVisual,
    definirFerramenta(f) {
      if (f === 'selecionar' || TIPOS[f]) {
        estado.ferramenta = f;
        desenharPainel();
      }
    },
    // pela voz: "cilindro 30 20" usa os números na ordem das medidas do recurso
    adicionarPorTexto(texto) {
      const t = normalizar(texto);
      const tipo = Object.keys(TIPOS).find((k) => t.includes(k) || t.includes(normalizar(TIPOS[k].nome))) || (t.includes('caixa') || t.includes('cubo') ? 'bloco' : null);
      if (!tipo) return `Posso criar: ${Object.values(TIPOS).map((x) => x.nome.toLowerCase()).join(', ')}.`;
      const numeros = (t.match(/\d+([.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
      const m = {};
      Object.keys(TIPOS[tipo].medidas).forEach((k, i) => { if (numeros[i]) m[k] = numeros[i]; });
      const topo = estado.info?.tam?.y || 0;
      const r = adicionarRecurso(tipo, m, [0, TIPOS[tipo].soma ? 0 : +topo.toFixed(2), 0]);
      return `Criei ${TIPOS[tipo].nome.toLowerCase()} ${resumoRecurso(r)} mm na oficina.`;
    },
    desfazer() {
      const anterior = estado.desfazer.pop();
      if (!anterior) return 'Nada para desfazer.';
      const d = JSON.parse(anterior);
      estado.recursos = d.recursos;
      estado.proximoId = d.proximoId;
      estado.selecionado = null;
      recalcular();
      desenharPainel();
      salvar();
      som.clique();
      return 'Desfeito.';
    },
    apagar() {
      const sel = estado.recursos.find((r) => r.id === estado.selecionado);
      if (!sel && !estado.recursos.length) return 'A peça já está vazia.';
      marcar();
      if (sel) estado.recursos = estado.recursos.filter((r) => r !== sel);
      else estado.recursos = [];
      estado.selecionado = null;
      recalcular();
      desenharPainel();
      salvar();
      som.desmontar();
      aoEvento?.(sel ? `apagou o ${TIPOS[sel.tipo].nome.toLowerCase()} ${sel.id} da peça` : 'apagou a peça inteira na oficina');
      return sel ? 'Recurso apagado.' : 'Peça apagada.';
    },
    exemplo() {
      marcar();
      estado.recursos = [
        { id: 1, tipo: 'bloco', m: { largura: 70, profundidade: 40, altura: 10 }, pos: [0, 0, 0], giro: 0 },
        { id: 2, tipo: 'cilindro', m: { diametro: 30, altura: 22 }, pos: [0, 10, 0], giro: 0 },
        { id: 3, tipo: 'furo', m: { diametro: 14, profundidadeFuro: 40 }, pos: [0, 32, 0], giro: 0 },
        { id: 4, tipo: 'furo', m: { diametro: 6, profundidadeFuro: 12 }, pos: [-26, 10, 0], giro: 0 },
        { id: 5, tipo: 'furo', m: { diametro: 6, profundidadeFuro: 12 }, pos: [26, 10, 0], giro: 0 },
        { id: 6, tipo: 'rasgo', m: { comprimento: 70, largura: 4, profundidadeFuro: 2 }, pos: [0, 10, 14], giro: 0 },
      ];
      estado.proximoId = 7;
      estado.selecionado = null;
      recalcular();
      desenharPainel();
      salvar();
      som.montar();
      aoEvento?.('abriu a peça de exemplo na oficina (uma base com bucha e furos)');
      return 'Peça de exemplo montada: base com bucha central e furos de fixação.';
    },
    exportar() {
      if (!solido.geometry.attributes.position) return 'A peça ainda está vazia.';
      const dados = new STLExporter().parse(new THREE.Mesh(solido.geometry), { binary: true });
      const url = URL.createObjectURL(new Blob([dados], { type: 'model/stl' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `peca-jarvis-${new Date().toISOString().slice(0, 10)}.stl`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      som.clique();
      aoEvento?.('exportou a peça da oficina em STL');
      return 'Peça exportada em STL, pronta para o fatiador da impressora 3D.';
    },
    resumo() {
      if (!estado.recursos.length) return 'peça vazia';
      const i = estado.info;
      return `${estado.recursos.length} recursos (${estado.recursos.map((r) => `${TIPOS[r.tipo].nome.toLowerCase()} ${resumoRecurso(r)}`).join('; ')}), `
        + `tamanho ${i.tam.x.toFixed(0)} × ${i.tam.z.toFixed(0)} × ${i.tam.y.toFixed(0)} mm, volume ${(i.volume / 1000).toFixed(1)} cm³`;
    },
    dados() {
      const i = estado.info || { tam: new THREE.Vector3(), volume: 0, triangulos: 0 };
      const cm3 = i.volume / 1000;
      return [
        ['Recursos', String(estado.recursos.length)],
        ['Tamanho', estado.recursos.length ? `${i.tam.x.toFixed(0)}×${i.tam.z.toFixed(0)}×${i.tam.y.toFixed(0)} mm` : '—'],
        ['Volume', csg ? `${cm3.toFixed(1).replace('.', ',')} cm³` : 'CALCULANDO'],
        ['Massa em PLA', csg ? `${(cm3 * 1.24).toFixed(1).replace('.', ',')} g` : '—'],
        ['Em alumínio', csg ? `${(cm3 * 2.7).toFixed(1).replace('.', ',')} g` : '—'],
        ['Triângulos', i.triangulos.toLocaleString('pt-BR')],
      ];
    },
  };
  return api;
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
