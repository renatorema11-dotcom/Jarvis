/**
 * holo-janela.js — a "janela 3D" do laboratório.
 *
 * O FaceLandmarker (MediaPipe) acha os olhos do Renato na webcam e a câmera da cena vira uma
 * janela de verdade: o olho virtual fica onde o olho dele está, e a projeção é fora do eixo
 * (método de Kooima, pelo frameCorners do three). Mexendo a cabeça, a perspectiva muda como
 * se a projeção estivesse atrás do vidro da tela, como na demonstração do Johnny Lee com o Wii.
 *
 * A distância vem do tamanho da íris (11,7 mm em quase todo mundo). A calibração guarda o
 * tamanho da íris e a posição dos olhos na posição normal; o tamanho da tela entra em
 * polegadas. Sem câmera, o mouse faz o papel da cabeça.
 */
import * as THREE from 'three';
import { frameCorners } from 'three/addons/utils/CameraUtils.js';
import { UmEuro } from './holo-maos.js';

const MODELO_ROSTO = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const IRIS_CM = 1.17;
// distância focal padrão em frações da largura do vídeo (webcam com uns 64° na horizontal)
export const FOCO_PADRAO = 0.5 / Math.tan(THREE.MathUtils.degToRad(32));
const CHAVE = 'jarvis.janela';
const ALTURA_JANELA = 0.3;      // centro do vidro na cena (a projeção fica em y = 0,35)
const DURACAO_MISTURA = 0.8;    // segundos para entrar e sair da janela sem pulo

/**
 * Posição do olho (o ponto entre as duas íris) em centímetros, em relação à câmera:
 * x para a direita da pessoa, y para cima, z para longe da tela. Devolve null sem íris.
 * pontos: os 478 pontos do FaceLandmarker, normalizados de 0 a 1 na imagem.
 */
export function olhoDoRosto(pontos, largura, altura, foco = FOCO_PADRAO) {
  if (!pontos || pontos.length < 478 || !largura || !altura) return null;
  const diametro = (a, b) => Math.hypot((pontos[a].x - pontos[b].x) * largura, (pontos[a].y - pontos[b].y) * altura);
  // média das larguras horizontal e vertical de cada íris; a maior das duas sofre menos com o rosto virado
  const irisA = (diametro(469, 471) + diametro(470, 472)) / 2;
  const irisB = (diametro(474, 476) + diametro(475, 477)) / 2;
  const iris = Math.max(irisA, irisB) / largura;
  if (!(iris > 0.002)) return null;
  const ex = (pontos[468].x + pontos[473].x) / 2;
  const ey = (pontos[468].y + pontos[473].y) / 2;
  const z = (foco * IRIS_CM) / iris;
  // a imagem da webcam não vem espelhada: a pessoa indo para a direita dela anda para a esquerda na imagem
  return { x: ((0.5 - ex) * z) / foco, y: (-(ey - 0.5) * (altura / largura) * z) / foco, z, iris, ex, ey };
}

const mediana = (lista) => {
  const v = [...lista].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};

