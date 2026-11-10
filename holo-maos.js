/*
 * holo-maos.js — como o laboratório holográfico (holo.js) enxerga as mãos.
 *
 * Rastreio: os 21 pontos de cada mão passam por um filtro One Euro (tira a tremedeira sem
 * atrasar o movimento rápido), cada mão é reconhecida pelo lado (direita/esquerda) entre um
 * quadro e outro, e os gestos são lidos em 3D pelos pontos "do mundo" do MediaPipe (em metros),
 * com histerese: a pinça fecha num ponto e só abre bem depois, então não fica piscando.
 *
 * Além dos gestos básicos (pinça, apontar, punho, mão aberta), lê:
 *  - joinha e joinha para baixo (confirmar e desfazer, disparados uma vez depois de segurar);
 *  - tesoura: indicador e médio em V, e o V fechando vira um "corte";
 *  - palma para cima, o giro do pulso na tela e a orientação 3D da mão (para girar peças);
 *  - o tamanho da mão e a abertura polegar–indicador em centímetros.
 *
 * O visual da mão (a luva) fica em holo-luva.js.
 */
import * as THREE from 'three';

export const LIGACOES_MAO = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
export const PONTAS = [4, 8, 12, 16, 20];
export const CORES_GESTO = {
  punho: '#ffa24c', pinca: '#5dfca0', aberta: '#4de8f0', aponta: '#b794ff', nenhum: '#8ff3f7',
  joinha: '#5dfca0', joinha_baixo: '#ff6b6b', tesoura: '#ffd84d',
};
const NOMES = {
  punho: 'PUNHO', pinca: 'PINÇA', aberta: 'ABERTA', aponta: 'APONTANDO', nenhum: 'RELAXADA',
  joinha: 'JOINHA', joinha_baixo: 'JOINHA P/ BAIXO', tesoura: 'TESOURA',
};

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
  // polegar em pé (joinha) ou para baixo: os outros dedos fechados e o polegar esticado na vertical
  const vPolegar = sub(P[2], P[4]);
  const vertical = vPolegar[1] / tam(vPolegar);   // y para baixo, como na imagem
  const polegarFora = dist(P[4], P[5]) > palma * 0.5 && cos(sub(P[2], P[3]), sub(P[3], P[4])) > 0.6;
  let gesto = 'nenhum';
  if (pinca) gesto = 'pinca';
  else if (esticados === 0 && polegarFora && vertical < -0.7) gesto = 'joinha';
  else if (esticados === 0 && polegarFora && vertical > 0.7) gesto = 'joinha_baixo';
  else if (dedos.indicador && dedos.medio && !dedos.anelar && !dedos.minimo) gesto = 'tesoura';
  else if (dedos.indicador && esticados === 1) gesto = 'aponta';
  else if (esticados === 0) gesto = 'punho';
  else if (esticados >= 3) gesto = 'aberta';
  return { gesto, pinca, dedos, razao, esticados, aberturaV: dist(P[8], P[12]) / palma };
}

