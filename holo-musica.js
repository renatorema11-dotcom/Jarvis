/*
 * holo-musica.js — o palco de instrumentos holográficos do laboratório (holo.js).
 *
 *   PIANO     duas oitavas; cada dedo que desce numa tecla toca (dá para tocar acordes)
 *   BATERIA   oito peças; bater de cima para baixo com a mão, a força vem da velocidade
 *   HARPA     doze feixes de laser em escala pentatônica; passar o dedo pelo feixe dedilha
 *   TEREMIM   a altura da mão direita é a nota e a da esquerda é o volume, sem encostar em nada
 *   TRILHA    sons de cinema: BRAAAM, impacto, subida, tímpano e acordes de cordas
 * Os sons são sintetizados na hora (Web Audio), com reverb de sala. Também toca com o mouse.
 */
const NOTAS = ['DÓ', 'DÓ#', 'RÉ', 'RÉ#', 'MI', 'FÁ', 'FÁ#', 'SOL', 'SOL#', 'LÁ', 'LÁ#', 'SI'];
const freqDe = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const nomeDe = (midi) => `${NOTAS[midi % 12]} ${Math.floor(midi / 12) - 1}`;
const HARPA = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86];
const PECAS = [
  { id: 'prato', nome: 'PRATO', x: 0.16, y: 0.3, r: 0.105 },
  { id: 'chimbal', nome: 'CHIMBAL', x: 0.3, y: 0.52, r: 0.075 },
  { id: 'tom1', nome: 'TOM 1', x: 0.42, y: 0.3, r: 0.07 },
  { id: 'tom2', nome: 'TOM 2', x: 0.58, y: 0.3, r: 0.075 },
  { id: 'conducao', nome: 'CONDUÇÃO', x: 0.84, y: 0.3, r: 0.11 },
  { id: 'caixa', nome: 'CAIXA', x: 0.42, y: 0.66, r: 0.085 },
  { id: 'surdo', nome: 'SURDO', x: 0.7, y: 0.62, r: 0.1 },
  { id: 'bumbo', nome: 'BUMBO', x: 0.56, y: 0.86, r: 0.1 },
];
const TRILHA = [
  { id: 'braam', nome: 'BRAAAM', icone: '▼' }, { id: 'impacto', nome: 'IMPACTO', icone: '✸' },
  { id: 'subida', nome: 'SUBIDA', icone: '⟰' }, { id: 'timpano', nome: 'TÍMPANO', icone: '◉' },
  { id: 'am', nome: 'LÁ MENOR', icone: '♪', acorde: [57, 60, 64, 69] }, { id: 'f', nome: 'FÁ', icone: '♪', acorde: [53, 57, 60, 65] },
  { id: 'c', nome: 'DÓ', icone: '♪', acorde: [48, 55, 60, 64] }, { id: 'g', nome: 'SOL', icone: '♪', acorde: [55, 59, 62, 67] },
];
export const INSTRUMENTOS = {
  piano: { nome: 'PIANO', icone: '🎹', dica: 'Desça os dedos nas teclas, como num piano de verdade. Dá para tocar acordes.' },
  bateria: { nome: 'BATERIA', icone: '🥁', dica: 'Bata de cima para baixo em cada peça. Quanto mais rápido, mais forte.' },
  harpa: { nome: 'HARPA LASER', icone: '✦', dica: 'Passe o dedo pelos feixes de laser para dedilhar. Deslize por vários para um glissando.' },
  teremim: { nome: 'TEREMIM', icone: '∿', dica: 'Mão direita: subir e descer muda a nota. Mão esquerda: altura é o volume. Sem encostar em nada.' },
  trilha: { nome: 'TRILHA DE CINEMA', icone: '🎬', dica: 'Bata nos painéis para disparar sons de filme: BRAAAM, impacto, subida e acordes de cordas.' },
};

