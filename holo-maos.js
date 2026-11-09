/*
 * holo-maos.js — como o laboratório holográfico (holo.js) enxerga as mãos.
 *
 * Rastreio: os 21 pontos de cada mão passam por um filtro One Euro (tira a tremedeira sem
 * atrasar o movimento rápido), cada mão é reconhecida pelo lado (direita/esquerda) entre um
 * quadro e outro, e os gestos são lidos em 3D pelos pontos "do mundo" do MediaPipe (em metros),
 * com histerese: a pinça fecha num ponto e só abre bem depois, então não fica piscando.
 *
 * Visual: em vez de linhas, uma mão holográfica com volume — ossos em cápsulas de vidro com
 * borda acesa, articulações e pontas dos dedos brilhando, palma em malha hexagonal e um anel de
 * HUD girando no centro da mão, na cor do gesto.
 */
import * as THREE from 'three';
import { brilho } from './cena.js';

export const LIGACOES_MAO = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
export const PONTAS = [4, 8, 12, 16, 20];
export const CORES_GESTO = { punho: '#ffa24c', pinca: '#5dfca0', aberta: '#4de8f0', aponta: '#b794ff', nenhum: '#8ff3f7' };
const NOMES = { punho: 'PUNHO', pinca: 'PINÇA', aberta: 'ABERTA', aponta: 'APONTANDO', nenhum: 'RELAXADA' };
// espessura de cada osso (palma mais grossa, dedos afinando até a ponta)
const GROSSURA = [1.25, 1.05, 0.9, 0.75, 1.25, 1, 0.85, 0.7, 1.15, 1, 0.85, 0.7, 1.15, 0.95, 0.8, 0.68, 1.15, 1.25, 0.85, 0.72, 0.62];

// ---------------- filtro One Euro ----------------
class UmEuro {
  constructor(minCorte = 1.4, beta = 12, corteD = 1) {
    Object.assign(this, { minCorte, beta, corteD, x: null, dx: 0, t: 0 });
  }

  filtrar(x, t) {
    if (this.x === null) {
      this.x = x;
      this.t = t;
      return x;
    }
    const dt = Math.max(1e-3, (t - this.t) / 1000);
    this.t = t;
    const alfa = (corte) => 1 / (1 + 1 / (2 * Math.PI * corte * dt));
    const dx = (x - this.x) / dt;
    this.dx += alfa(this.corteD) * (dx - this.dx);
    const corte = this.minCorte + this.beta * Math.abs(this.dx);
    this.x += alfa(corte) * (x - this.x);
    return this.x;
  }
}

