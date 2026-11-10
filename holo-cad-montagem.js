/*
 * holo-cad-montagem.js — a montagem da oficina (holo-cad.js): várias peças e itens da
 * biblioteca juntos, com restrições de verdade.
 *
 *  - componentes: uma peça da oficina ou um item da biblioteca (parafuso, porca, arruela,
 *    rolamento, perfil), cada um com posição e rotação próprias;
 *  - restrições "face com face" (encosta uma face na outra, de frente) e "eixo com eixo"
 *    (alinha furos e pinos), resolvidas na ordem em que foram criadas;
 *  - vista explodida animada (cada componente se afasta do centro) e lista de materiais.
 *
 * Tudo em milímetros, dentro do grupo que a oficina escala e gira.
 */
import * as THREE from 'three';
import { MATERIAIS, pecaBiblioteca, propriedadesMassa, arestasLimpas } from './holo-cad-nucleo.js';

const v3 = (a) => new THREE.Vector3(...a);
const arr = (v) => v.toArray().map((n) => +n.toFixed(4));

export function criarMontagem({ grupo, peca, materialPara, arestaPara }) {
  // peca(id) → { nome, geometria, material, eixos: [{p, d}], massa } da peça avaliada
  const raizComp = new THREE.Group();
  grupo.add(raizComp);
  const estado = { comps: [], restricoes: [], explodir: 0, explodirAlvo: 0, proximo: 1, real: false };
  const objetos = new Map();   // id → { grupo, malhas, info }
  const cacheBib = new Map();

  function infoDe(c) {
    if (c.ref.peca) {
      const p = peca(c.ref.peca);
      if (!p) return null;
      return { nome: p.nome, partes: p.geometria ? [p.geometria] : [], linhas: p.linhas || [], eixos: p.eixos || [], material: p.material, massa: p.massa };
    }
    const chave = `${c.ref.lib}|${c.ref.tam}|${c.ref.comp || ''}`;
    if (!cacheBib.has(chave)) {
      const b = pecaBiblioteca(c.ref.lib, c.ref.tam, c.ref.comp);
      const volume = b.partes.reduce((s, g) => s + Math.abs(propriedadesMassa(g).volume), 0);
      b.massa = (volume / 1000) * MATERIAIS[b.material].densidade;
      cacheBib.set(chave, b);
    }
    return cacheBib.get(chave);
  }

  function montarObjeto(c) {
    const antigo = objetos.get(c.id);
    if (antigo) raizComp.remove(antigo.grupo);
    const info = infoDe(c);
    const g = new THREE.Group();
    g.userData.comp = c.id;
    const malhas = [];
    if (info) {
      info.partes.forEach((geo, i) => {
        const m = new THREE.Mesh(geo, materialPara(info.material, estado.real, info.cores?.[i]));
        m.userData.comp = c.id;
        g.add(m);
        malhas.push(m);
        const arestas = new THREE.LineSegments(arestasLimpas(geo, 28), arestaPara(estado.real));
        arestas.userData.aresta = true;
        g.add(arestas);
      });
      for (const l of info.linhas || []) {
        const linha = new THREE.Line(l, arestaPara(estado.real, true));
        linha.userData.aresta = true;
        g.add(linha);
      }
    }
    raizComp.add(g);
    objetos.set(c.id, { grupo: g, malhas, info });
    aplicarTransformacao(c);
  }

  function aplicarTransformacao(c) {
    const o = objetos.get(c.id);
    if (!o) return;
    o.grupo.position.fromArray(c.pos);
    o.grupo.quaternion.fromArray(c.quat);
    o.grupo.updateMatrix();
  }

  function centroDe(c) {
    const o = objetos.get(c.id);
    const caixa = new THREE.Box3();
    for (const m of o?.malhas || []) {
      m.geometry.computeBoundingBox();
      caixa.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().compose(v3(c.pos), new THREE.Quaternion().fromArray(c.quat), new THREE.Vector3(1, 1, 1))));
    }
    return caixa.isEmpty() ? v3(c.pos) : caixa.getCenter(new THREE.Vector3());
  }

  // ---------- restrições ----------
  const matriz = (c) => new THREE.Matrix4().compose(v3(c.pos), new THREE.Quaternion().fromArray(c.quat), new THREE.Vector3(1, 1, 1));
  const qDe = (c) => new THREE.Quaternion().fromArray(c.quat);

  function resolver(r) {
    const A = estado.comps.find((c) => c.id === r.a.comp);
    const B = estado.comps.find((c) => c.id === r.b.comp);
    if (!A || !B || A === B) return false;
    if (r.tipo === 'face') {
      const PA = v3(r.a.p).applyMatrix4(matriz(A));
      const NA = v3(r.a.n).applyQuaternion(qDe(A)).normalize();
      const NB = v3(r.b.n).applyQuaternion(qDe(B)).normalize();
      const giro = new THREE.Quaternion().setFromUnitVectors(NB, NA.clone().negate());
      B.quat = qDe(B).premultiply(giro).normalize().toArray();
      const PB = v3(r.b.p).applyMatrix4(matriz(B));
      const ajuste = NA.clone().multiplyScalar(PA.clone().sub(PB).dot(NA) + (r.folga || 0));
      B.pos = arr(v3(B.pos).add(ajuste));
    } else {
      const PA = v3(r.a.p).applyMatrix4(matriz(A));
      const DA = v3(r.a.d).applyQuaternion(qDe(A)).normalize();
      const DB = v3(r.b.d).applyQuaternion(qDe(B)).normalize();
      const alvo = DB.dot(DA) < 0 && !r.inverter ? DA.clone().negate() : DA.clone();
      const giro = new THREE.Quaternion().setFromUnitVectors(DB, alvo);
      B.quat = qDe(B).premultiply(giro).normalize().toArray();
      const PB = v3(r.b.p).applyMatrix4(matriz(B));
      const v = PB.clone().sub(PA);
      const perp = v.clone().sub(DA.clone().multiplyScalar(v.dot(DA)));
      B.pos = arr(v3(B.pos).sub(perp));
    }
    aplicarTransformacao(B);
    return true;
  }

  // eixo mais perto do ponto clicado (em coordenadas do componente)
  function eixoPerto(c, pontoLocal) {
    const info = objetos.get(c.id)?.info;
    let melhor = null;
    for (const e of info?.eixos || []) {
      const p = v3(e.p);
      const d = v3(e.d).normalize();
      const w = pontoLocal.clone().sub(p);
      const dist = w.clone().sub(d.clone().multiplyScalar(w.dot(d))).length();
      if (!melhor || dist < melhor.dist) melhor = { p: e.p, d: e.d, dist };
    }
    return melhor;
  }

  const raycaster = new THREE.Raycaster();
  const teste = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  teste.matrixAutoUpdate = false;

  const api = {
    grupo: raizComp,
    get comps() { return estado.comps; },
    get restricoes() { return estado.restricoes; },
    carregar(dados) {
      estado.comps = (dados?.comps || []).map((c) => ({ ...c }));
      estado.restricoes = (dados?.restricoes || []).map((r) => ({ ...r }));
      estado.proximo = dados?.proximo || estado.comps.length + estado.restricoes.length + 1;
      api.reconstruir();
    },
    dados: () => ({ comps: estado.comps, restricoes: estado.restricoes, proximo: estado.proximo }),
    reconstruir(somentePeca = null) {
      for (const [id, o] of objetos) {
        if (!estado.comps.some((c) => c.id === id)) {
          raizComp.remove(o.grupo);
          objetos.delete(id);
        }
      }
      for (const c of estado.comps) if (!somentePeca || c.ref.peca === somentePeca || !objetos.has(c.id)) montarObjeto(c);
    },
    inserir(ref, pos = null) {
      const id = `c${estado.proximo++}`;
      // cada novo componente entra ao lado dos que já estão lá
      let x = 0;
      for (const c of estado.comps) {
        const o = objetos.get(c.id);
        const caixa = new THREE.Box3();
        for (const m of o?.malhas || []) {
          m.geometry.computeBoundingBox();
          caixa.union(m.geometry.boundingBox.clone().applyMatrix4(matriz(c)));
        }
        if (!caixa.isEmpty()) x = Math.max(x, caixa.max.x + 15);
      }
      const c = { id, ref, pos: pos || [estado.comps.length ? x + 10 : 0, 0, 0], quat: [0, 0, 0, 1], fixo: !estado.comps.length };
      estado.comps.push(c);
      montarObjeto(c);
      if (!pos && estado.comps.length > 1) {
        const caixa = new THREE.Box3();
        for (const m of objetos.get(id).malhas) {
          m.geometry.computeBoundingBox();
          caixa.union(m.geometry.boundingBox);
        }
        if (!caixa.isEmpty()) c.pos[0] += -caixa.min.x;
        aplicarTransformacao(c);
      }
      return c;
    },
    remover(id) {
      estado.comps = estado.comps.filter((c) => c.id !== id);
      estado.restricoes = estado.restricoes.filter((r) => r.a.comp !== id && r.b.comp !== id);
      api.reconstruir();
    },
    removerRestricao(id) {
      estado.restricoes = estado.restricoes.filter((r) => r.id !== id);
    },
    mover(id, pos) {
      const c = estado.comps.find((x) => x.id === id);
      if (!c) return;
      c.pos = pos.map((n) => +n.toFixed(3));
      aplicarTransformacao(c);
    },
    girar(id, eixo, graus) {
      const c = estado.comps.find((x) => x.id === id);
      if (!c) return;
      const q = new THREE.Quaternion().setFromAxisAngle({ x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }[eixo], THREE.MathUtils.degToRad(graus));
      c.quat = qDe(c).premultiply(q).normalize().toArray();
      aplicarTransformacao(c);
    },
    // raio no espaço da montagem → componente, ponto e normal (no espaço do componente)
    escolher(raio) {
      raycaster.ray.copy(raio);
      let melhor = null;
      for (const o of objetos.values()) {
        o.grupo.updateMatrix();
        teste.matrixWorld.copy(o.grupo.matrix);
        for (const m of o.malhas) {
          teste.geometry = m.geometry;
          const hit = raycaster.intersectObject(teste, false)[0];
          if (hit && (!melhor || hit.distance < melhor.hit.distance)) melhor = { hit, o };
        }
      }
      if (!melhor) return null;
      const c = estado.comps.find((x) => x.id === melhor.o.grupo.userData.comp);
      const local = melhor.hit.point.clone().applyMatrix4(melhor.o.grupo.matrix.clone().invert());
      const mundo = raizComp.localToWorld(melhor.hit.point.clone());
      return { comp: c, ponto: local, normal: melhor.hit.face.normal.clone(), mundo, eixo: eixoPerto(c, local) };
    },
    restringir(tipo, a, b) {
      if (!a || !b || a.comp.id === b.comp.id) return 'Escolha dois componentes diferentes.';
      if (b.comp.fixo && !a.comp.fixo) [a, b] = [b, a];
      const r = { id: `r${estado.proximo++}`, tipo };
      if (tipo === 'face') {
        r.a = { comp: a.comp.id, p: arr(a.ponto), n: arr(a.normal) };
        r.b = { comp: b.comp.id, p: arr(b.ponto), n: arr(b.normal) };
      } else {
        if (!a.eixo || !b.eixo) return 'Um dos dois não tem eixo (furo, pino ou peça redonda).';
        r.a = { comp: a.comp.id, p: a.eixo.p, d: a.eixo.d };
        r.b = { comp: b.comp.id, p: b.eixo.p, d: b.eixo.d };
      }
      estado.restricoes.push(r);
      resolver(r);
      return null;
    },
    resolverTudo() {
      for (let volta = 0; volta < 2; volta++) for (const r of estado.restricoes) resolver(r);
    },
    explodir(f) { estado.explodirAlvo = THREE.MathUtils.clamp(f, 0, 1.5); },
    get explosao() { return estado.explodirAlvo; },
    aplicarVisual(real) {
      estado.real = real;
      for (const c of estado.comps) montarObjeto(c);
    },
    destacar(id) {
      for (const [cid, o] of objetos) {
        for (const m of o.malhas) {
          const destaque = cid === id;
          if (m.material.emissive) m.material.emissiveIntensity = destaque ? 0.35 : 0;
          if (m.material.uniforms?.uDestaque) m.material.uniforms.uDestaque.value = destaque ? 1 : 0;
        }
      }
    },
    atualizar(dt) {
      estado.explodir = THREE.MathUtils.lerp(estado.explodir, estado.explodirAlvo, 1 - Math.exp(-dt * 4));
      const caixa = new THREE.Box3();
      for (const c of estado.comps) caixa.expandByPoint(centroDe(c));
      const centro = caixa.isEmpty() ? new THREE.Vector3() : caixa.getCenter(new THREE.Vector3());
      const tam = Math.max(40, caixa.isEmpty() ? 40 : caixa.getSize(new THREE.Vector3()).length());
      for (const c of estado.comps) {
        const o = objetos.get(c.id);
        if (!o) continue;
        const dir = centroDe(c).sub(centro);
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
        dir.normalize();
        dir.y += 0.35;
        o.grupo.position.fromArray(c.pos).addScaledVector(dir.normalize(), estado.explodir * tam * 0.7);
      }
    },
    caixa() {
      raizComp.updateMatrixWorld();
      const caixa = new THREE.Box3();
      for (const o of objetos.values()) for (const m of o.malhas) caixa.expandByObject(m);
      return caixa;
    },
    // lista de materiais: um item por peça diferente
    listaMateriais() {
      const linhas = new Map();
      for (const c of estado.comps) {
        const info = objetos.get(c.id)?.info;
        if (!info) continue;
        const chave = c.ref.peca || `${c.ref.lib}|${c.ref.tam}|${c.ref.comp || ''}`;
        const l = linhas.get(chave) || { nome: info.nome, qtd: 0, material: MATERIAIS[info.material]?.nome || '—', massa: info.massa || 0 };
        l.qtd++;
        linhas.set(chave, l);
      }
      return [...linhas.values()].map((l, i) => ({ item: i + 1, ...l, total: l.massa * l.qtd }));
    },
    // malhas no lugar (para exportar a montagem inteira)
    malhasNoLugar() {
      raizComp.updateMatrixWorld();
      return [...objetos.values()].flatMap((o) => o.malhas);
    },
    nomeDe(id) {
      const c = estado.comps.find((x) => x.id === id);
      const info = c && objetos.get(c.id)?.info;
      return info ? `${info.nome}:${estado.comps.filter((x) => JSON.stringify(x.ref) === JSON.stringify(c.ref)).indexOf(c) + 1}` : id;
    },
  };
  return api;
}