function lerConfig() {
  const padrao = { polegadas: 15.6, distancia: 55, iris0: 0, ex0: 0.5, ey0: 0.5 };
  try {
    return { ...padrao, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') };
  } catch {
    return padrao;
  }
}

const CSS = `
.holo[data-janela="1"] .holo-dir .holo-caixa:has([data-h="dados"]){ display:none; }
.holo-janela .hj-topo{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
.holo-janela .hj-topo h2{ margin:0; }
.holo-janela .hj-abrir{ padding:4px 8px; font-size:9.5px; letter-spacing:1.5px; }
.holo-janela .hj-estado{ margin:8px 0 7px; font-family:'Share Tech Mono',monospace; font-size:10.5px; letter-spacing:1.5px; color:#8ff3f7; min-height:14px; }
.holo-janela .hj-mapa{ position:relative; height:40px; border:1px solid rgba(77,232,240,0.18); border-radius:3px;
  background:linear-gradient(rgba(77,232,240,0.08) 1px, transparent 1px) 0 0/100% 25%, linear-gradient(90deg, rgba(77,232,240,0.08) 1px, transparent 1px) 0 0/12.5% 100%; }
.holo-janela .hj-mapa i{ position:absolute; left:50%; top:50%; width:10px; height:10px; margin:-5px 0 0 -5px; border-radius:50%; background:#4de8f0;
  box-shadow:0 0 12px #4de8f0; transition:opacity .3s; }
.holo-janela .hj-mapa i.longe{ opacity:0.25; }
.holo-janela .hj-campos{ display:flex; gap:8px; margin-top:9px; }
.holo-janela label{ flex:1; display:flex; align-items:center; gap:6px; font-family:'Share Tech Mono',monospace; font-size:9.5px; letter-spacing:1px; color:#a9c6cd; }
.holo-janela input{ width:100%; min-width:0; padding:4px 5px; font:inherit; color:#e9f7f9; background:rgba(2,10,16,0.8); border:1px solid rgba(77,232,240,0.25); border-radius:3px; text-align:right; }
`;

/**
 * Cria a janela. carregarVisao() devolve { modulo, arquivos } do tasks-vision (o mesmo das mãos).
 * container: onde o painel de ajuste aparece (a coluna da direita do laboratório).
 */
export function criarJanela({ container, som = null, carregarVisao, aoEvento = null }) {
  const cfg = lerConfig();
  const J = {
    ligada: false,
    mistura: 0,
    restaurar: false,
    detector: null,
    carregando: false,
    falhou: false,
    vistoEm: -1e9,
    rostoDesde: 0,
    calibrar: false,
    calibrando: null,
    olho: { x: 0, y: 0, z: cfg.distancia },
    fonte: 'nenhuma',
    msRosto: 0,
    quadrosRosto: 0,
    fpsRosto: 0,
    contagemDesde: 0,
    distanciaOlho: 0,
    filtros: { x: new UmEuro(1.1, 0.12), y: new UmEuro(1.1, 0.12), z: new UmEuro(0.6, 0.05) },
  };

  // ---------- painel de ajuste ----------
  if (!document.getElementById('holo-janela-estilo')) {
    const estilo = document.createElement('style');
    estilo.id = 'holo-janela-estilo';
    estilo.textContent = CSS;
    document.head.append(estilo);
  }
  const painel = document.createElement('section');
  painel.className = 'holo-caixa holo-janela';
  painel.hidden = true;
  painel.title = 'Sente na posição de sempre e toque em CALIBRAR. Depois mexa a cabeça: a projeção fica atrás do vidro da tela.';
  painel.innerHTML = `
    <div class="hj-topo"><h2>JANELA 3D</h2><button class="holo-btn hj-abrir" type="button" data-mira data-acao="ajustes" aria-expanded="true">AJUSTES ▴</button></div>
    <p class="hj-estado" aria-live="polite"></p>
    <div class="hj-mapa" title="Onde estão os seus olhos em relação à tela (o ponto cresce quando você chega perto)"><i></i></div>
    <div class="hj-ajustes">
      <div class="hj-campos">
        <label title="Tamanho da tela em polegadas (na diagonal)">TELA <input type="number" data-campo="polegadas" min="10" max="40" step="0.1" aria-label="Tela em polegadas"> POL</label>
        <label title="Distância normal dos seus olhos até a tela">DIST. <input type="number" data-campo="distancia" min="25" max="150" step="1" aria-label="Distância até a tela em centímetros"> CM</label>
      </div>
      <div class="holo-acoes" style="margin-top:8px">
        <button class="holo-btn" type="button" data-mira data-acao="calibrar">CALIBRAR</button>
        <button class="holo-btn" type="button" data-mira data-acao="desligar">DESLIGAR</button>
      </div>
    </div>`;
  container?.prepend(painel);
  const raizLab = container?.closest('.holo');
  const elAjustes = painel.querySelector('.hj-ajustes');
  const elAbrir = painel.querySelector('[data-acao="ajustes"]');
  let recolherEm = 0;
  function mostrarAjustes(sim) {
    elAjustes.hidden = !sim;
    elAbrir.textContent = sim ? 'AJUSTES ▴' : 'AJUSTES ▾';
    elAbrir.setAttribute('aria-expanded', String(sim));
    recolherEm = 0;
  }
  const elEstado = painel.querySelector('.hj-estado');
  const elPonto = painel.querySelector('.hj-mapa i');
  for (const campo of painel.querySelectorAll('input')) {
    campo.value = cfg[campo.dataset.campo];
    campo.addEventListener('change', () => {
      const v = Number(String(campo.value).replace(',', '.'));
      const [min, max] = [Number(campo.min), Number(campo.max)];
      if (!Number.isFinite(v)) return;
      cfg[campo.dataset.campo] = THREE.MathUtils.clamp(v, min, max);
      campo.value = cfg[campo.dataset.campo];
      salvar();
    });
  }
  painel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    som?.clique();
    if (b.dataset.acao === 'calibrar') calibrar();
    if (b.dataset.acao === 'desligar') ligar(false);
    if (b.dataset.acao === 'ajustes') mostrarAjustes(elAjustes.hidden);
  });

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch {}
  }

  // foco da webcam: sai da calibração (íris medida a uma distância conhecida) ou do padrão
  const foco = () => (cfg.iris0 > 0 ? (cfg.iris0 * cfg.distancia) / IRIS_CM : FOCO_PADRAO);

  // ---------- rosto ----------
  async function iniciarRosto() {
    if (J.detector || J.carregando || J.falhou) return;
    J.carregando = true;
    try {
      const { modulo, arquivos } = await carregarVisao();
      const opcoes = (delegate) => ({
        baseOptions: { modelAssetPath: MODELO_ROSTO, delegate },
        runningMode: 'VIDEO', numFaces: 1,
        minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
      });
      try {
        J.detector = await modulo.FaceLandmarker.createFromOptions(arquivos, opcoes('GPU'));
      } catch {
        J.detector = await modulo.FaceLandmarker.createFromOptions(arquivos, opcoes('CPU'));
      }
    } catch (erro) {
      console.warn('Janela 3D:', erro);
      J.falhou = true;
    } finally {
      J.carregando = false;
    }
  }

  function calibrar() {
    if (!J.detector) {
      J.calibrar = true;   // calibra assim que o rosto aparecer
      return 'Vou calibrar assim que eu achar o seu rosto.';
    }
    J.calibrando = { ate: performance.now() + 1500, amostras: [] };
    J.calibrar = false;
    return 'Calibrando: fique na posição normal, olhando para a tela.';
  }

  function terminarCalibracao() {
    const a = J.calibrando.amostras;
    J.calibrando = null;
    recolherEm = performance.now() + 2500;   // calibrou: os ajustes recolhem sozinhos daqui a pouco
    if (a.length < 8) {
      J.calibrar = true;
      return;
    }
    cfg.iris0 = mediana(a.map((s) => s.iris));
    cfg.ex0 = mediana(a.map((s) => s.ex));
    cfg.ey0 = mediana(a.map((s) => s.ey));
    salvar();
    for (const f of Object.values(J.filtros)) f.x = null;
    som?.clique();
    aoEvento?.('calibrou a janela 3D');
  }

  // um quadro de vídeo novo: acha os olhos e atualiza a posição filtrada (em cm, relativa à posição normal)
  function processar(video, agora) {
    if (!J.detector || !video?.videoWidth) return;
    const inicio = performance.now();
    let resultado;
    try {
      resultado = J.detector.detectForVideo(video, agora);
    } catch {
      return;
    }
    J.msRosto = J.msRosto * 0.9 + (performance.now() - inicio) * 0.1;
    const pts = resultado?.faceLandmarks?.[0];
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const medido = pts ? olhoDoRosto(pts, vw, vh, foco()) : null;
    if (!medido) return;
    const real = performance.now();
    if (real - J.vistoEm > 600) J.rostoDesde = real;
    J.vistoEm = real;
    J.quadrosRosto += 1;
    if (J.calibrando) {
      J.calibrando.amostras.push(medido);
      if (real > J.calibrando.ate) terminarCalibracao();
    } else if (J.calibrar && real - J.rostoDesde > 500) {
      calibrar();
    }
    // a posição normal (da calibração) vira o centro da tela
    const f = foco();
    const zNormal = cfg.distancia;
    const x0 = ((0.5 - cfg.ex0) * zNormal) / f;
    const y0 = (-(cfg.ey0 - 0.5) * (vh / vw) * zNormal) / f;
    const x = J.filtros.x.filtrar(medido.x - x0, agora);
    const y = J.filtros.y.filtrar(medido.y - y0, agora);
    const z = J.filtros.z.filtrar(medido.z, agora);
    // um pouco de previsão compensa o atraso da webcam (uns 50 ms)
    const prever = (filtro, v, limite) => v + THREE.MathUtils.clamp(filtro.dx * 0.05, -limite, limite);
    J.olho.x = prever(J.filtros.x, x, 3);
    J.olho.y = prever(J.filtros.y, y, 3);
    J.olho.z = THREE.MathUtils.clamp(z, 20, 160);
  }

  // ---------- câmera ----------
  const v = {
    eN: new THREE.Vector3(), cN: new THREE.Vector3(), dir: new THREE.Vector3(), dirX: new THREE.Vector3(), dirY: new THREE.Vector3(),
    bl: new THREE.Vector3(), br: new THREE.Vector3(), tl: new THREE.Vector3(),
    blJ: new THREE.Vector3(), brJ: new THREE.Vector3(), tlJ: new THREE.Vector3(), eJ: new THREE.Vector3(),
  };

  /**
   * Chamado depois que o laboratório posicionou a câmera normal (posição e lookAt). Mistura a câmera
   * normal com a janela e devolve a mistura (0 = câmera normal, 1 = janela inteira).
   */
  function aplicar(camera, { modoLab, intro, camZ, alvo, ponteiro, temCamera, dt, largura, altura }) {
    const queremos = J.ligada && modoLab === 'projecoes' && intro >= 1;
    const passo = dt / DURACAO_MISTURA;
    J.mistura = THREE.MathUtils.clamp(J.mistura + (queremos ? passo : -passo), 0, 1);
    if (J.mistura <= 0) {
      if (J.restaurar) {
        camera.updateProjectionMatrix();
        J.restaurar = false;
      }
      J.distanciaOlho = 0;
      return 0;
    }
    J.restaurar = true;
    const agora = performance.now();

    // de onde vem a cabeça: o rosto, o mouse (sem câmera) ou a posição normal enquanto procura
    const comRosto = agora - J.vistoEm < 600;
    if (comRosto) J.fonte = 'rosto';
    else if (!temCamera || J.falhou) J.fonte = 'mouse';
    else J.fonte = 'procurando';
    const olho = { x: 0, y: 0, z: cfg.distancia };
    if (J.fonte === 'rosto') Object.assign(olho, J.olho);
    else if (J.fonte === 'mouse') Object.assign(olho, { x: ponteiro.x * 14, y: -ponteiro.y * 8, z: cfg.distancia });
    // mouse e rosto perdido: a cabeça virtual desliza até o ponto (pelo tempo, não pelo número de quadros)
    const suave = comRosto ? 1 : 1 - Math.exp(-dt * (J.fonte === 'mouse' ? 6 : 2.5));
    J.olho.x += (olho.x - J.olho.x) * suave;
    J.olho.y += (olho.y - J.olho.y) * suave;
    J.olho.z += (olho.z - J.olho.z) * suave;

    // geometria do vidro: a tela de verdade, em cm, vira um retângulo na cena
    const pxPorCm = Math.hypot(screen.width || largura, screen.height || altura) / (cfg.polegadas * 2.54);
    const larguraCm = largura / pxPorCm;
    const alturaCm = altura / pxPorCm;
    const d0 = cfg.distancia;
    // na posição normal, a janela mostra a mesma altura de cena que a câmera normal mostra no centro
    const alturaCena = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camZ;
    const olhoAteCentro = (alturaCena * d0) / alturaCm;
    // o vidro fica um pouco na frente da projeção: ela inteira aparece "dentro" da tela
    const zVidro = Math.min(8, olhoAteCentro * 0.32);
    const k = (olhoAteCentro - zVidro) / d0;    // unidades da cena por centímetro
    const W = larguraCm * k;
    const H = alturaCm * k;
    v.blJ.set(-W / 2, ALTURA_JANELA - H / 2, zVidro);
    v.brJ.set(W / 2, ALTURA_JANELA - H / 2, zVidro);
    v.tlJ.set(-W / 2, ALTURA_JANELA + H / 2, zVidro);
    v.eJ.set(J.olho.x * k, ALTURA_JANELA + J.olho.y * k, zVidro + J.olho.z * k);

    // o retângulo que a câmera normal enxerga na altura do alvo: com ele a troca é suave
    v.eN.copy(camera.position);
    const dist = v.eN.distanceTo(alvo);
    camera.getWorldDirection(v.dir);
    v.cN.copy(v.eN).addScaledVector(v.dir, dist);
    v.dirX.set(1, 0, 0).applyQuaternion(camera.quaternion);
    v.dirY.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const meiaAltura = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    const meiaLargura = meiaAltura * camera.aspect;
    v.bl.copy(v.cN).addScaledVector(v.dirX, -meiaLargura).addScaledVector(v.dirY, -meiaAltura);
    v.br.copy(v.cN).addScaledVector(v.dirX, meiaLargura).addScaledVector(v.dirY, -meiaAltura);
    v.tl.copy(v.cN).addScaledVector(v.dirX, -meiaLargura).addScaledVector(v.dirY, meiaAltura);

    const s = THREE.MathUtils.smootherstep(J.mistura, 0, 1);
    camera.position.lerpVectors(v.eN, v.eJ, s);
    v.bl.lerp(v.blJ, s);
    v.br.lerp(v.brJ, s);
    v.tl.lerp(v.tlJ, s);
    frameCorners(camera, v.bl, v.br, v.tl, false);
    camera.updateMatrixWorld(true);
    J.distanciaOlho = camera.position.distanceTo(alvo);
    atualizarPainel(agora);
    return J.mistura;
  }

  let painelEm = 0;
  function atualizarPainel(agora) {
    if (painel.hidden || agora - painelEm < 200) return;
    painelEm = agora;
    if (recolherEm && agora > recolherEm) mostrarAjustes(false);
    if (agora - J.contagemDesde > 1000) {
      J.fpsRosto = Math.round((J.quadrosRosto * 1000) / Math.max(1, agora - J.contagemDesde));
      J.quadrosRosto = 0;
      J.contagemDesde = agora;
    }
    const texto = estado();
    if (elEstado.textContent !== texto) elEstado.textContent = texto;
    const longe = J.fonte !== 'rosto' && J.fonte !== 'mouse';
    elPonto.classList.toggle('longe', longe);
    const px = THREE.MathUtils.clamp(J.olho.x / 30, -0.5, 0.5);
    const py = THREE.MathUtils.clamp(-J.olho.y / 20, -0.5, 0.5);
    elPonto.style.left = `${50 + px * 100}%`;
    elPonto.style.top = `${50 + py * 100}%`;
    const escala = THREE.MathUtils.clamp(cfg.distancia / Math.max(20, J.olho.z), 0.5, 2);
    elPonto.style.transform = `scale(${escala.toFixed(2)})`;
  }

  // ---------- API ----------
  function estado() {
    if (!J.ligada) return 'DESLIGADA';
    if (J.fonte === 'mouse') return J.falhou ? 'SEM RASTREIO DO ROSTO · USANDO O MOUSE' : 'SEM CÂMERA · USANDO O MOUSE';
    if (J.calibrando) return 'CALIBRANDO · FIQUE PARADO';
    if (J.carregando) return 'CARREGANDO RASTREIO DO ROSTO…';
    if (J.fonte === 'rosto') return `ROSTO A ${Math.round(J.olho.z)} CM · ${J.fpsRosto} FPS`;
    return 'PROCURANDO O SEU ROSTO';
  }

  function ligar(sim = true) {
    J.ligada = !!sim;
    painel.hidden = !J.ligada;
    if (raizLab) raizLab.dataset.janela = J.ligada ? '1' : '';
    mostrarAjustes(true);
    J.contagemDesde = performance.now();
    J.quadrosRosto = 0;
    if (J.ligada) {
      J.calibrar = true;   // a posição de agora vira o centro da tela
      for (const f of Object.values(J.filtros)) f.x = null;
      iniciarRosto();
      aoEvento?.('ligou a janela 3D');
      return 'Janela 3D ligada. Fique na posição normal um instante para eu calibrar; depois mexa a cabeça.';
    }
    J.calibrando = null;
    aoEvento?.('desligou a janela 3D');
    return 'Janela 3D desligada.';
  }

  return {
    ligar,
    calibrar,
    estado,
    ligada: () => J.ligada,
    mistura: () => J.mistura,
    distanciaOlho: () => J.distanciaOlho,
    // o rosto roda quando a janela está ligada no modo projeções (ou chegando nele)
    querRosto: (modoLab) => J.ligada && modoLab === 'projecoes' && !!J.detector,
    custo: () => J.msRosto,
    processar,
    aplicar,
  };
}
