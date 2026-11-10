/*
 * holo-cad-extra.js — os recursos "futuristas" da oficina (holo-cad.js):
 *
 *  - esforço: empurrar a peça num ponto mostra um mapa de calor das tensões. É uma estimativa
 *    simplificada (a peça como uma viga engastada na mesa, com flexão, compressão e a pressão
 *    no ponto de contato), boa para enxergar onde a peça sofre; não substitui elementos finitos;
 *  - apresentação de cinema: a câmera dá a volta na peça com tarjas pretas, legendas, narração
 *    em voz (pt-BR) e, se pedido, grava tudo num vídeo .webm com uma trilha sintetizada;
 *  - QR code (para abrir a peça no celular) e foto da câmera (para a peça a partir da foto).
 */
import * as THREE from 'three';

// ---------------- esforço ----------------
const corCalor = (t, alvo) => {
  // azul → ciano → verde → amarelo → vermelho
  const paradas = [[0, '#1d4bff'], [0.25, '#18d6ff'], [0.5, '#2bff7a'], [0.75, '#ffe23a'], [1, '#ff2a1f']];
  const c = new THREE.Color();
  for (let i = 1; i < paradas.length; i++) {
    if (t <= paradas[i][0]) {
      const [t0, c0] = paradas[i - 1];
      const [t1, c1] = paradas[i];
      return alvo.copy(c.set(c0)).lerp(new THREE.Color(c1), (t - t0) / (t1 - t0));
    }
  }
  return alvo.set(paradas[paradas.length - 1][1]);
};

/*
 * geometria (mm, não indexada), ponto e direção da força (para dentro da peça), força em N.
 * Devolve cores por vértice, a tensão máxima (MPa) e onde ela fica.
 */
export function calcularEsforco(geometria, ponto, direcao, forcaN, escoamento) {
  const pos = geometria.attributes.position;
  geometria.computeBoundingBox();
  const caixa = geometria.boundingBox;
  const tamanho = caixa.getSize(new THREE.Vector3());
  const y0 = caixa.min.y;
  const d = direcao.clone().normalize();
  const lateral = new THREE.Vector3(d.x, 0, d.z);
  const fl = forcaN * lateral.length();
  const fv = forcaN * Math.abs(d.y);
  if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
  lateral.normalize();
  const perp = new THREE.Vector3(-lateral.z, 0, lateral.x);
  // fatias na altura: a seção de verdade (triângulos cortados pelo plano da fatia), com a largura na
  // direção da força, a espessura na perpendicular e o centro
  const N = 28;
  const altura = Math.max(1e-6, tamanho.y);
  const fatias = Array.from({ length: N }, (_, i) => ({ y: y0 + ((i + 0.5) / N) * altura, min: Infinity, max: -Infinity, pmin: Infinity, pmax: -Infinity, cx: 0, cz: 0, n: 0 }));
  const v = new THREE.Vector3();
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const idx = geometria.index;
  const total = idx ? idx.count : pos.count;
  const anotar = (f, x, z) => {
    const a = x * lateral.x + z * lateral.z;
    const b = x * perp.x + z * perp.z;
    f.min = Math.min(f.min, a);
    f.max = Math.max(f.max, a);
    f.pmin = Math.min(f.pmin, b);
    f.pmax = Math.max(f.pmax, b);
    f.cx += x;
    f.cz += z;
    f.n++;
  };
  for (let i = 0; i < total; i += 3) {
    for (let k = 0; k < 3; k++) tri[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k);
    const ymin = Math.min(tri[0].y, tri[1].y, tri[2].y);
    const ymax = Math.max(tri[0].y, tri[1].y, tri[2].y);
    const k0 = Math.max(0, Math.ceil(((ymin - y0) / altura) * N - 0.5));
    const k1 = Math.min(N - 1, Math.floor(((ymax - y0) / altura) * N - 0.5));
    for (let k = k0; k <= k1; k++) {
      const f = fatias[k];
      for (let e = 0; e < 3; e++) {
        const a = tri[e];
        const b = tri[(e + 1) % 3];
        if ((a.y - f.y) * (b.y - f.y) > 0 || a.y === b.y) continue;
        const t = (f.y - a.y) / (b.y - a.y);
        anotar(f, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      }
    }
  }
  let anterior = null;
  for (const f of fatias) {
    if (!f.n && anterior) Object.assign(f, { ...anterior, y: f.y, n: 0 });
    if (f.n) {
      f.cx /= f.n;
      f.cz /= f.n;
    }
    f.w = Math.max(1, f.max - f.min);
    f.t = Math.max(1, f.pmax - f.pmin);
    f.meio = (f.max + f.min) / 2;
    anterior = f;
  }
  const fatiaDe = (y) => Math.min(N - 1, Math.max(0, Math.floor(((y - y0) / altura) * N)));
  const raioContato = Math.max(2, Math.min(tamanho.x, tamanho.z) * 0.06);
  const excentricidade = (f) => Math.hypot(ponto.x - f.cx, ponto.z - f.cz);
  const tensoes = new Float32Array(pos.count);
  let maximo = 0;
  const ondeMax = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const f = fatias[fatiaDe(v.y)];
    const braco = Math.max(0, ponto.y - v.y);
    const area = f.w * f.t * 0.72;
    // flexão: M·c/I de uma seção retangular (w na direção da força)
    const momento = fl * braco + fv * excentricidade(f);
    const flexao = (6 * momento) / (f.t * f.w * f.w);
    const fibra = Math.min(1, Math.abs(v.dot(lateral) - f.meio) / (f.w / 2));
    let s = v.y <= ponto.y ? flexao * fibra + fv / area : 0;
    // pressão de contato em volta do ponto empurrado
    const dist = v.distanceTo(ponto);
    s += (forcaN / (Math.PI * raioContato * raioContato)) * 0.35 * Math.exp(-(dist * dist) / (2 * raioContato * raioContato));
    tensoes[i] = s;
    if (s > maximo) {
      maximo = s;
      ondeMax.copy(v);
    }
  }
  const cores = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const topo = Math.max(maximo, 1e-6);
  for (let i = 0; i < pos.count; i++) {
    corCalor(Math.pow(tensoes[i] / topo, 0.6), c);
    cores[i * 3] = c.r;
    cores[i * 3 + 1] = c.g;
    cores[i * 3 + 2] = c.b;
  }
  return { cores, maximo, ondeMax, fatorSeguranca: escoamento / Math.max(maximo, 1e-6) };
}