const CSS = `
.holo-musica[hidden], .holo-palco[hidden]{ display:none; }
.holo-musica-lista{ display:flex; flex-direction:column; gap:6px; }
.holo-musica-lista button{ display:grid; grid-template-columns:30px 1fr; align-items:center; gap:8px; padding:9px 10px; text-align:left; cursor:pointer;
  background:rgba(2,10,16,0.6); border:1px solid rgba(77,232,240,0.15); border-radius:3px; color:#a9c6cd; transition:all .2s; font-family:'Orbitron',sans-serif; font-size:11px; letter-spacing:2px; }
.holo-musica-lista button b{ font-size:19px; font-weight:400; text-align:center; filter:drop-shadow(0 0 6px rgba(77,232,240,0.6)); }
.holo-musica-lista button:hover, .holo-musica-lista button.mirado{ border-color:rgba(77,232,240,0.55); color:#e9f7f9; }
.holo-musica-lista button.ativo{ border-color:#4de8f0; color:#e9f7f9; box-shadow:0 0 16px rgba(77,232,240,0.25) inset; }
.holo-musica .holo-desc{ margin-top:4px; }
.holo-palco{ position:absolute; inset:0; z-index:1; pointer-events:none; }
.holo-palco > *{ pointer-events:auto; }
.holo-nota-grande{ position:absolute; left:50%; top:142px; transform:translateX(-50%); font-family:'Orbitron',sans-serif; font-weight:900; font-size:44px; letter-spacing:8px;
  color:#e9f7f9; text-shadow:0 0 30px rgba(77,232,240,0.9); opacity:0; pointer-events:none; }
.holo-nota-grande.mostra{ animation:holo-nota 1.1s ease-out; }
@keyframes holo-nota{ 0%{ opacity:0; transform:translateX(-50%) scale(.7); filter:blur(6px); } 15%{ opacity:1; transform:translateX(-50%) scale(1); filter:none; } 100%{ opacity:0; transform:translateX(-50%) scale(1.15) translateY(-16px); } }
.holo-faisca{ position:absolute; width:90px; height:90px; margin:-45px; border-radius:50%; pointer-events:none; border:2px solid var(--cor,#4de8f0);
  box-shadow:0 0 24px var(--cor,#4de8f0), inset 0 0 18px var(--cor,#4de8f0); animation:holo-faisca .7s ease-out forwards; }
@keyframes holo-faisca{ from{ transform:scale(.2); opacity:1; } to{ transform:scale(1.6); opacity:0; } }
/* piano */
.holo-piano{ position:absolute; left:50%; bottom:118px; width:min(1000px, calc(100% - 560px)); height:210px; transform:translateX(-50%) perspective(900px) rotateX(32deg); transform-origin:50% 100%; }
.holo-piano .brancas{ position:absolute; inset:0; display:flex; gap:3px; }
.holo-piano .tecla{ position:relative; flex:1; border:1px solid rgba(143,243,247,0.55); border-radius:0 0 6px 6px; cursor:pointer; overflow:visible;
  background:linear-gradient(180deg, rgba(200,250,255,0.18), rgba(77,232,240,0.06) 70%, rgba(143,243,247,0.22)); box-shadow:inset 0 -8px 18px rgba(77,232,240,0.15); transition:background .08s, box-shadow .08s; }
.holo-piano .tecla span{ position:absolute; left:0; right:0; bottom:8px; text-align:center; font-family:'Share Tech Mono',monospace; font-size:9px; color:#8ff3f7; letter-spacing:1px; pointer-events:none; }
.holo-piano .preta{ position:absolute; top:0; height:60%; z-index:2; border:1px solid rgba(183,148,255,0.7); border-radius:0 0 4px 4px; cursor:pointer;
  background:linear-gradient(180deg, rgba(40,20,70,0.85), rgba(80,50,140,0.6)); box-shadow:0 0 10px rgba(183,148,255,0.3); }
.holo-piano .tocando{ background:linear-gradient(180deg, rgba(220,255,255,0.75), rgba(77,232,240,0.45)) !important; box-shadow:0 0 34px rgba(77,232,240,0.9), inset 0 0 20px #fff !important; }
.holo-piano .tocando::after{ content:""; position:absolute; left:15%; right:15%; bottom:100%; height:260px; background:linear-gradient(0deg, rgba(77,232,240,0.55), transparent);
  filter:blur(2px); pointer-events:none; animation:holo-feixe-sobe .6s ease-out forwards; transform-origin:50% 100%; }
@keyframes holo-feixe-sobe{ from{ transform:scaleY(.2); opacity:1; } to{ transform:scaleY(1); opacity:0; } }
/* bateria */
.holo-bateria{ position:absolute; left:50%; top:96px; bottom:110px; width:min(1000px, calc(100% - 560px)); transform:translateX(-50%); }
.holo-peca{ position:absolute; border-radius:50%; cursor:pointer; display:grid; place-items:center; transform:translate(-50%, -50%) perspective(700px) rotateX(48deg);
  border:2px solid rgba(77,232,240,0.7); background:radial-gradient(circle, rgba(77,232,240,0.05) 30%, rgba(77,232,240,0.18) 70%, rgba(77,232,240,0.05));
  box-shadow:0 0 26px rgba(77,232,240,0.3), inset 0 0 26px rgba(77,232,240,0.25); transition:box-shadow .1s, background .1s; }
.holo-peca::before{ content:""; position:absolute; inset:14%; border-radius:50%; border:1px dashed rgba(143,243,247,0.45); }
.holo-peca span{ font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:2px; color:#cfeff3; transform:rotateX(-30deg); }
.holo-peca.prato, .holo-peca.conducao, .holo-peca.chimbal{ border-color:rgba(255,216,154,0.8); box-shadow:0 0 26px rgba(255,216,154,0.3), inset 0 0 26px rgba(255,216,154,0.2); }
.holo-peca.batida{ background:radial-gradient(circle, rgba(220,255,255,0.7), rgba(77,232,240,0.35) 60%, transparent); box-shadow:0 0 60px rgba(77,232,240,0.9), inset 0 0 40px #fff; }
/* harpa */
.holo-harpa{ position:absolute; left:50%; top:110px; bottom:120px; width:min(980px, calc(100% - 560px)); transform:translateX(-50%); }
.holo-harpa .moldura{ position:absolute; left:-2%; right:-2%; bottom:-14px; height:10px; border-radius:6px; background:linear-gradient(90deg, #8ff3f7, #b794ff, #8ff3f7); box-shadow:0 0 22px #4de8f0; }
.holo-feixe{ position:absolute; top:0; bottom:0; width:4px; margin-left:-2px; border-radius:2px; cursor:pointer;
  background:linear-gradient(180deg, transparent, var(--cor) 12%, var(--cor) 88%, rgba(255,255,255,0.9)); box-shadow:0 0 12px var(--cor), 0 0 26px var(--cor); opacity:.75; }
.holo-feixe span{ position:absolute; top:calc(100% + 18px); left:50%; transform:translateX(-50%); font-family:'Share Tech Mono',monospace; font-size:9.5px; color:#cfeff3; white-space:nowrap; }
.holo-feixe.vibra{ opacity:1; width:6px; animation:holo-vibra .5s ease-out; box-shadow:0 0 20px #fff, 0 0 46px var(--cor); }
@keyframes holo-vibra{ 0%,100%{ transform:translateX(0); } 15%{ transform:translateX(5px); } 30%{ transform:translateX(-4px); } 45%{ transform:translateX(3px); } 60%{ transform:translateX(-2px); } 75%{ transform:translateX(1px); } }
/* teremim */
.holo-teremim{ position:absolute; left:50%; top:96px; bottom:110px; width:min(980px, calc(100% - 560px)); transform:translateX(-50%); }
.holo-teremim .guia{ position:absolute; left:0; right:0; height:1px; background:rgba(77,232,240,0.14); }
.holo-teremim .guia span{ position:absolute; left:4px; top:-7px; font-family:'Share Tech Mono',monospace; font-size:9px; color:#5f8791; }
.holo-teremim .guia.do{ background:rgba(77,232,240,0.35); }
.holo-teremim .antena{ position:absolute; right:3%; top:4%; bottom:8%; width:6px; border-radius:3px; background:linear-gradient(180deg, #e9f7f9, #6b7c86); box-shadow:0 0 18px rgba(77,232,240,0.6); }
.holo-teremim .laco{ position:absolute; left:3%; bottom:12%; width:90px; height:46px; border:5px solid #9fb0ba; border-bottom:0; border-radius:46px 46px 0 0; box-shadow:0 0 14px rgba(77,232,240,0.4); }
.holo-teremim canvas{ position:absolute; left:10%; right:10%; top:36%; width:80%; height:28%; }
.holo-teremim .leitura{ position:absolute; left:50%; top:8%; transform:translateX(-50%); font-family:'Orbitron',sans-serif; font-size:26px; letter-spacing:5px; color:#e9f7f9; text-shadow:0 0 18px #4de8f0; }
.holo-teremim .marca{ position:absolute; left:0; right:0; height:2px; background:linear-gradient(90deg, transparent, #5dfca0, transparent); box-shadow:0 0 12px #5dfca0; opacity:0; transition:opacity .2s; }
/* trilha */
.holo-trilha{ position:absolute; left:50%; top:120px; bottom:120px; width:min(980px, calc(100% - 560px)); transform:translateX(-50%); display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; perspective:1100px; }
.holo-trilha button{ position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; cursor:pointer; color:#e9f7f9;
  border:1px solid rgba(77,232,240,0.4); border-radius:8px; background:linear-gradient(160deg, rgba(20,60,80,0.45), rgba(4,14,22,0.4)); transform:rotateX(14deg);
  box-shadow:0 0 22px rgba(77,232,240,0.15), inset 0 0 24px rgba(77,232,240,0.1); font-family:'Orbitron',sans-serif; font-size:13px; letter-spacing:3px; transition:all .12s; }
.holo-trilha button b{ font-size:34px; font-weight:400; color:#8ff3f7; text-shadow:0 0 18px #4de8f0; }
.holo-trilha button.cordas{ border-color:rgba(183,148,255,0.5); } .holo-trilha button.cordas b{ color:#d7c4ff; text-shadow:0 0 18px #b794ff; }
.holo-trilha button.batida{ background:linear-gradient(160deg, rgba(160,240,255,0.55), rgba(40,120,140,0.4)); box-shadow:0 0 60px rgba(77,232,240,0.8), inset 0 0 40px rgba(255,255,255,0.4); transform:rotateX(14deg) scale(1.04); }
@media (max-width: 900px){
  .holo-piano, .holo-bateria, .holo-harpa, .holo-teremim, .holo-trilha{ width:calc(100% - 24px); }
  .holo-piano{ bottom:170px; height:150px; }
  .holo-trilha{ grid-template-columns:repeat(2, 1fr); top:110px; bottom:180px; }
}
`;

