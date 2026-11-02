/*
 * cena.js — o que o console e o laboratório do Jarvis têm em comum: a sala (piso
 * de vidro preto que reflete a cena, parede de painéis, luzes e neblina), o passe
 * de lente da câmera, a luz de estúdio, o Reator Arc de metal e os sons.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const COR = {
  ciano: new THREE.Color('#4de8f0'),
  azul: new THREE.Color('#2f7bff'),
  branco: new THREE.Color('#e8fdff'),
  laranja: new THREE.Color('#ffa24c'),
  verde: new THREE.Color('#5dfca0'),
  violeta: new THREE.Color('#b794ff'),
  ouro: new THREE.Color('#ffd89a'),
};

// sem aceleração de vídeo o Chrome desenha pelo processador: tudo precisa ficar mais leve
export function placaFraca(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const nome = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  return /basic render|swiftshader|llvmpipe|software/i.test(nome);
}

export function materialLinha(cor, opacidade = 0.35) {
  return new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: opacidade, blending: THREE.AdditiveBlending, depthWrite: false });
}

export function circulo(raio, segmentos = 128, cor = COR.ciano, opacidade = 0.35) {
  const pts = [];
  for (let i = 0; i < segmentos; i++) {
    const a = (i / segmentos) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * raio, 0, Math.sin(a) * raio));
  }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), materialLinha(cor, opacidade));
}

let brilhoCache = null;
export function texturaBrilho() {
  if (brilhoCache) return brilhoCache;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(160,250,255,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  brilhoCache = new THREE.CanvasTexture(c);
  return brilhoCache;
}

export function brilho(cor, tamanho) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrilho(), color: cor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(tamanho);
  return s;
}

// ---------------- sala ----------------
const SHADER_PISO = {
  name: 'PisoDeVidro',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uRaio: { value: 18 }, uForca: { value: 0.55 },
  },
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec2 vLocal;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vLocal = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uRaio, uForca;
    varying vec4 vUv;
    varying vec2 vLocal;
    void main() {
      vec2 uv = vUv.xy / vUv.w;
      float d = length(vLocal) / uRaio;
      // quanto mais longe, mais o reflexo borra, como num vidro polido de verdade
      float s = 0.0016 + d * 0.0065;
      vec3 r = texture2D(tDiffuse, uv).rgb * 0.2;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7854;
        vec2 o = vec2(cos(a), sin(a) * 1.8) * s;
        r += texture2D(tDiffuse, uv + o).rgb * 0.06;
        r += texture2D(tDiffuse, uv + o * 2.1).rgb * 0.04;
      }
      float fade = smoothstep(1.0, 0.25, d);
      float marcas = 0.9 + 0.1 * sin(vLocal.x * 7.0 + sin(vLocal.y * 2.3) * 2.0);
      vec3 base = color * (1.0 - d * 0.7);
      gl_FragColor = vec4(base + r * uForca * fade * marcas, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

function texturaParede(repetir) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#04070b';
  g.fillRect(0, 0, 2048, 512);
  const colunas = 40;
  const largura = 2048 / colunas;
  for (let i = 0; i < colunas; i++) {
    const x = i * largura;
    // painéis de metal escuro, cada um com um tom e com vincos entre eles
    for (const [y, h] of [[40, 130], [172, 186], [360, 112]]) {
      const tom = 12 + Math.random() * 11;
      const grad = g.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, `rgb(${tom + 8},${tom + 13},${tom + 18})`);
      grad.addColorStop(1, `rgb(${tom - 6},${tom - 3},${tom})`);
      g.fillStyle = grad;
      g.fillRect(x + 2, y, largura - 4, h);
      g.fillStyle = 'rgba(180,220,235,0.05)';
      g.fillRect(x + 2, y, largura - 4, 1);
    }
    if (Math.random() < 0.3) {
      g.fillStyle = Math.random() < 0.7 ? '#4de8f0' : '#ffa24c';
      g.fillRect(x + 8 + Math.random() * 20, 180 + Math.random() * 150, 3, 3);
    }
    // a cada oito colunas, uma fita de luz vertical
    if (i % 8 === 0) {
      g.save();
      g.shadowColor = '#4de8f0';
      g.shadowBlur = 26;
      g.fillStyle = '#b8f6fb';
      g.fillRect(x + largura / 2 - 1.5, 46, 3, 420);
      g.restore();
    }
  }
  g.save();
  g.shadowColor = '#4de8f0';
  g.shadowBlur = 16;
  g.fillStyle = 'rgba(120,235,245,0.55)';
  g.fillRect(0, 164, 2048, 2);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = repetir;
  t.anisotropy = 8;
  return t;
}

export function criarSala({ y = -2.55, raio = 18, resolucao = 1024, alturaSala = 11, repetir = 2, tamanhoPoeira = 0.035 } = {}) {
  const grupo = new THREE.Group();

  const piso = new Reflector(new THREE.CircleGeometry(raio, 96), {
    textureWidth: resolucao, textureHeight: Math.round(resolucao / 2), clipBias: 0.002, multisample: 0, shader: SHADER_PISO, color: '#04080c',
  });
  piso.rotation.x = -Math.PI / 2;
  piso.position.y = y;
  piso.material.uniforms.uRaio.value = raio;
  grupo.add(piso);
  // piso sem reflexo, para o modo econômico
  const pisoSimples = new THREE.Mesh(new THREE.CircleGeometry(raio, 48), new THREE.MeshBasicMaterial({ color: '#04080c' }));
  pisoSimples.rotation.x = -Math.PI / 2;
  pisoSimples.position.y = y;
  pisoSimples.visible = false;
  grupo.add(pisoSimples);

  const parede = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, alturaSala, 72, 1, true), new THREE.MeshBasicMaterial({ map: texturaParede(repetir), side: THREE.BackSide }));
  parede.position.y = y + alturaSala / 2;
  grupo.add(parede);

  const teto = new THREE.Mesh(new THREE.CircleGeometry(raio, 48), new THREE.MeshBasicMaterial({ color: '#030507' }));
  teto.rotation.x = Math.PI / 2;
  teto.position.y = y + alturaSala;
  grupo.add(teto);

  // anéis de luz no teto: são eles que desenham o brilho no piso
  for (const [r, forca] of [[raio * 0.36, 2.4], [raio * 0.62, 1.1]]) {
    const anel = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 0.95).multiplyScalar(forca) }));
    anel.rotation.x = Math.PI / 2;
    anel.position.y = y + alturaSala - 0.05;
    grupo.add(anel);
  }

  // cone de luz bem fraco vindo do teto: dá a sensação de ar no ambiente
  const neblina = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.36, raio * 0.5, alturaSala, 64, 1, true), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float a = pow(max(vUv.y, 0.0), 2.2) * 0.035; gl_FragColor = vec4(vec3(0.55,0.85,0.95) * a, a); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  neblina.position.y = y + alturaSala / 2;
  grupo.add(neblina);

  // poeira no ar
  const qtd = 420;
  const pos = new Float32Array(qtd * 3);
  for (let i = 0; i < qtd; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * raio * 0.8;
    pos.set([Math.cos(a) * r, y + Math.random() * alturaSala * 0.8, Math.sin(a) * r], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const poeira = new THREE.Points(geo, new THREE.PointsMaterial({
    color: '#a8e6ee', map: texturaBrilho(), size: tamanhoPoeira * 2.2, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  poeira.layers.set(1);   // o reflexo do piso não enxerga a poeira (no vidro ela vira um desenho de pontos)
  grupo.add(poeira);

  return {
    grupo, piso, pisoSimples, poeira,
    usarReflexo(sim) {
      piso.visible = sim;
      pisoSimples.visible = !sim;
    },
    animar(dt) {
      poeira.rotation.y += dt * 0.008;
    },
  };
}

// ---------------- lente da câmera ----------------
export function criarLente({ aberracao = 0.016, grao = 0.018, vinheta = 0.55 } = {}) {
  return new ShaderPass({
    name: 'Lente',
    uniforms: {
      tDiffuse: { value: null }, uTempo: { value: 0 },
      uAberracao: { value: aberracao }, uGrao: { value: grao }, uVinheta: { value: vinheta },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTempo, uAberracao, uGrao, uVinheta;
      varying vec2 vUv;
      float acaso(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTempo * 37.0) * 43758.5453); }
      void main() {
        vec2 c = vUv - 0.5;
        float r2 = dot(c, c);
        // as cores se separam um pouco nas bordas, como numa lente real
        vec2 d = c * r2 * uAberracao;
        vec3 cor = vec3(texture2D(tDiffuse, vUv + d).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d).b);
        cor *= 1.0 - uVinheta * smoothstep(0.12, 0.72, r2);
        cor += (acaso(vUv * 1000.0) - 0.5) * uGrao * (0.4 + cor);
        gl_FragColor = vec4(cor, 1.0);
      }`,
  });
}

// luz de estúdio refletida nos metais (o reator, as esferas do átomo e do DNA)
export function ambienteEstudio(renderer, cena, intensidade = 0.7) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environmentIntensity = intensidade;
  pmrem.dispose();
}

// ---------------- Reator Arc de metal ----------------
function anelTorneado(perfil, material, segmentos = 128) {
  const geo = new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(r, y)), segmentos);
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = Math.PI / 2;   // o torno gira em volta de Y; a peça fica de frente para Z
  return m;
}

export function criarReatorReal() {
  const grupo = new THREE.Group();
  const aco = new THREE.MeshStandardMaterial({ color: '#b4bcc6', metalness: 1, roughness: 0.3 });
  const acoEscuro = new THREE.MeshStandardMaterial({ color: '#30373f', metalness: 1, roughness: 0.42 });
  const cobre = new THREE.MeshStandardMaterial({ color: '#c8783a', metalness: 1, roughness: 0.34 });
  const paladio = new THREE.MeshStandardMaterial({ color: '#e0e5ea', metalness: 1, roughness: 0.16 });
  const corNucleo = new THREE.Color('#7ef4ff');
  const nucleoMat = new THREE.MeshBasicMaterial({ color: corNucleo.clone().multiplyScalar(2.6) });
  const fitaMat = new THREE.MeshBasicMaterial({ color: corNucleo.clone().multiplyScalar(1.5) });

  // carcaça externa e cubo central, com bordas chanfradas
  grupo.add(anelTorneado([[2.18, 0.16], [2.22, 0.27], [2.47, 0.27], [2.56, 0.16], [2.56, -0.3], [2.18, -0.3], [2.18, 0.16]], aco));
  grupo.add(anelTorneado([[0.94, 0.2], [0.98, 0.3], [1.18, 0.3], [1.25, 0.2], [1.25, -0.28], [0.94, -0.28], [0.94, 0.2]], aco));
  const fundo = new THREE.Mesh(new THREE.CircleGeometry(2.2, 96), acoEscuro);
  fundo.position.z = -0.26;
  grupo.add(fundo);

  // dez bobinas de cobre enroladas em volta de uma barra
  const voltas = 15;
  const espira = new THREE.TorusGeometry(0.2, 0.027, 6, 22);
  const espiras = new THREE.InstancedMesh(espira, cobre, 10 * voltas);
  const barra = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.12, 0.86), acoEscuro, 10);
  const separador = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.1, 0.96), aco, 10);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const tang = new THREE.Vector3();
  const prof = new THREE.Vector3(0, 0, 1);
  const rad = new THREE.Vector3();
  for (let b = 0; b < 10; b++) {
    const a = (b / 10) * Math.PI * 2;
    rad.set(Math.cos(a), Math.sin(a), 0);
    tang.set(-Math.sin(a), Math.cos(a), 0);
    for (let v = 0; v < voltas; v++) {
      const r = 1.34 + (v / (voltas - 1)) * 0.76;
      m.makeBasis(tang.clone().multiplyScalar(1 + (r - 1.34) * 0.75), prof.clone().multiplyScalar(0.72), rad);
      m.setPosition(pos.copy(rad).multiplyScalar(r));
      espiras.setMatrixAt(b * voltas + v, m);
    }
    m.makeBasis(tang, prof, rad);
    m.setPosition(pos.copy(rad).multiplyScalar(1.72));
    barra.setMatrixAt(b, m);
    const a2 = a + Math.PI / 10;
    const rad2 = new THREE.Vector3(Math.cos(a2), Math.sin(a2), 0);
    const tang2 = new THREE.Vector3(-Math.sin(a2), Math.cos(a2), 0);
    m.makeBasis(tang2, prof, rad2);
    m.setPosition(pos.copy(rad2).multiplyScalar(1.71));
    separador.setMatrixAt(b, m);
  }
  grupo.add(espiras, barra, separador);

  // fitas de luz entre as peças
  for (const [r, e] of [[1.28, 0.016], [2.15, 0.018], [0.72, 0.03]]) {
    const anel = new THREE.Mesh(new THREE.TorusGeometry(r, e, 8, 128), fitaMat);
    anel.position.z = 0.16;
    grupo.add(anel);
  }

  // triângulo de paládio em volta do núcleo
  const cantos = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    return new THREE.Vector3(Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0.14);
  });
  cantos.forEach((p, i) => {
    const q = cantos[(i + 1) % 3];
    const dir = q.clone().sub(p);
    const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, dir.length(), 16), paladio);
    haste.position.copy(p).add(q).multiplyScalar(0.5);
    haste.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const junta = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), paladio);
    junta.position.copy(p);
    grupo.add(haste, junta);
  });

  // núcleo aceso e tampa de vidro que pega o reflexo do ambiente
  const nucleo = new THREE.Mesh(new THREE.SphereGeometry(0.46, 40, 24), nucleoMat);
  nucleo.scale.z = 0.4;
  nucleo.position.z = 0.04;
  grupo.add(nucleo);
  const aura = brilho(corNucleo, 2.5);
  aura.position.z = 0.3;
  aura.material.opacity = 0.3;
  grupo.add(aura);
  const vidro = new THREE.Mesh(new THREE.CircleGeometry(2.2, 96), new THREE.MeshPhysicalMaterial({
    color: '#ffffff', transparent: true, opacity: 0.05, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1, depthWrite: false,
  }));
  vidro.position.z = 0.24;
  grupo.add(vidro);

  // parafusos da carcaça
  const parafusos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), acoEscuro, 24);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    m.compose(new THREE.Vector3(Math.cos(a) * 2.37, Math.sin(a) * 2.37, 0.28), q, new THREE.Vector3(1, 1, 1));
    parafusos.setMatrixAt(i, m);
  }
  grupo.add(parafusos);

  // a luz do núcleo acende o cobre e o aço por dentro
  const luz = new THREE.PointLight(corNucleo, 5, 7, 1.7);
  luz.position.z = 0.7;
  grupo.add(luz);

  return {
    grupo,
    animar(t, nivel = 0) {
      const pulso = 0.86 + Math.sin(t * 2.6) * 0.1 + nivel * 0.9;
      nucleoMat.color.copy(corNucleo).multiplyScalar(2.6 * pulso);
      fitaMat.color.copy(corNucleo).multiplyScalar(1.5 * pulso);
      aura.material.color.copy(corNucleo);
      aura.scale.setScalar(1.7 + pulso * 0.4);
      luz.color.copy(corNucleo);
      luz.intensity = 5 * pulso;
    },
    definirCor(cor) {
      corNucleo.copy(cor);
    },
  };
}

// ---------------- sons (sintetizados, sem baixar nada) ----------------
export function criarSom() {
  let ctx = null;
  let saida = null;
  let hum = null;
  let ligado = true;
  try { ligado = localStorage.getItem('jarvis.som') !== '0'; } catch {}

  const garantir = () => {
    if (!ctx) {
      const Contexto = window.AudioContext || window.webkitAudioContext;
      if (!Contexto) return false;
      ctx = new Contexto();
      saida = ctx.createGain();
      saida.gain.value = ligado ? 1 : 0;
      saida.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  };

  const tom = (freq, ate, dur, volume, tipo = 'sine', atraso = 0) => {
    if (!garantir()) return;
    const t0 = ctx.currentTime + atraso;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, ate), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(volume, t0 + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(saida);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  };

  const sopro = (de, ate, dur, volume) => {
    if (!garantir()) return;
    const t0 = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const dados = buffer.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = 1.4;
    filtro.frequency.setValueAtTime(de, t0);
    filtro.frequency.exponentialRampToValueAtTime(ate, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(volume, t0 + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    fonte.connect(filtro).connect(g).connect(saida);
    fonte.start(t0);
  };

  return {
    get ligado() { return ligado; },
    alternar() {
      ligado = !ligado;
      try { localStorage.setItem('jarvis.som', ligado ? '1' : '0'); } catch {}
      if (garantir()) saida.gain.setTargetAtTime(ligado ? 1 : 0, ctx.currentTime, 0.05);
      return ligado;
    },
    // zumbido baixo do projetor
    ligarZumbido() {
      if (!garantir() || hum) return;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.016, ctx.currentTime, 0.8);
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.value = 420;
      const a = ctx.createOscillator();
      const b = ctx.createOscillator();
      a.type = 'sawtooth';
      a.frequency.value = 58;
      b.type = 'triangle';
      b.frequency.value = 116.6;
      a.connect(filtro);
      b.connect(filtro);
      filtro.connect(g).connect(saida);
      a.start();
      b.start();
      hum = { a, b, g };
    },
    desligarZumbido() {
      if (!hum) return;
      const { a, b, g } = hum;
      hum = null;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      a.stop(ctx.currentTime + 1);
      b.stop(ctx.currentTime + 1);
    },
    clique() { tom(1500, 900, 0.07, 0.05, 'triangle'); },
    agarrar() { tom(420, 880, 0.12, 0.06); },
    soltar() { tom(760, 340, 0.12, 0.05); },
    transformar() {
      sopro(300, 3200, 1.5, 0.05);
      tom(180, 720, 1.2, 0.035, 'sine');
      tom(1320, 1760, 0.16, 0.035, 'sine', 1.25);
    },
    desmontar() { sopro(2400, 260, 0.9, 0.06); tom(320, 70, 0.7, 0.05); },
    montar() { sopro(260, 2200, 0.7, 0.045); tom(90, 300, 0.6, 0.04); },
    ligarSistema() {
      tom(90, 440, 1.3, 0.05);
      tom(660, 660, 0.12, 0.03, 'sine', 1.1);
      tom(990, 990, 0.2, 0.03, 'sine', 1.25);
    },
  };
}