// ---------------- leitura dos gestos ----------------
const sub = (a, b) => [b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)];
const tam = (v) => Math.hypot(v[0], v[1], v[2]) || 1e-6;
const cos = (u, v) => (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (tam(u) * tam(v));
const dist = (a, b) => tam(sub(a, b));

function lerGesto(P, pinchAntes) {
  const palma = dist(P[0], P[9]);
  // dedo esticado: os três segmentos quase alinhados e a ponta mais longe do pulso que a junta do meio
  const reto = (mcp, pip, dip, ponta) => cos(sub(P[mcp], P[pip]), sub(P[pip], P[ponta])) > 0.55
    && cos(sub(P[pip], P[dip]), sub(P[dip], P[ponta])) > 0.4 && dist(P[0], P[ponta]) > dist(P[0], P[pip]) * 1.08;
  const dedos = { indicador: reto(5, 6, 7, 8), medio: reto(9, 10, 11, 12), anelar: reto(13, 14, 15, 16), minimo: reto(17, 18, 19, 20) };
  dedos.polegar = cos(sub(P[1], P[2]), sub(P[2], P[4])) > 0.75 && dist(P[4], P[5]) > palma * 0.55;
  const esticados = ['indicador', 'medio', 'anelar', 'minimo'].filter((d) => dedos[d]).length;
  // pinça com histerese: fecha abaixo de 0,32 da palma e só abre acima de 0,48
  const razao = dist(P[4], P[8]) / palma;
  const indicadorLonge = dist(P[0], P[8]) > palma * 0.95;
  const pinca = indicadorLonge && (pinchAntes ? razao < 0.48 : razao < 0.32);
  let gesto = 'nenhum';
  if (pinca) gesto = 'pinca';
  else if (dedos.indicador && esticados === 1) gesto = 'aponta';
  else if (esticados === 0) gesto = 'punho';
  else if (esticados >= 3) gesto = 'aberta';
  return { gesto, pinca, dedos, razao };
}

// ---------------- rastreio com filtro e identidade de cada mão ----------------
export function criarRastreio() {
  const porLado = {};   // filtros e histórico de cada mão
  const filtros = () => Array.from({ length: 21 }, () => [new UmEuro(), new UmEuro(), new UmEuro(1.2, 8)]);

  return {
    processar(resultado, agora) {
      const marcos = resultado.landmarks || [];
      const mundo = resultado.worldLandmarks || [];
      const lados = resultado.handedness || resultado.handednesses || [];
      const vistos = new Set();
      const maos = marcos.map((pts, i) => {
        // o MediaPipe supõe a imagem espelhada: "Left" na câmera é a mão direita da pessoa
        let lado = lados[i]?.[0]?.categoryName === 'Left' ? 'direita' : lados[i]?.[0]?.categoryName === 'Right' ? 'esquerda' : `mao${i}`;
        if (vistos.has(lado)) lado = `${lado}${i}`;
        vistos.add(lado);
        const estado = porLado[lado] ||= { filtros: filtros(), gesto: 'nenhum', bruto: 'nenhum', contagem: 0, pinca: false, visto: 0 };
        if (agora - estado.visto > 400) estado.filtros = filtros();   // a mão sumiu e voltou: recomeça o filtro
        estado.visto = agora;
        const suave = pts.map((p, k) => ({
          x: estado.filtros[k][0].filtrar(p.x, agora),
          y: estado.filtros[k][1].filtrar(p.y, agora),
          z: estado.filtros[k][2].filtrar(p.z || 0, agora),
        }));
        const leitura = lerGesto(mundo[i]?.length === 21 ? mundo[i] : suave, estado.pinca);
        estado.pinca = leitura.pinca;
        // a pinça vale em 2 quadros; os outros gestos em 3, para não trocar sem querer
        estado.contagem = leitura.gesto === estado.bruto ? estado.contagem + 1 : 1;
        estado.bruto = leitura.gesto;
        if (estado.contagem >= (leitura.gesto === 'pinca' ? 2 : 3)) estado.gesto = leitura.gesto;
        const d2 = (a, b) => Math.hypot(suave[a].x - suave[b].x, suave[a].y - suave[b].y);
        const centro = [0, 5, 9, 13, 17].reduce((s, k) => ({ x: s.x + suave[k].x / 5, y: s.y + suave[k].y / 5 }), { x: 0, y: 0 });
        return {
          lado, gesto: estado.gesto, gestoBruto: leitura.gesto, dedos: leitura.dedos, razaoPinca: leitura.razao,
          pts: suave, centro, palma: d2(0, 9) || 1e-3,
          pontaPinca: { x: (suave[4].x + suave[8].x) / 2, y: (suave[4].y + suave[8].y) / 2 },
          confianca: lados[i]?.[0]?.score ?? 1,
        };
      });
      // a mão principal é a direita, quando aparece
      maos.sort((a, b) => (a.lado === 'direita' ? -1 : 0) - (b.lado === 'direita' ? -1 : 0));
      return maos;
    },
  };
}

// ---------------- mão holográfica ----------------
function materialHolo(intensidade) {
  return new THREE.ShaderMaterial({
    uniforms: { uCor: { value: new THREE.Color('#4de8f0') }, uTempo: { value: 0 }, uForca: { value: intensidade } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      varying float vAltura;
      void main() {
        vec4 p = instanceMatrix * vec4(position, 1.0);
        vec4 mv = modelViewMatrix * p;
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = normalize(-mv.xyz);
        vAltura = mv.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uCor;
      uniform float uTempo, uForca;
      varying vec3 vN;
      varying vec3 vV;
      varying float vAltura;
      void main() {
        float borda = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float faixas = 0.78 + 0.22 * sin(vAltura * 55.0 - uTempo * 7.0);
        vec3 cor = uCor * (0.18 + borda * 1.5) * faixas * uForca;
        gl_FragColor = vec4(cor, 0.25 + borda * 0.75);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
}

function materialPalma() {
  return new THREE.ShaderMaterial({
    uniforms: { uCor: { value: new THREE.Color('#4de8f0') }, uTempo: { value: 0 }, uEscala: { value: 30 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 uCor;
      uniform float uTempo, uEscala;
      varying vec2 vP;
      // distância até a borda de uma colmeia hexagonal
      float hex(vec2 p) {
        p *= uEscala;
        vec2 r = vec2(1.0, 1.7320508);
        vec2 h = r * 0.5;
        vec2 a = mod(p, r) - h;
        vec2 b = mod(p - h, r) - h;
        vec2 g = dot(a, a) < dot(b, b) ? a : b;
        vec2 q = abs(g);
        return 0.5 - max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x);
      }
      void main() {
        float linha = smoothstep(0.06, 0.0, hex(vP));
        float onda = 0.6 + 0.4 * sin(length(vP) * 40.0 - uTempo * 4.0);
        float a = 0.05 + linha * 0.35 * onda;
        gl_FragColor = vec4(uCor * a * 1.6, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

function arco(raio, largura, inicio, tamanho) {
  return new THREE.RingGeometry(raio, raio + largura, 48, 1, inicio, tamanho);
}

export function criarMaoHolografica() {
  const grupo = new THREE.Group();
  grupo.visible = false;
  grupo.renderOrder = 10;
  const matOsso = materialHolo(1);
  const matJunta = materialHolo(1.5);
  const ossos = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), matOsso, LIGACOES_MAO.length);
  const juntas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), matJunta, 21);
  ossos.frustumCulled = juntas.frustumCulled = false;
  const pontas = PONTAS.map(() => brilho(new THREE.Color('#8ff3f7'), 0.2));
  const geoPalma = new THREE.BufferGeometry();
  geoPalma.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 3), 3));
  geoPalma.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 1]);
  const matPalma = materialPalma();
  const palma = new THREE.Mesh(geoPalma, matPalma);
  palma.frustumCulled = false;
  const contorno = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3)),
    new THREE.LineBasicMaterial({ color: '#4de8f0', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  contorno.frustumCulled = false;
  // anel de HUD no centro da mão: três arcos girando em sentidos diferentes
  const hud = new THREE.Group();
  const matHud = new THREE.MeshBasicMaterial({ color: '#4de8f0', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const aneis = [
    new THREE.Mesh(arco(1, 0.06, 0, Math.PI * 1.3), matHud),
    new THREE.Mesh(arco(1.18, 0.03, 0.4, Math.PI * 0.7), matHud),
    new THREE.Mesh(arco(1.18, 0.03, Math.PI * 1.25, Math.PI * 0.55), matHud),
    new THREE.Mesh(arco(0.82, 0.02, 0, Math.PI * 2), matHud),
  ];
  hud.add(...aneis);
  // marcador da pinça entre o polegar e o indicador
  const pincaAnel = new THREE.Mesh(arco(1, 0.12, 0, Math.PI * 2), matHud.clone());
  const pincaPonto = brilho(new THREE.Color('#5dfca0'), 0.35);
  grupo.add(palma, contorno, ossos, juntas, ...pontas, hud, pincaAnel, pincaPonto);

  const P = Array.from({ length: 21 }, () => new THREE.Vector3());
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const meio = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const cima = new THREE.Vector3(0, 1, 0);
  const cor = new THREE.Color();
  let pulsoPinca = 0;

  return {
    grupo,
    // mapear(ponto normalizado) -> posição no espaço da câmera
    atualizar(mao, mapear, t, real = false) {
      grupo.visible = !!mao;
      if (!mao) return;
      mao.pts.forEach((pt, k) => P[k].copy(mapear(pt)));
      const base = P[0].distanceTo(P[9]) * 0.085;
      cor.set(CORES_GESTO[mao.gesto] || CORES_GESTO.nenhum);
      if (real) cor.lerp(new THREE.Color('#e8f6ff'), 0.45);
      for (const mat of [matOsso, matJunta, matPalma]) {
        mat.uniforms.uCor.value.copy(cor);
        mat.uniforms.uTempo.value = t;
      }
      matPalma.uniforms.uEscala.value = 2.2 / Math.max(0.05, P[0].distanceTo(P[9]));
      matHud.color.copy(cor);
      contorno.material.color.copy(cor);
      LIGACOES_MAO.forEach(([a, b], k) => {
        dir.subVectors(P[b], P[a]);
        const comprimento = dir.length() || 1e-4;
        meio.addVectors(P[a], P[b]).multiplyScalar(0.5);
        q.setFromUnitVectors(cima, dir.divideScalar(comprimento));
        const r = base * GROSSURA[k];
        m.compose(meio, q, s.set(r, comprimento, r));
        ossos.setMatrixAt(k, m);
      });
      ossos.instanceMatrix.needsUpdate = true;
      P.forEach((p, k) => {
        const ponta = PONTAS.includes(k);
        const r = base * (ponta ? 1.15 : k === 0 ? 1.6 : 1.25) * (GROSSURA[Math.max(0, k - 1)] * 0.3 + 0.75);
        m.compose(p, q.identity(), s.setScalar(r));
        juntas.setMatrixAt(k, m);
      });
      juntas.instanceMatrix.needsUpdate = true;
      PONTAS.forEach((k, i) => {
        pontas[i].position.copy(P[k]);
        pontas[i].material.color.copy(cor);
        pontas[i].scale.setScalar(base * (mao.gesto === 'aponta' && k === 8 ? 7 : 4.2));
      });
      // palma: centro e os cinco pontos da base dos dedos e do pulso
      const ids = [0, 1, 5, 9, 13, 17];
      const centro = ids.reduce((acc, k) => acc.add(P[k]), new THREE.Vector3()).divideScalar(ids.length);
      const posPalma = geoPalma.attributes.position;
      posPalma.setXYZ(0, centro.x, centro.y, centro.z);
      ids.forEach((k, i) => posPalma.setXYZ(i + 1, P[k].x, P[k].y, P[k].z));
      posPalma.needsUpdate = true;
      const posContorno = contorno.geometry.attributes.position;
      ids.forEach((k, i) => posContorno.setXYZ(i, P[k].x, P[k].y, P[k].z));
      posContorno.needsUpdate = true;
      hud.position.copy(centro);
      hud.scale.setScalar(P[0].distanceTo(P[9]) * 0.42);
      aneis[0].rotation.z = t * 1.6;
      aneis[1].rotation.z = -t * 2.3;
      aneis[2].rotation.z = -t * 2.3;
      aneis[3].scale.setScalar(1 + Math.sin(t * 3) * 0.04);
      // pinça: anel fechando e ponto aceso entre os dedos
      const pinca = mao.gesto === 'pinca';
      pulsoPinca = THREE.MathUtils.lerp(pulsoPinca, pinca ? 1 : 0, 0.3);
      pincaAnel.visible = pincaPonto.visible = pulsoPinca > 0.03;
      meio.addVectors(P[4], P[8]).multiplyScalar(0.5);
      pincaAnel.position.copy(meio);
      pincaPonto.position.copy(meio);
      pincaAnel.scale.setScalar(base * (2.6 - pulsoPinca * 0.9 + Math.sin(t * 9) * 0.15));
      pincaAnel.material.opacity = 0.9 * pulsoPinca;
      pincaPonto.scale.setScalar(base * 6 * pulsoPinca);
    },
    centroTela: (mapearTela, mao) => mapearTela(mao.pts[0]),
  };
}

export const nomeGesto = (g) => NOMES[g] || '—';