export function criarMusica({ raiz, aoEvento }) {
  if (!document.getElementById('holo-musica-estilo')) {
    const estilo = document.createElement('style');
    estilo.id = 'holo-musica-estilo';
    estilo.textContent = CSS;
    document.head.append(estilo);
  }
  const estado = { instrumento: 'piano', notas: 0, ultima: '—', silencioDesde: 0, pontas: {}, afinado: true, teremim: null, ativo: false };

  // ---------- áudio ----------
  let ac = null;
  let mestre = null;
  let envioReverb = null;
  let analisador = null;
  let ruidoBuf = null;
  const cordasHarpa = {};
  function audio() {
    if (!ac) {
      ac = new AudioContext({ latencyHint: 'interactive' });
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 5;
      mestre = ac.createGain();
      mestre.gain.value = 0.75;
      const reverb = ac.createConvolver();
      const n = ac.sampleRate * 3;
      const impulso = ac.createBuffer(2, n, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = impulso.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
      }
      reverb.buffer = impulso;
      envioReverb = ac.createGain();
      envioReverb.gain.value = 0.42;
      analisador = ac.createAnalyser();
      analisador.fftSize = 2048;
      mestre.connect(comp);
      envioReverb.connect(reverb);
      reverb.connect(comp);
      comp.connect(analisador);
      analisador.connect(ac.destination);
      ruidoBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const r = ruidoBuf.getChannelData(0);
      for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  const saida = (no, reverb = 0.4) => {
    no.connect(mestre);
    const g = ac.createGain();
    g.gain.value = reverb;
    no.connect(g);
    g.connect(envioReverb);
  };
  const envelope = (g, t, pico, ataque, fim) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pico, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + fim);
  };
  const ruido = (t, dur, filtro, freq, q = 1) => {
    const s = ac.createBufferSource();
    s.buffer = ruidoBuf;
    const f = ac.createBiquadFilter();
    f.type = filtro;
    f.frequency.value = freq;
    f.Q.value = q;
    s.connect(f);
    s.start(t);
    s.stop(t + dur);
    return f;
  };

  function piano(midi, vel = 0.8) {
    audio();
    const t = ac.currentTime;
    const f0 = freqDe(midi);
    const g = ac.createGain();
    const dur = 3.2 * Math.pow(440 / f0, 0.35);
    envelope(g, t, 0.28 * vel, 0.004, dur);
    const brilhoF = ac.createBiquadFilter();
    brilhoF.type = 'lowpass';
    brilhoF.frequency.setValueAtTime(Math.min(16000, f0 * 12), t);
    brilhoF.frequency.exponentialRampToValueAtTime(Math.max(400, f0 * 2.5), t + 0.8);
    [[1, 1], [2, 0.42], [3, 0.2], [4, 0.1], [5, 0.05]].forEach(([n, amp]) => {
      const o = ac.createOscillator();
      o.frequency.value = f0 * n * (1 + n * n * 0.0004);
      o.detune.value = (Math.random() - 0.5) * 4;
      const ga = ac.createGain();
      ga.gain.value = amp;
      o.connect(ga);
      ga.connect(brilhoF);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
    brilhoF.connect(g);
    saida(g, 0.35);
  }

  // corda dedilhada (Karplus-Strong), calculada uma vez por nota
  function corda(midi) {
    if (cordasHarpa[midi]) return cordasHarpa[midi];
    const sr = ac.sampleRate;
    const n = Math.round(sr / freqDe(midi));
    const total = Math.round(sr * 3);
    const buf = ac.createBuffer(1, total, sr);
    const d = buf.getChannelData(0);
    const anel = new Float32Array(n).map(() => Math.random() * 2 - 1);
    let k = 0;
    for (let i = 0; i < total; i++) {
      const a = anel[k];
      const b = anel[(k + 1) % n];
      anel[k] = (a + b) * 0.4985;
      d[i] = a;
      k = (k + 1) % n;
    }
    cordasHarpa[midi] = buf;
    return buf;
  }
  function harpa(midi, vel = 0.8) {
    audio();
    const t = ac.currentTime;
    const s = ac.createBufferSource();
    s.buffer = corda(midi);
    const g = ac.createGain();
    g.gain.value = 0.45 * vel;
    s.connect(g);
    // um brilho de laser por cima da corda
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = freqDe(midi + 12);
    const go = ac.createGain();
    envelope(go, t, 0.05 * vel, 0.01, 1.4);
    o.connect(go);
    o.start(t);
    o.stop(t + 1.5);
    saida(g, 0.55);
    saida(go, 0.7);
    s.start(t);
  }

  function bateria(id, vel = 0.8) {
    audio();
    const t = ac.currentTime;
    const g = ac.createGain();
    saida(g, id === 'prato' || id === 'conducao' ? 0.35 : 0.18);
    const tom = (f1, f2, dur, amp) => {
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.5);
      const go = ac.createGain();
      envelope(go, t, amp * vel, 0.002, dur);
      o.connect(go);
      go.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    const chiado = (dur, tipo, freq, amp, q) => {
      const f = ruido(t, dur + 0.05, tipo, freq, q);
      const gn = ac.createGain();
      envelope(gn, t, amp * vel, 0.002, dur);
      f.connect(gn);
      gn.connect(g);
    };
    g.gain.value = 1;
    if (id === 'bumbo') { tom(160, 42, 0.55, 1.1); chiado(0.03, 'lowpass', 2500, 0.3, 1); }
    if (id === 'caixa') { tom(210, 160, 0.16, 0.45); chiado(0.22, 'highpass', 1400, 0.6, 0.7); }
    if (id === 'chimbal') chiado(0.07, 'highpass', 7500, 0.45, 0.8);
    if (id === 'tom1') tom(240, 150, 0.4, 0.75);
    if (id === 'tom2') tom(180, 110, 0.5, 0.8);
    if (id === 'surdo') tom(120, 70, 0.7, 0.9);
    if (id === 'prato') chiado(1.8, 'bandpass', 6500, 0.55, 0.4);
    if (id === 'conducao') { chiado(1.1, 'highpass', 5200, 0.3, 0.6); tom(2800, 2700, 0.9, 0.05); }
  }

  function trilha(id, vel = 1) {
    audio();
    const t = ac.currentTime;
    const p = TRILHA.find((x) => x.id === id);
    if (id === 'braam') {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(180, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
      f.frequency.exponentialRampToValueAtTime(500, t + 3);
      const forma = ac.createWaveShaper();
      const curva = new Float32Array(256).map((_, i) => Math.tanh((i / 128 - 1) * 2.2));
      forma.curve = curva;
      const g = ac.createGain();
      envelope(g, t, 0.5 * vel, 0.06, 4);
      [55, 82.41, 110, 220].forEach((fr) => [-8, 8].forEach((cents) => {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = cents;
        o.connect(f);
        o.start(t);
        o.stop(t + 4.1);
      }));
      f.connect(forma);
      forma.connect(g);
      saida(g, 0.6);
    } else if (id === 'impacto' || id === 'timpano') {
      const g = ac.createGain();
      saida(g, id === 'impacto' ? 0.85 : 0.5);
      const o = ac.createOscillator();
      const [f1, f2, dur] = id === 'impacto' ? [70, 26, 3] : [98, 86, 1.8];
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.6);
      const go = ac.createGain();
      envelope(go, t, 1.1 * vel, 0.004, dur);
      o.connect(go);
      go.connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);
      const f = ruido(t, 1.2, 'lowpass', id === 'impacto' ? 1100 : 600, 0.8);
      const gn = ac.createGain();
      envelope(gn, t, 0.6 * vel, 0.003, id === 'impacto' ? 1.1 : 0.5);
      f.connect(gn);
      gn.connect(g);
    } else if (id === 'subida') {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.25);
      const f = ruido(t, 3.3, 'bandpass', 300, 2.5);
      f.frequency.exponentialRampToValueAtTime(7000, t + 3);
      f.connect(g);
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(880, t + 3);
      const go = ac.createGain();
      go.gain.value = 0.12;
      o.connect(go);
      go.connect(g);
      o.start(t);
      o.stop(t + 3.3);
      saida(g, 0.6);
    } else if (p?.acorde) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1900;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.7);
      g.gain.setValueAtTime(0.22 * vel, t + 2.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
      [...p.acorde, p.acorde[0] - 12].forEach((midi) => [-7, 0, 7].forEach((cents) => {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freqDe(midi);
        o.detune.value = cents + (Math.random() - 0.5) * 3;
        const lfo = ac.createOscillator();
        lfo.frequency.value = 4.8 + Math.random();
        const prof = ac.createGain();
        prof.gain.value = 3;
        lfo.connect(prof);
        prof.connect(o.detune);
        o.connect(f);
        o.start(t);
        lfo.start(t);
        o.stop(t + 5.1);
        lfo.stop(t + 5.1);
      }));
      f.connect(g);
      saida(g, 0.6);
    }
  }

  // teremim: um oscilador contínuo com vibrato, sempre ligado enquanto o instrumento está na tela
  function ligarTeremim() {
    audio();
    if (estado.teremim) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = 440;
    const o2 = ac.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = 880;
    const g2 = ac.createGain();
    g2.gain.value = 0.18;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 5.6;
    const prof = ac.createGain();
    prof.gain.value = 3.5;
    lfo.connect(prof);
    prof.connect(o.frequency);
    prof.connect(o2.frequency);
    const filtro = ac.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 2400;
    const vol = ac.createGain();
    vol.gain.value = 0.0001;
    o.connect(filtro);
    o2.connect(g2);
    g2.connect(filtro);
    filtro.connect(vol);
    saida(vol, 0.5);
    [o, o2, lfo].forEach((x) => x.start(t));
    estado.teremim = { o, o2, vol, freq: 440 };
  }
  function desligarTeremim() {
    if (!estado.teremim) return;
    const { o, o2, vol } = estado.teremim;
    const t = ac.currentTime;
    vol.gain.setTargetAtTime(0.0001, t, 0.08);
    [o, o2].forEach((x) => x.stop(t + 0.5));
    estado.teremim = null;
  }

  // ---------- telas ----------
  const lista = document.createElement('aside');
  lista.className = 'holo-lado holo-esq holo-musica';
  lista.hidden = true;
  lista.innerHTML = `<section class="holo-caixa"><h2>INSTRUMENTOS</h2><div class="holo-musica-lista" data-m="lista"></div><p class="holo-desc" data-m="dica"></p>
    <div class="holo-acoes" data-m="afinar" hidden><button class="holo-btn" type="button" data-mira data-m="afinado">AFINADO · LIGADO</button></div></section>`;
  const palco = document.createElement('div');
  palco.className = 'holo-palco';
  palco.hidden = true;
  const notaGrande = document.createElement('div');
  notaGrande.className = 'holo-nota-grande';
  raiz.append(lista, palco);
  const m = {};
  for (const x of lista.querySelectorAll('[data-m]')) m[x.dataset.m] = x;
  m.lista.replaceChildren(...Object.entries(INSTRUMENTOS).map(([chave, inst]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mira = '';
    b.dataset.instrumento = chave;
    const icone = document.createElement('b');
    icone.textContent = inst.icone;
    const nome = document.createElement('span');
    nome.textContent = inst.nome;
    b.append(icone, nome);
    b.addEventListener('click', () => definir(chave));
    return b;
  }));
  m.afinado.addEventListener('click', () => {
    estado.afinado = !estado.afinado;
    m.afinado.textContent = `AFINADO · ${estado.afinado ? 'LIGADO' : 'DESLIGADO'}`;
  });

  function faisca(x, y, cor = '#4de8f0') {
    const f = document.createElement('span');
    f.className = 'holo-faisca';
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    f.style.setProperty('--cor', cor);
    palco.append(f);
    setTimeout(() => f.remove(), 720);
  }
  function mostrarNota(texto) {
    notaGrande.textContent = texto;
    notaGrande.classList.remove('mostra');
    void notaGrande.offsetWidth;
    notaGrande.classList.add('mostra');
  }
  function contar(texto, instrumento) {
    const agora = performance.now();
    if (agora - estado.silencioDesde > 10000) aoEvento?.(`começou a tocar ${INSTRUMENTOS[instrumento].nome.toLowerCase()} no laboratório`);
    estado.silencioDesde = agora;
    estado.notas++;
    estado.ultima = texto;
  }
  const centroDe = (el) => {
    const r = el.getBoundingClientRect();
    const b = raiz.getBoundingClientRect();
    return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2];
  };

  function tocarTecla(el, vel) {
    const midi = Number(el.dataset.nota);
    piano(midi, vel);
    el.classList.remove('tocando');
    void el.offsetWidth;
    el.classList.add('tocando');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('tocando'), 320);
    mostrarNota(nomeDe(midi));
    contar(nomeDe(midi), 'piano');
  }
  function baterPeca(el, vel) {
    bateria(el.dataset.peca, vel);
    el.classList.add('batida');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('batida'), 140);
    faisca(...centroDe(el), el.classList.contains('prato') || el.classList.contains('conducao') || el.classList.contains('chimbal') ? '#ffd89a' : '#4de8f0');
    contar(el.dataset.nome, 'bateria');
  }
  function dedilhar(i, vel, y) {
    const el = palco.querySelectorAll('.holo-feixe')[i];
    if (!el) return;
    harpa(HARPA[i], vel);
    el.classList.remove('vibra');
    void el.offsetWidth;
    el.classList.add('vibra');
    const [x] = centroDe(el);
    faisca(x, y ?? centroDe(el)[1], el.style.getPropertyValue('--cor'));
    mostrarNota(nomeDe(HARPA[i]));
    contar(nomeDe(HARPA[i]), 'harpa');
  }
  function dispararTrilha(el, vel) {
    trilha(el.dataset.trilha, vel);
    el.classList.add('batida');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('batida'), 220);
    faisca(...centroDe(el), el.classList.contains('cordas') ? '#b794ff' : '#4de8f0');
    mostrarNota(el.dataset.nome);
    contar(el.dataset.nome, 'trilha');
  }

  function montarPalco() {
    desligarTeremim();
    palco.replaceChildren(notaGrande);
    const inst = estado.instrumento;
    m.dica.textContent = INSTRUMENTOS[inst].dica;
    m.afinar.hidden = inst !== 'teremim';
    for (const b of m.lista.children) b.classList.toggle('ativo', b.dataset.instrumento === inst);
    if (inst === 'piano') {
      const piano = document.createElement('div');
      piano.className = 'holo-piano';
      const brancas = document.createElement('div');
      brancas.className = 'brancas';
      const notasBrancas = [];
      for (let midi = 60; midi < 84; midi++) if (![1, 3, 6, 8, 10].includes(midi % 12)) notasBrancas.push(midi);
      notasBrancas.forEach((midi) => {
        const t = document.createElement('div');
        t.className = 'tecla';
        t.dataset.nota = midi;
        const rotulo = document.createElement('span');
        rotulo.textContent = nomeDe(midi);
        t.append(rotulo);
        brancas.append(t);
      });
      piano.append(brancas);
      const largura = 100 / notasBrancas.length;
      notasBrancas.forEach((midi, i) => {
        if (![0, 2, 5, 7, 9].includes(midi % 12) || midi + 1 >= 84) return;
        const p = document.createElement('div');
        p.className = 'preta';
        p.dataset.nota = midi + 1;
        p.style.left = `${(i + 0.68) * largura}%`;
        p.style.width = `${largura * 0.62}%`;
        piano.append(p);
      });
      piano.addEventListener('pointerdown', (e) => {
        const t = e.target.closest('[data-nota]');
        if (t) tocarTecla(t, 0.8);
      });
      piano.addEventListener('pointerover', (e) => {
        const t = e.target.closest('[data-nota]');
        if (t && e.buttons) tocarTecla(t, 0.7);
      });
      palco.append(piano);
    }
    if (inst === 'bateria') {
      const kit = document.createElement('div');
      kit.className = 'holo-bateria';
      for (const p of PECAS) {
        const el = document.createElement('div');
        el.className = `holo-peca ${p.id}`;
        el.dataset.peca = p.id;
        el.dataset.nome = p.nome;
        el.style.left = `${p.x * 100}%`;
        el.style.top = `${p.y * 100}%`;
        el.style.width = el.style.height = `calc(${p.r * 2} * min(1000px, max(300px, 100vw - 560px)))`;
        const nome = document.createElement('span');
        nome.textContent = p.nome;
        el.append(nome);
        el.addEventListener('pointerdown', () => baterPeca(el, 0.85));
        kit.append(el);
      }
      palco.append(kit);
    }
    if (inst === 'harpa') {
      const harpaEl = document.createElement('div');
      harpaEl.className = 'holo-harpa';
      const moldura = document.createElement('div');
      moldura.className = 'moldura';
      harpaEl.append(moldura);
      const cores = ['#4de8f0', '#5dfca0', '#b794ff', '#ffa24c'];
      HARPA.forEach((midi, i) => {
        const f = document.createElement('div');
        f.className = 'holo-feixe';
        f.style.left = `${(i + 0.5) * (100 / HARPA.length)}%`;
        f.style.setProperty('--cor', cores[i % cores.length]);
        const rotulo = document.createElement('span');
        rotulo.textContent = nomeDe(midi);
        f.append(rotulo);
        harpaEl.append(f);
      });
      let ultimoX = null;
      harpaEl.addEventListener('pointerdown', (e) => {
        const r = harpaEl.getBoundingClientRect();
        const i = Math.floor(((e.clientX - r.left) / r.width) * HARPA.length);
        if (i >= 0 && i < HARPA.length) dedilhar(i, 0.8, e.clientY - raiz.getBoundingClientRect().top);
        ultimoX = e.clientX;
      });
      harpaEl.addEventListener('pointermove', (e) => {
        if (!e.buttons || ultimoX === null) return;
        cruzar(ultimoX - raiz.getBoundingClientRect().left, e.clientX - raiz.getBoundingClientRect().left, e.clientY - raiz.getBoundingClientRect().top, 0.7);
        ultimoX = e.clientX;
      });
      palco.append(harpaEl);
    }
    if (inst === 'teremim') {
      const el = document.createElement('div');
      el.className = 'holo-teremim';
      for (let midi = 48; midi <= 84; midi++) {
        if (![0, 4, 7].includes(midi % 12)) continue;
        const guia = document.createElement('div');
        guia.className = `guia ${midi % 12 === 0 ? 'do' : ''}`;
        guia.style.top = `${(1 - (midi - 48) / 36) * 100}%`;
        const rotulo = document.createElement('span');
        rotulo.textContent = nomeDe(midi);
        guia.append(rotulo);
        el.append(guia);
      }
      el.insertAdjacentHTML('beforeend', '<div class="antena"></div><div class="laco"></div><canvas width="800" height="200"></canvas><div class="marca"></div><div class="leitura">—</div>');
      el.addEventListener('pointermove', (e) => {
        if (!e.buttons) return;
        const r = el.getBoundingClientRect();
        teremimEm(1 - (e.clientY - r.top) / r.height, 0.6);
      });
      el.addEventListener('pointerup', () => teremimEm(null));
      el.addEventListener('pointerleave', () => teremimEm(null));
      palco.append(el);
      ligarTeremim();
    }
    if (inst === 'trilha') {
      const grade = document.createElement('div');
      grade.className = 'holo-trilha';
      for (const p of TRILHA) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.trilha = p.id;
        b.dataset.nome = p.nome;
        if (p.acorde) b.className = 'cordas';
        const icone = document.createElement('b');
        icone.textContent = p.icone;
        const nome = document.createElement('span');
        nome.textContent = p.nome;
        b.append(icone, nome);
        b.addEventListener('pointerdown', () => dispararTrilha(b, 1));
        grade.append(b);
      }
      palco.append(grade);
    }
  }

  // passou de um lado para o outro de um feixe da harpa?
  function cruzar(x0, x1, y, vel) {
    const el = palco.querySelector('.holo-harpa');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = raiz.getBoundingClientRect();
    const esq = r.left - b.left;
    const topo = r.top - b.top;
    if (y < topo || y > topo + r.height) return;
    HARPA.forEach((_, i) => {
      const fx = esq + (i + 0.5) * (r.width / HARPA.length);
      if ((x0 - fx) * (x1 - fx) < 0) dedilhar(i, vel, y);
    });
  }

  function teremimEm(nivel, volume = 0.6) {
    const tm = estado.teremim;
    const el = palco.querySelector('.holo-teremim');
    if (!tm || !el) return;
    const t = ac.currentTime;
    if (nivel === null) {
      tm.vol.gain.setTargetAtTime(0.0001, t, 0.12);
      el.querySelector('.marca').style.opacity = 0;
      return;
    }
    let midi = 48 + Math.max(0, Math.min(1, nivel)) * 36;
    if (estado.afinado) midi = Math.round(midi);
    const freq = freqDe(midi);
    tm.o.frequency.setTargetAtTime(freq, t, 0.035);
    tm.o2.frequency.setTargetAtTime(freq * 2, t, 0.035);
    tm.vol.gain.setTargetAtTime(Math.max(0.0001, volume * 0.5), t, 0.06);
    tm.freq = freq;
    const marca = el.querySelector('.marca');
    marca.style.opacity = 1;
    marca.style.top = `${(1 - (midi - 48) / 36) * 100}%`;
    const nome = nomeDe(Math.round(midi));
    el.querySelector('.leitura').textContent = `${nome} · ${Math.round(freq)} Hz`;
    if (nome !== estado.ultima) contar(nome, 'teremim');
  }

  // osciloscópio do teremim
  const onda = new Uint8Array(2048);
  function desenharOnda() {
    const canvas = palco.querySelector('.holo-teremim canvas');
    if (!canvas || !analisador) return;
    analisador.getByteTimeDomainData(onda);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = '#4de8f0';
    g.shadowColor = '#4de8f0';
    g.shadowBlur = 12;
    g.lineWidth = 2.5;
    g.beginPath();
    for (let i = 0; i < 800; i++) {
      const y = (onda[Math.floor((i / 800) * 1024)] / 255) * canvas.height;
      if (i) g.lineTo(i, y);
      else g.moveTo(i, y);
    }
    g.stroke();
  }

  function definir(chave) {
    if (!INSTRUMENTOS[chave]) return `Instrumentos: ${Object.values(INSTRUMENTOS).map((i) => i.nome.toLowerCase()).join(', ')}.`;
    estado.instrumento = chave;
    estado.pontas = {};
    if (estado.ativo) {
      audio();
      montarPalco();
    }
    return `${INSTRUMENTOS[chave].nome} pronto para tocar.`;
  }

  // pontas: [{ id, x, y, vx, vy }] em pixels da tela; maos: [{ lado, x, y }] do centro de cada mão
  function entrada(pontas, maos) {
    if (!estado.ativo) return;
    const inst = estado.instrumento;
    const caixa = raiz.getBoundingClientRect();
    const sob = (p) => document.elementFromPoint(caixa.left + p.x, caixa.top + p.y);
    const vistos = new Set();
    for (const p of pontas) {
      vistos.add(p.id);
      const st = estado.pontas[p.id] ||= { alvo: null, armado: true, x: p.x };
      if (inst === 'piano') {
        const tecla = sob(p)?.closest?.('.holo-piano [data-nota]') || null;
        if (tecla && tecla !== st.alvo && p.vy > 30) tocarTecla(tecla, Math.min(1, 0.45 + p.vy / 1500));
        else if (tecla && tecla === st.alvo) {
          if (p.vy < -70) st.armado = true;
          else if (st.armado && p.vy > 160) {
            tocarTecla(tecla, Math.min(1, 0.45 + p.vy / 1500));
            st.armado = false;
          }
        }
        if (tecla !== st.alvo) st.armado = false;
        st.alvo = tecla;
      } else if (inst === 'bateria' || inst === 'trilha') {
        const alvo = sob(p)?.closest?.(inst === 'bateria' ? '.holo-peca' : '.holo-trilha button') || null;
        if (alvo && st.armado && p.vy > 380) {
          // uma batida por peça a cada 120 ms, mesmo com vários dedos juntos
          if (!alvo._ultima || performance.now() - alvo._ultima > 120) {
            alvo._ultima = performance.now();
            const vel = Math.min(1, 0.35 + p.vy / 2200);
            if (inst === 'bateria') baterPeca(alvo, vel);
            else dispararTrilha(alvo, vel);
          }
          st.armado = false;
        }
        if (p.vy < 60) st.armado = true;
      } else if (inst === 'harpa') {
        if (Math.abs(p.x - st.x) > 2) cruzar(st.x, p.x, p.y, Math.min(1, 0.45 + Math.abs(p.vx) / 2500));
      }
      st.x = p.x;
    }
    for (const id of Object.keys(estado.pontas)) if (!vistos.has(id)) delete estado.pontas[id];
    if (inst === 'teremim') {
      const el = palco.querySelector('.holo-teremim');
      if (!el || !maos.length) {
        teremimEm(null);
      } else {
        const r = el.getBoundingClientRect();
        const topo = r.top - caixa.top;
        const nivel = (m0) => 1 - (m0.y - topo) / r.height;
        const direita = maos.find((x) => x.lado === 'direita') || maos[0];
        const esquerda = maos.find((x) => x !== direita);
        teremimEm(nivel(direita), esquerda ? Math.max(0.05, Math.min(1, nivel(esquerda))) : 0.6);
      }
    }
    desenharOnda();
  }

  return {
    lista,
    palco,
    ativar(sim) {
      estado.ativo = sim;
      lista.hidden = !sim;
      palco.hidden = !sim;
      if (sim) montarPalco();
      else desligarTeremim();
    },
    entrada,
    definir,
    // nível do som agora (0 a 1), para a mesa pulsar junto
    nivel() {
      if (!analisador) return 0;
      analisador.getByteTimeDomainData(onda);
      let pico = 0;
      for (let i = 0; i < onda.length; i += 8) pico = Math.max(pico, Math.abs(onda[i] - 128));
      return pico / 128;
    },
    instrumento: () => estado.instrumento,
    resumo: () => `${INSTRUMENTOS[estado.instrumento].nome.toLowerCase()} na tela, ${estado.notas} notas tocadas, última: ${estado.ultima}`,
    dados: () => [['Instrumento', INSTRUMENTOS[estado.instrumento].nome], ['Notas tocadas', String(estado.notas)], ['Última', estado.ultima], ['Som', ac ? 'SINTETIZADO AO VIVO' : 'TOQUE PARA LIGAR']],
  };
}
