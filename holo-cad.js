/*
 * holo-cad.js — a oficina do laboratório holográfico (holo.js): um CAD paramétrico de verdade,
 * no estilo do Autodesk Inventor, controlado com as mãos, o mouse ou a voz.
 *
 * Como no Inventor, a peça é uma árvore de recursos em milímetros:
 *   esboço 2D num plano (ou numa face) → extrusão / revolução → furos → arredondar, chanfro,
 *   padrões, espelhar e casca. Cada medida aceita fórmula com parâmetros (largura/2…), o "fim da
 *   peça" pode voltar no tempo, recursos podem ser suprimidos, e a peça tem material real, massa e
 *   centro de gravidade. Na montagem, peças e itens da biblioteca se encaixam com restrições face
 *   com face e eixo com eixo; o desenho técnico sai numa folha A4; a inspeção mede, corta, estima
 *   esforço, gera a peça a partir de uma foto, manda para o celular em realidade aumentada e faz
 *   uma apresentação de cinema com narração.
 *
 * Arquivos: holo-cad-nucleo.js (geometria e cálculo), holo-cad-ui.js (faixa de abas, árvore,
 * propriedades, status e cubo de vistas), holo-cad-montagem.js, holo-cad-desenho.js e
 * holo-cad-extra.js. As operações booleanas (three-bvh-csg) carregam quando a oficina abre.
 */
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import * as N from './holo-cad-nucleo.js';
import { criarInterface } from './holo-cad-ui.js';
import { criarMontagem } from './holo-cad-montagem.js';
import { gerarFolha } from './holo-cad-desenho.js';
import { calcularEsforco, gerarQR, fotoDoVideo, criarApresentacao, refinar } from './holo-cad-extra.js';