export const legendaCalor = () => 'linear-gradient(90deg, #1d4bff, #18d6ff, #2bff7a, #ffe23a, #ff2a1f)';

// ---------------- QR code ----------------
let qrCarregando = null;
function carregarQR() {
  qrCarregando ||= new Promise((ok, falha) => {
    if (window.qrcode) return ok(window.qrcode);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    s.onload = () => (window.qrcode ? ok(window.qrcode) : falha(new Error('o gerador de QR não carregou')));
    s.onerror = () => falha(new Error('sem internet para o gerador de QR'));
    document.head.append(s);
  });
  return qrCarregando;
}

export async function gerarQR(texto, tamanho = 220) {
  const qrcode = await carregarQR();
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  const c = document.createElement('canvas');
  const margem = 3;
  const celula = Math.floor(tamanho / (n + margem * 2));
  c.width = c.height = celula * (n + margem * 2);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#04121a';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + margem) * celula, (r + margem) * celula, celula, celula);
  return c;
}

// ---------------- foto da câmera ----------------
export function fotoDoVideo(video, largura = 640) {
  if (!video?.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = largura;
  c.height = Math.round((largura * video.videoHeight) / video.videoWidth);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

// ---------------- apresentação de cinema ----------------
const CSS = `
.holo-cine{ position:absolute; inset:0; z-index:7; pointer-events:none; opacity:0; transition:opacity .6s; }
.holo-cine.ativa{ opacity:1; }
.holo-cine::before, .holo-cine::after{ content:""; position:absolute; left:0; right:0; height:11vh; background:#000; transition:transform .8s cubic-bezier(.2,.8,.2,1); }
.holo-cine::before{ top:0; transform:translateY(-100%); } .holo-cine::after{ bottom:0; transform:translateY(100%); }
.holo-cine.ativa::before, .holo-cine.ativa::after{ transform:none; }
.holo-cine-titulo{ position:absolute; left:6vw; bottom:calc(11vh + 26px); max-width:60vw; }
.holo-cine-titulo small{ display:block; font-family:'Share Tech Mono',monospace; font-size:12px; letter-spacing:5px; color:#4de8f0; }
.holo-cine-titulo strong{ display:block; font-family:'Orbitron',sans-serif; font-weight:900; font-size:clamp(22px,3.2vw,44px); letter-spacing:8px; color:#fff; text-shadow:0 0 24px rgba(77,232,240,.7); }
.holo-cine-legenda{ position:absolute; left:50%; bottom:3.5vh; transform:translateX(-50%); width:min(900px, 86vw); text-align:center; font-family:'Rajdhani',sans-serif; font-weight:600;
  font-size:clamp(16px,1.6vw,22px); color:#fff; text-shadow:0 2px 8px #000; }
.holo-cine-rec{ position:absolute; right:3vw; top:calc(11vh + 18px); font-family:'Share Tech Mono',monospace; font-size:12px; letter-spacing:3px; color:#ff4d4d; display:none; }
.holo-cine-rec.ligado{ display:block; animation:holo-rec 1s steps(2) infinite; }
@keyframes holo-rec{ 50%{ opacity:.25; } }
.holo-cine-dados{ position:absolute; right:5vw; bottom:calc(11vh + 26px); display:grid; gap:4px; text-align:right; font-family:'Share Tech Mono',monospace; font-size:12px; letter-spacing:2px; color:#8ff3f7; }
.holo-cine-dados b{ color:#fff; font-weight:400; }
.holo.cinema .of-ui, .holo.cinema .of-rotulos, .holo.cinema .holo-topo, .holo.cinema .holo-guia, .holo.cinema .holo-camera, .holo.cinema .holo-mao-tag, .holo.cinema .holo-cursor{
  opacity:0 !important; pointer-events:none !important; transition:opacity .6s; }
`;

function vozPtBr() {
  const vozes = window.speechSynthesis?.getVoices?.() || [];
  return vozes.find((v) => /pt-BR/i.test(v.lang) && /Google|Microsoft|Francisca|Antonio|Daniel/i.test(v.name)) || vozes.find((v) => /pt/i.test(v.lang)) || null;
}

export function criarApresentacao({ raiz, canvas }) {
  if (!document.getElementById('holo-cine-estilo')) {
    const estilo = document.createElement('style');
    estilo.id = 'holo-cine-estilo';
    estilo.textContent = CSS;
    document.head.append(estilo);
  }
  const el = document.createElement('div');
  el.className = 'holo-cine';
  el.innerHTML = '<div class="holo-cine-titulo"><small></small><strong></strong></div><div class="holo-cine-dados"></div><div class="holo-cine-legenda"></div><div class="holo-cine-rec">● REC</div>';
  raiz.append(el);
  const [tituloP, tituloG] = el.querySelectorAll('.holo-cine-titulo small, .holo-cine-titulo strong');
  const dadosEl = el.querySelector('.holo-cine-dados');
  const legenda = el.querySelector('.holo-cine-legenda');
  const rec = el.querySelector('.holo-cine-rec');
  const estado = { ativa: false, inicio: 0, duracao: 18, falas: [], proxima: 0, gravador: null, partes: [], composto: null, audio: null, fim: null, dados: [] };

  function trilha() {
    // um tapete grave de cinema: duas serras desafinadas num filtro que abre devagar
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const destino = ctx.createMediaStreamDestination();
    const mestre = ctx.createGain();
    mestre.gain.setValueAtTime(0, ctx.currentTime);
    mestre.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 2.5);
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.setValueAtTime(220, ctx.currentTime);
    filtro.frequency.linearRampToValueAtTime(1400, ctx.currentTime + estado.duracao * 0.8);
    for (const [f, det] of [[55, -7], [55, 7], [82.4, 0], [110, 4]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(filtro);
      o.start();
    }
    filtro.connect(mestre);
    mestre.connect(destino);
    mestre.connect(ctx.destination);
    return { ctx, destino, mestre };
  }

  function quadroComposto() {
    const c = estado.composto;
    if (!c) return;
    const g = c.getContext('2d');
    g.drawImage(canvas, 0, 0, c.width, c.height);
    const barra = c.height * 0.11;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, barra);
    g.fillRect(0, c.height - barra, c.width, barra);
    g.textAlign = 'left';
    g.fillStyle = '#4de8f0';
    g.font = `${Math.round(c.height * 0.018)}px "Share Tech Mono", monospace`;
    g.fillText(tituloP.textContent, c.width * 0.06, c.height - barra - c.height * 0.075);
    g.fillStyle = '#ffffff';
    g.font = `900 ${Math.round(c.height * 0.045)}px "Orbitron", sans-serif`;
    g.fillText(tituloG.textContent, c.width * 0.06, c.height - barra - c.height * 0.03);
    g.textAlign = 'center';
    g.font = `600 ${Math.round(c.height * 0.03)}px "Rajdhani", sans-serif`;
    g.fillText(legenda.textContent, c.width / 2, c.height - barra * 0.4);
    g.textAlign = 'right';
    g.fillStyle = '#8ff3f7';
    g.font = `${Math.round(c.height * 0.018)}px "Share Tech Mono", monospace`;
    estado.dados.forEach(([k, v], i) => g.fillText(`${k} ${v}`, c.width * 0.95, c.height - barra - c.height * 0.03 - (estado.dados.length - 1 - i) * c.height * 0.026));
  }

  const api = {
    get ativa() { return estado.ativa; },
    // 0 → 1 ao longo da apresentação
    get progresso() { return estado.ativa ? Math.min(1, (performance.now() - estado.inicio) / (estado.duracao * 1000)) : 0; },
    iniciar({ titulo, subtitulo, falas, dados = [], duracao = 18, gravar = false }) {
      if (estado.ativa) api.parar();
      Object.assign(estado, { ativa: true, inicio: performance.now(), duracao, falas, proxima: 0, partes: [], dados });
      tituloP.textContent = subtitulo;
      tituloG.textContent = titulo;
      dadosEl.replaceChildren(...dados.map(([k, v]) => {
        const d = document.createElement('div');
        d.textContent = `${k} `;
        const b = document.createElement('b');
        b.textContent = v;
        d.append(b);
        return d;
      }));
      legenda.textContent = '';
      el.classList.add('ativa');
      raiz.classList.add('cinema');
      rec.classList.toggle('ligado', gravar);
      window.speechSynthesis?.cancel();
      return new Promise((ok) => {
        estado.fim = ok;
        if (!gravar) return;
        try {
          estado.audio = trilha();
          const c = document.createElement('canvas');
          c.width = Math.min(1920, canvas.width);
          c.height = Math.round((c.width * canvas.height) / canvas.width);
          estado.composto = c;
          const fluxo = c.captureStream(30);
          for (const t of estado.audio.destino.stream.getAudioTracks()) fluxo.addTrack(t);
          const tipo = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((x) => MediaRecorder.isTypeSupported(x));
          estado.gravador = new MediaRecorder(fluxo, { mimeType: tipo, videoBitsPerSecond: 8_000_000 });
          estado.gravador.ondataavailable = (e) => e.data.size && estado.partes.push(e.data);
          estado.gravador.start(500);
        } catch (erro) {
          console.warn('Apresentação: gravação indisponível', erro);
          estado.gravador = null;
          rec.classList.remove('ligado');
        }
      });
    },
    // chamado a cada quadro pela oficina
    atualizar() {
      if (!estado.ativa) return;
      const t = (performance.now() - estado.inicio) / 1000;
      while (estado.proxima < estado.falas.length && t >= estado.falas[estado.proxima].t) {
        const fala = estado.falas[estado.proxima++];
        legenda.textContent = fala.texto;
        if (window.speechSynthesis) {
          const u = new SpeechSynthesisUtterance(fala.texto);
          u.lang = 'pt-BR';
          const voz = vozPtBr();
          if (voz) u.voice = voz;
          u.rate = 1.03;
          u.pitch = 0.92;
          window.speechSynthesis.speak(u);
        }
      }
      if (t >= estado.duracao) api.parar();
    },
    // depois que o laboratório desenhou o quadro: copia para o vídeo, com as legendas
    depoisDeRenderizar() {
      if (estado.ativa && estado.gravador) quadroComposto();
    },
    parar() {
      if (!estado.ativa) return;
      estado.ativa = false;
      el.classList.remove('ativa');
      raiz.classList.remove('cinema');
      window.speechSynthesis?.cancel();
      rec.classList.remove('ligado');
      const terminar = (video) => {
        estado.fim?.(video);
        estado.fim = null;
      };
      if (estado.audio) {
        const { ctx, mestre } = estado.audio;
        mestre.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
        setTimeout(() => ctx.close(), 900);
        estado.audio = null;
      }
      if (estado.gravador) {
        const g = estado.gravador;
        estado.gravador = null;
        g.onstop = () => {
          terminar(new Blob(estado.partes, { type: g.mimeType || 'video/webm' }));
          estado.composto = null;
        };
        g.stop();
      } else {
        terminar(null);
      }
    },
  };
  return api;
}

// refina a malha (divide os triângulos grandes pela aresta mais longa) para o mapa de calor ficar suave
export function refinar(geo, maxAresta, limiteTriangulos = 160000) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const n = idx ? idx.count : pos.count;
  let tris = [];
  for (let i = 0; i < n; i += 3) {
    tris.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k)));
  }
  const max2 = maxAresta * maxAresta;
  for (let volta = 0; volta < 10 && tris.length < limiteTriangulos; volta++) {
    const novos = [];
    let dividiu = false;
    for (const t of tris) {
      const d = [t[0].distanceToSquared(t[1]), t[1].distanceToSquared(t[2]), t[2].distanceToSquared(t[0])];
      const k = d.indexOf(Math.max(...d));
      if (d[k] <= max2 || novos.length + tris.length > limiteTriangulos) {
        novos.push(t);
        continue;
      }
      const a = t[k];
      const b = t[(k + 1) % 3];
      const c = t[(k + 2) % 3];
      const m = a.clone().add(b).multiplyScalar(0.5);
      novos.push([a, m, c], [m, b, c]);
      dividiu = true;
    }
    tris = novos;
    if (!dividiu) break;
  }
  const saida = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((v, k) => v.toArray(saida, i * 9 + k * 3)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(saida, 3));
  g.computeVertexNormals();
  return g;
}
