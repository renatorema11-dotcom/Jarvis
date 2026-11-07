/*
 * holo-real.js — as versões "foto real" das projeções do laboratório (holo.js).
 * Cada criador devolve { grupo, ambiente, pronto, animar(t, contexto) }:
 *   ambiente "espaco" esconde a sala; "sala" deixa o objeto em cima da mesa.
 * Nada aqui é criado antes de a pessoa ligar o modo foto real. As formas das projeções novas
 * (Lua, Sistema Solar, Molécula, Coração, Terreno...) vêm de holo-formas.js, para as duas versões baterem.
 */
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { COR, brilho, texturaBrilho, criarReatorReal } from './cena.js';
import { PLANETAS, TERRENO, alturaTerreno, moleculaCafeina, RAIO_ATOMO, campoCoracao, vasosCoracao, batimento, perfilNacele, DRONE, solDaFase } from './holo-formas.js';

const TEXTURAS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/planets/';

function carregar(nomes) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const texturas = {};
  const pronto = Promise.all(Object.entries(nomes).map(([chave, [arquivo, cor]]) => new Promise((ok, nao) => {
    texturas[chave] = loader.load(TEXTURAS + arquivo, (t) => {
      if (cor) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      ok(t);
    }, undefined, () => nao(new Error(`textura ${arquivo}`)));
  })));
  return { texturas, pronto };
}

// ---------------- Terra: mapa de verdade, com dia e noite conforme o sol de agora ----------------
function realTerra({ giro, sol }) {
  const R = 2;
  const grupo = new THREE.Group();
  const { texturas, pronto } = carregar({
    dia: ['earth_atmos_2048.jpg', true], normal: ['earth_normal_2048.jpg', false], espec: ['earth_specular_2048.jpg', false],
    nuvens: ['earth_clouds_1024.png', false], noite: ['earth_lights_2048.png', true], lua: ['moon_1024.jpg', true],
  });
  texturas.nuvens.wrapS = THREE.RepeatWrapping;
  const uniforms = {
    uDia: { value: texturas.dia }, uNoite: { value: texturas.noite }, uNormal: { value: texturas.normal }, uEspec: { value: texturas.espec }, uNuvens: { value: texturas.nuvens },
    uSol: { value: new THREE.Vector3(1, 0, 0) }, uCam: { value: new THREE.Vector3(0, 0, 10) }, uTempo: { value: 0 },
  };
  const planeta = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D uDia, uNoite, uNormal, uEspec, uNuvens;
      uniform vec3 uSol, uCam;
      uniform float uTempo;
      varying vec2 vUv;
      varying vec3 vP;
      void main() {
        vec3 N0 = normalize(vP);
        vec3 V = normalize(uCam - vP);
        // relevo a partir do mapa de normais
        vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N0));
        vec3 B = cross(N0, T);
        vec3 n = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
        vec3 N = normalize(T * n.x * 0.55 + B * n.y * 0.55 + N0 * n.z);
        float luz = dot(N, uSol);
        float luzEsfera = dot(N0, uSol);
        float dia = smoothstep(-0.12, 0.22, luzEsfera);
        vec3 chao = texture2D(uDia, vUv).rgb;
        vec3 cor = chao * (0.012 + max(luz, 0.0) * 1.7);
        // oceano espelha o sol
        float agua = texture2D(uEspec, vUv).r;
        vec3 H = normalize(uSol + V);
        cor += vec3(1.0, 0.95, 0.85) * pow(max(dot(N0, H), 0.0), 160.0) * agua * 0.55 * dia;
        // luzes das cidades no lado da noite
        cor += texture2D(uNoite, vUv).rgb * vec3(1.6, 1.25, 0.8) * (1.0 - dia);
        // nuvens andando, com sombra no chão
        vec2 uvNuvem = vUv + vec2(uTempo * 0.0016, 0.0);
        vec4 tn = texture2D(uNuvens, uvNuvem);
        float nuvem = tn.a * tn.r;
        vec4 ts = texture2D(uNuvens, uvNuvem + uSol.xz * 0.004);
        float sombra = ts.a * ts.r;
        cor *= 1.0 - sombra * 0.4 * dia;
        cor = mix(cor, vec3(0.96) * (0.012 + max(luzEsfera, 0.0) * 1.2), nuvem * 0.88);
        // borda azul da atmosfera, só do lado iluminado
        float borda = pow(max(1.0 - max(dot(N0, V), 0.0), 0.0), 3.2);
        cor += vec3(0.25, 0.52, 1.0) * borda * smoothstep(-0.3, 0.35, luzEsfera) * 1.15;
        gl_FragColor = vec4(cor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  // a textura da esfera começa com a longitude 0 em +x; giramos para coincidir com as projeções
  planeta.rotation.y = giro - Math.PI / 2;
  grupo.add(planeta);

  // halo fino da atmosfera, para fora do planeta
  const haloU = { uSol: { value: new THREE.Vector3(1, 0, 0) }, uCam: { value: new THREE.Vector3(0, 0, 10) } };
  const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 96, 64), new THREE.ShaderMaterial({
    uniforms: haloU,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 uSol, uCam;
      varying vec3 vP;
      void main() {
        vec3 N = normalize(vP);
        vec3 V = normalize(uCam - vP);
        float a = pow(clamp(-dot(V, N) / 0.31, 0.0, 1.0), 2.4);
        float lado = smoothstep(-0.35, 0.3, dot(N, uSol));
        vec3 cor = vec3(0.3, 0.6, 1.0) * a * lado * 1.15;
        gl_FragColor = vec4(cor, a * lado);
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  }));
  grupo.add(halo);

  const lua = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 32), new THREE.MeshStandardMaterial({ map: texturas.lua, roughness: 1, metalness: 0, envMapIntensity: 0 }));
  grupo.add(lua);

  const v = new THREE.Vector3();
  return {
    grupo, ambiente: 'espaco', pronto,
    animar(t, { camera, projecao, luzSol }) {
      const s = sol();      // direção do sol no espaço da projeção
      uniforms.uTempo.value = t;
      uniforms.uSol.value.copy(s).applyAxisAngle(new THREE.Vector3(0, 1, 0), -planeta.rotation.y);
      uniforms.uCam.value.copy(planeta.worldToLocal(v.copy(camera.position)));
      haloU.uSol.value.copy(s);
      haloU.uCam.value.copy(halo.worldToLocal(v.copy(camera.position)));
      const a = t * 0.03 + 1.1;
      lua.position.set(Math.cos(a) * 5.2, 0.6, Math.sin(a) * 5.2);
      lua.rotation.y = -a;
      if (luzSol) luzSol.position.copy(projecao.localToWorld(v.copy(s).multiplyScalar(40)));
    },
  };
}