const CHAVE = 'jarvis.oficina';
const CHAVE_ANTIGA = 'jarvis.peca';
const RAIO_GRADE = 100;
// a medida que a pinça "puxa" em cada recurso (puxar para cima aumenta)
const PUXAR = { extrusao: 'distancia', furo: 'profundidade', revolucao: 'angulo', arredondar: 'raio', chanfro: 'raio', casca: 'espessura', padrao_ret: 'd1', padrao_circ: 'n', espelhar: 'desloc' };
const fmt = (n, casas = 1) => (Number.isFinite(+n) ? String(+(+n).toFixed(casas)).replace('.', ',') : '—');
const novoId = () => Math.random().toString(36).slice(2, 8);

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ---------------- materiais de tela ----------------
function materialHolo() {
  return new THREE.ShaderMaterial({
    uniforms: { uCor: { value: new THREE.Color('#4de8f0') }, uTempo: { value: 0 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying float vY;
      #include <clipping_planes_pars_vertex>
      void main(){
        #include <begin_vertex>
        #include <project_vertex>
        #include <clipping_planes_vertex>
        vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz); vY = position.y;
      }`,
    fragmentShader: `
      uniform vec3 uCor; uniform float uTempo;
      varying vec3 vN; varying vec3 vV; varying float vY;
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float varre = 0.85 + 0.15 * sin(vY * 0.9 - uTempo * 3.0);
        vec3 c = uCor * (0.07 + fr * 0.55) * varre;
        gl_FragColor = vec4(c, 0.1 + fr * 0.35);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, clipping: true, toneMapped: false,
  });
}

// tampa do corte: as faces de trás aparecem só onde o plano de corte abriu a peça
function materialTampa() {
  return new THREE.ShaderMaterial({
    uniforms: { uCor: { value: new THREE.Color('#ffa24c') } },
    vertexShader: `
      #include <clipping_planes_pars_vertex>
      void main(){
        #include <begin_vertex>
        #include <project_vertex>
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uCor;
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        float h = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 10.0));
        gl_FragColor = vec4(uCor * (0.45 + 0.4 * h), 1.0);
      }`,
    side: THREE.BackSide, clipping: true, toneMapped: false,
  });
}

export function criarOficina({ cena, raiz, som, aoEvento, renderer = null, servicos = () => null, video = () => null }) {
  // ---------- cena: grupo → giro (vista) → escala (mm) → centro → peça / montagem ----------
  const grupo = new THREE.Group();
  grupo.position.set(0, 0.1, 0);
  grupo.visible = false;
  cena.add(grupo);
  const giro = new THREE.Group();
  const escala = new THREE.Group();
  const centro = new THREE.Group();
  grupo.add(giro);
  giro.add(escala);
  escala.add(centro);
  const pecaVista = new THREE.Group();
  const montagemVista = new THREE.Group();
  centro.add(pecaVista, montagemVista);

  const mat = {
    holo: materialHolo(),
    holoCorte: new THREE.MeshBasicMaterial({ color: '#06222b', side: THREE.FrontSide, clipping: true }),
    tampa: materialTampa(),
    reais: {},
    arestaHolo: new THREE.LineBasicMaterial({ color: new THREE.Color('#8ff3f7').multiplyScalar(1.3), transparent: true, opacity: 0.95, toneMapped: false }),
    arestaReal: new THREE.LineBasicMaterial({ color: '#1c2228', transparent: true, opacity: 0.22 }),
    rosca: new THREE.LineBasicMaterial({ color: new THREE.Color('#ffa24c').multiplyScalar(1.3), transparent: true, opacity: 0.85, toneMapped: false }),
    fantasma: new THREE.LineBasicMaterial({ color: new THREE.Color('#ffa24c').multiplyScalar(1.5), toneMapped: false, depthTest: false, transparent: true }),
    novo: new THREE.LineBasicMaterial({ color: new THREE.Color('#5dfca0').multiplyScalar(1.5), toneMapped: false, depthTest: false, transparent: true }),
    esboco: new THREE.LineBasicMaterial({ color: new THREE.Color('#e9f7f9').multiplyScalar(1.4), toneMapped: false, depthTest: false, transparent: true }),
    esbocoSel: new THREE.LineBasicMaterial({ color: new THREE.Color('#ffa24c').multiplyScalar(1.6), toneMapped: false, depthTest: false, transparent: true }),
    construcao: new THREE.LineDashedMaterial({ color: '#8ff3f7', dashSize: 2, gapSize: 1.5, toneMapped: false, depthTest: false, transparent: true, opacity: 0.7 }),
    gradeEsboco: new THREE.LineBasicMaterial({ color: '#4de8f0', transparent: true, opacity: 0.12, depthWrite: false }),
    grade: new THREE.LineBasicMaterial({ color: '#4de8f0', transparent: true, opacity: 0.14, depthWrite: false }),
    gradeForte: new THREE.LineBasicMaterial({ color: '#4de8f0', transparent: true, opacity: 0.34, depthWrite: false }),
    calor: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 }),
    calorHolo: new THREE.MeshBasicMaterial({ vertexColors: true }),
    medida: new THREE.LineBasicMaterial({ color: new THREE.Color('#5dfca0').multiplyScalar(1.4), toneMapped: false, depthTest: false, transparent: true }),
  };
  const planoCorte = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  function materialReal(chave, cor = null) {
    const k = `${chave}|${cor || ''}`;
    if (!mat.reais[k]) {
      const m = N.MATERIAIS[chave] || N.MATERIAIS.aluminio;
      mat.reais[k] = new THREE.MeshPhysicalMaterial({
        color: cor || m.cor, metalness: m.metal, roughness: m.rugosidade, clearcoat: m.metal ? 0.25 : 0.6, clearcoatRoughness: 0.25,
        side: THREE.FrontSide, envMap: cena.environment || null, envMapIntensity: 1.2, emissive: new THREE.Color('#ffa24c'), emissiveIntensity: 0,
      });
    }
    return mat.reais[k];
  }

  // grade da mesa (plano XZ da peça), recortada num círculo
  const linhas = (pts, m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, m);
  };
  const grade = new THREE.Group();
  {
    const fraca = [];
    const forte = [];
    for (let x = -RAIO_GRADE; x <= RAIO_GRADE; x += 10) {
      const z = Math.sqrt(RAIO_GRADE * RAIO_GRADE - x * x);
      (x % 50 === 0 ? forte : fraca).push(x, 0, -z, x, 0, z, -z, 0, x, z, 0, x);
    }
    grade.add(linhas(fraca, mat.grade), linhas(forte, mat.gradeForte));
    grade.add(linhas([0, 0.05, 0, 30, 0.05, 0], new THREE.LineBasicMaterial({ color: '#ff6b6b', toneMapped: false })),
      linhas([0, 0.05, 0, 0, 0.05, 30], new THREE.LineBasicMaterial({ color: '#6b9bff', toneMapped: false })),
      linhas([0, 0, 0, 0, 30, 0], new THREE.LineBasicMaterial({ color: '#6bff9b', toneMapped: false })));
  }
  pecaVista.add(grade);

  const solido = new THREE.Mesh(new THREE.BufferGeometry(), mat.holo);
  const tampa = new THREE.Mesh(solido.geometry, mat.tampa);
  tampa.visible = false;
  const arestas = new THREE.LineSegments(new THREE.BufferGeometry(), mat.arestaHolo);
  const roscas = new THREE.Group();
  const separados = new THREE.Group();
  const fantasma = new THREE.LineSegments(new THREE.BufferGeometry(), mat.fantasma);
  fantasma.renderOrder = 5;
  const vistaEsboco = new THREE.Group();
  vistaEsboco.renderOrder = 6;
  const auxiliares = new THREE.Group();   // medidas, centro de gravidade, plano de corte
  // mapa de calor do esforço: uma cópia refinada da peça com cores por vértice
  const calorMalha = new THREE.Mesh(new THREE.BufferGeometry(), mat.calor);
  calorMalha.visible = false;
  pecaVista.add(solido, tampa, arestas, roscas, separados, fantasma, vistaEsboco, auxiliares, calorMalha);

  // centro de gravidade: uma mira com esfera
  const marcaCg = new THREE.Group();
  {
    const m = new THREE.MeshBasicMaterial({ color: '#ffd84d', depthTest: false, transparent: true, toneMapped: false });
    marcaCg.add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), m));
    marcaCg.add(linhas([-4, 0, 0, 4, 0, 0, 0, -4, 0, 0, 4, 0, 0, 0, -4, 0, 0, 4], new THREE.LineBasicMaterial({ color: '#ffd84d', depthTest: false, toneMapped: false })));
    marcaCg.renderOrder = 9;
    marcaCg.visible = false;
  }
  auxiliares.add(marcaCg);
  const planoVisivel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffa24c', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
  planoVisivel.visible = false;
  auxiliares.add(planoVisivel);
  const linhaMedida = new THREE.LineSegments(new THREE.BufferGeometry(), mat.medida);
  linhaMedida.renderOrder = 9;
  auxiliares.add(linhaMedida);

  // ---------- documento ----------
  const novaPeca = (nome) => ({ id: `p${novoId()}`, nome, material: 'aluminio', recursos: [], fim: null, parametros: [] });
  let doc = { versao: 2, pecas: [novaPeca('Peça 1')], ativa: null, montagem: null };
  doc.ativa = doc.pecas[0].id;

  const ui = {
    aba: 'modelo', ferramenta: 'selecionar', sel: null, edicao: null, esboco: null, entSel: null, passo: 5, real: false,
    primitiva: 'bloco', ladosPoli: 6, campoAtivo: null, compSel: null, escolhaRestricao: null, corte: { ativo: false, eixo: 'x', pos: 0, inverter: false },
    medir: [], forca: 200, esforco: null, cg: false, regua: null, folha: null, qr: null, foto: null, apresentacao: { gravar: false },
    bib: { tipo: 'parafuso', tam: 'M8', comp: 30 }, erros: {}, info: null, msgs: [],
  };
  const desfazerPilha = [];
  const refazerPilha = [];
  let salvarTimer = 0;

  const peca = () => doc.pecas.find((p) => p.id === doc.ativa) || doc.pecas[0];
  const recurso = (id) => peca().recursos.find((r) => r.id === id);
  const esbocoAtivo = () => (ui.esboco ? recurso(ui.esboco) : null);
  const nomeNovo = (tipo) => {
    const base = N.NOMES_TIPO[tipo] || tipo;
    let n = 1;
    while (peca().recursos.some((r) => r.nome === `${base}${n}`)) n++;
    return `${base}${n}`;
  };
  const fimAtual = () => (peca().fim == null ? peca().recursos.length : Math.min(peca().fim, peca().recursos.length));

  function fotografar() {
    return JSON.stringify({ doc, montagem: montagem ? montagem.dados() : null });
  }
  function marcar() {
    desfazerPilha.push(fotografar());
    if (desfazerPilha.length > 60) desfazerPilha.shift();
    refazerPilha.length = 0;
  }
  function salvar() {
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(() => {
      try { localStorage.setItem(CHAVE, JSON.stringify({ ...doc, montagem: montagem.dados(), passo: ui.passo })); } catch {}
    }, 350);
  }
  function restaurar(texto) {
    const d = JSON.parse(texto);
    doc = d.doc;
    if (d.montagem) montagem.carregar(d.montagem);
    if (!recurso(ui.sel)) ui.sel = null;
    if (ui.esboco && !recurso(ui.esboco)) ui.esboco = null;
    ui.edicao = null;
    cacheAval.clear();
    recalcular();
    redesenhar();
    salvar();
  }

  // a oficina antiga guardava uma lista de recursos simples: vira primitivas e furos da nova
  function migrarAntiga(dados) {
    const p = novaPeca('Peça 1');
    for (const r of dados.recursos || []) {
      if (r.tipo === 'furo') {
        p.recursos.push({ id: novoId(), tipo: 'furo', nome: nomeLivre(p, 'furo'), ponto: r.pos, dir: [0, -1, 0], estilo: 'simples', diametro: String(r.m?.diametro ?? 8), profundidade: String(r.m?.profundidadeFuro ?? 10), passante: false });
      } else if (N.PRIMITIVAS[r.tipo]) {
        const m = { ...r.m };
        if (r.tipo === 'rasgo') m.profundidade = m.profundidadeFuro ?? m.profundidade;
        delete m.profundidadeFuro;
        p.recursos.push({ id: novoId(), tipo: 'primitiva', nome: nomeLivre(p, 'primitiva'), forma: r.tipo, m, pos: r.pos, giro: r.giro || 0, operacao: r.tipo === 'rasgo' ? 'cortar' : 'juntar' });
      }
    }
    return p;
  }
  function nomeLivre(p, tipo) {
    const base = N.NOMES_TIPO[tipo];
    let n = 1;
    while (p.recursos.some((r) => r.nome === `${base}${n}`)) n++;
    return `${base}${n}`;
  }

  // ---------- CSG ----------
  let csg = null;
  let carregandoCsg = null;
  const carregarCsg = () => {
    carregandoCsg ||= import('three-bvh-csg').then((m) => {
      csg = { ...m, avaliador: new m.Evaluator() };
      csg.avaliador.attributes = ['position', 'normal'];
      csg.avaliador.useGroups = false;
      cacheAval.clear();
      recalcular();
      redesenhar();
    }).catch((erro) => {
      console.warn('Oficina: operações booleanas indisponíveis', erro);
      aviso('Não consegui carregar as operações booleanas; confira a internet.');
    });
    return carregandoCsg;
  };
  const OPS = () => ({ juntar: csg.ADDITION, cortar: csg.SUBTRACTION, intersecao: csg.INTERSECTION });

  // ---------- avaliação da peça ----------
  const cacheAval = new Map();   // id da peça → resultado
  function avaliar(p) {
    const { vars, erros: errosParametro } = N.valoresParametros(p.parametros);
    const lista = p.recursos;
    const fim = p.fim == null ? lista.length : Math.min(p.fim, lista.length);
    const ativos = lista.slice(0, fim).filter((r) => !r.suprimido);
    const esbocos = Object.fromEntries(lista.filter((r) => r.tipo === 'esboco').map((r) => [r.id, r]));
    const porId = Object.fromEntries(lista.map((r) => [r.id, r]));
    const modificadores = {};
    for (const r of ativos) {
      if (r.tipo !== 'arredondar' && r.tipo !== 'chanfro') continue;
      let raio = 0;
      try { raio = N.avaliarExpr(r.raio, vars); } catch {}
      (modificadores[r.alvo] ||= []).push({ tipo: r.tipo, raio, arestas: r.arestas || 'todas' });
    }
    const caixa = new THREE.Box3();
    const geos = new Map();
    const erros = { ...Object.fromEntries(Object.entries(errosParametro).map(([k, v]) => [`param:${k}`, v])) };
    const ctx = { vars, esbocos, modificadores, caixa, porId, recursos: ativos };
    const gerar = (r) => {
      if (geos.has(r.id)) return geos.get(r.id);
      let g;
      try {
        g = N.GERADORES[r.tipo](r, ctx);
        g.geos = g.geos.map((x) => N.limpar(x));
      } catch (e) {
        g = { geos: [], op: 'juntar', erro: e.message };
        erros[r.id] = e.message;
      }
      geos.set(r.id, g);
      return g;
    };
    ctx.geoDe = gerar;
    let resultado = null;
    const avulsos = [];
    for (const r of ativos) {
      if (!N.GERADORES[r.tipo]) continue;
      const g = gerar(r);
      if (g.erro || !g.geos.length) continue;
      if (!csg) {
        avulsos.push(...g.geos.map((x) => ({ geo: x, op: g.op })));
        for (const x of g.geos) {
          x.computeBoundingBox();
          caixa.union(x.boundingBox);
        }
        continue;
      }
      try {
        let pincel = new csg.Brush(g.geos[0]);
        pincel.updateMatrixWorld();
        for (const x of g.geos.slice(1)) {
          const outro = new csg.Brush(x);
          outro.updateMatrixWorld();
          pincel = csg.avaliador.evaluate(pincel, outro, csg.ADDITION);
        }
        if (!resultado) {
          if (g.op === 'juntar') resultado = pincel;
          else erros[r.id] = 'não há material para cortar ainda';
        } else {
          resultado = csg.avaliador.evaluate(resultado, pincel, OPS()[g.op] ?? csg.ADDITION);
        }
        if (resultado) {
          resultado.geometry.computeBoundingBox();
          caixa.copy(resultado.geometry.boundingBox);
        }
      } catch (e) {
        erros[r.id] = `a operação booleana falhou (${e.message})`;
      }
    }
    let geometria = null;
    let massa = { volume: 0, centro: new THREE.Vector3() };
    if (resultado?.geometry?.attributes.position?.count) {
      geometria = toCreasedNormals(resultado.geometry.clone(), THREE.MathUtils.degToRad(32));
      massa = N.propriedadesMassa(geometria);
      massa.volume = Math.abs(massa.volume);
    }
    // eixos (para a montagem): furos, círculos extrudados, revoluções, primitivas redondas e as cópias de padrões
    const eixos = [];
    const eixoDe = (r) => {
      const lista2 = [];
      if (r.tipo === 'furo') lista2.push({ p: r.ponto, d: r.dir });
      if (r.tipo === 'primitiva' && N.PRIMITIVAS[r.forma] && r.forma !== 'bloco' && r.forma !== 'rasgo') lista2.push({ p: (r.pos || [0, 0, 0]).map((v) => +v || 0), d: [0, 1, 0] });
      if ((r.tipo === 'extrusao' || r.tipo === 'revolucao') && esbocos[r.esboco]) {
        const base = N.basePlano(esbocos[r.esboco].plano);
        if (r.tipo === 'extrusao') {
          for (const e of esbocos[r.esboco].ents || []) {
            if (e.t === 'circ' || e.t === 'poli') lista2.push({ p: N.doPlano(base, e.c[0], e.c[1]).toArray(), d: base.n.toArray() });
          }
        } else {
          const dir = r.eixo === 'x' ? base.x : base.y;
          lista2.push({ p: base.o.toArray(), d: dir.toArray() });
        }
      }
      return lista2;
    };
    for (const r of ativos) {
      eixos.push(...eixoDe(r));
      const g = geos.get(r.id);
      if (g?.matrizes && porId[g.origem]) {
        for (const e of eixoDe(porId[g.origem])) {
          for (const m of g.matrizes) {
            eixos.push({ p: new THREE.Vector3(...e.p).applyMatrix4(m).toArray(), d: new THREE.Vector3(...e.d).transformDirection(m).toArray() });
          }
        }
      }
    }
    // roscas desenhadas
    const linhasRosca = [];
    for (const r of ativos) {
      if (r.tipo !== 'furo') continue;
      const l = N.roscaDoFuro(r, vars);
      if (l) linhasRosca.push(l);
      for (const outro of ativos) {
        const g = geos.get(outro.id);
        if (l && g?.origem === r.id) for (const m of g.matrizes) linhasRosca.push(l.clone().applyMatrix4(m));
      }
    }
    const m = N.MATERIAIS[p.material] || N.MATERIAIS.aluminio;
    return {
      geometria, geos, erros, vars, avulsos, eixos, linhasRosca, caixa: geometria ? geometria.boundingBox || (geometria.computeBoundingBox(), geometria.boundingBox) : caixa.clone(),
      volume: massa.volume, centro: massa.centro, massa: (massa.volume / 1000) * m.densidade,
    };
  }

  function avaliacao(p = peca()) {
    if (!cacheAval.has(p.id)) cacheAval.set(p.id, avaliar(p));
    return cacheAval.get(p.id);
  }

  let sujo = false;
  let ultimoCalculo = 0;
  const agendar = () => { sujo = true; };

  function recalcular() {
    sujo = false;
    ultimoCalculo = performance.now();
    const p = peca();
    cacheAval.delete(p.id);
    const a = avaliacao(p);
    ui.erros = a.erros;
    solido.geometry.dispose?.();
    arestas.geometry.dispose();
    solido.geometry = a.geometria || new THREE.BufferGeometry();
    tampa.geometry = solido.geometry;
    arestas.geometry = a.geometria ? N.arestasLimpas(a.geometria, 28) : new THREE.BufferGeometry();
    roscas.clear();
    for (const l of a.linhasRosca) roscas.add(new THREE.Line(l, mat.rosca));
    separados.clear();
    for (const { geo, op } of a.avulsos) separados.add(new THREE.Mesh(geo, op === 'juntar' ? solido.material : new THREE.MeshBasicMaterial({ color: '#ffa24c', wireframe: true, transparent: true, opacity: 0.5 })));
    ui.esforco = null;
    aplicarMaterialSolido();
    marcaCg.position.copy(a.centro);
    const tam = a.caixa.isEmpty() ? new THREE.Vector3(60, 30, 60) : a.caixa.getSize(new THREE.Vector3());
    estado.escalaAlvo = 4.3 / Math.max(70, tam.x, tam.y * 1.25, tam.z);
    estado.centroAlvo = a.caixa.isEmpty() ? new THREE.Vector3(0, 15, 0) : a.caixa.getCenter(new THREE.Vector3());
    desenharSelecao();
    desenharEsboco();
    if (montagem && doc.montagem !== false) montagem.reconstruir(p.id);
    tela?.status();
  }

  function aplicarMaterialSolido() {
    const real = ui.real;
    calorMalha.visible = !!ui.esforco;
    solido.visible = !ui.esforco;
    calorMalha.material = real ? mat.calor : mat.calorHolo;
    if (ui.corte.ativo) {
      solido.material = real ? materialReal(peca().material) : mat.holoCorte;
    } else {
      solido.material = real ? materialReal(peca().material) : mat.holo;
    }
    arestas.material = real ? mat.arestaReal : mat.arestaHolo;
    const planos = ui.corte.ativo ? [planoCorte] : [];
    for (const m of [solido.material, mat.tampa, arestas.material, mat.rosca]) {
      if (m.clippingPlanes !== planos) {
        m.clippingPlanes = planos;
        m.needsUpdate = true;
      }
    }
    tampa.visible = ui.corte.ativo;
    for (const m of Object.values(mat.reais)) if (cena.environment && m.envMap !== cena.environment) {
      m.envMap = cena.environment;
      m.needsUpdate = true;
    }
  }

  // ---------- seleção e pré-visualização ----------
  const cotasTela = [];   // { ponto (mm, na peça), texto, classe }
  function desenharSelecao() {
    fantasma.geometry.dispose();
    const r = ui.sel ? recurso(ui.sel) : null;
    const a = cacheAval.get(peca().id);
    const g = r && a?.geos.get(r.id);
    if (g?.geos?.length && r.tipo !== 'esboco') {
      const partes = g.geos.map((x) => new THREE.EdgesGeometry(x, 24));
      const pos = [];
      for (const p of partes) pos.push(...p.attributes.position.array);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      fantasma.geometry = geo;
      fantasma.material = ui.edicao?.novo ? mat.novo : mat.fantasma;
    } else {
      fantasma.geometry = new THREE.BufferGeometry();
    }
    cotasTela.length = 0;
    if (r && g?.geos?.length && r.tipo !== 'esboco') {
      const caixa = new THREE.Box3();
      for (const x of g.geos) {
        x.computeBoundingBox();
        caixa.union(x.boundingBox);
      }
      const campo = PUXAR[r.tipo];
      if (r.tipo === 'furo') cotasTela.push({ ponto: new THREE.Vector3(...r.ponto), texto: N.resumoRecurso(r), classe: ui.edicao?.novo ? 'novo' : '' });
      else if (campo && !caixa.isEmpty()) cotasTela.push({ ponto: caixa.getCenter(new THREE.Vector3()).setY(caixa.max.y + 2), texto: `${r.nome} · ${N.resumoRecurso(r)}`, classe: ui.edicao?.novo ? 'novo' : '' });
      else if (!caixa.isEmpty()) cotasTela.push({ ponto: caixa.getCenter(new THREE.Vector3()).setY(caixa.max.y + 2), texto: `${r.nome}`, classe: '' });
    }
    tela?.cotas();
  }

  // ---------- esboço ----------
  const visaoEsboco = { previa: null, traco: null };
  function desenharEsboco() {
    vistaEsboco.clear();
    const p = peca();
    const fim = fimAtual();
    const ativo = esbocoAtivo();
    // esboços visíveis: o ativo, o selecionado e os que ainda não viraram recurso
    const usados = new Set(p.recursos.filter((r) => r.esboco).map((r) => r.esboco));
    const visiveis = p.recursos.filter((r, i) => r.tipo === 'esboco' && i < fim && !r.suprimido && (r.id === ui.esboco || r.id === ui.sel || !usados.has(r.id)));
    for (const esb of visiveis) {
      const base = N.basePlano(esb.plano);
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      g.matrix.copy(base.matriz);
      for (const e of esb.ents || []) {
        const pts = N.pontosEntidade(e);
        const pos = [];
        for (let i = 1; i < pts.length; i++) pos.push(pts[i - 1].x, pts[i - 1].y, 0.05, pts[i].x, pts[i].y, 0.05);
        const l = linhas(pos, e.construcao ? mat.construcao : e.id === ui.entSel && esb.id === ui.esboco ? mat.esbocoSel : mat.esboco);
        if (e.construcao) l.computeLineDistances();
        l.renderOrder = 7;
        g.add(l);
      }
      if (esb.id === ui.esboco) {
        // grade do plano do esboço
        const pts = [];
        const R = 120;
        const passo = ui.passo >= 5 ? 10 : 5;
        for (let x = -R; x <= R; x += passo) pts.push(x, -R, 0, x, R, 0, -R, x, 0, R, x, 0);
        g.add(linhas(pts, mat.gradeEsboco));
        g.add(linhas([0, 0, 0.02, 20, 0, 0.02], new THREE.LineBasicMaterial({ color: '#ff6b6b', toneMapped: false, depthTest: false })));
        g.add(linhas([0, 0, 0.02, 0, 20, 0.02], new THREE.LineBasicMaterial({ color: '#6bff9b', toneMapped: false, depthTest: false })));
        // pontos coincidentes
        const pontos = (esb.ents || []).flatMap((e) => N.extremos(e).map((v) => ({ v, e })));
        const marcas = [];
        for (let i = 0; i < pontos.length; i++) {
          for (let j = i + 1; j < pontos.length; j++) {
            if (pontos[i].e !== pontos[j].e && pontos[i].v.distanceTo(pontos[j].v) < 0.05) marcas.push(pontos[i].v);
          }
        }
        if (marcas.length) {
          const geo = new THREE.BufferGeometry().setFromPoints(marcas.map((v) => new THREE.Vector3(v.x, v.y, 0.1)));
          const pts2 = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffd84d', size: 6, sizeAttenuation: false, depthTest: false, toneMapped: false }));
          pts2.renderOrder = 8;
          g.add(pts2);
        }
      }
      vistaEsboco.add(g);
      g.updateMatrixWorld(true);
    }
    // prévia do que está sendo desenhado
    if (ativo && (visaoEsboco.previa || visaoEsboco.traco)) {
      const base = N.basePlano(ativo.plano);
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      g.matrix.copy(base.matriz);
      const pos = [];
      const ents = visaoEsboco.previa ? [].concat(visaoEsboco.previa) : [];
      for (const e of ents) {
        const pts = N.pontosEntidade(e);
        for (let i = 1; i < pts.length; i++) pos.push(pts[i - 1].x, pts[i - 1].y, 0.1, pts[i].x, pts[i].y, 0.1);
      }
      if (visaoEsboco.traco) {
        const t = visaoEsboco.traco;
        for (let i = 1; i < t.length; i++) pos.push(t[i - 1][0], t[i - 1][1], 0.1, t[i][0], t[i][1], 0.1);
      }
      const l = linhas(pos, mat.novo);
      l.renderOrder = 8;
      g.add(l);
      vistaEsboco.add(g);
      g.updateMatrixWorld(true);
    }
    tela?.cotas();
  }

  // rótulos das cotas do esboço ativo (posição no plano + texto)
  function cotasEsboco() {
    const esb = esbocoAtivo();
    if (!esb) return [];
    const base = N.basePlano(esb.plano);
    const ents = [...(esb.ents || []), ...(visaoEsboco.previa ? [].concat(visaoEsboco.previa).map((e) => ({ ...e, previa: true })) : [])];
    return ents.map((e) => {
      let texto = '';
      let u = 0;
      let v = 0;
      if (e.t === 'linha') {
        const c = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
        texto = `${fmt(c)}${e.h ? ' ⏤H' : e.v ? ' ⏐V' : ''}`;
        u = (e.a[0] + e.b[0]) / 2;
        v = (e.a[1] + e.b[1]) / 2;
      } else if (e.t === 'ret') {
        texto = `${fmt(Math.abs(e.b[0] - e.a[0]))} × ${fmt(Math.abs(e.b[1] - e.a[1]))}`;
        u = (e.a[0] + e.b[0]) / 2;
        v = Math.max(e.a[1], e.b[1]);
      } else if (e.t === 'circ') {
        texto = `Ø${fmt(e.r * 2)}`;
        u = e.c[0];
        v = e.c[1] + e.r;
      } else if (e.t === 'arco') {
        const g = N.geometriaArco(e);
        texto = `R${fmt(g.raio)}${e.tg ? ' ◠T' : ''}`;
        const meio = g.pontos[Math.floor(g.pontos.length / 2)];
        u = meio.x;
        v = meio.y;
      } else if (e.t === 'poli') {
        texto = `⬡${e.n} Ø${fmt(e.r * 2)}`;
        u = e.c[0];
        v = e.c[1] + e.r;
      }
      return { ponto: N.doPlano(base, u, v), texto, classe: e.previa ? 'novo' : e.id === ui.entSel ? 'sel' : 'esboco' };
    });
  }

  // ---------- vista: giro (quaternion), escala e centro ----------
  const estado = {
    vista: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, -0.6, 0)), vistaAlvo: null,
    escalaVista: 0.04, escalaAlvo: 0.04, centro: new THREE.Vector3(0, 15, 0), centroAlvo: new THREE.Vector3(0, 15, 0),
    arraste: null, gestoAntes: 'nenhum', pega: null, duas: null, menu: { aberto: false, desde: 0, fora: 0 }, ultimoToque: 0,
  };
  const VISTAS = {
    frente: new THREE.Euler(0, 0, 0), tras: new THREE.Euler(0, Math.PI, 0), topo: new THREE.Euler(Math.PI / 2, 0, 0), base: new THREE.Euler(-Math.PI / 2, 0, 0),
    direita: new THREE.Euler(0, -Math.PI / 2, 0), esquerda: new THREE.Euler(0, Math.PI / 2, 0), iso: new THREE.Euler(0.52, -Math.PI / 4, 0),
  };
  function olharPara(nome) {
    const e = VISTAS[nome];
    if (!e) return;
    estado.vistaAlvo = new THREE.Quaternion().setFromEuler(e);
    som.clique();
  }
  // vira a vista de frente para um plano (normal no espaço da peça)
  function olharParaPlano(plano) {
    const n = new THREE.Vector3(...plano.n).normalize();
    const x = new THREE.Vector3(...plano.x).normalize();
    const y = new THREE.Vector3().crossVectors(n, x);
    const m = new THREE.Matrix4().makeBasis(x, y, n);
    estado.vistaAlvo = new THREE.Quaternion().setFromRotationMatrix(m).invert();
  }

  // ---------- montagem ----------
  const montagem = criarMontagem({
    grupo: montagemVista,
    peca: (id) => {
      const p = doc.pecas.find((x) => x.id === id);
      if (!p) return null;
      const a = avaliacao(p);
      return { nome: p.nome, geometria: a.geometria, material: p.material, eixos: a.eixos, massa: a.massa, linhas: a.linhasRosca };
    },
    materialPara: (chave, real, cor) => (real ? materialReal(chave, cor) : mat.holo),
    arestaPara: (real, rosca) => (rosca ? mat.rosca : real ? mat.arestaReal : mat.arestaHolo),
  });
  montagemVista.visible = false;

  // ---------- extras ----------
  const apresentacao = renderer ? criarApresentacao({ raiz, canvas: renderer.domElement }) : null;

  // ---------- mensagens ----------
  function aviso(texto) {
    tela?.toast(texto);
  }
  function evento(texto) {
    aoEvento?.(texto);
  }

  // ======================================================================
  // AÇÕES (chamadas pela tela, pelas mãos e pela voz)
  // ======================================================================
  const acoes = {};

  acoes.aba = (nome) => {
    if (!['esboco', 'modelo', 'montagem', 'desenho', 'inspecao'].includes(nome)) return;
    if (nome === 'esboco' && !ui.esboco) {
      acoes.novoEsboco();
      return;
    }
    if (ui.aba === 'esboco' && nome !== 'esboco') acoes.terminarEsboco(false);
    ui.aba = nome;
    ui.ferramenta = { esboco: 'linha', modelo: 'selecionar', montagem: 'mover_comp', desenho: 'nenhuma', inspecao: 'medir' }[nome];
    pecaVista.visible = nome !== 'montagem';
    montagemVista.visible = nome === 'montagem';
    if (nome === 'montagem') {
      if (!montagem.comps.length) montagem.inserir({ peca: peca().id });
      montagem.reconstruir();
      montagem.aplicarVisual(ui.real);
      enquadrar();
    } else {
      recalcular();
    }
    if (nome !== 'inspecao') {
      ui.medir = [];
      linhaMedida.geometry = new THREE.BufferGeometry();
      if (ui.esforco) {
        ui.esforco = null;
        aplicarMaterialSolido();
      }
    }
    if (nome !== 'montagem') montagem.explodir(0);
    som.clique();
    redesenhar();
  };

  acoes.ferramenta = (nome) => {
    const unicas = {
      novo_esboco: () => acoes.novoEsboco(), extrudir: () => acoes.novoRecurso('extrusao'), revolucionar: () => acoes.novoRecurso('revolucao'),
      arredondar: () => acoes.novoRecurso('arredondar'), chanfro: () => acoes.novoRecurso('chanfro'), casca: () => acoes.novoRecurso('casca'),
      padrao_ret: () => acoes.novoRecurso('padrao_ret'), padrao_circ: () => acoes.novoRecurso('padrao_circ'), espelhar: () => acoes.novoRecurso('espelhar'),
      terminar: () => acoes.terminarEsboco(true), apagar_ent: () => acoes.apagarEntidade(), construcao: () => acoes.construcao(),
      nova_peca: () => acoes.novaPeca(), stl: () => acoes.exportar('stl'), obj: () => acoes.exportar('obj'), glb: () => acoes.exportar('glb'),
      folha: () => acoes.folha(), explodir: () => { montagem.explodir(montagem.explosao > 0.05 ? 0 : 1); redesenhar(); },
    };
    if (unicas[nome]) {
      som.clique();
      unicas[nome]();
      return;
    }
    if (ui.edicao?.novo && nome !== ui.ferramenta && !['material', 'parametros'].includes(nome)) acoes.ok();
    ui.ferramenta = nome;
    ui.escolhaRestricao = null;
    if (['furo', 'primitivas'].includes(nome) && !ui.edicao) {
      ui.sel = null;
      desenharSelecao();
    }
    if (nome === 'corte') {
      ui.corte.ativo = !ui.corte.ativo;
      atualizarCorte();
      aplicarMaterialSolido();
    }
    if (nome === 'massa') {
      ui.cg = !ui.cg;
      marcaCg.visible = ui.cg;
    }
    if (nome !== 'medir') {
      ui.medir = [];
      linhaMedida.geometry = new THREE.BufferGeometry();
    }
    if (nome !== 'esforco' && ui.esforco) {
      ui.esforco = null;
      aplicarMaterialSolido();
    }
    som.clique();
    redesenhar();
  };

  // ----- esboço -----
  acoes.novoEsboco = (plano = null) => {
    if (!plano) {
      // primeiro escolhe o plano (ou uma face, com a pinça)
      ui.ferramenta = 'escolher_plano';
      ui.aba = 'modelo';
      pecaVista.visible = true;
      montagemVista.visible = false;
      redesenhar();
      aviso('ESCOLHA O PLANO DO ESBOÇO OU FAÇA PINÇA NUMA FACE');
      return;
    }
    marcar();
    const p = peca();
    const pl = typeof plano === 'string' ? { ...N.PLANOS[plano], ref: plano } : plano;
    const esb = { id: novoId(), tipo: 'esboco', nome: nomeNovo('esboco'), plano: { o: pl.o, n: pl.n, x: pl.x }, ref: pl.ref || 'face', ents: [] };
    p.recursos.splice(fimAtual(), 0, esb);
    if (p.fim != null) p.fim++;
    ui.esboco = esb.id;
    ui.sel = esb.id;
    ui.entSel = null;
    ui.aba = 'esboco';
    ui.ferramenta = 'linha';
    ui.edicao = null;
    olharParaPlano(esb.plano);
    recalcular();
    redesenhar();
    salvar();
    evento(`começou um esboço 2D no plano ${pl.ref ? (N.PLANOS[pl.ref]?.nome || pl.ref).toLowerCase() : 'de uma face'} da oficina`);
    som.montar();
  };

  acoes.editarEsboco = (id) => {
    const esb = recurso(id);
    if (!esb || esb.tipo !== 'esboco') return;
    ui.esboco = id;
    ui.sel = id;
    ui.aba = 'esboco';
    ui.ferramenta = 'linha';
    ui.edicao = null;
    olharParaPlano(esb.plano);
    desenharEsboco();
    redesenhar();
  };

  acoes.terminarEsboco = (continuar = true) => {
    const esb = esbocoAtivo();
    ui.esboco = null;
    ui.entSel = null;
    visaoEsboco.previa = null;
    visaoEsboco.traco = null;
    ui.aba = 'modelo';
    ui.ferramenta = 'selecionar';
    if (esb && !esb.ents.length) {
      // esboço vazio não fica na árvore
      const p = peca();
      p.recursos = p.recursos.filter((r) => r !== esb);
      ui.sel = null;
      recalcular();
      redesenhar();
      salvar();
      return;
    }
    recalcular();
    redesenhar();
    salvar();
    if (!esb) return;
    evento(`terminou o ${esb.nome} com ${esb.ents.length} entidades`);
    // como no Inventor: esboço com perfil fechado e ainda sem uso já abre a extrusão
    const usado = peca().recursos.some((r) => r.esboco === esb.id);
    if (continuar && !usado && N.lacosDoEsboco(esb).length) {
      acoes.novoRecurso('extrusao', { esboco: esb.id });
      aviso('🤏 PUXE PARA CIMA PARA DAR ALTURA · 👍 CONFIRMA');
    }
  };

  acoes.adicionarEntidades = (ents, mensagem = null) => {
    const esb = esbocoAtivo();
    if (!esb || !ents.length) return;
    marcar();
    for (const e of ents) esb.ents.push({ id: novoId(), ...e });
    ui.entSel = esb.ents[esb.ents.length - 1].id;
    recalcular();
    redesenhar();
    salvar();
    if (mensagem) aviso(mensagem);
    som.soltar();
  };

  acoes.apagarEntidade = () => {
    const esb = esbocoAtivo();
    if (!esb || !ui.entSel) return aviso('SELECIONE UMA LINHA DO ESBOÇO');
    marcar();
    esb.ents = esb.ents.filter((e) => e.id !== ui.entSel);
    ui.entSel = null;
    recalcular();
    redesenhar();
    salvar();
    som.desmontar();
  };

  acoes.construcao = () => {
    const esb = esbocoAtivo();
    const e = esb?.ents.find((x) => x.id === ui.entSel);
    if (!e) return aviso('SELECIONE UMA LINHA PARA VIRAR CONSTRUÇÃO');
    marcar();
    e.construcao = !e.construcao;
    recalcular();
    redesenhar();
    salvar();
  };

  acoes.mudarEntidade = (e, mudar) => {
    marcar();
    mudar(e);
    agendar();
    desenharEsboco();
    salvar();
  };

  // ----- recursos -----
  function alvoPadrao(tipos) {
    const p = peca();
    const sel = recurso(ui.sel);
    if (sel && tipos.includes(sel.tipo)) return sel.id;
    const lista = p.recursos.slice(0, fimAtual()).filter((r) => tipos.includes(r.tipo) && !r.suprimido);
    return lista.length ? lista[lista.length - 1].id : null;
  }

  function esbocoPadrao() {
    const p = peca();
    const sel = recurso(ui.sel);
    if (sel?.tipo === 'esboco') return sel.id;
    const usados = new Set(p.recursos.filter((r) => r.esboco).map((r) => r.esboco));
    const livres = p.recursos.slice(0, fimAtual()).filter((r) => r.tipo === 'esboco' && !usados.has(r.id) && N.lacosDoEsboco(r).length);
    if (livres.length) return livres[livres.length - 1].id;
    const todos = p.recursos.slice(0, fimAtual()).filter((r) => r.tipo === 'esboco' && N.lacosDoEsboco(r).length);
    return todos.length ? todos[todos.length - 1].id : null;
  }

  const PADROES = {
    extrusao: () => ({ distancia: '10', direcao: 'normal', operacao: 'juntar', fim: 'distancia' }),
    revolucao: () => ({ eixo: 'y', angulo: '360', operacao: 'juntar' }),
    furo: () => ({ estilo: 'simples', diametro: '8', profundidade: '10', passante: false, rosca: 'M8', escDiam: '16', escAng: '90', rebDiam: '14', rebProf: '5', profundidadeRosca: '' }),
    arredondar: () => ({ raio: '2', arestas: 'todas' }),
    chanfro: () => ({ raio: '1', arestas: 'todas' }),
    casca: () => ({ espessura: '2', face: 'aberta' }),
    padrao_ret: () => ({ n1: '3', d1: '20', dir1: 'x', n2: '1', d2: '20', dir2: 'z' }),
    padrao_circ: () => ({ n: '6', angulo: '360', eixo: 'y', centro: ['0', '0', '0'] }),
    espelhar: () => ({ plano: 'yz', desloc: '0' }),
    primitiva: () => ({ forma: ui.primitiva, m: { ...N.PRIMITIVAS[ui.primitiva].medidas }, pos: [0, 0, 0], giro: 0, operacao: ui.primitiva === 'rasgo' ? 'cortar' : 'juntar' }),
  };

  acoes.novoRecurso = (tipo, extra = {}) => {
    if (ui.esboco) acoes.terminarEsboco(false);
    if (ui.edicao?.novo) acoes.ok();
    const r = { id: novoId(), tipo, nome: nomeNovo(tipo), ...PADROES[tipo](), ...extra };
    if (tipo === 'extrusao' || tipo === 'revolucao') {
      r.esboco ||= esbocoPadrao();
      if (!r.esboco) {
        aviso('PRIMEIRO FAÇA UM ESBOÇO COM UM PERFIL FECHADO');
        acoes.novoEsboco();
        return null;
      }
      const esb = recurso(r.esboco);
      // esboço numa face: corte entra na peça
      if (esb?.ref === 'face' && extra.operacao === 'cortar') r.direcao = 'inversa';
      if (tipo === 'revolucao') {
        const linhaEixo = esb?.ents.find((e) => e.construcao && e.t === 'linha');
        if (linhaEixo) r.eixo = linhaEixo.id;
      }
    }
    if (['arredondar', 'chanfro'].includes(tipo)) {
      r.alvo = r.alvo || alvoPadrao(['extrusao']);
      if (!r.alvo) {
        aviso('ARREDONDAR E CHANFRO FUNCIONAM EM EXTRUSÕES');
        return null;
      }
    }
    if (['padrao_ret', 'padrao_circ', 'espelhar'].includes(tipo)) {
      r.alvo = r.alvo || alvoPadrao(['furo', 'extrusao', 'primitiva', 'revolucao']);
      if (!r.alvo) {
        aviso('FAÇA PRIMEIRO O RECURSO QUE VAI SER REPETIDO');
        return null;
      }
    }
    if (tipo === 'furo' && !r.ponto) {
      ui.ferramenta = 'furo';
      redesenhar();
      aviso('FAÇA PINÇA NA FACE ONDE VAI O FURO');
      return null;
    }
    marcar();
    const p = peca();
    p.recursos.splice(fimAtual(), 0, r);
    if (p.fim != null) p.fim++;
    ui.sel = r.id;
    ui.edicao = { id: r.id, novo: true };
    recalcular();
    redesenhar();
    som.montar();
    return r;
  };

  acoes.ok = () => {
    const ed = ui.edicao;
    if (!ed) return;
    const r = recurso(ed.id);
    ui.edicao = null;
    if (r) {
      evento(`criou ${r.nome} (${N.resumoRecurso(r)}) na peça ${peca().nome}`);
      aviso(`✓ ${r.nome.toUpperCase()}`);
    }
    if (ui.ferramenta !== 'furo') ui.ferramenta = 'selecionar';
    desenharSelecao();
    redesenhar();
    salvar();
    som.soltar();
  };

  acoes.cancelar = () => {
    const ed = ui.edicao;
    if (!ed) return;
    ui.edicao = null;
    if (ed.novo) {
      const p = peca();
      const i = p.recursos.findIndex((r) => r.id === ed.id);
      if (i >= 0) {
        p.recursos.splice(i, 1);
        if (p.fim != null && i < p.fim) p.fim--;
      }
      desfazerPilha.pop();
      ui.sel = null;
    }
    recalcular();
    redesenhar();
    som.desmontar();
  };

  // muda um campo de um recurso (a tela chama a cada edição)
  acoes.mudarCampo = (r, chave, valor, estrutural = false) => {
    if (!r) return;
    if (!ui.edicao) marcar();
    if (Array.isArray(chave)) {
      let alvo = r;
      for (const k of chave.slice(0, -1)) alvo = alvo[k];
      alvo[chave[chave.length - 1]] = valor;
    } else {
      r[chave] = valor;
    }
    if (r.tipo === 'extrusao' && chave === 'operacao') {
      const esb = recurso(r.esboco);
      if (esb?.ref === 'face') r.direcao = valor === 'cortar' ? 'inversa' : 'normal';
    }
    agendar();
    salvar();
    if (estrutural) redesenhar();
    else tela?.arvore();
  };

  acoes.selecionar = (id) => {
    if (ui.edicao?.novo && ui.edicao.id !== id) acoes.ok();
    ui.sel = ui.sel === id ? null : id;
    ui.compSel = null;
    const r = recurso(ui.sel);
    if (r?.tipo === 'esboco' && ui.aba !== 'esboco') desenharEsboco();
    desenharSelecao();
    desenharEsboco();
    redesenhar();
    som.clique();
  };

  acoes.suprimir = (id) => {
    const r = recurso(id);
    if (!r) return;
    marcar();
    r.suprimido = !r.suprimido;
    recalcular();
    redesenhar();
    salvar();
    evento(`${r.suprimido ? 'suprimiu' : 'reativou'} o recurso ${r.nome}`);
  };

  acoes.apagarRecurso = (id) => {
    const p = peca();
    const r = recurso(id);
    if (!r) return;
    marcar();
    // quem depende dele vai junto (extrusão de um esboço, padrão de um furo…)
    const remover = new Set([id]);
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const x of p.recursos) {
        if (!remover.has(x.id) && (remover.has(x.esboco) || remover.has(x.alvo))) {
          remover.add(x.id);
          mudou = true;
        }
      }
    }
    const antes = p.recursos.length;
    p.recursos = p.recursos.filter((x) => !remover.has(x.id));
    if (p.fim != null) p.fim = Math.max(0, p.fim - (antes - p.recursos.length));
    if (remover.has(ui.sel)) ui.sel = null;
    if (remover.has(ui.esboco)) ui.esboco = null;
    if (ui.edicao && remover.has(ui.edicao.id)) ui.edicao = null;
    recalcular();
    redesenhar();
    salvar();
    som.desmontar();
    evento(`apagou ${r.nome}${remover.size > 1 ? ` e ${remover.size - 1} recurso(s) que dependiam dele` : ''}`);
  };

  // fim da peça: mostra só os recursos acima dele (volta no tempo)
  acoes.moverFim = (indice) => {
    const p = peca();
    const n = p.recursos.length;
    const novo = THREE.MathUtils.clamp(Math.round(indice), 0, n);
    marcar();
    p.fim = novo >= n ? null : novo;
    recalcular();
    redesenhar();
    salvar();
    som.clique();
  };

  acoes.renomear = (r, nome) => {
    if (!nome?.trim()) return;
    marcar();
    r.nome = nome.trim().slice(0, 40);
    redesenhar();
    salvar();
  };

  acoes.material = (chave) => {
    if (!N.MATERIAIS[chave]) return;
    marcar();
    peca().material = chave;
    cacheAval.delete(peca().id);
    recalcular();
    if (montagem.comps.length) montagem.aplicarVisual(ui.real);
    redesenhar();
    salvar();
    evento(`mudou o material da peça para ${N.MATERIAIS[chave].nome}`);
    som.clique();
  };

  acoes.parametro = (indice, campo, valor) => {
    const p = peca();
    marcar();
    if (indice === 'novo') {
      let n = p.parametros.length;
      while (p.parametros.some((x) => x.nome === `d${n}`)) n++;
      p.parametros.push({ nome: `d${n}`, expr: '10' });
    } else if (campo === 'apagar') {
      p.parametros.splice(indice, 1);
    } else {
      p.parametros[indice][campo] = campo === 'nome' ? String(valor).replace(/[^\wÀ-ú]/g, '').slice(0, 20) || `d${indice}` : valor;
    }
    recalcular();
    salvar();
    if (indice === 'novo' || campo === 'apagar' || campo === 'nome') redesenhar();
    else tela?.props();
  };

  acoes.renomearPeca = (nome) => {
    marcar();
    peca().nome = String(nome || '').trim().slice(0, 40) || peca().nome;
    redesenhar();
    salvar();
  };

  acoes.novaPeca = () => {
    marcar();
    const p = novaPeca(`Peça ${doc.pecas.length + 1}`);
    doc.pecas.push(p);
    doc.ativa = p.id;
    ui.sel = null;
    ui.edicao = null;
    ui.esboco = null;
    ui.aba = 'modelo';
    ui.ferramenta = 'selecionar';
    pecaVista.visible = true;
    montagemVista.visible = false;
    recalcular();
    redesenhar();
    salvar();
    aviso(`NOVA PEÇA: ${p.nome.toUpperCase()}`);
    evento(`criou uma peça nova na oficina (${p.nome})`);
  };

  acoes.abrirPeca = (id) => {
    if (!doc.pecas.some((p) => p.id === id)) return;
    doc.ativa = id;
    ui.sel = null;
    ui.edicao = null;
    ui.esboco = null;
    if (ui.aba === 'montagem' || ui.aba === 'esboco') {
      ui.aba = 'modelo';
      ui.ferramenta = 'selecionar';
      pecaVista.visible = true;
      montagemVista.visible = false;
    }
    recalcular();
    redesenhar();
    salvar();
  };

  acoes.desfazer = () => {
    if (ui.edicao?.novo) {
      acoes.cancelar();
      return 'Recurso novo cancelado.';
    }
    const anterior = desfazerPilha.pop();
    if (!anterior) return 'Nada para desfazer.';
    refazerPilha.push(fotografar());
    restaurar(anterior);
    som.clique();
    aviso('↶ DESFEITO');
    return 'Desfeito.';
  };
  acoes.refazer = () => {
    const proximo = refazerPilha.pop();
    if (!proximo) return 'Nada para refazer.';
    desfazerPilha.push(fotografar());
    restaurar(proximo);
    return 'Refeito.';
  };

  acoes.passo = (n) => {
    ui.passo = n;
    salvar();
    redesenhar();
  };

  // ----- montagem -----
  acoes.inserir = (ref) => {
    marcar();
    const c = montagem.inserir(ref);
    ui.compSel = c.id;
    montagem.destacar(c.id);
    enquadrar();
    redesenhar();
    salvar();
    som.montar();
    evento(`inseriu ${montagem.nomeDe(c.id)} na montagem`);
    return c;
  };
  acoes.removerComp = (id) => {
    marcar();
    montagem.remover(id);
    if (ui.compSel === id) ui.compSel = null;
    redesenhar();
    salvar();
  };
  acoes.girarComp = (id, eixo, graus) => {
    marcar();
    montagem.girar(id, eixo, graus);
    redesenhar();
    salvar();
  };
  acoes.moverComp = (id, i, valor) => {
    const c = montagem.comps.find((x) => x.id === id);
    if (!c) return;
    marcar();
    const pos = [...c.pos];
    pos[i] = valor;
    montagem.mover(id, pos);
    salvar();
  };
  acoes.fixarComp = (id) => {
    const c = montagem.comps.find((x) => x.id === id);
    if (!c) return;
    c.fixo = !c.fixo;
    redesenhar();
    salvar();
  };
  acoes.removerRestricao = (id) => {
    marcar();
    montagem.removerRestricao(id);
    redesenhar();
    salvar();
  };
  acoes.explodir = (f) => {
    montagem.explodir(f);
    tela?.props();
  };

  // ----- saída -----
  function geometriaParaSaida() {
    if (ui.aba === 'montagem' && montagem.comps.length) {
      const malhas = montagem.malhasNoLugar();
      const cena2 = new THREE.Group();
      for (const m of malhas) {
        const c = new THREE.Mesh(m.geometry, m.material);
        m.updateWorldMatrix(true, false);
        const local = new THREE.Matrix4().copy(montagemVista.matrixWorld).invert().multiply(m.matrixWorld);
        c.applyMatrix4(local);
        cena2.add(c);
      }
      return { objeto: cena2, nome: `montagem-${normalizar(peca().nome).replace(/\W+/g, '-')}` };
    }
    const a = avaliacao();
    if (!a.geometria) return null;
    const m = new THREE.Mesh(a.geometria, ui.real ? materialReal(peca().material) : materialReal(peca().material));
    return { objeto: m, nome: normalizar(peca().nome).replace(/\W+/g, '-') || 'peca' };
  }

  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function glb(objeto) {
    return new Promise((ok, falha) => {
      // GLB em metros (o padrão do formato), girado como a peça na mesa
      const raizExp = new THREE.Group();
      const copia = objeto.clone();
      copia.scale.multiplyScalar(0.001);
      raizExp.add(copia);
      new GLTFExporter().parse(raizExp, (r) => ok(r), falha, { binary: true });
    });
  }

  acoes.exportar = async (formato = 'stl') => {
    const saida = geometriaParaSaida();
    if (!saida) return 'A peça ainda está vazia.';
    const data = new Date().toISOString().slice(0, 10);
    if (formato === 'obj') {
      baixar(new Blob([new OBJExporter().parse(saida.objeto)], { type: 'text/plain' }), `${saida.nome}-${data}.obj`);
    } else if (formato === 'glb') {
      baixar(new Blob([await glb(saida.objeto)], { type: 'model/gltf-binary' }), `${saida.nome}-${data}.glb`);
    } else {
      baixar(new Blob([new STLExporter().parse(saida.objeto, { binary: true })], { type: 'model/stl' }), `${saida.nome}-${data}.stl`);
    }
    som.clique();
    evento(`exportou ${ui.aba === 'montagem' ? 'a montagem' : 'a peça'} em ${formato.toUpperCase()}`);
    aviso(`⇩ ${formato.toUpperCase()} BAIXADO`);
    return `Exportei em ${formato.toUpperCase()}.`;
  };

  function notasDaPeca() {
    const p = peca();
    const a = avaliacao();
    const fim = fimAtual();
    const ativos = p.recursos.slice(0, fim).filter((r) => !r.suprimido);
    const notas = [];
    const furos = new Map();
    for (const r of ativos) {
      if (r.tipo !== 'furo') continue;
      const copias = ativos.filter((x) => x.alvo === r.id && a.geos.get(x.id)?.matrizes).reduce((s, x) => s + a.geos.get(x.id).matrizes.length, 0);
      const chave = r.estilo === 'roscado' ? `FURO ${r.rosca} (BROCA Ø${fmt(N.ROSCAS[r.rosca]?.broca)})` : `FURO Ø${fmt(N.avaliarExpr(r.diametro, a.vars))}${r.estilo === 'escareado' ? ' ESCAREADO 90°' : r.estilo === 'rebaixado' ? ' REBAIXADO' : ''}`;
      const prof = r.passante ? 'PASSANTE' : `PROF. ${fmt(N.avaliarExpr(r.profundidade, a.vars))}`;
      const k = `${chave} ${prof}`;
      furos.set(k, (furos.get(k) || 0) + 1 + copias);
    }
    for (const [k, n] of furos) notas.push(`${n}× ${k}`);
    const raios = ativos.filter((r) => r.tipo === 'arredondar').map((r) => `R${fmt(N.avaliarExpr(r.raio, a.vars))}`);
    if (raios.length) notas.push(`ARREDONDAMENTOS ${[...new Set(raios)].join(', ')}`);
    const chanfros = ativos.filter((r) => r.tipo === 'chanfro').map((r) => `${fmt(N.avaliarExpr(r.raio, a.vars))}×45°`);
    if (chanfros.length) notas.push(`CHANFROS ${[...new Set(chanfros)].join(', ')}`);
    notas.push('QUEBRAR CANTOS VIVOS NÃO COTADOS.');
    return notas;
  }

  acoes.folha = () => {
    const a = avaliacao();
    if (!a.geometria) return 'A peça ainda está vazia.';
    const p = peca();
    try {
      ui.folha = gerarFolha({
        geometria: a.geometria, nome: p.nome, material: N.MATERIAIS[p.material]?.nome, massa: a.massa, volume: a.volume / 1000, notas: notasDaPeca(),
      });
    } catch (erro) {
      console.warn('Oficina: folha falhou', erro);
      aviso('NÃO CONSEGUI GERAR A FOLHA');
      return 'Não consegui gerar a folha.';
    }
    tela?.folha(ui.folha);
    som.montar();
    evento(`gerou o desenho técnico A4 da peça ${p.nome}`);
    return 'Desenho técnico A4 pronto, com as três vistas, a isométrica, as cotas e o carimbo.';
  };
  acoes.baixarFolha = () => {
    if (!ui.folha) return;
    ui.folha.toBlob((b) => baixar(b, `desenho-${normalizar(peca().nome).replace(/\W+/g, '-')}.png`), 'image/png');
  };
  acoes.fecharFolha = () => {
    ui.folha = null;
    tela?.folha(null);
  };

  // ----- inspeção -----
  function atualizarCorte() {
    const a = avaliacao();
    const caixa = a.caixa.isEmpty() ? new THREE.Box3(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(30, 30, 30)) : a.caixa;
    const eixo = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }[ui.corte.eixo];
    const c = caixa.getCenter(new THREE.Vector3());
    const tam = caixa.getSize(new THREE.Vector3());
    const ponto = c.clone().addScaledVector(eixo, ui.corte.pos);
    // o plano guarda o lado de cá; normal para dentro do que fica visível
    ui.corte.normalLocal = eixo.clone().multiplyScalar(ui.corte.inverter ? 1 : -1);
    ui.corte.pontoLocal = ponto;
    planoVisivel.visible = ui.corte.ativo;
    planoVisivel.position.copy(ponto);
    planoVisivel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), eixo);
    planoVisivel.scale.setScalar(Math.max(tam.x, tam.y, tam.z) * 1.4 + 10);
    ui.corte.limite = (eixo.x * tam.x + eixo.y * tam.y + eixo.z * tam.z) / 2 + 2;
  }
  acoes.corte = (mudanca) => {
    Object.assign(ui.corte, mudanca);
    atualizarCorte();
    aplicarMaterialSolido();
    tela?.props();
  };

  acoes.esforcoEm = (pontoLocal, normalLocal) => {
    const a = avaliacao();
    if (!a.geometria) return;
    const m = N.MATERIAIS[peca().material];
    const tam = a.caixa.getSize(new THREE.Vector3()).length();
    const fina = refinar(a.geometria, Math.max(1.2, tam / 70));
    const r = calcularEsforco(fina, pontoLocal, normalLocal.clone().negate(), ui.forca, m.escoamento);
    fina.setAttribute('color', new THREE.BufferAttribute(r.cores, 3));
    calorMalha.geometry.dispose();
    calorMalha.geometry = fina;
    ui.esforco = { ...r, ponto: pontoLocal.clone() };
    aplicarMaterialSolido();
    tela?.props();
    som.agarrar();
    evento(`testou um esforço de ${ui.forca} N na peça: tensão máxima estimada ${fmt(r.maximo)} MPa, fator de segurança ${fmt(r.fatorSeguranca)}`);
  };
  acoes.limparEsforco = () => {
    ui.esforco = null;
    aplicarMaterialSolido();
    tela?.props();
  };
  acoes.forca = (n) => {
    ui.forca = THREE.MathUtils.clamp(Math.round(n), 1, 5000);
    if (ui.esforco) acoes.esforcoEm(ui.esforco.ponto, ui.esforco.normal || new THREE.Vector3(0, 1, 0));
    else tela?.props();
  };

  // ----- futuristas -----
  // F1: a voz (ou um texto) vira operações; o n8n traduz a frase com IA
  acoes.projetarPorTexto = async (pedido, imagem = null) => {
    const s = servicos();
    if (!s?.projetar) return 'O cérebro (n8n) não está ligado: configure a chave para projetar pela voz.';
    aviso(imagem ? '📷 ANALISANDO A FOTO…' : '🧠 PROJETANDO…');
    tela?.ocupado(true);
    try {
      const r = await s.projetar({ pedido, imagem, modelo: acoes.modelo() });
      const resumo = acoes.aplicarOperacoes(r?.operacoes || []);
      return r?.resposta ? `${r.resposta} ${resumo}`.trim() : resumo;
    } catch (erro) {
      aviso('O CÉREBRO NÃO RESPONDEU');
      return `Não consegui projetar agora (${erro.message}).`;
    } finally {
      tela?.ocupado(false);
    }
  };

  acoes.fotoPeca = async (pedido = '') => {
    const imagem = fotoDoVideo(video());
    if (!imagem) return 'A câmera não está ligada.';
    ui.foto = `data:image/jpeg;base64,${imagem}`;
    tela?.props();
    return acoes.projetarPorTexto(pedido || 'Modele uma peça mecânica parecida com o objeto que aparece na foto, com medidas aproximadas em milímetros.', imagem);
  };

  // F3: GLB temporário no n8n e QR code para abrir no celular em realidade aumentada
  acoes.celular = async () => {
    const s = servicos();
    if (!s?.publicarRA) return 'O cérebro (n8n) não está ligado: configure a chave para mandar a peça ao celular.';
    const saida = geometriaParaSaida();
    if (!saida) return 'A peça ainda está vazia.';
    tela?.ocupado(true);
    aviso('📱 PREPARANDO A PEÇA PARA O CELULAR…');
    try {
      const bin = await glb(saida.objeto);
      const b64 = btoa(Array.from(new Uint8Array(bin), (b) => String.fromCharCode(b)).join(''));
      const r = await s.publicarRA({ glb: b64, nome: peca().nome });
      if (!r?.url) throw new Error('sem endereço');
      ui.qr = { url: r.url, canvas: await gerarQR(r.url, 240) };
      tela?.props();
      evento('mandou a peça para o celular em realidade aumentada (QR code na tela)');
      return 'Pronto: aponte a câmera do celular para o QR code para ver a peça em realidade aumentada. O link vale por 24 horas.';
    } catch (erro) {
      aviso('NÃO CONSEGUI MANDAR PARA O CELULAR');
      return `Não consegui preparar a peça para o celular (${erro.message}).`;
    } finally {
      tela?.ocupado(false);
    }
  };

  // F4: apresentação de cinema
  acoes.apresentar = async (gravar = ui.apresentacao.gravar) => {
    if (!apresentacao) return 'A apresentação precisa do renderizador.';
    const p = peca();
    const a = avaliacao();
    if (!a.geometria && !montagem.comps.length) return 'A peça ainda está vazia.';
    const tam = a.caixa.isEmpty() ? null : a.caixa.getSize(new THREE.Vector3());
    const mat2 = N.MATERIAIS[p.material];
    const furos = notasDaPeca().filter((n) => n.includes('FURO'));
    const falas = [
      { t: 0.6, texto: `Apresentando ${p.nome}, projetada na oficina do Jarvis.` },
      { t: 4.6, texto: `Material: ${mat2.nome.toLowerCase()}. Massa de ${fmt(a.massa)} gramas, em ${p.recursos.filter((r) => !r.suprimido).length} recursos.` },
      tam && { t: 9, texto: `Dimensões gerais: ${fmt(tam.x, 0)} por ${fmt(tam.z, 0)} por ${fmt(tam.y, 0)} milímetros.` },
      { t: 13.2, texto: furos.length ? `Detalhes: ${furos.join('; ').toLowerCase()}.` : `Centro de gravidade a ${fmt(a.centro.y)} milímetros da base.` },
    ].filter(Boolean);
    const dados = [['MATERIAL', mat2.nome], ['MASSA', `${fmt(a.massa)} g`], ['VOLUME', `${fmt(a.volume / 1000)} cm³`], ...(tam ? [['DIMENSÕES', `${fmt(tam.x, 0)}×${fmt(tam.z, 0)}×${fmt(tam.y, 0)} mm`]] : [])];
    estado.cinema = { inicio: estado.vista.clone(), zoom: estado.escalaAlvo };
    evento(`começou a apresentação de cinema da peça ${p.nome}${gravar ? ', gravando vídeo' : ''}`);
    const video2 = await apresentacao.iniciar({ titulo: p.nome.toUpperCase(), subtitulo: 'J.A.R.V.I.S. · OFICINA HOLOGRÁFICA', falas, dados, duracao: 18, gravar });
    estado.cinema = null;
    estado.vistaAlvo = new THREE.Quaternion().setFromEuler(VISTAS.iso);
    if (ui.aba === 'montagem') montagem.explodir(0);
    if (video2) {
      baixar(video2, `apresentacao-${normalizar(p.nome).replace(/\W+/g, '-')}.webm`);
      aviso('🎬 VÍDEO BAIXADO');
      return 'Apresentação gravada: o vídeo foi baixado.';
    }
    return 'Apresentação concluída.';
  };

  // ======================================================================
  // VOZ E IA: modelo resumido e operações
  // ======================================================================
  acoes.modelo = () => {
    const p = peca();
    const a = avaliacao();
    const tam = a.caixa.isEmpty() ? [0, 0, 0] : a.caixa.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(1));
    const limpo = (r) => {
      const o = { ...r };
      delete o.suprimido;
      if (o.ents) o.ents = o.ents.map((e) => ({ ...e }));
      return o;
    };
    return {
      peca: { nome: p.nome, material: p.material, parametros: p.parametros, recursos: p.recursos.map(limpo), tamanho_mm: { x: tam[0], y: tam[1], z: tam[2] }, massa_g: +a.massa.toFixed(1) },
      pecas: doc.pecas.map((x) => x.nome), materiais: Object.keys(N.MATERIAIS), aba: ui.aba,
    };
  };

  // aplica a lista de operações vinda do cérebro (ou digitada); devolve um resumo
  acoes.aplicarOperacoes = (ops) => {
    if (!Array.isArray(ops) || !ops.length) return 'Não entendi nenhuma operação.';
    if (ui.esboco) acoes.terminarEsboco(false);
    if (ui.edicao?.novo) acoes.ok();
    marcar();
    const feitos = [];
    const acharAlvo = (alvo) => {
      const p = peca();
      if (!alvo || alvo === 'ultimo') return [...p.recursos].reverse().find((r) => r.tipo !== 'esboco' && r.tipo !== 'arredondar' && r.tipo !== 'chanfro');
      return p.recursos.find((r) => r.id === alvo || normalizar(r.nome) === normalizar(alvo));
    };
    const txt = (v) => (v == null ? undefined : String(v));
    let ultimoEsboco = null;
    for (const op of ops.slice(0, 60)) {
      try {
        const p = peca();
        const inserir = (r) => {
          p.recursos.splice(fimAtual(), 0, r);
          if (p.fim != null) p.fim++;
          return r;
        };
        switch (op.op) {
          case 'nova_peca': {
            const np = novaPeca(op.nome || `Peça ${doc.pecas.length + 1}`);
            doc.pecas.push(np);
            doc.ativa = np.id;
            feitos.push(`peça ${np.nome}`);
            break;
          }
          case 'renomear': p.nome = String(op.nome || p.nome).slice(0, 40); break;
          case 'material':
            if (N.MATERIAIS[op.material]) {
              p.material = op.material;
              feitos.push(`material ${N.MATERIAIS[op.material].nome.toLowerCase()}`);
            }
            break;
          case 'parametro': {
            const existente = p.parametros.find((x) => x.nome === op.nome);
            if (existente) existente.expr = txt(op.valor);
            else p.parametros.push({ nome: String(op.nome).replace(/[^\wÀ-ú]/g, ''), expr: txt(op.valor) });
            break;
          }
          case 'esboco': {
            const plano = N.PLANOS[op.plano] ? { ...N.PLANOS[op.plano], ref: op.plano } : op.face ? { ...N.planoDaFace(op.face.ponto, op.face.normal), ref: 'face' } : { ...N.PLANOS.xz, ref: 'xz' };
            // a IA às vezes manda números como texto: tudo vira número aqui
            const n = (v, padrao = 0) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
            const par = (p) => (Array.isArray(p) ? [n(p[0]), n(p[1])] : [0, 0]);
            const ents = (op.entidades || []).filter((e) => e && ['linha', 'ret', 'circ', 'arco', 'poli'].includes(e.t || e.tipo)).map((e) => {
              const t = e.t || e.tipo;
              const ent = { id: novoId(), t };
              if (t === 'linha' || t === 'ret' || t === 'arco') Object.assign(ent, { a: par(e.a), b: par(e.b) });
              if (t === 'circ' || t === 'poli') Object.assign(ent, { c: par(e.c), r: Math.max(0.1, n(e.r, 5)) });
              if (t === 'ret' && e.raio) ent.raio = Math.max(0, n(e.raio));
              if (t === 'arco') ent.ang = n(e.ang, 180) || 180;
              if (t === 'poli') Object.assign(ent, { n: Math.max(3, Math.round(n(e.n, 6))), rot: n(e.rot) });
              if (e.construcao) ent.construcao = true;
              return ent;
            });
            ultimoEsboco = inserir({ id: novoId(), tipo: 'esboco', nome: nomeNovo('esboco'), plano: { o: plano.o, n: plano.n, x: plano.x }, ref: plano.ref, ents });
            break;
          }
          case 'extrusao':
          case 'revolucao': {
            const esb = op.esboco ? acharAlvo(op.esboco) : ultimoEsboco || recurso(esbocoPadrao());
            if (!esb) throw new Error('sem esboço');
            const r = { id: novoId(), tipo: op.op, nome: nomeNovo(op.op), ...PADROES[op.op](), esboco: esb.id };
            for (const k of ['distancia', 'direcao', 'operacao', 'fim', 'angulo', 'eixo']) if (op[k] != null) r[k] = txt(op[k]);
            if (esb.ref === 'face' && r.operacao === 'cortar' && op.direcao == null) r.direcao = 'inversa';
            inserir(r);
            feitos.push(`${r.nome} ${N.resumoRecurso(r)}`);
            break;
          }
          case 'furo': {
            const r = { id: novoId(), tipo: 'furo', nome: nomeNovo('furo'), ...PADROES.furo(), ponto: op.ponto || [0, 0, 0], dir: op.dir || [0, -1, 0] };
            for (const k of ['estilo', 'diametro', 'profundidade', 'rosca', 'escDiam', 'rebDiam', 'rebProf']) if (op[k] != null) r[k] = txt(op[k]);
            if (op.passante != null) r.passante = !!op.passante;
            if (op.rosca && !op.estilo) r.estilo = 'roscado';
            inserir(r);
            feitos.push(`${r.nome} ${N.resumoRecurso(r)}`);
            break;
          }
          case 'primitiva': {
            if (!N.PRIMITIVAS[op.forma]) throw new Error(`forma ${op.forma}`);
            const r = { id: novoId(), tipo: 'primitiva', nome: nomeNovo('primitiva'), forma: op.forma, m: { ...N.PRIMITIVAS[op.forma].medidas, ...(op.medidas || {}) }, pos: op.pos || [0, 0, 0], giro: op.giro || 0, operacao: op.operacao || (op.forma === 'rasgo' ? 'cortar' : 'juntar') };
            inserir(r);
            feitos.push(`${N.PRIMITIVAS[op.forma].nome.toLowerCase()}`);
            break;
          }
          case 'arredondar':
          case 'chanfro':
          case 'padrao_ret':
          case 'padrao_circ':
          case 'espelhar': {
            const alvo = acharAlvo(op.alvo);
            if (!alvo) throw new Error('sem alvo');
            const r = { id: novoId(), tipo: op.op, nome: nomeNovo(op.op), ...PADROES[op.op](), alvo: alvo.id };
            for (const [k, v] of Object.entries(op)) if (!['op', 'alvo'].includes(k) && v != null) r[k] = Array.isArray(v) ? v.map(String) : String(v);
            inserir(r);
            feitos.push(`${r.nome}`);
            break;
          }
          case 'casca': {
            const r = { id: novoId(), tipo: 'casca', nome: nomeNovo('casca'), ...PADROES.casca(), espessura: txt(op.espessura ?? 2), face: op.face || 'aberta' };
            inserir(r);
            feitos.push(`casca de ${r.espessura} mm`);
            break;
          }
          case 'editar': {
            const r = acharAlvo(op.alvo);
            if (!r) throw new Error('não achei o recurso');
            for (const [k, v] of Object.entries(op.campos || {})) {
              if (k === 'id' || k === 'tipo') continue;
              r[k] = typeof v === 'number' ? String(v) : v;
            }
            feitos.push(`${r.nome} alterado`);
            break;
          }
          case 'apagar': {
            const r = acharAlvo(op.alvo);
            if (r) {
              p.recursos = p.recursos.filter((x) => x !== r && x.esboco !== r.id && x.alvo !== r.id);
              feitos.push(`${r.nome} apagado`);
            }
            break;
          }
          case 'suprimir': {
            const r = acharAlvo(op.alvo);
            if (r) r.suprimido = op.valor !== false;
            break;
          }
          default:
            break;
        }
      } catch (erro) {
        feitos.push(`(ignorei ${op.op}: ${erro.message})`);
      }
    }
    ui.sel = null;
    ui.aba = ui.aba === 'esboco' ? 'modelo' : ui.aba;
    pecaVista.visible = ui.aba !== 'montagem';
    cacheAval.clear();
    recalcular();
    redesenhar();
    salvar();
    enquadrar();
    som.montar();
    const texto = feitos.length ? `Feito: ${feitos.join(', ')}.` : 'Nada mudou.';
    evento(`a oficina aplicou um projeto: ${texto}`);
    return texto;
  };

  // peça de exemplo: uma flange de motor com bucha, furo central e seis furos M6
  acoes.exemplo = () => acoes.aplicarOperacoes([
    { op: 'renomear', nome: 'Flange de motor' },
    { op: 'material', material: 'aluminio' },
    { op: 'parametro', nome: 'D', valor: '80' },
    { op: 'esboco', plano: 'xz', entidades: [{ t: 'circ', c: [0, 0], r: 40 }] },
    { op: 'extrusao', distancia: '10' },
    { op: 'esboco', plano: 'xz', entidades: [{ t: 'circ', c: [0, 0], r: 20 }] },
    { op: 'extrusao', distancia: '26' },
    { op: 'furo', ponto: [0, 26, 0], dir: [0, -1, 0], diametro: '22', passante: true },
    { op: 'furo', ponto: [30, 10, 0], dir: [0, -1, 0], estilo: 'roscado', rosca: 'M6', passante: true },
    { op: 'padrao_circ', alvo: 'ultimo', n: 6, angulo: 360, eixo: 'y' },
    { op: 'chanfro', alvo: 'Extrusão1', raio: '1', arestas: 'topo' },
  ]);

  // pedidos simples resolvidos aqui mesmo (sem IA): "material alumínio", "cilindro 30 20"…
  acoes.porTextoLocal = (texto) => {
    const t = normalizar(texto);
    const material = Object.entries(N.MATERIAIS).find(([k, m]) => t.includes(k) || t.includes(normalizar(m.nome).split(' ')[0]));
    if (t.includes('material') && material) {
      acoes.material(material[0]);
      return `Material trocado para ${material[1].nome.toLowerCase()}.`;
    }
    const forma = Object.keys(N.PRIMITIVAS).find((k) => t.includes(k) || t.includes(normalizar(N.PRIMITIVAS[k].nome))) || (t.includes('caixa') || t.includes('cubo') ? 'bloco' : null);
    if (forma) {
      const numeros = (t.match(/\d+([.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
      const m = {};
      Object.keys(N.PRIMITIVAS[forma].medidas).forEach((k, i) => { if (numeros[i]) m[k] = numeros[i]; });
      const topo = avaliacao().caixa.isEmpty() ? 0 : avaliacao().caixa.max.y;
      return acoes.aplicarOperacoes([{ op: 'primitiva', forma, medidas: m, pos: [0, forma === 'rasgo' ? +topo.toFixed(2) : 0, 0] }]);
    }
    return null;
  };

  // ======================================================================
  // ENTRADA: pinça (mão ou mouse) com um raio no mundo
  // ======================================================================
  const raycaster = new THREE.Raycaster();
  const inversa = new THREE.Matrix4();
  const paraPeca = (raio) => {
    pecaVista.updateWorldMatrix(true, false);
    inversa.copy(pecaVista.matrixWorld).invert();
    const r = raio.clone().applyMatrix4(inversa);
    r.direction.normalize();
    return r;
  };
  const paraMontagem = (raio) => {
    montagemVista.updateWorldMatrix(true, false);
    const r = raio.clone().applyMatrix4(new THREE.Matrix4().copy(montagemVista.matrixWorld).invert());
    r.direction.normalize();
    return r;
  };
  const encaixar = (n, passo = ui.passo) => Math.round(n / passo) * passo;

  const malhaTeste = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  function naPeca(raioLocal) {
    raycaster.ray.copy(raioLocal);
    const geos = solido.geometry.attributes.position ? [solido.geometry] : separados.children.map((m) => m.geometry);
    let melhor = null;
    for (const g of geos) {
      malhaTeste.geometry = g;
      const hit = raycaster.intersectObject(malhaTeste, false)[0];
      if (hit && (!melhor || hit.distance < melhor.distance)) melhor = hit;
    }
    if (!melhor) return null;
    return { ponto: melhor.point, normal: melhor.face.normal.clone().normalize(), distancia: melhor.distance };
  }

  function recursoEm(raioLocal) {
    raycaster.ray.copy(raioLocal);
    const a = cacheAval.get(peca().id);
    let melhor = null;
    for (const [id, g] of a?.geos || []) {
      for (const geo of g.geos || []) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        const hit = raycaster.intersectObject(m, false)[0];
        if (hit && (!melhor || hit.distance < melhor.distance)) melhor = { id, distance: hit.distance };
      }
    }
    return melhor;
  }

  // ponto (u, v) do raio no plano do esboço, com encaixe na grade e nos pontos existentes
  function noEsboco(raioLocal, esb, encaixe = true) {
    const base = N.basePlano(esb.plano);
    const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(base.n, base.o);
    const p = raioLocal.intersectPlane(plano, new THREE.Vector3());
    if (!p) return null;
    const d = p.sub(base.o);
    let u = d.dot(base.x);
    let v = d.dot(base.y);
    if (!encaixe) return [u, v];
    const tol = Math.max(ui.passo * 0.5, 1.5);
    let melhor = null;
    for (const e of esb.ents) {
      for (const q of N.extremos(e)) {
        const dist = Math.hypot(q.x - u, q.y - v);
        if (dist < tol && (!melhor || dist < melhor.dist)) melhor = { dist, u: q.x, v: q.y };
      }
    }
    if (melhor) return [melhor.u, melhor.v, true];
    u = encaixar(u);
    v = encaixar(v);
    return [u, v, false];
  }

  function entidadeEm(uv, esb) {
    let melhor = null;
    const p = new THREE.Vector2(...uv);
    for (const e of esb.ents) {
      const pts = N.pontosEntidade(e);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const ab = b.clone().sub(a);
        const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
        const d = a.clone().addScaledVector(ab, t).distanceTo(p);
        if (d < Math.max(3, ui.passo) && (!melhor || d < melhor.d)) melhor = { d, e };
      }
    }
    return melhor?.e || null;
  }

  // entidade que vai sendo desenhada entre a e b
  function previaEntidade(ferr, a, b, esb) {
    const [ua, va] = a;
    let [ub, vb] = b;
    if (ferr === 'linha') {
      const ang = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(vb - va, ub - ua)));
      const e = { t: 'linha', a: [ua, va], b: [ub, vb] };
      if (ang < 5 || ang > 175) {
        e.b[1] = va;
        e.h = true;
      } else if (Math.abs(ang - 90) < 5) {
        e.b[0] = ua;
        e.v = true;
      }
      return e;
    }
    if (ferr === 'ret') {
      if (ub === ua) ub += ui.passo;
      if (vb === va) vb += ui.passo;
      return { t: 'ret', a: [ua, va], b: [ub, vb] };
    }
    if (ferr === 'circ') return { t: 'circ', c: [ua, va], r: Math.max(ui.passo / 2, encaixar(Math.hypot(ub - ua, vb - va), ui.passo / 2)) };
    if (ferr === 'poli') return { t: 'poli', c: [ua, va], r: Math.max(ui.passo / 2, encaixar(Math.hypot(ub - ua, vb - va), ui.passo / 2)), n: ui.ladosPoli, rot: 0 };
    if (ferr === 'arco') {
      // arco tangente quando começa na ponta de uma linha
      let tan = null;
      for (const e of esb.ents) {
        if (e.t !== 'linha') continue;
        if (Math.hypot(e.b[0] - ua, e.b[1] - va) < 0.05) tan = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
        else if (Math.hypot(e.a[0] - ua, e.a[1] - va) < 0.05) tan = [e.a[0] - e.b[0], e.a[1] - e.b[1]];
        if (tan) break;
      }
      if (tan) return { t: 'arco', a: [ua, va], b: [ub, vb], ang: +N.anguloTangente([ua, va], [ub, vb], tan).toFixed(3), tg: true };
      return { t: 'arco', a: [ua, va], b: [ub, vb], ang: 180 };
    }
    return null;
  }

  // pixels de tela por milímetro da peça (para puxar medidas com a mão)
  let cameraAtual = null;
  function pixelsPorMm() {
    if (!cameraAtual) return 4;
    const dist = cameraAtual.position.distanceTo(grupo.getWorldPosition(new THREE.Vector3()));
    const alturaVisivel = 2 * Math.tan(THREE.MathUtils.degToRad(cameraAtual.fov / 2)) * dist;
    return (raiz.clientHeight / alturaVisivel) * estado.escalaVista;
  }

  // começa, continua ou termina uma pinça; xy = posição na tela (para puxar), extras = { giro }
  function entrada(gesto, raioMundo, extras = {}) {
    const antes = estado.gestoAntes;
    estado.gestoAntes = gesto;
    const comeca = gesto === 'pinca' && antes !== 'pinca';
    const solta = gesto !== 'pinca' && antes === 'pinca';
    const ar = estado.arraste;
    if (comeca) iniciarArraste(raioMundo, extras);
    else if (gesto === 'pinca' && ar) continuarArraste(raioMundo, extras);
    else if (solta && ar) terminarArraste(raioMundo, extras);
  }

  function iniciarArraste(raioMundo, extras) {
    const ferr = ui.ferramenta;
    const xy = extras.xy || [0, 0];
    // ----- montagem -----
    if (ui.aba === 'montagem') {
      const hit = montagem.escolher(paraMontagem(raioMundo));
      if (ferr === 'face_face' || ferr === 'eixo_eixo') {
        if (!hit) return;
        const tipo = ferr === 'face_face' ? 'face' : 'eixo';
        if (!ui.escolhaRestricao) {
          ui.escolhaRestricao = hit;
          montagem.destacar(hit.comp.id);
          aviso(tipo === 'face' ? 'AGORA A FACE DA OUTRA PEÇA' : 'AGORA O FURO OU PINO DA OUTRA PEÇA');
          som.clique();
        } else {
          marcar();
          const erro = montagem.restringir(tipo, ui.escolhaRestricao, hit);
          ui.escolhaRestricao = null;
          montagem.destacar(null);
          if (erro) {
            desfazerPilha.pop();
            aviso(erro.toUpperCase());
          } else {
            aviso(tipo === 'face' ? '◫ FACE COM FACE' : '⊜ EIXO COM EIXO');
            evento(`encaixou duas peças na montagem (${tipo === 'face' ? 'face com face' : 'eixo com eixo'})`);
            salvar();
            som.montar();
          }
          redesenhar();
        }
        estado.arraste = { tipo: 'nada' };
        return;
      }
      if (!hit) {
        ui.compSel = null;
        montagem.destacar(null);
        redesenhar();
        return;
      }
      ui.compSel = hit.comp.id;
      montagem.destacar(hit.comp.id);
      marcar();
      const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.comp.pos[1]);
      const p = paraMontagem(raioMundo).intersectPlane(plano, new THREE.Vector3()) || new THREE.Vector3(...hit.comp.pos);
      estado.arraste = { tipo: 'comp', comp: hit.comp, desvio: [hit.comp.pos[0] - p.x, hit.comp.pos[2] - p.z], plano, giro0: extras.giro, passos: 0, mudou: false };
      som.agarrar();
      redesenhar();
      return;
    }
    const raio = paraPeca(raioMundo);
    // ----- escolher a face para um esboço novo -----
    if (ferr === 'escolher_plano') {
      const hit = naPeca(raio);
      if (!hit) return;
      acoes.novoEsboco({ ...N.planoDaFace(hit.ponto.toArray(), hit.normal.toArray()), ref: 'face' });
      estado.arraste = { tipo: 'nada' };
      return;
    }
    // ----- extrusão "até a face": escolher a face -----
    if (ferr === 'escolher_face') {
      const hit = naPeca(raio);
      const r = recurso(ui.edicao?.id || ui.sel);
      if (hit && r?.tipo === 'extrusao') {
        r.face = { p: hit.ponto.toArray().map((n) => +n.toFixed(3)), n: hit.normal.toArray().map((n) => +n.toFixed(4)) };
        r.fim = 'face';
        ui.ferramenta = 'selecionar';
        agendar();
        redesenhar();
        aviso('✓ FACE ESCOLHIDA');
      }
      estado.arraste = { tipo: 'nada' };
      return;
    }
    // ----- esboço -----
    const esb = esbocoAtivo();
    if (esb) {
      const uv = noEsboco(raio, esb);
      if (!uv) return;
      if (ferr === 'sel_esb') {
        const e = entidadeEm(noEsboco(raio, esb, false), esb);
        ui.entSel = e?.id || null;
        if (e) {
          marcar();
          estado.arraste = { tipo: 'mover_ent', e, inicio: uv, original: JSON.parse(JSON.stringify(e)), mudou: false };
          som.agarrar();
        }
        desenharEsboco();
        redesenhar();
        return;
      }
      if (ferr === 'livre') {
        estado.arraste = { tipo: 'traco', pts: [noEsboco(raio, esb, false)] };
        visaoEsboco.traco = estado.arraste.pts;
        return;
      }
      if (['linha', 'ret', 'circ', 'arco', 'poli'].includes(ferr)) {
        estado.arraste = { tipo: 'desenhar', a: uv, b: uv };
        visaoEsboco.previa = previaEntidade(ferr, uv, uv, esb);
        desenharEsboco();
        som.agarrar();
      }
      return;
    }
    // ----- inspeção -----
    if (ui.aba === 'inspecao') {
      const hit = naPeca(raio);
      if (ferr === 'medir' && hit) {
        ui.medir.push(hit.ponto.clone());
        if (ui.medir.length > 2) ui.medir = [hit.ponto.clone()];
        desenharMedida();
        som.clique();
        tela?.props();
      } else if (ferr === 'esforco' && hit) {
        acoes.esforcoEm(hit.ponto, hit.normal);
        ui.esforco.normal = hit.normal.clone();
      } else if (ferr === 'corte' && ui.corte.ativo) {
        estado.arraste = { tipo: 'puxar_corte', y0: xy[1], v0: ui.corte.pos };
      }
      if (hit) estado.arraste ||= { tipo: 'nada' };
      return;
    }
    // ----- modelo -----
    const ed = ui.edicao ? recurso(ui.edicao.id) : null;
    if (ferr === 'furo') {
      const hit = naPeca(raio);
      if (hit) {
        // encaixe na grade da própria face
        const pl = N.planoDaFace(hit.ponto.toArray(), hit.normal.toArray());
        const base = N.basePlano(pl);
        const d = hit.ponto.clone().sub(base.o);
        const ponto = N.doPlano(base, encaixar(d.dot(base.x)), encaixar(d.dot(base.y))).toArray().map((n) => +n.toFixed(3));
        const dir = hit.normal.clone().negate().toArray().map((n) => +n.toFixed(4));
        if (ed?.tipo === 'furo' && ui.edicao.novo) {
          ed.ponto = ponto;
          ed.dir = dir;
          agendar();
          tela?.props();
        } else {
          acoes.novoRecurso('furo', { ponto, dir });
        }
        estado.arraste = { tipo: 'nada' };
        som.clique();
        return;
      }
    }
    if (ed && PUXAR[ed.tipo]) {
      // G1: puxar a pinça para cima aumenta a medida principal do recurso
      const campo = PUXAR[ed.tipo];
      let v0 = 0;
      try { v0 = N.avaliarExpr(ed[campo], avaliacao().vars); } catch {}
      estado.arraste = { tipo: 'puxar', r: ed, campo, y0: xy[1], v0 };
      som.agarrar();
      return;
    }
    if (ferr === 'primitivas') {
      const hit = naPeca(raio);
      const subtrai = ui.primitiva === 'rasgo';
      if (subtrai && !hit) return;
      const altura = hit && (subtrai || hit.normal.y > 0.6) ? +hit.ponto.y.toFixed(2) : 0;
      const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -altura);
      const a = hit && (subtrai || hit.normal.y > 0.6) ? hit.ponto.clone() : raio.intersectPlane(plano, new THREE.Vector3());
      if (!a) return;
      a.x = encaixar(a.x);
      a.z = encaixar(a.z);
      estado.arraste = { tipo: 'primitiva', a, b: a.clone(), altura, plano };
      desenharPreviaPrimitiva(estado.arraste);
      som.agarrar();
      return;
    }
    // selecionar / mover
    const alvo = recursoEm(raio);
    if (!alvo) {
      if (ui.sel && !ui.edicao) {
        ui.sel = null;
        desenharSelecao();
        desenharEsboco();
        redesenhar();
      }
      return;
    }
    if (ui.sel !== alvo.id) acoes.selecionar(alvo.id);
    const r = recurso(alvo.id);
    if (r?.tipo === 'primitiva' || r?.tipo === 'furo') {
      marcar();
      const y = r.tipo === 'primitiva' ? +r.pos[1] || 0 : r.ponto[1];
      const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
      const p = raio.intersectPlane(plano, new THREE.Vector3());
      const pos = r.tipo === 'primitiva' ? r.pos : r.ponto;
      estado.arraste = { tipo: 'mover', r, plano, desvio: p ? [(+pos[0] || 0) - p.x, (+pos[2] || 0) - p.z] : [0, 0], giro0: extras.giro, giroInicial: +r.giro || 0, mudou: false };
      som.agarrar();
    } else {
      estado.arraste = { tipo: 'nada' };
    }
  }

  function continuarArraste(raioMundo, extras) {
    const ar = estado.arraste;
    const xy = extras.xy || [0, 0];
    if (ar.tipo === 'comp') {
      const p = paraMontagem(raioMundo).intersectPlane(ar.plano, new THREE.Vector3());
      if (p) {
        montagem.mover(ar.comp.id, [encaixar(p.x + ar.desvio[0]), ar.comp.pos[1], encaixar(p.z + ar.desvio[1])]);
        ar.mudou = true;
      }
      // G1: girar o pulso gira o componente em passos de 15°
      if (extras.giro != null && ar.giro0 != null) {
        const passos = Math.round(THREE.MathUtils.radToDeg(extras.giro - ar.giro0) / 15);
        if (passos !== ar.passos) {
          montagem.girar(ar.comp.id, 'y', -(passos - ar.passos) * 15);
          ar.passos = passos;
          ar.mudou = true;
          som.clique();
        }
      }
      return;
    }
    if (ar.tipo === 'puxar' || ar.tipo === 'puxar_corte') {
      const ppm = pixelsPorMm();
      const delta = (ar.y0 - xy[1]) / Math.max(0.3, ppm);
      if (ar.tipo === 'puxar_corte') {
        acoes.corte({ pos: THREE.MathUtils.clamp(encaixar(ar.v0 + delta, 1), -(ui.corte.limite || 50), ui.corte.limite || 50) });
        return;
      }
      let novo;
      if (ar.campo === 'angulo') novo = THREE.MathUtils.clamp(encaixar(ar.v0 + delta * 3, 15), 15, 360);
      else if (ar.campo === 'n') novo = THREE.MathUtils.clamp(Math.round(ar.v0 + delta / 6), 2, 36);
      else novo = Math.max(ar.campo === 'desloc' ? -500 : ui.passo >= 5 ? 1 : 0.5, encaixar(ar.v0 + delta, ar.campo === 'raio' || ar.campo === 'espessura' ? 0.5 : ui.passo));
      if (String(novo) !== String(ar.r[ar.campo])) {
        ar.r[ar.campo] = String(novo);
        if (ar.r.tipo === 'furo' && ar.r.passante) ar.r.passante = false;
        agendar();
        tela?.props();
        tela?.arvore();
      }
      return;
    }
    if (ar.tipo === 'mover') {
      const raio = paraPeca(raioMundo);
      const p = raio.intersectPlane(ar.plano, new THREE.Vector3());
      if (!p) return;
      const alvo = ar.r.tipo === 'primitiva' ? ar.r.pos : ar.r.ponto;
      const x = encaixar(p.x + ar.desvio[0]);
      const z = encaixar(p.z + ar.desvio[1]);
      if (+alvo[0] !== x || +alvo[2] !== z) {
        alvo[0] = x;
        alvo[2] = z;
        ar.mudou = true;
        agendar();
      }
      if (ar.r.tipo === 'primitiva' && extras.giro != null && ar.giro0 != null) {
        const g = ar.giroInicial - Math.round(THREE.MathUtils.radToDeg(extras.giro - ar.giro0) / 15) * 15;
        if (g !== +ar.r.giro) {
          ar.r.giro = g;
          ar.mudou = true;
          agendar();
          som.clique();
        }
      }
      return;
    }
    if (ar.tipo === 'primitiva') {
      const p = paraPeca(raioMundo).intersectPlane(ar.plano, new THREE.Vector3());
      if (p) {
        ar.b = p;
        desenharPreviaPrimitiva(ar);
      }
      return;
    }
    const esb = esbocoAtivo();
    if (!esb) return;
    const raio = paraPeca(raioMundo);
    if (ar.tipo === 'traco') {
      const uv = noEsboco(raio, esb, false);
      const ult = ar.pts[ar.pts.length - 1];
      if (uv && Math.hypot(uv[0] - ult[0], uv[1] - ult[1]) > 0.6) {
        ar.pts.push(uv);
        desenharEsboco();
      }
      return;
    }
    if (ar.tipo === 'desenhar') {
      const uv = noEsboco(raio, esb);
      if (!uv) return;
      ar.b = uv;
      visaoEsboco.previa = previaEntidade(ui.ferramenta, ar.a, uv, esb);
      desenharEsboco();
      return;
    }
    if (ar.tipo === 'mover_ent') {
      const uv = noEsboco(raio, esb);
      if (!uv) return;
      const du = uv[0] - ar.inicio[0];
      const dv = uv[1] - ar.inicio[1];
      const o = ar.original;
      const mover = (p) => [p[0] + du, p[1] + dv];
      for (const k of ['a', 'b', 'c']) if (o[k]) ar.e[k] = mover(o[k]);
      ar.mudou = du !== 0 || dv !== 0;
      agendar();
      desenharEsboco();
    }
  }

  function terminarArraste() {
    const ar = estado.arraste;
    estado.arraste = null;
    if (!ar || ar.tipo === 'nada') return;
    som.soltar();
    if (ar.tipo === 'comp') {
      if (!ar.mudou) desfazerPilha.pop();
      else {
        montagem.resolverTudo();
        salvar();
      }
      redesenhar();
      return;
    }
    if (ar.tipo === 'puxar' || ar.tipo === 'puxar_corte') {
      recalcular();
      salvar();
      redesenhar();
      return;
    }
    if (ar.tipo === 'mover') {
      if (!ar.mudou) desfazerPilha.pop();
      else {
        recalcular();
        salvar();
        evento(`moveu ${ar.r.nome}`);
      }
      redesenhar();
      return;
    }
    if (ar.tipo === 'primitiva') {
      const r = previaPrimitiva(ar);
      limparPreviaPrimitiva();
      acoes.novoRecurso('primitiva', r);
      return;
    }
    const esb = esbocoAtivo();
    if (ar.tipo === 'traco') {
      visaoEsboco.traco = null;
      const rec = N.reconhecerTraco(ar.pts, ui.passo);
      if (!rec) {
        desenharEsboco();
        aviso('TRAÇO CURTO DEMAIS');
        return;
      }
      const nomes = { linha: 'LINHA', polilinha: 'LINHAS', circulo: 'CÍRCULO', retangulo: 'RETÂNGULO', triangulo: 'TRIÂNGULO', poligono: 'POLÍGONO' };
      const e = rec.ents[0];
      const medida = rec.tipo === 'circulo' ? ` Ø${fmt(e.r * 2)}` : rec.tipo === 'retangulo' ? ` ${fmt(Math.abs(e.b[0] - e.a[0]))}×${fmt(Math.abs(e.b[1] - e.a[1]))}` : '';
      acoes.adicionarEntidades(rec.ents, `✎ TRAÇO VIROU ${nomes[rec.tipo]}${medida}`);
      evento(`desenhou no ar e o traço virou ${nomes[rec.tipo].toLowerCase()}${medida.toLowerCase()}`);
      return;
    }
    if (ar.tipo === 'desenhar') {
      const e = visaoEsboco.previa;
      visaoEsboco.previa = null;
      const valido = e && (e.t === 'circ' || e.t === 'poli' || Math.hypot(ar.b[0] - ar.a[0], ar.b[1] - ar.a[1]) > 0.4);
      if (valido && esb) acoes.adicionarEntidades([e]);
      else desenharEsboco();
      return;
    }
    if (ar.tipo === 'mover_ent') {
      if (!ar.mudou) desfazerPilha.pop();
      recalcular();
      redesenhar();
      salvar();
    }
  }

  // prévia de uma primitiva desenhada na mesa
  const previaPrim = new THREE.LineSegments(new THREE.BufferGeometry(), mat.novo);
  previaPrim.renderOrder = 8;
  pecaVista.add(previaPrim);
  function previaPrimitiva(ar) {
    const forma = ui.primitiva;
    const m = { ...N.PRIMITIVAS[forma].medidas };
    const dx = ar.b.x - ar.a.x;
    const dz = ar.b.z - ar.a.z;
    let pos = [ar.a.x, ar.altura, ar.a.z];
    let giro = 0;
    if (forma === 'bloco') {
      m.largura = Math.max(ui.passo, encaixar(Math.abs(dx)));
      m.profundidade = Math.max(ui.passo, encaixar(Math.abs(dz)));
      pos = [encaixar(ar.a.x + dx / 2), ar.altura, encaixar(ar.a.z + dz / 2)];
    } else if (forma === 'rasgo') {
      m.comprimento = Math.max(ui.passo, encaixar(Math.hypot(dx, dz)));
      pos = [ar.a.x + dx / 2, ar.altura, ar.a.z + dz / 2];
      giro = Math.round(THREE.MathUtils.radToDeg(-Math.atan2(dz, dx)) / 15) * 15;
    } else {
      const d = Math.max(ui.passo * 2, encaixar(Math.hypot(dx, dz) * 2));
      if ('diametro' in m) m.diametro = d;
      else if ('base' in m) m.base = d;
      else if ('largura' in m) m.largura = d;
      if (forma === 'tubo') m.interno = Math.max(1, Math.min(m.interno, d - 2 * ui.passo));
    }
    return { forma, m, pos: pos.map((n) => +n.toFixed(2)), giro, operacao: forma === 'rasgo' ? 'cortar' : 'juntar' };
  }
  function desenharPreviaPrimitiva(ar) {
    const r = previaPrimitiva(ar);
    const g = N.PRIMITIVAS[r.forma].geo(r.m);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...r.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(r.giro), 0)), new THREE.Vector3(1, 1, 1)));
    previaPrim.geometry.dispose();
    previaPrim.geometry = new THREE.EdgesGeometry(g, 24);
    cotasTela.length = 0;
    g.computeBoundingBox();
    cotasTela.push({ ponto: g.boundingBox.getCenter(new THREE.Vector3()).setY(g.boundingBox.max.y + 2), texto: `${N.PRIMITIVAS[r.forma].nome} ${Object.values(r.m).map((v) => fmt(v)).join('×')}`, classe: 'novo' });
    tela?.cotas();
  }
  function limparPreviaPrimitiva() {
    previaPrim.geometry.dispose();
    previaPrim.geometry = new THREE.BufferGeometry();
  }

  function desenharMedida() {
    const pts = ui.medir;
    linhaMedida.geometry.dispose();
    if (pts.length === 2) {
      linhaMedida.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    } else {
      linhaMedida.geometry = new THREE.BufferGeometry();
    }
    tela?.cotas();
  }

  // ======================================================================
  // MÃOS: tudo que a oficina lê das duas mãos a cada quadro
  // ======================================================================
  const tmpQ = new THREE.Quaternion();
  function maos({ maos: lista, raioDe, telaDe, cursor, agora }) {
    const direita = lista.find((m) => m.lado.startsWith('direita')) || lista[0];
    const esquerda = lista.find((m) => m.lado.startsWith('esquerda') && m !== direita);
    const resposta = { usouDuas: false, toque: null };
    // ---- G3: palma esquerda para cima abre o menu radial preso à mão ----
    const menu = estado.menu;
    if (esquerda?.palmaCima) {
      menu.fora = 0;
      if (!menu.aberto) {
        menu.aberto = true;
        tela?.radial(true);
        som.clique();
      }
      const [x, y] = telaDe(esquerda.centro);
      tela?.posicionarRadial(x, y - 30);
    } else if (menu.aberto) {
      menu.fora ||= agora;
      if (agora - menu.fora > 600) {
        menu.aberto = false;
        tela?.radial(false);
      }
    }
    if (menu.aberto) {
      resposta.usouDuas = true;
      return resposta;   // com o menu aberto, a mão direita só escolhe (o cursor cuida do clique)
    }
    // ---- G2: joinha confirma, joinha para baixo desfaz, tesoura corta ----
    for (const m of lista) {
      if (m.evento === 'confirmar') {
        if (ui.regua && ui.ferramenta === 'regua') acoes.aplicarMedida(ui.regua.mm, 'régua de dedos');
        else if (estado.duas?.mm) acoes.aplicarMedida(estado.duas.mm, 'duas mãos');
        else if (ui.edicao) acoes.ok();
        else if (ui.esboco) acoes.terminarEsboco(true);
        else aviso('👍');
      } else if (m.evento === 'desfazer') {
        aviso(ui.edicao?.novo ? '✕ CANCELADO' : '↶ DESFEITO');
        acoes.desfazer();
      } else if (m.evento === 'corte') {
        cortarCom(raioDe(m.pontaV));
      }
    }
    // ---- G1: duas pinças medem a largura entre as mãos ----
    if (lista.length === 2 && lista.every((m) => m.gesto === 'pinca')) {
      const pts = lista.map((m) => pontoDeMedida(raioDe(m.pontaPinca)));
      if (pts[0] && pts[1]) {
        const mm = encaixar(pts[0].distanceTo(pts[1]), ui.passo >= 5 ? 1 : 0.5);
        estado.duas = { mm, pts };
        linhaMedida.geometry.dispose();
        linhaMedida.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        tela?.cotas();
      }
      if (estado.arraste) terminarArraste();
      estado.gestoAntes = 'nenhum';
      resposta.usouDuas = true;
      return resposta;
    }
    if (estado.duas) {
      // soltou uma das mãos: a medida vai para o campo ativo
      const mm = estado.duas.mm;
      estado.duas = null;
      if (!ui.medir.length) {
        linhaMedida.geometry.dispose();
        linhaMedida.geometry = new THREE.BufferGeometry();
      }
      if (mm) acoes.aplicarMedida(mm, 'duas mãos');
      tela?.cotas();
    }
    // ---- F2: régua de dedos ----
    if (ui.ferramenta === 'regua') {
      const m = direita;
      ui.regua = m?.pincaCm ? { cm: m.pincaCm, mm: Math.round(m.pincaCm * 10), a: telaDe(m.pts[4]), b: telaDe(m.pts[8]) } : null;
      tela?.regua(ui.regua);
    } else if (ui.regua) {
      ui.regua = null;
      tela?.regua(null);
    }
    const m = direita;
    if (!m) {
      soltarTudo();
      return resposta;
    }
    // ---- G4: punho fechado em cima da peça pega e gira em todos os eixos ----
    if (m.gesto === 'punho' && m.quat) {
      if (!estado.pega) {
        const raio = raioDe(m.centro);
        const toca = ui.aba === 'montagem' ? !!montagem.escolher(paraMontagem(raio)) : !!naPeca(paraPeca(raio));
        estado.pega = { maoInicio: m.quat.clone(), vistaInicio: estado.vista.clone(), livre: toca, x: m.centro.x, y: m.centro.y };
        if (toca) aviso('✊ PEÇA NA MÃO · GIRE O PULSO');
        som.agarrar();
      }
      const pega = estado.pega;
      if (pega.livre) {
        tmpQ.copy(m.quat).multiply(pega.maoInicio.clone().invert());
        estado.vistaAlvo = tmpQ.multiply(pega.vistaInicio).normalize();
      } else {
        // fora da peça: o punho gira como um torno (arrastar)
        const dx = (pega.x - m.centro.x) * 7;
        const dy = (m.centro.y - pega.y) * 5;
        estado.vistaAlvo = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy).multiply(pega.vistaInicio).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx));
      }
      if (estado.arraste) terminarArraste();
      estado.gestoAntes = 'punho';
      return resposta;
    }
    if (estado.pega) {
      estado.pega = null;
      estado.vistaAlvo = null;
      som.soltar();
    }
    // ---- L3: o dedo apontado que toca a peça faz ondas na superfície ----
    if (m.gesto === 'aponta' && !cursor.alvo && agora - estado.ultimoToque > 280) {
      const raio = raioDe(m.pts[8]);
      const hit = ui.aba === 'montagem' ? montagem.escolher(paraMontagem(raio)) : naPeca(paraPeca(raio));
      if (hit) {
        estado.ultimoToque = agora;
        const ponto = (hit.mundo || hit.ponto).clone();
        const normal = hit.normal.clone();
        const origem = ui.aba === 'montagem' ? montagemVista : pecaVista;
        if (!hit.mundo) origem.localToWorld(ponto);
        normal.transformDirection(origem.matrixWorld);
        resposta.toque = { ponto, normal, tamanho: 0.35 };
      }
    }
    // ---- duas mãos na tela e só uma em pinça: espera um instante pela outra (medida com as duas) ----
    const outra = lista.find((x) => x !== m);
    if (outra && m.gesto === 'pinca' && outra.gesto !== 'pinca' && !estado.arraste) {
      estado.pincaSozinha ||= agora;
      if (agora - estado.pincaSozinha < 320) return resposta;
    } else if (m.gesto !== 'pinca') {
      estado.pincaSozinha = 0;
    }
    // ---- pinça: desenhar, selecionar, puxar, mover (o mesmo caminho do mouse) ----
    const naTelaUi = !!cursor.alvo;
    if (m.gesto === 'pinca' && !estado.arraste && naTelaUi) return resposta;
    if (cursor.mao || m.gesto === 'pinca') {
      const ponto = m.gesto === 'pinca' ? m.pontaPinca : m.pts[8];
      entrada(m.gesto === 'pinca' ? 'pinca' : 'nenhum', raioDe(ponto), { giro: m.giro, xy: telaDe(ponto) });
    } else {
      soltarTudo();
    }
    return resposta;
  }

  // G2: o "corte" da tesoura no ponto mirado: furo passante, ou corta com o esboço pendente
  function cortarCom(raioMundo) {
    if (ui.aba !== 'modelo' && ui.aba !== 'esboco') return;
    const raio = paraPeca(raioMundo);
    const hit = naPeca(raio);
    if (!hit) return aviso('✂ MIRE NA PEÇA PARA CORTAR');
    if (ui.esboco) acoes.terminarEsboco(false);
    const esb = esbocoPadrao();
    const usado = esb && peca().recursos.some((r) => r.esboco === esb);
    if (esb && !usado) {
      acoes.novoRecurso('extrusao', { esboco: esb, operacao: 'cortar', fim: 'passante' });
      acoes.ok();
      aviso('✂ CORTE PASSANTE PELO ESBOÇO');
      return;
    }
    const pl = N.planoDaFace(hit.ponto.toArray(), hit.normal.toArray());
    const base = N.basePlano(pl);
    const d = hit.ponto.clone().sub(base.o);
    const ponto = N.doPlano(base, encaixar(d.dot(base.x)), encaixar(d.dot(base.y))).toArray().map((n) => +n.toFixed(3));
    acoes.novoRecurso('furo', { ponto, dir: hit.normal.clone().negate().toArray(), passante: true });
    acoes.ok();
    aviso('✂ FURO PASSANTE');
  }

  // ponto da medida com duas mãos: no plano de frente para a câmera que passa pelo centro da peça
  function pontoDeMedida(raioMundo) {
    const raio = ui.aba === 'montagem' ? paraMontagem(raioMundo) : paraPeca(raioMundo);
    const esb = esbocoAtivo();
    if (esb) {
      const uv = noEsboco(raio, esb, false);
      return uv ? N.doPlano(N.basePlano(esb.plano), uv[0], uv[1]) : null;
    }
    const c = estado.centro.clone();
    const n = raio.direction.clone().negate();
    return raio.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, c), new THREE.Vector3());
  }

  // uma medida (das duas mãos ou da régua de dedos) vai para o campo que está ativo
  acoes.aplicarMedida = (mm, origem) => {
    let campo = ui.campoAtivo;
    // o painel pode ter sido refeito: procura de novo o campo com o mesmo nome
    if (campo && !campo.input?.isConnected) {
      const igual = [...raiz.querySelectorAll('.of-props .of-campo')].find((c) => c.querySelector('span')?.textContent === campo.rotulo);
      const entrada = igual?.querySelector('input');
      campo = entrada ? { ...campo, input: entrada, aplicar: (v) => { entrada.value = String(v); entrada.dispatchEvent(new Event('change')); } } : null;
    }
    if (campo?.aplicar && campo.input?.isConnected) {
      campo.aplicar(mm);
      aviso(`📏 ${fmt(mm)} mm → ${campo.rotulo}`);
      evento(`mediu ${fmt(mm)} mm com ${origem} e aplicou em ${campo.rotulo.toLowerCase()}`);
    } else {
      aviso(`📏 ${fmt(mm)} mm · TOQUE NUM CAMPO PARA APLICAR`);
    }
  };

  function soltarTudo() {
    if (estado.gestoAntes === 'pinca') entrada('nenhum', new THREE.Ray(), {});
    estado.gestoAntes = 'nenhum';
  }

  // L3: devolve o toque do raio na peça (ponto e normal no mundo)
  function toque(raioMundo) {
    const hit = ui.aba === 'montagem' ? montagem.escolher(paraMontagem(raioMundo)) : naPeca(paraPeca(raioMundo));
    if (!hit) return null;
    const origem = ui.aba === 'montagem' ? montagemVista : pecaVista;
    const ponto = hit.mundo ? hit.mundo.clone() : origem.localToWorld(hit.ponto.clone());
    return { ponto, normal: hit.normal.clone().transformDirection(origem.matrixWorld) };
  }

  // ======================================================================
  // QUADRO
  // ======================================================================
  function enquadrar() {
    if (ui.aba === 'montagem') {
      const caixa = new THREE.Box3();
      for (const c of montagem.comps) {
        const m = new THREE.Vector3(...c.pos);
        caixa.expandByPoint(m);
      }
      montagemVista.updateMatrixWorld(true);
      const b = new THREE.Box3();
      for (const malha of montagem.malhasNoLugar()) {
        malha.geometry.computeBoundingBox();
        b.union(malha.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().compose(malha.parent.position, malha.parent.quaternion, new THREE.Vector3(1, 1, 1))));
      }
      if (!b.isEmpty()) {
        const tam = b.getSize(new THREE.Vector3());
        estado.escalaAlvo = 4.3 / Math.max(70, tam.x, tam.y * 1.25, tam.z);
        estado.centroAlvo = b.getCenter(new THREE.Vector3());
      }
    } else {
      const a = avaliacao();
      const tam = a.caixa.isEmpty() ? new THREE.Vector3(60, 30, 60) : a.caixa.getSize(new THREE.Vector3());
      estado.escalaAlvo = 4.3 / Math.max(70, tam.x, tam.y * 1.25, tam.z);
      estado.centroAlvo = a.caixa.isEmpty() ? new THREE.Vector3(0, 15, 0) : a.caixa.getCenter(new THREE.Vector3());
    }
  }

  const ponto = new THREE.Vector3();
  let ultimoT = 0;
  function atualizar(camera, rot, zoom) {
    if (!grupo.visible) return;
    cameraAtual = camera;
    const agora = performance.now();
    const dt = Math.min(0.1, (agora - (ultimoT || agora)) / 1000);
    ultimoT = agora;
    if (sujo && agora - ultimoCalculo > 110) recalcular();
    mat.holo.uniforms.uTempo.value = agora / 1000;
    // giro: arrastar com o mouse (vx, vy do laboratório) gira como um torno
    if (rot && (Math.abs(rot.vx) > 1e-5 || Math.abs(rot.vy) > 1e-5)) {
      estado.vistaAlvo = null;
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot.vy);
      const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rot.vx);
      estado.vista.premultiply(pitch).multiply(yaw).normalize();
    }
    // apresentação de cinema: volta inteira em torno da peça
    if (apresentacao?.ativa && estado.cinema) {
      apresentacao.atualizar();
      const t = apresentacao.progresso;
      const ang = -Math.PI / 4 + t * Math.PI * 2;
      const alt = 0.42 + Math.sin(t * Math.PI * 2) * 0.18;
      estado.vistaAlvo = new THREE.Quaternion().setFromEuler(new THREE.Euler(alt, ang, 0));
      if (ui.aba === 'montagem') montagem.explodir(Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.9);
      zoom *= 0.92 + Math.sin(t * Math.PI) * 0.22;
    }
    if (estado.vistaAlvo) estado.vista.slerp(estado.vistaAlvo, 1 - Math.exp(-dt * (estado.pega ? 14 : 7)));
    giro.quaternion.copy(estado.vista);
    estado.escalaVista = THREE.MathUtils.lerp(estado.escalaVista, estado.escalaAlvo * zoom, 0.1);
    escala.scale.setScalar(estado.escalaVista);
    estado.centro.lerp(estado.centroAlvo, 0.1);
    centro.position.copy(estado.centro).negate();
    if (montagemVista.visible) montagem.atualizar(dt);
    // corte: o plano acompanha a peça no mundo
    if (ui.corte.ativo && ui.corte.normalLocal) {
      pecaVista.updateWorldMatrix(true, false);
      const n = ui.corte.normalLocal.clone().transformDirection(pecaVista.matrixWorld);
      const p = pecaVista.localToWorld(ui.corte.pontoLocal.clone());
      planoCorte.setFromNormalAndCoplanarPoint(n, p);
    }
    // rótulos presos em pontos 3D
    const w = raiz.clientWidth;
    const h = raiz.clientHeight;
    pecaVista.updateWorldMatrix(true, false);
    for (const c of tela?.rotulos() || []) {
      ponto.copy(c.ponto);
      (c.montagem ? montagemVista : pecaVista).localToWorld(ponto);
      ponto.project(camera);
      c.el.style.transform = `translate(${((ponto.x + 1) / 2) * w}px, ${((1 - ponto.y) / 2) * h}px) translate(-50%, -50%)`;
      c.el.style.visibility = ponto.z > 1 ? 'hidden' : '';
    }
    tela?.cubo(estado.vista);
  }

  // ---------- lista de rótulos 3D (a tela desenha) ----------
  function rotulos3d() {
    const lista = [...cotasTela, ...cotasEsboco()];
    if (ui.medir.length === 2) {
      const [a, b] = ui.medir;
      const d = b.clone().sub(a);
      lista.push({ ponto: a.clone().add(b).multiplyScalar(0.5), texto: `${fmt(d.length(), 2)} mm  (Δx ${fmt(Math.abs(d.x))} · Δy ${fmt(Math.abs(d.y))} · Δz ${fmt(Math.abs(d.z))})`, classe: 'medida' });
    } else if (ui.medir.length === 1) {
      lista.push({ ponto: ui.medir[0], texto: 'PONTO 1', classe: 'medida' });
    }
    if (estado.duas?.pts) lista.push({ ponto: estado.duas.pts[0].clone().add(estado.duas.pts[1]).multiplyScalar(0.5), texto: `${fmt(estado.duas.mm)} mm`, classe: 'medida grande', montagem: ui.aba === 'montagem' });
    if (ui.cg && ui.aba !== 'montagem') lista.push({ ponto: marcaCg.position.clone().add(new THREE.Vector3(0, 3, 0)), texto: 'CG', classe: 'cg' });
    if (ui.esforco) lista.push({ ponto: ui.esforco.ondeMax, texto: `MÁX ${fmt(ui.esforco.maximo)} MPa`, classe: 'calor' });
    return lista;
  }

  // ======================================================================
  // INTERFACE
  // ======================================================================
  let tela = null;
  function redesenhar() {
    tela?.tudo();
  }

  const O = {
    ui, acoes, N, montagem, olharPara,
    get doc() { return doc; },
    peca, recurso, esbocoAtivo, fimAtual, avaliacao, rotulos3d, fmt,
    get estado() { return estado; },
    aviso, marcar, salvar, agendar,
    som,
  };
  tela = criarInterface(O, raiz);

  // ---------- carregar ----------
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (salvo?.versao === 2 && salvo.pecas?.length) {
      doc = { versao: 2, pecas: salvo.pecas, ativa: salvo.ativa, montagem: null };
      if (!doc.pecas.some((p) => p.id === doc.ativa)) doc.ativa = doc.pecas[0].id;
      ui.passo = [0.5, 1, 5, 10].includes(salvo.passo) ? salvo.passo : 5;
      montagem.carregar(salvo.montagem);
    } else {
      const antiga = JSON.parse(localStorage.getItem(CHAVE_ANTIGA) || 'null');
      if (antiga?.recursos?.length) {
        doc.pecas = [migrarAntiga(antiga)];
        doc.ativa = doc.pecas[0].id;
      }
    }
  } catch {}
  recalcular();
  enquadrar();
  redesenhar();

  // ======================================================================
  // API para o laboratório (holo.js) e para a voz
  // ======================================================================
  const api = {
    grupo,
    ativar(sim) {
      grupo.visible = sim;
      tela.mostrar(sim);
      if (sim) {
        carregarCsg();
        if (renderer) renderer.localClippingEnabled = true;
      } else {
        estado.arraste = null;
        estado.menu.aberto = false;
        tela.radial(false);
        apresentacao?.parar();
      }
    },
    entrada: (gesto, raio, extras) => entrada(gesto, raio, extras),
    maos,
    toque,
    soltar() {
      soltarTudo();
      if (estado.pega) {
        estado.pega = null;
        estado.vistaAlvo = null;
      }
    },
    ocupado: () => !!estado.arraste && estado.arraste.tipo !== 'nada',
    menuAberto: () => estado.menu.aberto,
    atualizar,
    depoisDeRenderizar: () => apresentacao?.depoisDeRenderizar(),
    aplicarVisual(real) {
      ui.real = real;
      aplicarMaterialSolido();
      montagem.aplicarVisual(real);
      tela.tudo();
    },
    // teclado (Enter, Esc, Delete, Ctrl+Z e atalhos de ferramenta); devolve true se usou a tecla
    tecla(e) {
      if (!grupo.visible) return false;
      if (e.target?.closest?.('input, textarea, select')) {
        if (e.key === 'Enter') e.target.blur();
        return e.key === 'Escape';
      }
      if (e.key === 'Escape') {
        if (ui.folha) acoes.fecharFolha();
        else if (ui.edicao) acoes.cancelar();
        else if (ui.esboco) acoes.terminarEsboco(false);
        else if (apresentacao?.ativa) apresentacao.parar();
        else return false;
        return true;
      }
      if (e.key === 'Enter') {
        if (ui.edicao) acoes.ok();
        else if (ui.esboco) acoes.terminarEsboco(true);
        return true;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ui.esboco && ui.entSel) acoes.apagarEntidade();
        else if (ui.aba === 'montagem' && ui.compSel) acoes.removerComp(ui.compSel);
        else if (ui.sel) acoes.apagarRecurso(ui.sel);
        return true;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        acoes.desfazer();
        return true;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        acoes.refazer();
        return true;
      }
      const atalhos = ui.esboco
        ? { l: 'linha', r: 'ret', c: 'circ', a: 'arco', p: 'poli', f: 'livre', s: 'sel_esb' }
        : { s: 'novo_esboco', e: 'extrudir', h: 'furo', r: 'revolucionar', m: 'medir' };
      const f = atalhos[e.key.toLowerCase()];
      if (f && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (f === 'medir') acoes.aba('inspecao');
        else acoes.ferramenta(f);
        return true;
      }
      return false;
    },
    definirFerramenta: (f) => acoes.ferramenta(f),
    aba: (nome) => {
      acoes.aba(nome);
      return `Aba ${nome} da oficina.`;
    },
    adicionarPorTexto(texto) {
      const local = acoes.porTextoLocal(texto);
      if (local) return local;
      return `Posso criar: ${Object.values(N.PRIMITIVAS).map((x) => x.nome.toLowerCase()).join(', ')}; para peças mais complexas, peça "projetar" com a descrição.`;
    },
    projetar: (texto) => acoes.projetarPorTexto(texto),
    fotoPeca: (texto) => acoes.fotoPeca(texto),
    celular: () => acoes.celular(),
    apresentar: (gravar) => acoes.apresentar(!!gravar),
    folha: () => acoes.folha(),
    material(nome) {
      const t = normalizar(nome);
      const chave = Object.keys(N.MATERIAIS).find((k) => t.includes(k) || t.includes(normalizar(N.MATERIAIS[k].nome).split(' ')[0]));
      if (!chave) return `Materiais: ${Object.values(N.MATERIAIS).map((m) => m.nome.toLowerCase()).join(', ')}.`;
      acoes.material(chave);
      const a = avaliacao();
      return `Material ${N.MATERIAIS[chave].nome.toLowerCase()}: a peça passa a pesar ${fmt(a.massa)} gramas.`;
    },
    corte(ligar = true) {
      if (ui.aba !== 'inspecao') acoes.aba('inspecao');
      if (ui.corte.ativo !== ligar) acoes.ferramenta('corte');
      return ligar ? 'Vista em corte ligada.' : 'Vista em corte desligada.';
    },
    explodir(f = 1) {
      if (ui.aba !== 'montagem') acoes.aba('montagem');
      acoes.explodir(f);
      return f > 0 ? 'Vista explodida da montagem.' : 'Montagem fechada.';
    },
    biblioteca(tipo, tamanho, comprimento) {
      if (!N.BIBLIOTECA[tipo]) return `Na biblioteca tem: ${Object.values(N.BIBLIOTECA).map((b) => b.nome.toLowerCase()).join(', ')}.`;
      if (ui.aba !== 'montagem') acoes.aba('montagem');
      const tam = N.BIBLIOTECA[tipo].tamanhos.includes(tamanho) ? tamanho : N.BIBLIOTECA[tipo].tamanhos[Math.min(4, N.BIBLIOTECA[tipo].tamanhos.length - 1)];
      const c = acoes.inserir({ lib: tipo, tam, comp: comprimento ? Number(comprimento) : undefined });
      return `Inseri ${montagem.nomeDe(c.id)} na montagem.`;
    },
    olhar: (vista) => {
      olharPara(vista);
      return `Vista ${vista}.`;
    },
    desfazer: () => acoes.desfazer(),
    apagar() {
      if (ui.sel) {
        const r = recurso(ui.sel);
        acoes.apagarRecurso(ui.sel);
        return `${r?.nome || 'Recurso'} apagado.`;
      }
      if (!peca().recursos.length) return 'A peça já está vazia.';
      marcar();
      peca().recursos = [];
      peca().fim = null;
      ui.sel = null;
      ui.esboco = null;
      ui.edicao = null;
      recalcular();
      redesenhar();
      salvar();
      evento('apagou a peça inteira na oficina');
      return 'Peça apagada.';
    },
    exemplo: () => acoes.exemplo(),
    exportar: (formato) => acoes.exportar(formato),
    aplicarOperacoes: (ops) => acoes.aplicarOperacoes(ops),
    modelo: () => acoes.modelo(),
    resumo() {
      const p = peca();
      if (!p.recursos.length) return `peça ${p.nome} vazia`;
      const a = avaliacao();
      const tam = a.caixa.isEmpty() ? null : a.caixa.getSize(new THREE.Vector3());
      return `peça ${p.nome} em ${N.MATERIAIS[p.material].nome.toLowerCase()}, ${p.recursos.length} recursos (${p.recursos.map((r) => `${r.nome}: ${N.resumoRecurso(r)}`).join('; ')})`
        + (tam ? `, tamanho ${fmt(tam.x, 0)} × ${fmt(tam.z, 0)} × ${fmt(tam.y, 0)} mm, massa ${fmt(a.massa)} g` : '')
        + `; aba ${ui.aba}${ui.aba === 'montagem' ? ` com ${montagem.comps.length} componentes` : ''}`;
    },
    dados() {
      const p = peca();
      const a = avaliacao();
      const tam = a.caixa.isEmpty() ? null : a.caixa.getSize(new THREE.Vector3());
      return [
        ['Peça', p.nome],
        ['Recursos', String(p.recursos.length)],
        ['Tamanho', tam ? `${fmt(tam.x, 0)}×${fmt(tam.z, 0)}×${fmt(tam.y, 0)} mm` : '—'],
        ['Volume', csg ? `${fmt(a.volume / 1000)} cm³` : 'CALCULANDO'],
        ['Massa', csg ? `${fmt(a.massa)} g (${N.MATERIAIS[p.material].nome})` : '—'],
      ];
    },
  };
  return api;
}
