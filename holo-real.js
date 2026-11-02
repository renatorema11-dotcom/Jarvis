/*
 * holo-real.js — as versões "foto real" das projeções do laboratório (holo.js).
 * Cada criador devolve { grupo, ambiente, pronto, animar(t, contexto) }:
 *   ambiente "espaco" esconde a sala; "sala" deixa o objeto em cima da mesa.
 * Nada aqui é criado antes de a pessoa ligar o modo foto real.
 */
import * as THREE from 'three';
import { COR, brilho, texturaBrilho, criarReatorReal } from './cena.js';

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

export function criarReal(chave, opcoes = {}) {
  const criadores = { terra: realTerra, saturno: realSaturno, reator: realReator, atomo: realAtomo, dna: realDna, cidade: realCidade };
  return criadores[chave](opcoes);
}
