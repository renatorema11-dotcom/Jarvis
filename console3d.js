/*
 * console3d.js — a cena 3D atrás do console do Jarvis: a mesma sala do laboratório,
 * com o Reator Arc no lugar do reator desenhado. O núcleo muda de cor com o estado
 * da conversa e pulsa com o volume da voz. Dois visuais: 'holo' (partículas e linhas)
 * e 'real' (metal e cobre). Se a placa de vídeo não der conta, a cena vai se
 * simplificando sozinha e, no limite, desiste e o console volta ao desenho antigo.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COR, placaFraca, circulo, brilho, texturaBrilho, materialLinha, criarSala, criarLente, ambienteEstudio, criarReatorReal } from './cena.js';

const CORES_ESTADO = { offline: '#3fb7c4', conectando: '#6aa8ff', ouvindo: '#4de8f0', falando: '#ffa24c', ferramenta: '#b794ff' };
const FORCA_ESTADO = { offline: 0.62, conectando: 0.85, ouvindo: 1, falando: 1.15, ferramenta: 1.1 };
const RAIO_REATOR = 2.56;
const INTERVALO_QUADRO = 32;   // ~30 quadros por segundo: sobra placa para o reconhecimento facial e o vidro

const C = {
  ativo: false,
  pausado: false,
  modo: 'holo',
  estado: 'offline',
  nivel: 0,
  nivelSuave: 0,
  cor: new THREE.Color(CORES_ESTADO.offline),
  corAlvo: new THREE.Color(CORES_ESTADO.offline),
  forca: 0.62,
  ponteiro: { x: 0, y: 0 },
  camera: { x: 0, y: 0 },
  tempo: 0,
  ultimo: 0,
  lentos: 0,
  degradacao: 0,
  quadro: 0,
};

// reator do visual holograma: núcleo, bobinas e carcaça em partículas, mais anéis de linha
function reatorHolografico() {
  const grupo = new THREE.Group();
  const total = 16000;
  const pos = new Float32Array(total * 3);
  const brilhoPonto = new Float32Array(total);
  const semente = new Float32Array(total);
  let n = 0;
  const add = (r, a, z, b) => {
    if (n >= total) return;
    pos.set([Math.cos(a) * r, Math.sin(a) * r, z], n * 3);
    brilhoPonto[n] = b;
    semente[n] = Math.random();
    n++;
  };
  for (let i = 0; i < 2600; i++) add(Math.pow(Math.random(), 0.7) * 0.55, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25, 1.3);
  for (let i = 0; i < 1800; i++) add(1.0 + Math.random() * 0.2, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.18, 0.9);
  for (let b = 0; b < 10; b++) {
    const centro = (b / 10) * Math.PI * 2;
    for (let i = 0; i < 780; i++) {
      const r = 1.38 + Math.random() * 0.78;
      add(r, centro + (Math.random() - 0.5) * THREE.MathUtils.degToRad(24), (Math.random() - 0.5) * 0.3, 0.55 + (r - 1.38) * 0.4);
    }
  }
  for (let i = 0; i < 2600; i++) add(2.32 + Math.random() * 0.22, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.36, 0.65);
  while (n < total) add(Math.sqrt(Math.random()) * 2.5, Math.random() * Math.PI * 2, -0.32, 0.18);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('brilhoPonto', new THREE.BufferAttribute(brilhoPonto, 1));
  geo.setAttribute('semente', new THREE.BufferAttribute(semente, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uCor: { value: new THREE.Color() }, uTempo: { value: 0 }, uNivel: { value: 0 }, uTamanho: { value: 1 }, uForca: { value: 1 } },
    vertexShader: `
      uniform float uTempo, uNivel, uTamanho;
      attribute float brilhoPonto, semente;
      varying float vB;
      void main() {
        vec3 p = position;
        // a voz empurra as partículas para fora, como uma onda saindo do núcleo
        float r = length(p.xy);
        p.xy *= 1.0 + uNivel * 0.07 * sin(r * 5.0 - uTempo * 8.0);
        p.z += uNivel * 0.25 * sin(r * 7.0 - uTempo * 9.0 + semente * 2.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.2, uTamanho * (0.7 + semente * 0.8));
        vB = brilhoPonto * (0.78 + 0.22 * sin(uTempo * 2.6 + semente * 50.0)) * (0.86 + 0.14 * sin(p.y * 24.0 - uTempo * 3.2));
      }`,
    fragmentShader: `
      uniform vec3 uCor;
      uniform float uForca;
      varying float vB;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(uCor * vB * uForca, a * a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  grupo.add(new THREE.Points(geo, material));

  const giro = new THREE.Group();
  const linhas = [];
  const anel = (raio, opacidade, destino = grupo) => {
    const c = circulo(raio, 160, COR.ciano, opacidade);
    c.rotation.x = Math.PI / 2;
    destino.add(c);
    linhas.push(c);
  };
  anel(0.62, 0.45);
  anel(1.26, 0.4);
  anel(2.24, 0.4, giro);
  anel(2.6, 0.5, giro);
  const raios = [];
  for (let b = 0; b < 10; b++) {
    const a = ((b + 0.5) / 10) * Math.PI * 2;
    raios.push(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0.15, Math.cos(a) * 2.24, Math.sin(a) * 2.24, 0.15);
  }
  const geoRaios = new THREE.BufferGeometry();
  geoRaios.setAttribute('position', new THREE.Float32BufferAttribute(raios, 3));
  const segmentos = new THREE.LineSegments(geoRaios, materialLinha(COR.ciano, 0.5));
  giro.add(segmentos);
  linhas.push(segmentos);
  grupo.add(giro);
  const vertices = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2 + Math.PI / 2);
  const triangulo = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(vertices.map((a) => new THREE.Vector3(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.12))), materialLinha(COR.branco, 0.8));
  grupo.add(triangulo);
  const aura = brilho(COR.ciano, 1);
  aura.material.opacity = 0.5;
  grupo.add(aura);

  return {
    grupo,
    animar(t, nivel, cor, forca) {
      giro.rotation.z = t * 0.3;
      const u = material.uniforms;
      u.uTempo.value = t;
      u.uNivel.value = nivel;
      u.uCor.value.copy(cor);
      u.uForca.value = forca * 0.78;
      for (const l of linhas) l.material.color.copy(cor);
      aura.material.color.copy(cor);
      aura.scale.setScalar((1.15 + Math.sin(t * 2.6) * 0.08 + nivel * 1.1) * forca);
    },
    definirTamanho(px) {
      material.uniforms.uTamanho.value = px;
    },
  };
}

function ajustar() {
  const w = innerWidth;
  const h = innerHeight;
  C.renderer.setSize(w, h, false);
  C.composer.setPixelRatio(C.renderer.getPixelRatio());
  C.composer.setSize(w, h);
  C.camera3d.aspect = w / h;
  C.camera3d.updateProjectionMatrix();

  // o reator 3D fica exatamente onde está a caixa .reator da página
  const caixa = C.alvo.getBoundingClientRect();
  const alturaMundo = 2 * Math.tan(THREE.MathUtils.degToRad(C.camera3d.fov / 2)) * C.camera3d.position.z;
  const k = alturaMundo / h;
  const lado = caixa.width || 360;
  C.base.position.set((caixa.left + caixa.width / 2 - w / 2) * k, (h / 2 - (caixa.top + caixa.height / 2)) * k, 0);
  const escala = (lado * 0.36 * k) / RAIO_REATOR;   // por dentro das barras do espectro da voz
  C.base.scale.setScalar(escala);
  const pisoY = C.base.position.y - lado * 0.56 * k;
  C.sala.piso.position.y = pisoY;
  C.sala.pisoSimples.position.y = pisoY;
  C.poca.position.set(C.base.position.x, pisoY + 0.02, C.base.position.z);
  if (C.holo) C.holo.definirTamanho(Math.max(1.4, 2.3 * C.renderer.getPixelRatio() * (lado / 400)));
}

function aplicarModo() {
  const real = C.modo === 'real';
  if (real && !C.real) {
    C.real = criarReatorReal();
    C.base.add(C.real.grupo);
  }
  if (C.holo) C.holo.grupo.visible = !real;
  if (C.real) C.real.grupo.visible = real;
  C.luzes.visible = real;
  C.renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  C.renderer.toneMappingExposure = 0.92;
  C.cena.environmentIntensity = real ? 0.34 : 0.7;
  C.bloom.strength = real ? 0.2 : 0.8;
  C.bloom.threshold = real ? 1 : 0.25;
}

function quadro(agora) {
  if (!C.ativo) return;
  C.quadro = requestAnimationFrame(quadro);
  if (C.pausado) return;
  const passou = agora - C.ultimo;
  if (passou < INTERVALO_QUADRO) return;
  C.ultimo = agora;
  const delta = Math.min(passou / 1000, 0.25);
  C.tempo += delta;
  const t = C.tempo;

  // só conta como lento com a aba visível e sem pausa longa
  if (passou < 500) {
    // desistir de vez exige lentidão bem maior do que tirar o reflexo
    const limite = C.degradacao === 0 ? 75 : 130;
    C.lentos = passou > limite ? C.lentos + 1 : Math.max(0, C.lentos - 1);
    if (C.lentos > (C.degradacao === 0 ? 40 : 120)) {
      C.lentos = 0;
      degradar();
      if (!C.ativo) return;
    }
  }

  C.nivelSuave += (C.nivel - C.nivelSuave) * 0.25;
  C.cor.lerp(C.corAlvo, 0.07);
  C.forca += ((FORCA_ESTADO[C.estado] ?? 1) - C.forca) * 0.06;

  C.camera.x += (C.ponteiro.x - C.camera.x) * 0.03;
  C.camera.y += (C.ponteiro.y - C.camera.y) * 0.03;
  C.camera3d.position.x = C.camera.x * 0.7 + Math.sin(t * 0.21) * 0.05;
  C.camera3d.position.y = -C.camera.y * 0.35 + Math.sin(t * 0.29) * 0.03;
  C.camera3d.lookAt(0, 0, 0);

  const holoAtivo = C.modo === 'holo';
  // o reator acompanha o olhar: inclina um pouco na direção do ponteiro
  C.base.rotation.y = C.camera.x * 0.22 + Math.sin(t * 0.33) * 0.05;
  C.base.rotation.x = C.camera.y * 0.14 + Math.sin(t * 0.27) * 0.03;
  if (holoAtivo) {
    C.holo.animar(t, C.nivelSuave, C.cor, C.forca);
  } else {
    C.real.definirCor(C.cor);
    C.real.animar(t, C.nivelSuave * C.forca);
  }
  C.poca.material.color.copy(C.cor);
  C.poca.material.opacity = 0.13 * C.forca + C.nivelSuave * 0.12;
  C.sala.animar(delta);
  C.lente.uniforms.uTempo.value = t % 10;

  if (C.degradacao >= 1) C.renderer.render(C.cena, C.camera3d);
  else C.composer.render();
}

// a cena pesou: primeiro tira o reflexo e o pós-processamento, depois desiste
function degradar() {
  C.degradacao += 1;
  C.aoDegradar?.(C.degradacao);
  if (C.degradacao === 1) {
    C.renderer.setPixelRatio(0.8);
    C.sala.usarReflexo(false);
    ajustar();
  } else {
    parar();
  }
}

export function parar() {
  C.ativo = false;
  cancelAnimationFrame(C.quadro);
  removeEventListener('resize', C.aoRedimensionar);
  C.renderer?.dispose();
  C.aoDesistir?.();
}

export function iniciar({ canvas, alvo, visual = 'holo', aoDegradar = null, aoDesistir = null }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  if (placaFraca(renderer)) {
    renderer.dispose();
    return false;
  }
  Object.assign(C, { renderer, alvo, aoDegradar, aoDesistir, modo: visual === 'real' ? 'real' : 'holo' });
  renderer.setPixelRatio(1);
  renderer.setClearColor('#01040a');
  const cena = new THREE.Scene();
  cena.fog = new THREE.FogExp2('#02060a', 0.0075);
  const camera3d = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
  camera3d.position.set(0, 0, 26);
  camera3d.layers.enable(1);
  const alvoRender = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2 });
  const composer = new EffectComposer(renderer, alvoRender);
  composer.addPass(new RenderPass(cena, camera3d));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.25);
  composer.addPass(bloom);
  const lente = criarLente({ aberracao: 0.012, grao: 0.014, vinheta: 0.5 });
  composer.addPass(lente);
  composer.addPass(new OutputPass());
  ambienteEstudio(renderer, cena, 0.7);
  Object.assign(C, { cena, camera3d, composer, bloom, lente });

  C.sala = criarSala({ raio: 44, alturaSala: 22, resolucao: 512, repetir: 5, y: -4, tamanhoPoeira: 0.07 });
  cena.add(C.sala.grupo);
  C.base = new THREE.Group();
  cena.add(C.base);
  C.holo = reatorHolografico();
  C.base.add(C.holo.grupo);

  const plano = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.MeshBasicMaterial({
    map: texturaBrilho(), color: COR.ciano, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  plano.rotation.x = -Math.PI / 2;
  C.poca = plano;
  cena.add(plano);

  C.luzes = new THREE.Group();
  const sol = new THREE.DirectionalLight('#fff4e6', 0.8);
  sol.position.set(-6, 8, 12);
  C.luzes.add(sol, new THREE.HemisphereLight('#a9c8ff', '#0a0f14', 0.18));
  cena.add(C.luzes);

  aplicarModo();
  C.aoRedimensionar = ajustar;
  addEventListener('resize', ajustar);
  addEventListener('pointermove', (e) => {
    C.ponteiro.x = (e.clientX / innerWidth - 0.5) * 2;
    C.ponteiro.y = (e.clientY / innerHeight - 0.5) * 2;
  });
  ajustar();
  C.ativo = true;
  C.quadro = requestAnimationFrame(quadro);
  return true;
}

export function definirEstado(estado) {
  C.estado = estado;
  C.corAlvo.set(CORES_ESTADO[estado] || CORES_ESTADO.offline);
}

export function definirNivel(nivel) {
  C.nivel = nivel;
}

export function definirModo(modo) {
  C.modo = modo === 'real' ? 'real' : 'holo';
  if (C.ativo) aplicarModo();
}

export function pausar(sim) {
  C.pausado = !!sim;
  if (!sim) C.ultimo = 0;
}

// a caixa do reator pode mudar de lugar depois que a página termina de carregar
export function reposicionar() {
  if (C.ativo) ajustar();
}