// orientação da mão (base ortonormal: X do mínimo ao indicador, Y do pulso ao dedo médio)
const eixoX = new THREE.Vector3();
const eixoY = new THREE.Vector3();
const eixoZ = new THREE.Vector3();
const base = new THREE.Matrix4();
function orientacao(W, alvo) {
  eixoY.set(W[9].x - W[0].x, W[9].y - W[0].y, (W[9].z || 0) - (W[0].z || 0)).normalize();
  eixoX.set(W[5].x - W[17].x, W[5].y - W[17].y, (W[5].z || 0) - (W[17].z || 0));
  eixoX.addScaledVector(eixoY, -eixoX.dot(eixoY)).normalize();
  eixoZ.crossVectors(eixoX, eixoY);
  base.makeBasis(eixoX, eixoY, eixoZ);
  return alvo.setFromRotationMatrix(base);
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
        const estado = porLado[lado] ||= {
          filtros: filtros(), gesto: 'nenhum', bruto: 'nenhum', contagem: 0, pinca: false, visto: 0,
          desde: 0, disparado: false, vAbertoEm: 0, corteEm: 0, tamanhoCm: 0, pincaCm: 0, palmaCimaDesde: 0,
        };
        if (agora - estado.visto > 400) {
          // a mão sumiu e voltou: recomeça o filtro
          estado.filtros = filtros();
          estado.tamanhoCm = 0;
        }
        estado.visto = agora;
        const suave = pts.map((p, k) => ({
          x: estado.filtros[k][0].filtrar(p.x, agora),
          y: estado.filtros[k][1].filtrar(p.y, agora),
          z: estado.filtros[k][2].filtrar(p.z || 0, agora),
        }));
        const W = mundo[i]?.length === 21 ? mundo[i] : null;
        const leitura = lerGesto(W || suave, estado.pinca);
        estado.pinca = leitura.pinca;
        // a pinça vale em 2 quadros; os outros gestos em 3, para não trocar sem querer
        estado.contagem = leitura.gesto === estado.bruto ? estado.contagem + 1 : 1;
        estado.bruto = leitura.gesto;
        if (estado.contagem >= (leitura.gesto === 'pinca' ? 2 : 3) && estado.gesto !== leitura.gesto) {
          estado.gesto = leitura.gesto;
          estado.desde = agora;
          estado.disparado = false;
        }
        // joinha confirma e joinha para baixo desfaz, uma vez só, depois de segurar um instante
        let evento = null;
        if (!estado.disparado && agora - estado.desde > 300) {
          if (estado.gesto === 'joinha') evento = 'confirmar';
          if (estado.gesto === 'joinha_baixo') evento = 'desfazer';
          if (evento) estado.disparado = true;
        }
        // tesoura: o V aberto que fecha rápido vira um corte
        if (leitura.gesto === 'tesoura' || estado.gesto === 'tesoura') {
          if (leitura.aberturaV > 0.42) estado.vAbertoEm = agora;
          if (leitura.aberturaV < 0.2 && agora - estado.vAbertoEm < 700 && agora - estado.corteEm > 900) {
            estado.corteEm = agora;
            estado.vAbertoEm = 0;
            evento = 'corte';
          }
        }
        // medidas reais (aproximadas) pelos pontos do mundo, em centímetros
        let normal = null;
        let quat = null;
        let palmaCima = false;
        if (W) {
          const comprimento = (dist(W[0], W[9]) + dist(W[9], W[10]) + dist(W[10], W[11]) + dist(W[11], W[12])) * 100;
          estado.tamanhoCm = estado.tamanhoCm ? estado.tamanhoCm + (comprimento - estado.tamanhoCm) * 0.05 : comprimento;
          const abertura = dist(W[4], W[8]) * 100;
          estado.pincaCm = estado.pincaCm ? estado.pincaCm + (abertura - estado.pincaCm) * 0.35 : abertura;
          // normal da palma (para o lado de dentro da mão), em coordenadas da imagem (y para baixo)
          const a = sub(W[0], W[5]);
          const b = sub(W[0], W[17]);
          const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          const s = (lado.startsWith('esquerda') ? -1 : 1) / tam(n);
          normal = { x: n[0] * s, y: n[1] * s, z: n[2] * s };
          quat = orientacao(W, new THREE.Quaternion());
          if (leitura.esticados >= 3 && normal.y < -0.55) {
            estado.palmaCimaDesde ||= agora;
            palmaCima = agora - estado.palmaCimaDesde > 250;
          } else {
            estado.palmaCimaDesde = 0;
          }
        }
        const d2 = (a, b) => Math.hypot(suave[a].x - suave[b].x, suave[a].y - suave[b].y);
        const centro = [0, 5, 9, 13, 17].reduce((acc, k) => ({ x: acc.x + suave[k].x / 5, y: acc.y + suave[k].y / 5 }), { x: 0, y: 0 });
        return {
          lado, gesto: estado.gesto, gestoBruto: leitura.gesto, dedos: leitura.dedos, razaoPinca: leitura.razao,
          pts: suave, centro, palma: d2(0, 9) || 1e-3,
          pontaPinca: { x: (suave[4].x + suave[8].x) / 2, y: (suave[4].y + suave[8].y) / 2 },
          pontaV: { x: (suave[8].x + suave[12].x) / 2, y: (suave[8].y + suave[12].y) / 2 },
          confianca: lados[i]?.[0]?.score ?? 1,
          evento, normal, quat, palmaCima,
          // giro do pulso na tela (radianos), do pulso até a base do dedo médio
          giro: Math.atan2(suave[9].y - suave[0].y, suave[0].x - suave[9].x),
          tamanhoCm: estado.tamanhoCm, pincaCm: estado.pincaCm,
        };
      });
      // a mão principal é a direita, quando aparece
      maos.sort((a, b) => (a.lado === 'direita' ? -1 : 0) - (b.lado === 'direita' ? -1 : 0));
      return maos;
    },
  };
}

export const nomeGesto = (g) => NOMES[g] || '—';