// ---------------- Saturno: faixas geradas por código e anéis com sombra de verdade ----------------
function texturaFaixas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const paleta = ['#6b5a42', '#a88e63', '#d7bf8d', '#efe2c0', '#cfb27c', '#e8d6a8', '#b99c68', '#ddc897', '#f1e6c8', '#c3a570', '#dcc592', '#a98c5e', '#7a6547'];
  const passo = 512 / (paleta.length - 1);
  for (let y = 0; y < 512; y++) {
    const i = Math.min(paleta.length - 2, Math.floor(y / passo));
    const a = new THREE.Color(paleta[i]);
    const b = new THREE.Color(paleta[i + 1]);
    const mistura = a.lerp(b, y / passo - i);
    const onda = 1 + Math.sin(y * 0.42) * 0.035 + Math.sin(y * 1.3) * 0.02 + (Math.random() - 0.5) * 0.035;
    g.fillStyle = `rgb(${mistura.r * 255 * onda},${mistura.g * 255 * onda},${mistura.b * 255 * onda})`;
    g.fillRect(0, y, 1024, 1);
  }
  // redemoinhos discretos ao longo das faixas
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,245,220' : '70,55,35'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 1024, Math.random() * 512, 30 + Math.random() * 160, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function texturaAneis() {
  const n = 1024;
  const dados = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = i / n;
    let densidade;
    if (x < 0.22) densidade = 0.12 + x * 0.7;                       // anel C, fraco
    else if (x < 0.585) densidade = 0.72 + Math.sin(x * 190) * 0.12 + Math.sin(x * 61) * 0.1;  // anel B, denso
    else if (x < 0.65) densidade = 0.035;                           // divisão de Cassini
    else if (x < 0.965) densidade = 0.52 + Math.sin(x * 140) * 0.08; // anel A
    else densidade = 0;
    if (x > 0.905 && x < 0.915) densidade = 0.04;                   // divisão de Encke
    densidade = Math.max(0, Math.min(1, densidade + (Math.random() - 0.5) * 0.09));
    const claro = 0.72 + x * 0.25;
    dados.set([255 * claro, 235 * claro, 205 * claro, 255 * densidade], i * 4);
  }
  const t = new THREE.DataTexture(dados, n, 1, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function realSaturno() {
  const R = 1.5;
  const R1 = 2.0;
  const R2 = 3.76;
  const grupo = new THREE.Group();
  grupo.rotation.set(0.47, 0, 0.12);
  const aneisTex = texturaAneis();
  const achatado = 0.9;
  const uP = { uMapa: { value: texturaFaixas() }, uAneis: { value: aneisTex }, uSol: { value: new THREE.Vector3(1, 0, 0) }, uCam: { value: new THREE.Vector3() }, uR1: { value: R1 }, uR2: { value: R2 } };
  const planeta = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.ShaderMaterial({
    uniforms: uP,
    vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D uMapa, uAneis;
      uniform vec3 uSol, uCam;
      uniform float uR1, uR2;
      varying vec2 vUv;
      varying vec3 vP;
      void main() {
        vec3 N = normalize(vP);
        vec3 V = normalize(uCam - vP);
        float luz = max(dot(N, uSol), 0.0);
        float sombra = 1.0;
        // o anel projeta sombra no planeta
        if (abs(uSol.y) > 0.001) {
          float s = -vP.y / uSol.y;
          if (s > 0.0) {
            vec3 q = vP + uSol * s;
            float r = (length(q.xz) - uR1) / (uR2 - uR1);
            if (r > 0.0 && r < 1.0) sombra = 1.0 - texture2D(uAneis, vec2(r, 0.5)).a * 0.85;
          }
        }
        float borda = pow(max(dot(N, V), 0.0), 0.42);
        vec3 cor = texture2D(uMapa, vUv).rgb * (0.006 + luz * 1.65 * sombra) * borda;
        gl_FragColor = vec4(cor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  planeta.scale.y = achatado;
  grupo.add(planeta);

  const uA = { uAneis: { value: aneisTex }, uSol: { value: new THREE.Vector3(1, 0, 0) }, uR1: { value: R1 }, uR2: { value: R2 }, uRp: { value: R } };
  const aneis = new THREE.Mesh(new THREE.RingGeometry(R1, R2, 256, 1), new THREE.ShaderMaterial({
    uniforms: uA,
    vertexShader: 'varying vec3 vP; void main(){ vP = vec3(position.x, 0.0, position.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D uAneis;
      uniform vec3 uSol;
      uniform float uR1, uR2, uRp;
      varying vec3 vP;
      void main() {
        float r = (length(vP) - uR1) / (uR2 - uR1);
        vec4 t = texture2D(uAneis, vec2(r, 0.5));
        // a sombra do planeta cai sobre os anéis
        float atras = dot(vP, uSol);
        float afastado = length(cross(vP, uSol));
        float sombra = atras < 0.0 ? smoothstep(uRp * 0.94, uRp * 1.02, afastado) : 1.0;
        gl_FragColor = vec4(t.rgb * (0.02 + 1.05 * sombra), t.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  aneis.rotation.x = -Math.PI / 2;
  grupo.add(aneis);

  const solMundo = new THREE.Vector3(-0.72, 0.28, 0.63).normalize();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  return {
    grupo, ambiente: 'espaco', pronto: Promise.resolve(),
    animar(t, { camera, luzSol }) {
      grupo.getWorldQuaternion(q).invert();
      const s = v.copy(solMundo).applyQuaternion(q).normalize();
      uP.uSol.value.copy(s);
      uA.uSol.value.copy(s);
      uP.uCam.value.copy(grupo.worldToLocal(camera.position.clone()));
      if (luzSol) luzSol.position.copy(solMundo).multiplyScalar(40);
    },
  };
}

// ---------------- Reator Arc: o de metal da cena comum ----------------
function realReator() {
  const r = criarReatorReal();
  return { grupo: r.grupo, ambiente: 'sala', pronto: Promise.resolve(), animar: (t) => r.animar(t) };
}

// ---------------- Átomo: esferas polidas, elétrons acesos ----------------
function realAtomo() {
  const grupo = new THREE.Group();
  const nucleons = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.21, 32, 20),
    new THREE.MeshPhysicalMaterial({ metalness: 0.15, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
    40,
  );
  const m = new THREE.Matrix4();
  const cor = new THREE.Color();
  for (let i = 0; i < 40; i++) {
    const p = new THREE.Vector3().randomDirection().multiplyScalar(Math.cbrt(Math.random()) * 0.52);
    m.makeTranslation(p.x, p.y, p.z);
    nucleons.setMatrixAt(i, m);
    nucleons.setColorAt(i, cor.set(i % 2 ? '#e8452c' : '#2f7bff'));
  }
  grupo.add(nucleons);
  const eletrons = [];
  const orbitaMat = new THREE.MeshStandardMaterial({ color: '#c9d5de', metalness: 1, roughness: 0.25, emissive: new THREE.Color('#123a44') });
  for (let i = 0; i < 3; i++) {
    const e = new THREE.Euler(0.35, 0.3, (i * Math.PI) / 3);
    // aro fino de metal, esticado em elipse
    const aro = new THREE.Mesh(new THREE.TorusGeometry(1, 0.008, 8, 200), orbitaMat);
    aro.scale.set(2.7, 1.05, 1);
    aro.rotation.copy(e);
    const bola = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3, 3.2) }));
    const halo = brilho(COR.ciano, 0.55);
    const luz = new THREE.PointLight(COR.ciano, 2.2, 4, 1.8);
    bola.add(halo, luz);
    grupo.add(aro, bola);
    eletrons.push({ e, bola, fase: i * 2.1, v: 1.3 + i * 0.35 });
  }
  const miolo = new THREE.PointLight('#ffd0a0', 5, 5, 1.8);
  grupo.add(miolo);
  const apoio = new THREE.Vector3();
  return {
    grupo, ambiente: 'sala', pronto: Promise.resolve(),
    animar(t) {
      for (const o of eletrons) {
        const a = t * o.v + o.fase;
        apoio.set(Math.cos(a) * 2.7, Math.sin(a) * 1.05, 0).applyEuler(o.e);
        o.bola.position.copy(apoio);
      }
    },
  };
}

// ---------------- DNA: modelo de bolas e bastões ----------------
function realDna() {
  const grupo = new THREE.Group();
  const altura = 4.5;
  const voltas = 3.2;
  const raio = 1.0;
  const fita = (t, fase) => {
    const a = t * voltas * Math.PI * 2 + fase;
    return new THREE.Vector3(Math.cos(a) * raio, (t - 0.5) * altura, Math.sin(a) * raio);
  };
  const qtd = 150;
  const bolas = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 24, 16), new THREE.MeshPhysicalMaterial({ metalness: 0.1, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 }), qtd * 2);
  const m = new THREE.Matrix4();
  const cor = new THREE.Color();
  for (let i = 0; i < qtd; i++) {
    const t = i / (qtd - 1);
    [0, Math.PI].forEach((fase, lado) => {
      const p = fita(t, fase);
      m.makeTranslation(p.x, p.y, p.z);
      bolas.setMatrixAt(i * 2 + lado, m);
      bolas.setColorAt(i * 2 + lado, cor.set(lado ? '#7a5cff' : '#2fa8ff'));
    });
  }
  grupo.add(bolas);
  const pares = 40;
  const bastoes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.038, 0.038, 1, 16), new THREE.MeshPhysicalMaterial({ metalness: 0.05, roughness: 0.35, clearcoat: 0.7 }), pares * 2);
  const coresPares = [['#ff7a3c', '#34d9e8'], ['#49e38a', '#c78bff']];
  const eixo = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const esc = new THREE.Vector3();
  for (let k = 0; k < pares; k++) {
    const t = (k + 0.5) / pares;
    const a = fita(t, 0);
    const b = fita(t, Math.PI);
    const meio = a.clone().add(b).multiplyScalar(0.5);
    const [c1, c2] = coresPares[k % 2];
    [[a, c1], [b, c2]].forEach(([ponta, c], lado) => {
      const dir = meio.clone().sub(ponta);
      const centro = ponta.clone().add(meio).multiplyScalar(0.5);
      q.setFromUnitVectors(eixo, dir.clone().normalize());
      m.compose(centro, q, esc.set(1, dir.length(), 1));
      bastoes.setMatrixAt(k * 2 + lado, m);
      bastoes.setColorAt(k * 2 + lado, cor.set(c));
    });
  }
  grupo.add(bastoes);
  const luz = new THREE.PointLight('#bfe9ff', 6, 8, 1.6);
  luz.position.set(2.4, 1.6, 2.8);
  grupo.add(luz);
  return { grupo, ambiente: 'sala', pronto: Promise.resolve(), animar() {} };
}

// ---------------- Cidade: maquete à noite, janelas acesas e trânsito ----------------
function realCidade({ predios, base }) {
  const grupo = new THREE.Group();
  const caixa = new THREE.BoxGeometry(1, 1, 1);
  caixa.translate(0, 0.5, 0);
  const n = predios.length;
  const sementes = new Float32Array(n);
  const inst = new THREE.InstancedMesh(caixa.clone(), new THREE.ShaderMaterial({
    uniforms: { uBase: { value: base } },
    vertexShader: `
      attribute float aSemente;
      varying vec3 vW;
      varying vec3 vN;
      varying float vS;
      void main() {
        vec4 w = instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normal;
        vS = aSemente;
        gl_Position = projectionMatrix * modelViewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uBase;
      varying vec3 vW;
      varying vec3 vN;
      varying float vS;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float y = vW.y - uBase;
        vec3 cor = vec3(0.014, 0.019, 0.028);
        if (abs(vN.y) < 0.5) {
          float u = abs(vN.x) > 0.5 ? vW.z : vW.x;
          vec2 g = vec2(u * 15.0, y * 20.0);
          vec2 id = floor(g);
          vec2 f = fract(g);
          float janela = step(0.14, f.x) * step(f.x, 0.86) * step(0.22, f.y) * step(f.y, 0.78);
          float acesa = step(0.72 + vS * 0.14, h(id + vS * 91.0));
          vec3 tom = mix(vec3(1.5, 0.98, 0.52), vec3(0.62, 0.95, 1.5), step(0.82, h(id * 1.7 + vS)));
          vec3 luzes = janela * acesa * tom * (0.3 + h(id + 3.0) * 1.05);
          // de longe a janela fica menor que o pixel: usa a média em vez de cintilar
          float pixel = max(fwidth(g.x), fwidth(g.y));
          cor += mix(luzes, tom * 0.055, smoothstep(0.35, 0.95, pixel));
          cor *= abs(vN.x) > 0.5 ? 1.0 : 0.82;
          cor += vec3(0.05, 0.07, 0.1) * exp(-y * 1.1);   // luz da rua subindo pela fachada
        } else {
          cor = vec3(0.022, 0.026, 0.034);
        }
        gl_FragColor = vec4(cor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), n);
  const m = new THREE.Matrix4();
  const maisAlto = predios.reduce((a, b) => (b.h > a.h ? b : a));
  const predio = new Map(predios.map((p) => [p, p === maisAlto ? p.h : p.h * (0.42 + Math.random() * 0.68)]));
  predios.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, base, p.z), new THREE.Quaternion(), new THREE.Vector3(p.lado * 0.8, predio.get(p), p.lado * 0.8));
    inst.setMatrixAt(i, m);
    sementes[i] = Math.random();
  });
  inst.geometry.setAttribute('aSemente', new THREE.InstancedBufferAttribute(sementes, 1));
  grupo.add(inst);

  // chão da maquete com as ruas acesas
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#05080c';
  g.fillRect(0, 0, 1024, 1024);
  const passo = 1024 * (0.46 / 6);
  g.save();
  g.shadowColor = '#ffc98a';
  g.shadowBlur = 8;
  g.strokeStyle = 'rgba(255,205,140,0.75)';
  g.lineWidth = 1.6;
  for (let i = -6; i <= 6; i++) {
    const o = 512 + (i + 0.5) * passo;
    g.beginPath(); g.moveTo(o, 0); g.lineTo(o, 1024); g.moveTo(0, o); g.lineTo(1024, o); g.stroke();
  }
  g.restore();
  const texChao = new THREE.CanvasTexture(c);
  texChao.colorSpace = THREE.SRGBColorSpace;
  texChao.anisotropy = 8;
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: texChao }));
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = base - 0.005;
  grupo.add(chao);

  // balizas vermelhas nas torres mais altas
  const altas = [...predios].sort((a, b) => predio.get(b) - predio.get(a)).slice(0, 7);
  const balizas = altas.map((p) => {
    const b = brilho(new THREE.Color('#ff3b30'), 0.2);
    b.position.set(p.x, base + predio.get(p) + 0.04, p.z);
    grupo.add(b);
    return b;
  });

  // carros andando pelas ruas
  const carros = 140;
  const dados = Array.from({ length: carros }, () => ({
    rua: (Math.floor(Math.random() * 12) - 6 + 0.5) * 0.46,
    vertical: Math.random() < 0.5, pos: Math.random() * 6 - 3, v: (0.18 + Math.random() * 0.3) * (Math.random() < 0.5 ? 1 : -1),
  }));
  const posCarros = new Float32Array(carros * 3);
  const coresCarros = new Float32Array(carros * 3);
  dados.forEach((d, i) => {
    const c2 = d.v > 0 ? new THREE.Color(2.4, 2.2, 1.7) : new THREE.Color(2.4, 0.3, 0.2);
    coresCarros.set([c2.r, c2.g, c2.b], i * 3);
  });
  const geoCarros = new THREE.BufferGeometry();
  geoCarros.setAttribute('position', new THREE.BufferAttribute(posCarros, 3));
  geoCarros.setAttribute('color', new THREE.BufferAttribute(coresCarros, 3));
  const pontos = new THREE.Points(geoCarros, new THREE.PointsMaterial({ map: texturaBrilho(), size: 0.07, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  grupo.add(pontos);

  let antes = 0;
  return {
    grupo, ambiente: 'sala', pronto: Promise.resolve(),
    animar(t) {
      const dt = Math.min(0.1, t - antes);
      antes = t;
      dados.forEach((d, i) => {
        d.pos += d.v * dt;
        if (d.pos > 3) d.pos = -3;
        if (d.pos < -3) d.pos = 3;
        posCarros[i * 3] = d.vertical ? d.rua : d.pos;
        posCarros[i * 3 + 1] = base + 0.012;
        posCarros[i * 3 + 2] = d.vertical ? d.pos : d.rua;
      });
      geoCarros.attributes.position.needsUpdate = true;
      const pisca = Math.sin(t * 3.4) > 0.4 ? 1 : 0.15;
      for (const b of balizas) b.material.opacity = pisca;
    },
  };
}

// ---------------- ruído em GLSL (Sol e disco do buraco negro) ----------------
const GLSL_RUIDO = `
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float ruido3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += ruido3(p) * a; p *= 2.03; a *= 0.5; } return s; }
`;

// textura de planeta desenhada por código: faixas com ruído (gigantes gasosos) ou manchas (rochosos)
function texturaPlaneta(paleta, { faixas = true, mancha = null } = {}) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const cores = paleta.map((p) => new THREE.Color(p));
  for (let y = 0; y < 256; y++) {
    const t = faixas ? (Math.sin(y * 0.11) * 0.5 + 0.5) * 0.6 + (Math.sin(y * 0.031 + 1.3) * 0.5 + 0.5) * 0.4 : 0.5;
    const i = Math.min(cores.length - 2, Math.floor(t * (cores.length - 1)));
    const cor = cores[i].clone().lerp(cores[i + 1], t * (cores.length - 1) - i);
    g.fillStyle = `#${cor.getHexString()}`;
    g.fillRect(0, y, 512, 1);
  }
  for (let i = 0; i < (faixas ? 600 : 1400); i++) {
    const claro = Math.random() < 0.5;
    g.fillStyle = `rgba(${claro ? '255,250,235' : '30,20,10'},${Math.random() * (faixas ? 0.06 : 0.12)})`;
    if (faixas) g.fillRect(Math.random() * 512, Math.random() * 256, 20 + Math.random() * 90, 1 + Math.random() * 2);
    else {
      g.beginPath();
      g.arc(Math.random() * 512, Math.random() * 256, 1 + Math.random() * 9, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (mancha) {
    g.fillStyle = mancha;
    g.beginPath();
    g.ellipse(330, 160, 26, 13, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------- Lua: textura de verdade e a fase de hoje ----------------
function realLua({ fase }) {
  const grupo = new THREE.Group();
  const { texturas, pronto } = carregar({ mapa: ['moon_1024.jpg', true] });
  const lua = new THREE.Mesh(new THREE.SphereGeometry(1.9, 128, 96), new THREE.MeshStandardMaterial({
    map: texturas.mapa, bumpMap: texturas.mapa, bumpScale: 0.035, roughness: 1, metalness: 0, envMapIntensity: 0,
    // brilho da Terra no lado escuro, bem fraco
    emissiveMap: texturas.mapa, emissive: new THREE.Color('#9fb6d6'), emissiveIntensity: 0.07,
  }));
  lua.rotation.y = -Math.PI / 2;   // o lado visível da Terra fica de frente
  grupo.add(lua);
  const sol = solDaFase(fase.fase);
  return {
    grupo, ambiente: 'espaco', pronto,
    animar(t, { luzSol }) {
      if (luzSol) luzSol.position.copy(sol).multiplyScalar(40);
    },
  };
}

// ---------------- Sistema Solar: Sol fervendo e planetas iluminados por ele ----------------
function realSistemaSolar() {
  const grupo = new THREE.Group();
  const uSol = { uTempo: { value: 0 }, uCam: { value: new THREE.Vector3() } };
  const sol = new THREE.Mesh(new THREE.SphereGeometry(0.6, 96, 64), new THREE.ShaderMaterial({
    uniforms: uSol,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float uTempo;
      uniform vec3 uCam;
      varying vec3 vP;
      ${GLSL_RUIDO}
      void main() {
        vec3 N = normalize(vP);
        float n = fbm3(N * 6.0 + vec3(0.0, uTempo * 0.12, uTempo * 0.05));
        float m = fbm3(N * 18.0 - vec3(uTempo * 0.2));
        vec3 cor = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.45), n) * (0.75 + m * 0.5);
        float borda = pow(max(dot(N, normalize(uCam - vP)), 0.0), 0.45);
        gl_FragColor = vec4(cor * (1.4 + borda * 2.2), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  grupo.add(sol);
  const coroa = brilho(new THREE.Color('#ff9a3c'), 3.4);
  coroa.material.opacity = 0.75;
  grupo.add(coroa, brilho(new THREE.Color('#ffd27a'), 1.7));
  const luz = new THREE.PointLight('#fff1d6', 4.5, 0, 0);
  grupo.add(luz);

  const terraMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, envMapIntensity: 0 });
  const { texturas, pronto } = carregar({ dia: ['earth_atmos_2048.jpg', true] });
  const prontoTerra = pronto.then(() => {
    terraMat.map = texturas.dia;
    terraMat.needsUpdate = true;
  }).catch(() => terraMat.color.set('#3f7fd6'));
  const mapas = {
    'MERCÚRIO': texturaPlaneta(['#6e6862', '#9c958c', '#b8b1a8'], { faixas: false }),
    'VÊNUS': texturaPlaneta(['#c9a46a', '#e3c78e', '#f0dcae'], { faixas: true }),
    'MARTE': texturaPlaneta(['#7a2f1a', '#b5512c', '#d27a4a'], { faixas: false }),
    'JÚPITER': texturaPlaneta(['#8a6a4f', '#c9a27c', '#efe0c8', '#b98b62', '#e8d3b4'], { faixas: true, mancha: 'rgba(170,70,40,0.85)' }),
    'SATURNO': texturaFaixas(),
    'URANO': texturaPlaneta(['#8fd4dc', '#a6e1e8', '#bde9ee'], { faixas: true }),
    'NETUNO': texturaPlaneta(['#2c4fb8', '#3a63d0', '#5b82e6'], { faixas: true }),
  };
  const planetas = PLANETAS.map(([nome, orbita, raio, , voltas], i) => {
    const pivo = new THREE.Group();
    const material = nome === 'TERRA' ? terraMat : new THREE.MeshStandardMaterial({ map: mapas[nome], roughness: 1, metalness: 0, envMapIntensity: 0 });
    const planeta = new THREE.Mesh(new THREE.SphereGeometry(raio, 48, 32), material);
    planeta.position.x = orbita;
    pivo.add(planeta);
    if (nome === 'SATURNO') {
      const aneis = new THREE.Mesh(new THREE.RingGeometry(raio * 1.3, raio * 2.3, 96, 1), new THREE.MeshStandardMaterial({
        map: texturaAneis(), transparent: true, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0, depthWrite: false,
      }));
      // a textura dos anéis é radial: u vai da borda de dentro à de fora
      const uv = aneis.geometry.attributes.uv;
      const pos = aneis.geometry.attributes.position;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (Math.hypot(pos.getX(k), pos.getY(k)) - raio * 1.3) / raio, 0.5);
      aneis.rotation.x = -Math.PI / 2 + 0.47;
      aneis.position.x = orbita;
      pivo.add(aneis);
    }
    grupo.add(pivo);
    const orbitaLinha = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 200 }, (_, k) => {
      const a = (k / 200) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * orbita, 0, Math.sin(a) * orbita);
    })), new THREE.LineBasicMaterial({ color: '#8fb6c8', transparent: true, opacity: 0.16, depthWrite: false }));
    grupo.add(orbitaLinha);
    return { pivo, planeta, voltas, i };
  });
  const cinturao = [];
  for (let k = 0; k < 1600; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.32 + (Math.random() - 0.5) * 0.24;
    cinturao.push(Math.cos(a) * r, (Math.random() - 0.5) * 0.06, Math.sin(a) * r);
  }
  const geoCint = new THREE.BufferGeometry();
  geoCint.setAttribute('position', new THREE.Float32BufferAttribute(cinturao, 3));
  grupo.add(new THREE.Points(geoCint, new THREE.PointsMaterial({ color: '#a39a8c', size: 0.018 })));
  const v = new THREE.Vector3();
  return {
    grupo, ambiente: 'espaco', pronto: prontoTerra,
    animar(t, { camera }) {
      uSol.uTempo.value = t;
      uSol.uCam.value.copy(sol.worldToLocal(v.copy(camera.position)));
      for (const p of planetas) {
        p.pivo.rotation.y = p.i * 2.1 + 0.6 + t * p.voltas * 0.6;
        p.planeta.rotation.y = t * 0.5;
      }
    },
  };
}

// ---------------- Galáxia: estrelas com as cores de verdade e faixas de poeira ----------------
function materialEstrelas(escuro) {
  return new THREE.ShaderMaterial({
    uniforms: { uPixel: { value: Math.min(devicePixelRatio, 1.5) } },
    vertexShader: `
      attribute float tamanho;
      varying vec3 vCor;
      uniform float uPixel;
      void main() {
        vCor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = tamanho * uPixel * ${escuro ? '70.0' : '22.0'} / -mv.z;
      }`,
    fragmentShader: `
      varying vec3 vCor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vCor * ${escuro ? '1.0' : '1.6'}, a * ${escuro ? '0.32' : 'a'});
        #include <colorspace_fragment>
      }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: escuro ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
}

function realGalaxia() {
  const grupo = new THREE.Group();
  const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
  const nuvemDe = () => ({ pos: [], cores: [], tamanhos: [] });
  const add = (n, x, y, z, cor, tam) => {
    n.pos.push(x, y, z);
    n.cores.push(cor.r, cor.g, cor.b);
    n.tamanhos.push(tam);
  };
  const pontos = (n, escuro) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(n.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(n.cores, 3));
    geo.setAttribute('tamanho', new THREE.Float32BufferAttribute(n.tamanhos, 1));
    return new THREE.Points(geo, materialEstrelas(escuro));
  };
  const velha = new THREE.Color('#ffd9a8');
  const jovem = new THREE.Color('#a9c6ff');
  const rosa = new THREE.Color('#ff7fb8');
  const claro = nuvemDe();
  for (let i = 0; i < 16000; i++) {
    const v = new THREE.Vector3(gauss(), gauss() * 0.42, gauss()).multiplyScalar(0.55);
    add(claro, v.x, v.y, v.z, velha.clone().lerp(new THREE.Color('#fff4e0'), Math.random() * 0.6), 0.5 + Math.random() * 0.8);
  }
  for (let i = 0; i < 36000; i++) {
    const braco = i % 4;
    const t = Math.pow(Math.random(), 0.8);
    const r = 0.55 + t * 3.4;
    const a = (braco / 4) * Math.PI * 2 + Math.log(r / 0.55) / 0.32;
    const espalha = 0.07 + r * 0.08;
    const regiao = Math.random() < 0.035;
    add(claro, Math.cos(a) * r + gauss() * espalha, gauss() * 0.06 * (1 - t * 0.6), Math.sin(a) * r + gauss() * espalha,
      regiao ? rosa : jovem.clone().lerp(velha, (1 - t) * 0.5), regiao ? 1.6 : 0.35 + Math.random() * 0.7);
  }
  for (let i = 0; i < 9000; i++) {
    const r = -Math.log(1 - Math.random() * 0.98) * 1.1;
    const a = Math.random() * Math.PI * 2;
    add(claro, Math.cos(a) * r, gauss() * 0.05, Math.sin(a) * r, velha, 0.3);
  }
  const estrelas = pontos(claro, false);
  grupo.add(estrelas);
  // faixas de poeira escura na beira de dentro dos braços
  const escura = nuvemDe();
  const poeiraCor = new THREE.Color('#1a0f0a');
  for (let i = 0; i < 7000; i++) {
    const braco = i % 4;
    const t = 0.1 + Math.random() * 0.75;
    const r = 0.55 + t * 3.4;
    const a = (braco / 4) * Math.PI * 2 + Math.log(r / 0.55) / 0.32 - 0.22;
    add(escura, Math.cos(a) * r + gauss() * 0.08, gauss() * 0.03, Math.sin(a) * r + gauss() * 0.08, poeiraCor, 0.8 + Math.random());
  }
  const poeira = pontos(escura, true);
  poeira.renderOrder = 2;
  grupo.add(poeira);
  const nucleo = brilho(new THREE.Color('#ffc98a'), 2.4);
  nucleo.material.opacity = 0.85;
  grupo.add(nucleo);
  const disco = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshBasicMaterial({
    map: texturaBrilho(), color: '#6f86b8', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  disco.rotation.x = -Math.PI / 2;
  grupo.add(disco);
  return {
    grupo, ambiente: 'espaco', pronto: Promise.resolve(),
    animar(t) {
      estrelas.rotation.y = poeira.rotation.y = -t * 0.025;
    },
  };
}

// ---------------- Buraco Negro: disco quente girando e a luz entortada em volta ----------------
function shaderDisco(lente) {
  return {
    uniforms: { uTempo: { value: 0 }, uCam: { value: new THREE.Vector3() }, uDeLado: { value: 1 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float uTempo, uDeLado;
      uniform vec3 uCam;
      varying vec3 vP;
      ${GLSL_RUIDO}
      void main() {
        vec2 p = vP.xy;
        float r = length(p);
        float t = clamp((r - ${lente ? '0.88' : '0.95'}) / ${lente ? '0.9' : '2.65'}, 0.0, 1.0);
        // perto do horizonte o gás gira mais rápido
        float giro = uTempo * 1.6 / pow(max(r, 0.5), 1.5);
        vec2 q = mat2(cos(giro), -sin(giro), sin(giro), cos(giro)) * p;
        float n = fbm3(vec3(q * 2.2, r * 3.0));
        float faixas = 0.65 + 0.35 * sin(r * 26.0 + n * 6.0);
        vec3 quente = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.62, 0.22), smoothstep(0.0, 0.35, t));
        quente = mix(quente, vec3(0.75, 0.16, 0.04), smoothstep(0.35, 1.0, t));
        // o lado que vem na nossa direção fica mais forte (efeito Doppler)
        vec3 tangente = normalize(vec3(-p.y, p.x, 0.0));
        float doppler = 1.0 + ${lente ? '0.0' : '0.5 * dot(tangente, normalize(uCam - vP))'};
        float a = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.7, 1.0, t)) * faixas * (0.55 + n * 0.9);
        vec3 cor = quente * a * pow(max(doppler, 0.0), 3.0) * ${lente ? '0.8' : '1.7'} * (1.0 - t * 0.6);
        ${lente ? 'cor += vec3(1.0, 0.9, 0.75) * exp(-pow((r - 0.86) / 0.01, 2.0)) * 1.8; cor *= uDeLado;' : ''}
        gl_FragColor = vec4(cor, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  };
}

function realBuracoNegro() {
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 64, 48), new THREE.MeshBasicMaterial({ color: '#000000' })));
  const matDisco = new THREE.ShaderMaterial(shaderDisco(false));
  const disco = new THREE.Mesh(new THREE.RingGeometry(0.95, 3.6, 256, 8), matDisco);
  disco.rotation.x = -Math.PI / 2;
  grupo.add(disco);
  const matLente = new THREE.ShaderMaterial(shaderDisco(true));
  const lente = new THREE.Mesh(new THREE.RingGeometry(0.84, 1.8, 256, 4), matLente);
  grupo.add(lente);
  // jatos azulados saindo dos polos
  const jato = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.32, 3.2, 32, 1, true), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float a = pow(max(1.0 - vUv.y, 0.0), 2.0) * 0.5; gl_FragColor = vec4(vec3(0.45, 0.6, 1.0) * a, a); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  jato.position.y = 1.7;
  const jato2 = jato.clone();
  jato2.rotation.x = Math.PI;
  jato2.position.y = -1.7;
  grupo.add(jato, jato2);
  const v = new THREE.Vector3();
  const centro = new THREE.Vector3();
  const normalDisco = new THREE.Vector3();
  const giro = new THREE.Quaternion();
  return {
    grupo, ambiente: 'espaco', pronto: Promise.resolve(),
    animar(t, { camera }) {
      matDisco.uniforms.uTempo.value = matLente.uniforms.uTempo.value = t;
      matDisco.uniforms.uCam.value.copy(disco.worldToLocal(v.copy(camera.position)));
      lente.lookAt(camera.position);
      // a luz entortada só aparece quando o disco é visto de lado
      const olhar = v.copy(camera.position).sub(grupo.getWorldPosition(centro)).normalize();
      normalDisco.set(0, 1, 0).applyQuaternion(grupo.getWorldQuaternion(giro));
      matLente.uniforms.uDeLado.value = 1 - Math.pow(Math.abs(olhar.dot(normalDisco)), 1.5) * 0.85;
    },
  };
}

// ---------------- Turbina: motor de metal em corte, com o fan girando ----------------
function realTurbina() {
  const grupo = new THREE.Group();
  const motor = new THREE.Group();
  motor.rotation.z = -Math.PI / 2;   // o eixo do torno (y) vira o eixo do motor (x)
  grupo.add(motor);
  const pintura = new THREE.MeshPhysicalMaterial({ color: '#dfe3e8', metalness: 0.55, roughness: 0.32, clearcoat: 0.6, side: THREE.DoubleSide });
  const titanio = new THREE.MeshStandardMaterial({ color: '#a9b3bd', metalness: 1, roughness: 0.26 });
  const escuro = new THREE.MeshStandardMaterial({ color: '#2b2f34', metalness: 0.9, roughness: 0.35 });
  const quente = new THREE.MeshStandardMaterial({ color: '#8a5a3a', metalness: 1, roughness: 0.4, emissive: new THREE.Color('#ff5a1a'), emissiveIntensity: 0.25 });
  // carenagem com um quarto aberto, para ver o miolo
  const perfil = perfilNacele();
  const pontos = [...perfil.map(([x, r]) => new THREE.Vector2(r, x)), ...[...perfil].reverse().map(([x, r]) => new THREE.Vector2(r - 0.07, x))];
  pontos.push(pontos[0].clone());
  motor.add(new THREE.Mesh(new THREE.LatheGeometry(pontos, 128, Math.PI * 0.15, Math.PI * 1.5), pintura));
  const m = new THREE.Matrix4();
  const deitar = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  // fan: 22 pás torcidas em volta do eixo
  const fan = new THREE.Group();
  fan.position.y = -1.85;
  // a corda da pá fica ao longo do eixo do motor, como num fan de verdade
  const pa = new THREE.BoxGeometry(0.025, 0.9, 0.24, 1, 12, 1);
  pa.translate(0, 0.73, 0);
  const pp = pa.attributes.position;
  for (let k = 0; k < pp.count; k++) {
    const y = pp.getY(k);
    const torcao = 1.0 - y * 0.55;
    const x = pp.getX(k);
    const z = pp.getZ(k);
    pp.setXYZ(k, x * Math.cos(torcao) - z * Math.sin(torcao), y, x * Math.sin(torcao) + z * Math.cos(torcao));
  }
  pa.computeVertexNormals();
  const pas = new THREE.InstancedMesh(pa, titanio, 22);
  for (let i = 0; i < 22; i++) pas.setMatrixAt(i, m.makeRotationY((i / 22) * Math.PI * 2).multiply(deitar));
  const cubo = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 48), escuro);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 48), escuro);
  cone.rotation.x = Math.PI;
  cone.position.y = -0.33;
  fan.add(pas, cubo, cone);
  motor.add(fan);
  // compressor e turbina: discos de palhetas
  const estagio = (y, rMax, n, material) => {
    const g = new THREE.BoxGeometry(0.05, rMax - 0.3, 0.012);
    g.translate(0, 0.3 + (rMax - 0.3) / 2, 0);
    const disco = new THREE.InstancedMesh(g, material, n);
    const inclina = new THREE.Matrix4().makeRotationY(0.5);
    for (let i = 0; i < n; i++) disco.setMatrixAt(i, m.makeRotationY((i / n) * Math.PI * 2).multiply(deitar).multiply(inclina));
    const d = new THREE.Group();
    d.position.y = y;
    d.add(disco);
    return d;
  };
  const rotor = new THREE.Group();
  for (let d = 0; d < 7; d++) rotor.add(estagio(-1.35 + d * 0.2, 0.82 - d * 0.04, 34, titanio));
  for (let d = 0; d < 4; d++) rotor.add(estagio(0.85 + d * 0.16, 0.75, 40, quente));
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 32), escuro));
  motor.add(rotor);
  // câmara de combustão acesa
  const camara = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.13, 24, 96), new THREE.MeshStandardMaterial({
    color: '#3a2010', emissive: new THREE.Color('#ff6a1a'), emissiveIntensity: 2.6, roughness: 0.6,
  }));
  camara.rotation.x = Math.PI / 2;
  camara.position.y = 0.35;
  const fogo = new THREE.PointLight('#ff7a2a', 3, 4, 2);
  fogo.position.y = 0.35;
  motor.add(camara, fogo);
  // cone de escape e o jato quente
  const escape = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 48, 1, true), escuro);
  escape.position.y = 1.95;
  motor.add(escape);
  const jato = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.38, 1.8, 48, 1, true), new THREE.ShaderMaterial({
    uniforms: { uTempo: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTempo; varying vec2 vUv;
      void main(){
        float t = 1.0 - vUv.y;
        float diamantes = 0.7 + 0.3 * sin(t * 30.0 - uTempo * 40.0);
        vec3 cor = mix(vec3(1.0, 0.55, 0.2), vec3(0.35, 0.55, 1.0), t) * pow(max(1.0 - t, 0.0), 1.6) * diamantes * 1.4;
        gl_FragColor = vec4(cor, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  jato.position.y = 3.05;
  motor.add(jato);
  return {
    grupo, ambiente: 'sala', pronto: Promise.resolve(),
    animar(t) {
      fan.rotation.y = t * 9;
      rotor.rotation.y = t * 14;
      jato.material.uniforms.uTempo.value = t;
      camara.material.emissiveIntensity = 2.4 + Math.sin(t * 19) * 0.25 + Math.sin(t * 31) * 0.15;
    },
  };
}

// ---------------- Drone: fibra de carbono, hélices girando e flutuando ----------------
function realDrone() {
  const grupo = new THREE.Group();
  const corpo = new THREE.Group();
  grupo.add(corpo);
  const carbono = new THREE.MeshPhysicalMaterial({ color: '#1c2125', metalness: 0.35, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.15 });
  const casca = new THREE.MeshPhysicalMaterial({ color: '#e9ecef', metalness: 0.1, roughness: 0.3, clearcoat: 1 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9aa3ab', metalness: 1, roughness: 0.3 });
  const base = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), carbono);
  base.scale.set(0.55, 0.16, 0.8);
  const tampa = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), casca);
  tampa.scale.set(0.5, 0.2, 0.74);
  tampa.position.y = 0.02;
  corpo.add(base, tampa);
  const helices = [];
  DRONE.motores.forEach((p, i) => {
    const dir = new THREE.Vector3(p.x, 0, p.z);
    const distancia = dir.length();
    const braco = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, distancia - 0.3, 16), carbono);
    braco.position.copy(dir.clone().multiplyScalar((distancia + 0.3) / 2 / distancia)).setY(0.02);
    braco.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    corpo.add(braco);
    const motorM = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.17, 32), metal);
    motorM.position.set(p.x, p.y, p.z);
    corpo.add(motorM);
    const helice = new THREE.Group();
    helice.position.set(p.x, p.y + 0.12, p.z);
    const pa = new THREE.Mesh(new THREE.BoxGeometry(DRONE.helice * 2, 0.012, 0.09), new THREE.MeshStandardMaterial({ color: '#15181b', roughness: 0.5, metalness: 0.2 }));
    pa.rotation.x = 0.12;
    const borrao = new THREE.Mesh(new THREE.CircleGeometry(DRONE.helice, 48), new THREE.MeshBasicMaterial({ color: '#8a949c', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
    borrao.rotation.x = -Math.PI / 2;
    helice.add(pa, borrao);
    corpo.add(helice);
    helices.push({ helice, sentido: i % 2 ? 1 : -1 });
    const corLed = i < 2 ? '#3dff7a' : '#ff3b30';
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(corLed).multiplyScalar(2.5) }));
    led.position.set(p.x, p.y - 0.1, p.z);
    const halo = brilho(new THREE.Color(corLed), 0.32);
    halo.position.copy(led.position);
    corpo.add(led, halo);
    const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 8), carbono);
    perna.position.set(p.x * 0.47, -0.36, p.z * 0.47);
    corpo.add(perna);
  });
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 24), new THREE.MeshPhysicalMaterial({ color: '#111417', metalness: 0.6, roughness: 0.3, clearcoat: 1 }));
  gimbal.position.set(0, -0.28, 0.62);
  const lente = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#1a3a6a', metalness: 0.2, roughness: 0.05, clearcoat: 1, emissive: new THREE.Color('#0a2a5a'), emissiveIntensity: 0.6 }));
  lente.position.set(0, -0.28, 0.73);
  corpo.add(gimbal, lente);
  return {
    grupo, ambiente: 'sala', pronto: Promise.resolve(),
    animar(t) {
      corpo.position.y = Math.sin(t * 1.6) * 0.06;
      corpo.rotation.z = Math.sin(t * 0.9) * 0.03;
      corpo.rotation.x = Math.sin(t * 1.1) * 0.025;
      for (const h of helices) h.helice.rotation.y = t * 26 * h.sentido;
    },
  };
}

// ---------------- Molécula: modelo de bolas e varetas com as cores dos químicos ----------------
function realMolecula() {
  const grupo = new THREE.Group();
  const { atomos, ligacoes } = moleculaCafeina();
  const CORES = { C: '#3c3f44', N: '#3156f0', O: '#f02a1f', H: '#f2f4f6' };
  const bolas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshPhysicalMaterial({ metalness: 0.05, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }), atomos.length);
  const m = new THREE.Matrix4();
  const cor = new THREE.Color();
  atomos.forEach((a, i) => {
    m.compose(a.p, new THREE.Quaternion(), new THREE.Vector3().setScalar(RAIO_ATOMO[a.el] * 0.95));
    bolas.setMatrixAt(i, m);
    bolas.setColorAt(i, cor.set(CORES[a.el]));
  });
  grupo.add(bolas);
  const metades = [];
  for (const [i, j, dupla] of ligacoes) {
    const a = atomos[i].p;
    const b = atomos[j].p;
    const desvio = dupla ? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(0.055) : new THREE.Vector3();
    for (const s of dupla ? [1, -1] : [0]) {
      const d = desvio.clone().multiplyScalar(s);
      const meio = a.clone().add(b).multiplyScalar(0.5).add(d);
      metades.push([a.clone().add(d), meio, atomos[i].el], [meio, b.clone().add(d), atomos[j].el]);
    }
  }
  const varetas = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 16), new THREE.MeshPhysicalMaterial({ metalness: 0.05, roughness: 0.28, clearcoat: 0.8 }), metades.length);
  const eixo = new THREE.Vector3(0, 1, 0);
  metades.forEach(([de, ate, el], k) => {
    const dir = ate.clone().sub(de);
    m.compose(de.clone().add(ate).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(eixo, dir.clone().normalize()), new THREE.Vector3(0.035, dir.length(), 0.035));
    varetas.setMatrixAt(k, m);
    varetas.setColorAt(k, cor.set(CORES[el]).lerp(new THREE.Color('#ffffff'), 0.15));
  });
  grupo.add(varetas);
  const luz = new THREE.PointLight('#d6ecff', 5, 8, 1.6);
  luz.position.set(2, 2, 3);
  grupo.add(luz);
  return { grupo, ambiente: 'sala', pronto: Promise.resolve(), animar() {} };
}

// ---------------- Coração: superfície de verdade, úmida, batendo, com os vasos ----------------
function realCoracao() {
  const grupo = new THREE.Group();
  const corpo = new THREE.Group();
  grupo.add(corpo);
  const resolucao = 72;
  const escala = 1.95;
  const malha = new MarchingCubes(resolucao, new THREE.MeshPhysicalMaterial({
    color: '#8c1c1c', roughness: 0.36, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.22, sheen: 0.6, sheenColor: new THREE.Color('#ff7070'),
  }), false, false, 90000);
  malha.isolation = 0;
  const meio = resolucao / 2;
  for (let z = 0; z < resolucao; z++) {
    for (let y = 0; y < resolucao; y++) {
      for (let x = 0; x < resolucao; x++) {
        const px = ((x - meio) / meio) * escala;
        const py = ((y - meio) / meio) * escala;
        const pz = ((z - meio) / meio) * escala;
        // a fórmula é de grau 6 e quase plana perto da superfície: dividir pelo gradiente vira uma
        // distância aproximada, e a malha sai lisa
        const f = campoCoracao(px, py, pz);
        const h = 0.01;
        const gx = campoCoracao(px + h, py, pz) - campoCoracao(px - h, py, pz);
        const gy = campoCoracao(px, py + h, pz) - campoCoracao(px, py - h, pz);
        const gz = campoCoracao(px, py, pz + h) - campoCoracao(px, py, pz - h);
        const d = f / Math.max(Math.hypot(gx, gy, gz) / (2 * h), 1e-3);
        malha.setCell(x, y, z, -THREE.MathUtils.clamp(d, -0.5, 0.5));
      }
    }
  }
  malha.update();
  malha.scale.setScalar(escala);
  corpo.add(malha);
  const vasos = vasosCoracao();
  const tubo = (curva, raio, cor) => new THREE.Mesh(new THREE.TubeGeometry(curva, 64, raio, 20, false), new THREE.MeshPhysicalMaterial({ color: cor, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.3 }));
  corpo.add(tubo(vasos.aorta, 0.2, '#a3212a'), tubo(vasos.pulmonar, 0.17, '#5b3b8c'), tubo(vasos.cava, 0.16, '#3b4f9e'),
    tubo(vasos.coronariaE, 0.03, '#c23a2a'), tubo(vasos.coronariaD, 0.03, '#c23a2a'));
  // gordura amarelada acompanhando as coronárias
  corpo.add(tubo(vasos.coronariaE, 0.05, '#d8b562'), tubo(vasos.coronariaD, 0.045, '#d8b562'));
  const luz = new THREE.PointLight('#ffd9d0', 3, 7, 1.6);
  luz.position.set(1.5, 1.4, 2.5);
  grupo.add(luz);
  return {
    grupo, ambiente: 'sala', pronto: Promise.resolve(),
    animar(t) {
      corpo.scale.setScalar(1 + batimento(t) * 0.045);
    },
  };
}

// ---------------- Terreno: maquete de relevo com lago, mata, rocha e neve ----------------
function realTerreno() {
  const grupo = new THREE.Group();
  const { lado, base, agua } = TERRENO;
  const geo = new THREE.PlaneGeometry(lado, lado, 220, 220);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) pos.setY(k, base + alturaTerreno(pos.getX(k), pos.getZ(k)));
  geo.computeVertexNormals();
  const normais = geo.attributes.normal;
  const cores = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const tons = { areia: new THREE.Color('#b7a57a'), grama: new THREE.Color('#4c7a32'), mata: new THREE.Color('#2b4a20'), rocha: new THREE.Color('#6d655b'), neve: new THREE.Color('#f1f4f6') };
  for (let k = 0; k < pos.count; k++) {
    const h = pos.getY(k) - base;
    const inclinacao = 1 - normais.getY(k);
    if (h < agua + 0.04) c.copy(tons.areia);
    else if (h < 0.95) c.copy(tons.grama).lerp(tons.mata, THREE.MathUtils.smoothstep(h, 0.5, 0.95));
    else if (h < 1.65) c.copy(tons.mata).lerp(tons.rocha, THREE.MathUtils.smoothstep(h, 1.0, 1.5));
    else c.copy(tons.rocha).lerp(tons.neve, THREE.MathUtils.smoothstep(h, 1.65, 1.9));
    if (inclinacao > 0.32 && h > agua + 0.1) c.lerp(tons.rocha, Math.min(1, (inclinacao - 0.32) * 3));
    c.multiplyScalar(0.92 + Math.random() * 0.12);
    cores.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  grupo.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })));
  const lago = new THREE.Mesh(new THREE.PlaneGeometry(lado, lado), new THREE.MeshPhysicalMaterial({
    color: '#1d5873', roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.84, clearcoat: 1,
  }));
  lago.rotation.x = -Math.PI / 2;
  lago.position.y = base + agua;
  grupo.add(lago);
  const bloco = new THREE.Mesh(new THREE.BoxGeometry(lado + 0.04, 0.3, lado + 0.04), new THREE.MeshStandardMaterial({ color: '#191c20', metalness: 0.4, roughness: 0.6 }));
  bloco.position.y = base - 0.15;
  grupo.add(bloco);
  return { grupo, ambiente: 'sala', pronto: Promise.resolve(), animar() {} };
}

export function criarReal(chave, opcoes = {}) {
  const criadores = {
    terra: realTerra, saturno: realSaturno, reator: realReator, atomo: realAtomo, dna: realDna, cidade: realCidade,
    lua: realLua, solar: realSistemaSolar, galaxia: realGalaxia, buraco: realBuracoNegro, turbina: realTurbina,
    drone: realDrone, molecula: realMolecula, coracao: realCoracao, terreno: realTerreno,
  };
  return criadores[chave](opcoes);
}
