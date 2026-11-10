/*
 * holo-cad-ui.js — a tela da oficina (holo-cad.js), no jeito do Autodesk Inventor:
 *
 *   faixa de abas no alto (ESBOÇO · MODELO 3D · MONTAGEM · DESENHO · INSPEÇÃO) com as ferramentas,
 *   árvore de recursos à esquerda (com o "Fim da peça" arrastável), propriedades do recurso à
 *   direita, barra de status embaixo (material, massa, centro de gravidade) e o cubo de vistas.
 *
 * Tudo é clicável com o mouse e com o cursor da mão (data-mira). Também desenha o menu radial que
 * abre na palma da mão esquerda, a régua de dedos, os rótulos presos na peça e a folha A4.
 */
import * as THREE from 'three';
import { legendaCalor } from './holo-cad-extra.js';

const CSS = `
.of-ui[hidden]{ display:none; }
.of-ui{ position:absolute; inset:0; z-index:2; pointer-events:none; font-family:'Share Tech Mono',monospace; color:#a9c6cd; }
.of-ui > *{ pointer-events:auto; }
.holo[data-modo="oficina"] .holo-titulo, .holo[data-modo="oficina"] .holo-dir{ display:none; }
.holo[data-modo="oficina"] .holo-camera{ width:156px; bottom:40px; }
.holo[data-modo="oficina"] .holo-guia{ bottom:38px; max-width:calc(100% - 640px); }
.holo[data-modo="oficina"] .holo-guia span{ padding:5px 9px; font-size:9.5px; }
.of-painel{ background:linear-gradient(160deg, rgba(14,34,48,0.8), rgba(6,18,26,0.66)); border:1px solid rgba(77,232,240,0.2); border-radius:4px; backdrop-filter:blur(8px); }
.of-faixa{ position:absolute; top:82px; left:22px; right:22px; display:flex; flex-direction:column; }
.of-abas{ display:flex; gap:2px; padding:6px 8px 0; align-items:flex-end; }
.of-abas button{ font-family:inherit; font-size:10.5px; letter-spacing:2px; color:#a9c6cd; background:transparent; border:1px solid transparent; border-bottom:0; border-radius:4px 4px 0 0; padding:6px 14px; cursor:pointer; }
.of-abas button:hover, .of-abas button.mirado{ color:#e9f7f9; background:rgba(77,232,240,0.1); }
.of-abas button.ativa{ color:#01060a; background:#4de8f0; box-shadow:0 0 14px rgba(77,232,240,0.45); }
.of-abas .of-doc{ margin-left:auto; padding:0 6px 6px; font-size:10px; letter-spacing:1.5px; color:#5f8791; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:40%; }
.of-abas .of-doc b{ color:#e9f7f9; font-weight:400; }
.of-abas .of-menu-arvore{ display:none; }
.of-ferr{ display:flex; gap:5px; padding:8px; flex-wrap:nowrap; overflow-x:auto; background:rgba(77,232,240,0.05); border-top:1px solid rgba(77,232,240,0.18); scrollbar-width:thin; }
.of-ferr button{ flex:0 0 auto; min-width:62px; display:grid; justify-items:center; gap:2px; padding:5px 5px 4px; font-family:inherit; font-size:8.5px; letter-spacing:.8px; color:#cfe7ec;
  background:rgba(2,10,16,0.55); border:1px solid rgba(77,232,240,0.16); border-radius:4px; cursor:pointer; transition:all .18s; white-space:nowrap; }
.of-ferr button i{ font-style:normal; font-size:16px; line-height:18px; color:#8ff3f7; font-family:'Rajdhani',sans-serif; font-weight:700; }
.of-ferr button.menos i{ color:#ffa24c; }
.of-ferr button:hover, .of-ferr button.mirado{ border-color:rgba(77,232,240,0.6); color:#fff; background:rgba(77,232,240,0.12); }
.of-ferr button.ativo{ border-color:#4de8f0; color:#fff; box-shadow:0 0 14px rgba(77,232,240,0.35) inset, 0 0 10px rgba(77,232,240,0.25); }
.of-ferr button.ok i{ color:#5dfca0; }
.of-ferr .sep{ flex:0 0 1px; min-width:1px; padding:0; border:0; background:rgba(77,232,240,0.2); margin:2px 3px; }
.of-arvore{ position:absolute; left:22px; top:190px; bottom:40px; width:236px; overflow-y:auto; padding:10px 8px; scrollbar-width:thin; scrollbar-color:rgba(77,232,240,0.35) transparent; }
.of-arvore h4, .of-props h4{ margin:0 0 8px; font-family:'Orbitron',sans-serif; font-size:10px; letter-spacing:2.5px; color:#8ff3f7; font-weight:700; }
.of-arvore h4 small{ display:block; margin-top:3px; font-family:'Share Tech Mono',monospace; font-size:9.5px; letter-spacing:1px; color:#5f8791; font-weight:400; }
.of-no{ display:grid; grid-template-columns:18px 1fr auto; gap:4px; align-items:center; padding:4px 5px; border-radius:3px; font-size:10.5px; line-height:1.25; cursor:pointer; border:1px solid transparent; }
.of-no:hover, .of-no.mirado{ background:rgba(77,232,240,0.08); }
.of-no .ic{ color:#8ff3f7; text-align:center; }
.of-no .ic.menos{ color:#ffa24c; }
.of-no .nm{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#e9f7f9; }
.of-no .nm small{ display:block; color:#5f8791; font-size:9.5px; }
.of-no.sel{ background:rgba(255,162,76,0.14); border-color:rgba(255,162,76,0.55); }
.of-no.sup .nm{ color:#5f8791; text-decoration:line-through; }
.of-no.apos{ opacity:.38; }
.of-no.erro .nm, .of-no.erro .ic{ color:#ff6b6b; }
.of-no .bt{ display:flex; gap:2px; opacity:0; transition:opacity .15s; }
.of-no:hover .bt, .of-no.sel .bt, .of-no.mirado .bt{ opacity:1; }
.of-no .bt button{ width:20px; height:20px; padding:0; font-size:11px; color:#a9c6cd; background:rgba(2,10,16,0.7); border:1px solid rgba(77,232,240,0.2); border-radius:3px; cursor:pointer; }
.of-no .bt button:hover, .of-no .bt button.mirado{ color:#fff; border-color:#4de8f0; }
.of-no.n1{ padding-left:14px; } .of-no.n2{ padding-left:26px; color:#5f8791; }
.of-fim{ display:flex; align-items:center; gap:4px; margin:4px 0; padding:4px 5px; border-top:2px solid #ffa24c; color:#ffa24c; font-size:10px; letter-spacing:1.5px; cursor:grab; user-select:none; }
.of-fim span{ flex:1; }
.of-fim button{ width:22px; height:20px; padding:0; color:#ffa24c; background:rgba(2,10,16,0.7); border:1px solid rgba(255,162,76,0.45); border-radius:3px; cursor:pointer; }
.of-fim button.mirado, .of-fim button:hover{ background:rgba(255,162,76,0.2); }
.of-fim.arrastando{ cursor:grabbing; opacity:.85; }
.of-props{ position:absolute; right:22px; top:190px; width:270px; max-height:calc(100% - 190px - 172px); overflow-y:auto; padding:10px 12px; display:flex; flex-direction:column; gap:7px;
  scrollbar-width:thin; scrollbar-color:rgba(77,232,240,0.35) transparent; }
.of-props p{ margin:0; font-family:'Rajdhani',sans-serif; font-size:13.5px; line-height:1.3; color:#a9c6cd; }
.of-props p.dica{ color:#8ff3f7; }
.of-props h5{ margin:4px 0 0; font-size:9.5px; letter-spacing:2.2px; color:#5f8791; font-weight:400; }
.of-campo{ display:grid; grid-template-columns:1fr 26px 74px 26px; gap:3px; align-items:center; font-size:10px; letter-spacing:.8px; }
.of-campo > span{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.of-campo button{ height:26px; padding:0; color:#8ff3f7; background:rgba(2,10,16,0.7); border:1px solid rgba(77,232,240,0.25); border-radius:3px; cursor:pointer; font-size:14px; }
.of-campo button:hover, .of-campo button.mirado{ background:rgba(77,232,240,0.16); border-color:#4de8f0; }
.of-campo input, .of-entrada{ width:100%; height:26px; box-sizing:border-box; background:rgba(0,6,10,0.75); border:1px solid rgba(77,232,240,0.3); border-radius:3px; color:#e9f7f9;
  font-family:'Share Tech Mono',monospace; font-size:11.5px; text-align:center; padding:0 3px; }
.of-campo input:focus, .of-entrada:focus{ outline:none; border-color:#ffa24c; box-shadow:0 0 10px rgba(255,162,76,0.35); }
.of-campo input.erro{ border-color:#ff6b6b; color:#ff9b9b; }
.of-campo.ativo > span{ color:#ffa24c; }
.of-campo small{ grid-column:1 / -1; color:#5f8791; font-size:9px; text-align:right; margin-top:-2px; }
.of-chips{ display:flex; flex-wrap:wrap; gap:4px; }
.of-chips button{ font-family:inherit; font-size:9.5px; letter-spacing:1px; color:#a9c6cd; background:rgba(2,10,16,0.6); border:1px solid rgba(77,232,240,0.2); border-radius:12px; padding:4px 9px; cursor:pointer; }
.of-chips button:hover, .of-chips button.mirado{ border-color:#4de8f0; color:#fff; }
.of-chips button.on{ color:#01060a; background:#4de8f0; border-color:#4de8f0; }
.of-chips button.menos.on{ background:#ffa24c; border-color:#ffa24c; }
.of-botoes{ display:flex; gap:6px; flex-wrap:wrap; margin-top:2px; }
.of-botoes button{ flex:1; min-width:70px; font-family:inherit; font-size:10px; letter-spacing:1.5px; color:#4de8f0; background:rgba(4,16,24,0.75); border:1px solid rgba(77,232,240,0.38); border-radius:3px; padding:8px 6px; cursor:pointer; }
.of-botoes button:hover, .of-botoes button.mirado{ background:rgba(77,232,240,0.14); box-shadow:0 0 14px rgba(77,232,240,0.3); }
.of-botoes button.ok{ color:#01060a; background:#5dfca0; border-color:#5dfca0; }
.of-botoes button.perigo{ color:#ff8f8f; border-color:rgba(255,107,107,0.5); }
.of-dados{ display:grid; grid-template-columns:auto 1fr; gap:4px 10px; margin:0; font-size:10.5px; }
.of-dados dt{ color:#5f8791; letter-spacing:1px; } .of-dados dd{ margin:0; text-align:right; color:#e9f7f9; }
.of-tabela{ width:100%; border-collapse:collapse; font-size:10px; }
.of-tabela th{ color:#5f8791; font-weight:400; text-align:left; padding:3px 2px; border-bottom:1px solid rgba(77,232,240,0.2); letter-spacing:1px; }
.of-tabela td{ padding:3px 2px; color:#e9f7f9; border-bottom:1px solid rgba(77,232,240,0.08); }
.of-tabela input{ width:100%; height:22px; font-size:10.5px; }
.of-tabela .valor{ text-align:right; color:#8ff3f7; }
.of-tabela .valor.erro{ color:#ff6b6b; }
.of-legenda{ height:10px; border-radius:5px; }
.of-qr{ display:grid; justify-items:center; gap:6px; }
.of-qr canvas{ width:200px; height:200px; image-rendering:pixelated; border-radius:6px; box-shadow:0 0 24px rgba(77,232,240,0.35); }
.of-qr a{ color:#8ff3f7; font-size:9.5px; word-break:break-all; }
.of-foto{ width:100%; border-radius:4px; border:1px solid rgba(77,232,240,0.3); }
.of-status{ position:absolute; left:0; right:0; bottom:0; height:30px; display:flex; align-items:center; gap:18px; padding:0 22px; background:linear-gradient(0deg, rgba(1,8,14,0.92), rgba(1,8,14,0.7));
  border-top:1px solid rgba(77,232,240,0.18); font-size:10px; letter-spacing:1.2px; color:#5f8791; white-space:nowrap; overflow:hidden; }
.of-status b{ color:#e9f7f9; font-weight:400; }
.of-status .dica{ margin-left:auto; color:#5dfca0; overflow:hidden; text-overflow:ellipsis; }
.of-status .ocupado{ color:#ffd84d; display:none; }
.of-status .ocupado.ligado{ display:inline; animation:of-pisca 1s steps(2) infinite; }
@keyframes of-pisca{ 50%{ opacity:.3; } }
.of-cubo{ position:absolute; right:318px; top:196px; width:76px; height:76px; perspective:320px; }
.of-cubo .c{ position:absolute; inset:9px; transform-style:preserve-3d; }
.of-cubo .c button{ position:absolute; inset:0; display:grid; place-items:center; font-family:inherit; font-size:8px; letter-spacing:.5px; color:#e9f7f9; background:rgba(77,232,240,0.12);
  border:1px solid rgba(143,243,247,0.55); cursor:pointer; backface-visibility:hidden; padding:0; }
.of-cubo .c button:hover, .of-cubo .c button.mirado{ background:rgba(255,162,76,0.4); }
.of-cubo .c button[data-vista="topo"]{ background:rgba(77,232,240,0.24); }
.of-cubo .casa{ position:absolute; left:-6px; top:-6px; width:22px; height:22px; padding:0; font-size:12px; color:#8ff3f7; background:rgba(2,10,16,0.75); border:1px solid rgba(77,232,240,0.35); border-radius:50%; cursor:pointer; }
.of-cubo .casa.mirado, .of-cubo .casa:hover{ background:rgba(77,232,240,0.2); }
.of-rotulos{ position:absolute; inset:0; z-index:1; pointer-events:none !important; overflow:hidden; }
.of-rotulo{ position:absolute; left:0; top:0; padding:2px 6px; font-size:10.5px; letter-spacing:1px; color:#01060a; background:#ffa24c; border-radius:2px; white-space:nowrap;
  box-shadow:0 0 12px rgba(255,162,76,0.5); will-change:transform; }
.of-rotulo.novo{ background:#5dfca0; box-shadow:0 0 12px rgba(93,252,160,0.5); }
.of-rotulo.esboco{ background:rgba(2,12,18,0.82); color:#e9f7f9; border:1px solid rgba(143,243,247,0.6); box-shadow:none; font-size:9.5px; }
.of-rotulo.sel{ background:#ffa24c; }
.of-rotulo.medida{ background:#5dfca0; }
.of-rotulo.grande{ font-size:15px; padding:4px 10px; }
.of-rotulo.cg{ background:#ffd84d; }
.of-rotulo.calor{ background:#ff2a1f; color:#fff; }
.of-toast{ position:absolute; left:50%; top:202px; transform:translateX(-50%); z-index:4; pointer-events:none !important; font-size:11.5px; letter-spacing:2.5px; color:#5dfca0; text-shadow:0 0 12px #5dfca0;
  opacity:0; white-space:nowrap; background:rgba(1,8,14,0.6); padding:6px 14px; border-radius:16px; }
.of-toast.mostra{ animation:of-toast 2.6s ease; }
@keyframes of-toast{ 0%{ opacity:0; transform:translate(-50%, 8px); } 10%, 78%{ opacity:1; transform:translate(-50%, 0); } 100%{ opacity:0; } }
.of-radial{ position:absolute; left:0; top:0; width:0; height:0; z-index:6; }
.of-radial[hidden]{ display:none; }
.of-radial::before{ content:""; position:absolute; left:-120px; top:-120px; width:240px; height:240px; border-radius:50%; border:1px dashed rgba(77,232,240,0.35);
  background:radial-gradient(circle, rgba(77,232,240,0.12), transparent 70%); animation:of-gira 12s linear infinite; }
@keyframes of-gira{ to{ transform:rotate(360deg); } }
.of-radial button{ position:absolute; width:64px; height:64px; margin:-32px 0 0 -32px; border-radius:50%; display:grid; place-items:center; align-content:center; gap:1px; font-family:inherit;
  font-size:7.5px; letter-spacing:.5px; color:#e9f7f9; background:rgba(2,14,22,0.85); border:1px solid rgba(77,232,240,0.5); cursor:pointer; box-shadow:0 0 14px rgba(77,232,240,0.25);
  animation:of-abre .35s cubic-bezier(.2,.9,.3,1.3) both; }
.of-radial button i{ font-style:normal; font-size:17px; color:#8ff3f7; font-family:'Rajdhani',sans-serif; font-weight:700; }
.of-radial button.mirado{ background:rgba(255,162,76,0.35); border-color:#ffa24c; transform:scale(1.12); }
.of-radial button.ativo{ border-color:#5dfca0; }
@keyframes of-abre{ from{ opacity:0; transform:scale(.3); } }
.of-regua{ position:absolute; inset:0; z-index:5; pointer-events:none !important; }
.of-regua[hidden]{ display:none; }
.of-regua svg{ position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.of-regua b{ position:absolute; left:0; top:0; font-weight:400; font-size:20px; letter-spacing:2px; color:#01060a; background:#5dfca0; padding:3px 10px; border-radius:3px; box-shadow:0 0 18px rgba(93,252,160,0.6); }
.of-folha{ position:absolute; inset:0; z-index:8; display:grid; place-items:center; background:rgba(1,6,10,0.72); backdrop-filter:blur(4px); }
.of-folha[hidden]{ display:none; }
.of-folha .papel{ display:grid; gap:10px; justify-items:center; animation:of-papel .6s cubic-bezier(.2,.8,.2,1) both; }
@keyframes of-papel{ from{ opacity:0; transform:perspective(900px) rotateX(18deg) translateY(30px) scale(.92); } }
.of-folha canvas{ width:min(88vw, 1120px); height:auto; box-shadow:0 0 40px rgba(77,232,240,0.35), 0 20px 60px #000; border-radius:2px; }
.of-folha .of-botoes{ width:min(88vw, 520px); }
@media (max-width: 900px){
  .of-faixa{ top:100px; left:10px; right:10px; }
  .of-abas{ overflow-x:auto; }
  .of-abas button{ padding:5px 9px; font-size:9.5px; letter-spacing:1px; }
  .of-abas .of-doc{ display:none; }
  .of-abas .of-menu-arvore{ display:block; }
  .of-arvore{ display:none; top:200px; left:10px; bottom:auto; max-height:46vh; z-index:4; }
  .of-arvore.aberta{ display:block; }
  .of-props{ left:10px; right:10px; width:auto; top:auto; bottom:36px; max-height:34vh; }
  .of-cubo{ right:14px; top:206px; transform:scale(.8); transform-origin:top right; }
  .of-status{ font-size:9px; gap:10px; padding:0 10px; }
  .of-status .opc{ display:none; }
}
`;

const ABAS = [['esboco', 'ESBOÇO'], ['modelo', 'MODELO 3D'], ['montagem', 'MONTAGEM'], ['desenho', 'DESENHO'], ['inspecao', 'INSPEÇÃO']];
const FERRAMENTAS = {
  esboco: [
    [['linha', '╱', 'LINHA'], ['ret', '▭', 'RETÂNGULO'], ['circ', '◯', 'CÍRCULO'], ['arco', '◠', 'ARCO'], ['poli', '⬡', 'POLÍGONO'], ['livre', '✎', 'TRAÇO LIVRE']],
    [['sel_esb', '✥', 'SELECIONAR'], ['construcao', '┄', 'CONSTRUÇÃO'], ['apagar_ent', '✕', 'APAGAR', 'menos']],
    [['terminar', '✓', 'TERMINAR', 'ok']],
  ],
  modelo: [
    [['novo_esboco', '▱', 'NOVO ESBOÇO']],
    [['extrudir', '⇧', 'EXTRUDIR'], ['revolucionar', '↻', 'REVOLUCIONAR'], ['furo', '⊙', 'FURO', 'menos']],
    [['arredondar', '◜', 'ARREDONDAR'], ['chanfro', '◸', 'CHANFRO'], ['casca', '▢', 'CASCA']],
    [['padrao_ret', '⁙', 'PADRÃO RET.'], ['padrao_circ', '⁂', 'PADRÃO CIRC.'], ['espelhar', '⇋', 'ESPELHAR']],
    [['primitivas', '◇', 'PRIMITIVAS'], ['material', '◈', 'MATERIAL'], ['parametros', 'fx', 'PARÂMETROS']],
    [['selecionar', '✥', 'SELECIONAR']],
  ],
  montagem: [
    [['inserir', '⊕', 'INSERIR PEÇA'], ['nova_peca', '✚', 'NOVA PEÇA'], ['biblioteca', '⛭', 'BIBLIOTECA']],
    [['mover_comp', '✥', 'MOVER'], ['face_face', '◫', 'FACE / FACE'], ['eixo_eixo', '⊜', 'EIXO / EIXO']],
    [['explodir', '✴', 'EXPLODIR'], ['bom', '☰', 'LISTA DE MAT.']],
  ],
  desenho: [
    [['folha', '▤', 'FOLHA A4']],
    [['stl', '⇩', 'STL'], ['obj', '⇩', 'OBJ'], ['glb', '⇩', 'GLB']],
  ],
  inspecao: [
    [['medir', '↔', 'MEDIR'], ['regua', '⟷', 'RÉGUA DEDOS'], ['corte', '◧', 'CORTE']],
    [['massa', '⊕', 'MASSA E CG'], ['esforco', '≋', 'ESFORÇO', 'menos']],
    [['foto', '◉', 'PEÇA DA FOTO'], ['ra', '▣', 'CELULAR RA'], ['apresentar', '►', 'APRESENTAR']],
  ],
};
const DICAS = {
  edicao: '🤏 PUXE PARA CIMA PARA AJUSTAR · 👍 CONFIRMA · 👎 CANCELA',
  esboco: '🤏 DESENHE NO PLANO · ✎ TRAÇO LIVRE VIRA FORMA · 👍 TERMINA',
  escolher_plano: 'ESCOLHA O PLANO OU FAÇA PINÇA NUMA FACE DA PEÇA',
  furo: '🤏 PINÇA NA FACE COLOCA O FURO · ✌ TESOURA FAZ FURO PASSANTE',
  montagem: '🤏 ARRASTE · GIRE O PULSO 15° · ◫ FACE/FACE · ⊜ EIXO/EIXO',
  regua: '🤏 ABRA POLEGAR E INDICADOR · 👍 APLICA A MEDIDA',
  padrao: '✊ PUNHO NA PEÇA GIRA EM TODOS OS EIXOS · 🖐 PALMA ESQUERDA PARA CIMA ABRE O MENU · 🤏🤏 DUAS PINÇAS MEDEM',
};
const PLANO_NOME = { xz: 'TOPO (XZ)', xy: 'FRENTE (XY)', yz: 'LATERAL (YZ)', face: 'FACE DA PEÇA' };

const el = (tag, classe = '', texto = '') => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto) e.textContent = texto;
  return e;
};
const botao = (texto, aoClicar, classe = '') => {
  const b = el('button', classe, texto);
  b.type = 'button';
  b.dataset.mira = '';
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    aoClicar(ev);
  });
  return b;
};

export function criarInterface(O, raiz) {
  if (!document.getElementById('of-estilo')) {
    const s = document.createElement('style');
    s.id = 'of-estilo';
    s.textContent = CSS;
    document.head.append(s);
  }
  const { ui, acoes, N, fmt } = O;
  const caixa = el('div', 'of-ui');
  caixa.hidden = true;
  caixa.innerHTML = `
    <div class="of-faixa of-painel"><div class="of-abas"></div><div class="of-ferr"></div></div>
    <aside class="of-arvore of-painel"></aside>
    <aside class="of-props of-painel"></aside>
    <div class="of-cubo"><div class="c"></div></div>
    <div class="of-status"></div>
    <div class="of-radial" hidden></div>
    <div class="of-regua" hidden><svg><line stroke="#5dfca0" stroke-width="3" stroke-dasharray="6 4"/><circle r="7" fill="#5dfca0"/><circle r="7" fill="#5dfca0"/></svg><b></b></div>
    <div class="of-toast"></div>
    <div class="of-folha" hidden><div class="papel"></div></div>`;
  raiz.append(caixa);
  const q = (s) => caixa.querySelector(s);
  const abasEl = q('.of-abas');
  const ferrEl = q('.of-ferr');
  const arvoreEl = q('.of-arvore');
  const propsEl = q('.of-props');
  const statusEl = q('.of-status');
  const cuboEl = q('.of-cubo .c');
  const radialEl = q('.of-radial');
  const reguaEl = q('.of-regua');
  const toastEl = q('.of-toast');
  const folhaEl = q('.of-folha');
  const rotulosEl = el('div', 'of-rotulos');
  raiz.append(rotulosEl);
  rotulosEl.hidden = true;
  let rotulos = [];
  let ocupado = false;

  // ---------- cubo de vistas ----------
  const faces = [['frente', 'FRENTE', 'translateZ(29px)'], ['tras', 'TRÁS', 'rotateY(180deg) translateZ(29px)'], ['direita', 'DIREITA', 'rotateY(90deg) translateZ(29px)'],
    ['esquerda', 'ESQ.', 'rotateY(-90deg) translateZ(29px)'], ['topo', 'TOPO', 'rotateX(90deg) translateZ(29px)'], ['base', 'BASE', 'rotateX(-90deg) translateZ(29px)']];
  for (const [vista, texto, t] of faces) {
    const b = botao(texto, () => O.olharPara(vista));
    b.dataset.vista = vista;
    b.style.transform = t;
    cuboEl.append(b);
  }
  const casa = botao('⌂', () => O.olharPara('iso'), 'casa');
  casa.title = 'Vista isométrica';
  q('.of-cubo').append(casa);
  const S = new THREE.Matrix4().makeScale(1, -1, 1);
  const R = new THREE.Matrix4();

  // ---------- campos ----------
  function campo(rotulo, valor, aoMudar, { passo = ui.passo, unidade = 'mm', vars = null, dica = '' } = {}) {
    const linha = el('div', 'of-campo');
    const nome = el('span', '', rotulo);
    const menos = botao('−', () => mexer(-1));
    menos.dataset.esperar = '550';
    const entrada = el('input');
    entrada.type = 'text';
    entrada.inputMode = 'decimal';
    entrada.value = valor ?? '';
    entrada.setAttribute('aria-label', rotulo);
    const mais = botao('+', () => mexer(1));
    mais.dataset.esperar = '550';
    const valida = () => {
      let ok = true;
      try { N.avaliarExpr(entrada.value, vars || O.avaliacao().vars); } catch { ok = false; }
      entrada.classList.toggle('erro', !ok);
      return ok;
    };
    const aplicar = (texto) => {
      entrada.value = texto;
      if (valida()) aoMudar(texto);
    };
    function mexer(sinal) {
      let v = 0;
      try { v = N.avaliarExpr(entrada.value, vars || O.avaliacao().vars); } catch {}
      aplicar(String(+(v + sinal * passo).toFixed(3)));
      ativar();
    }
    function ativar() {
      for (const x of propsEl.querySelectorAll('.of-campo.ativo')) x.classList.remove('ativo');
      linha.classList.add('ativo');
      ui.campoAtivo = { input: entrada, rotulo, aplicar: (mm) => aplicar(String(mm)) };
    }
    entrada.addEventListener('change', () => aplicar(entrada.value));
    entrada.addEventListener('focus', ativar);
    linha.addEventListener('click', ativar);
    linha.append(nome, menos, entrada, mais);
    if (dica || unidade) linha.append(el('small', '', [dica, /[a-zÀ-ú]/i.test(entrada.value) && !/^\d/.test(entrada.value) ? '' : unidade].filter(Boolean).join(' · ')));
    valida();
    return linha;
  }

  function chips(rotulo, opcoes, atual, aoEscolher, classe = '') {
    const frag = document.createDocumentFragment();
    if (rotulo) frag.append(el('h5', '', rotulo));
    const c = el('div', 'of-chips');
    for (const [valor, texto] of opcoes) {
      const b = botao(texto, () => aoEscolher(valor), `${valor === atual ? 'on' : ''} ${classe}`);
      c.append(b);
    }
    frag.append(c);
    return frag;
  }

  function botoes(lista) {
    const c = el('div', 'of-botoes');
    for (const [texto, fn, classe] of lista) c.append(botao(texto, fn, classe || ''));
    return c;
  }

  function dados(pares) {
    const dl = el('dl', 'of-dados');
    for (const [k, v] of pares) dl.append(el('dt', '', k), el('dd', '', v));
    return dl;
  }

  // ---------- faixa ----------
  function faixa() {
    abasEl.replaceChildren();
    const menuArvore = botao('☰', () => arvoreEl.classList.toggle('aberta'), 'of-menu-arvore');
    abasEl.append(menuArvore);
    for (const [aba, nome] of ABAS) {
      const b = botao(nome, () => acoes.aba(aba), ui.aba === aba ? 'ativa' : '');
      abasEl.append(b);
    }
    const docEl = el('span', 'of-doc');
    const p = O.peca();
    docEl.append(document.createTextNode(ui.aba === 'montagem' ? 'MONTAGEM · ' : 'PEÇA · '));
    docEl.append(el('b', '', ui.aba === 'montagem' ? `${O.montagem.comps.length} COMPONENTES` : `${p.nome} · ${N.MATERIAIS[p.material].nome}`));
    abasEl.append(docEl);
    ferrEl.replaceChildren();
    const grupos = FERRAMENTAS[ui.aba] || [];
    grupos.forEach((g, i) => {
      if (i) ferrEl.append(el('span', 'sep'));
      for (const [chave, icone, nome, classe] of g) {
        const ativo = ui.ferramenta === chave || (chave === 'corte' && ui.corte.ativo) || (chave === 'massa' && ui.cg) || (chave === 'explodir' && O.montagem.explosao > 0.05);
        const b = botao('', () => acoes.ferramenta(chave), `${classe || ''} ${ativo ? 'ativo' : ''}`);
        b.append(el('i', '', icone), document.createTextNode(nome));
        b.dataset.ferr = chave;
        ferrEl.append(b);
      }
    });
  }

  // ---------- árvore ----------
  function arvore() {
    arvoreEl.replaceChildren();
    if (ui.aba === 'montagem') return arvoreMontagem();
    const p = O.peca();
    const t = el('h4', '', `▾ ${p.nome}`);
    t.append(el('small', '', `${N.MATERIAIS[p.material].nome} · ${O.doc.pecas.length > 1 ? `${O.doc.pecas.length} PEÇAS` : 'PEÇA'}`));
    arvoreEl.append(t);
    const origem = el('div', 'of-no n1');
    origem.append(el('span', 'ic', '⊹'), el('span', 'nm', 'Origem'), el('span', 'bt'));
    arvoreEl.append(origem);
    const planos = el('div', 'of-no n2');
    planos.append(el('span', 'ic', ''), el('span', 'nm', 'Planos XY · XZ · YZ'), el('span', 'bt'));
    arvoreEl.append(planos);
    const fim = O.fimAtual();
    const erros = ui.erros || {};
    const linhas = [];
    p.recursos.forEach((r, i) => {
      if (i === fim) arvoreEl.append(linhaFim(fim, p.recursos.length));
      const no = el('div', `of-no n1 ${r.id === ui.sel ? 'sel' : ''} ${r.suprimido ? 'sup' : ''} ${i >= fim ? 'apos' : ''} ${erros[r.id] ? 'erro' : ''}`);
      no.dataset.mira = '';
      const menos = r.tipo === 'furo' || r.operacao === 'cortar';
      const ic = el('span', `ic ${menos ? 'menos' : ''}`, N.ICONES[r.tipo] || '·');
      const nm = el('span', 'nm', r.nome);
      nm.append(el('small', '', erros[r.id] ? `⚠ ${erros[r.id]}` : N.resumoRecurso(r)));
      const bt = el('span', 'bt');
      bt.append(botao(r.suprimido ? '◌' : '◉', () => acoes.suprimir(r.id)), botao('✕', () => acoes.apagarRecurso(r.id)));
      no.append(ic, nm, bt);
      no.addEventListener('click', () => acoes.selecionar(r.id));
      no.addEventListener('dblclick', () => r.tipo === 'esboco' && acoes.editarEsboco(r.id));
      arvoreEl.append(no);
      linhas.push(no);
    });
    if (fim >= p.recursos.length) arvoreEl.append(linhaFim(fim, p.recursos.length));
    if (O.doc.pecas.length > 1) {
      arvoreEl.append(el('h4', '', 'PEÇAS'));
      for (const outra of O.doc.pecas) {
        const no = el('div', `of-no ${outra.id === p.id ? 'sel' : ''}`);
        no.dataset.mira = '';
        no.append(el('span', 'ic', '◇'), el('span', 'nm', outra.nome), el('span', 'bt'));
        no.addEventListener('click', () => acoes.abrirPeca(outra.id));
        arvoreEl.append(no);
      }
    }
    // rola só a árvore (scrollIntoView rolaria o laboratório inteiro)
    const sel = arvoreEl.querySelector('.of-no.sel');
    if (sel && (sel.offsetTop < arvoreEl.scrollTop || sel.offsetTop > arvoreEl.scrollTop + arvoreEl.clientHeight - 30)) arvoreEl.scrollTop = sel.offsetTop - arvoreEl.clientHeight / 2;
  }

  // "Fim da peça": arraste com o mouse ou ▲ ▼ com a mão
  function linhaFim(fim, total) {
    const linha = el('div', 'of-fim');
    linha.append(el('span', '', '▬ FIM DA PEÇA'), botao('▲', () => acoes.moverFim(fim - 1)), botao('▼', () => acoes.moverFim(fim + 1)));
    linha.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      linha.classList.add('arrastando');
      const nos = [...arvoreEl.querySelectorAll('.of-no.n1')].slice(1);   // tira a Origem
      let alvo = fim;
      const mover = (ev) => {
        alvo = nos.filter((n) => n.getBoundingClientRect().top + n.offsetHeight / 2 < ev.clientY).length;
        linha.style.transform = `translateY(${ev.clientY - e.clientY}px)`;
      };
      const soltar = () => {
        removeEventListener('pointermove', mover);
        removeEventListener('pointerup', soltar);
        linha.classList.remove('arrastando');
        linha.style.transform = '';
        acoes.moverFim(Math.min(alvo, total));
      };
      addEventListener('pointermove', mover);
      addEventListener('pointerup', soltar);
    });
    return linha;
  }

  function arvoreMontagem() {
    const m = O.montagem;
    const t = el('h4', '', '▾ MONTAGEM');
    t.append(el('small', '', `${m.comps.length} COMPONENTES · ${m.restricoes.length} RESTRIÇÕES`));
    arvoreEl.append(t);
    for (const c of m.comps) {
      const no = el('div', `of-no n1 ${c.id === ui.compSel ? 'sel' : ''}`);
      no.dataset.mira = '';
      const nm = el('span', 'nm', m.nomeDe(c.id));
      nm.append(el('small', '', c.ref.peca ? 'peça da oficina' : 'biblioteca'));
      const bt = el('span', 'bt');
      bt.append(botao('✕', () => acoes.removerComp(c.id)));
      no.append(el('span', 'ic', c.fixo ? '📌' : c.ref.peca ? '◇' : '⛭'), nm, bt);
      no.addEventListener('click', () => {
        ui.compSel = ui.compSel === c.id ? null : c.id;
        m.destacar(ui.compSel);
        tudo();
      });
      arvoreEl.append(no);
    }
    if (m.restricoes.length) arvoreEl.append(el('h4', '', 'RESTRIÇÕES'));
    m.restricoes.forEach((r, i) => {
      const no = el('div', 'of-no n1');
      const nm = el('span', 'nm', `${r.tipo === 'face' ? 'Face' : 'Eixo'} ${i + 1}`);
      nm.append(el('small', '', `${m.nomeDe(r.a.comp)} ↔ ${m.nomeDe(r.b.comp)}`));
      const bt = el('span', 'bt');
      bt.append(botao('✕', () => acoes.removerRestricao(r.id)));
      no.append(el('span', 'ic', r.tipo === 'face' ? '◫' : '⊜'), nm, bt);
      arvoreEl.append(no);
    });
  }

  // ---------- propriedades ----------
  function props() {
    propsEl.replaceChildren();
    const r = O.recurso(ui.edicao?.id || ui.sel);
    const add = (...x) => propsEl.append(...x);
    if (ui.ferramenta === 'escolher_plano') {
      add(el('h4', '', 'NOVO ESBOÇO'), el('p', 'dica', 'Escolha o plano do esboço, ou faça pinça numa face plana da peça.'));
      add(chips('PLANO', [['xz', 'TOPO (XZ)'], ['xy', 'FRENTE (XY)'], ['yz', 'LATERAL (YZ)']], null, (p) => acoes.novoEsboco(p)));
      add(botoes([['✕ CANCELAR', () => acoes.ferramenta('selecionar')]]));
      return;
    }
    if (ui.aba === 'esboco' && O.esbocoAtivo()) return propsEsboco();
    if (ui.aba === 'montagem') return propsMontagem();
    if (ui.aba === 'desenho') return propsDesenho();
    if (ui.aba === 'inspecao') return propsInspecao();
    if (ui.ferramenta === 'material') return propsMaterial();
    if (ui.ferramenta === 'parametros') return propsParametros();
    if (ui.ferramenta === 'primitivas' && !ui.edicao) return propsPrimitivas();
    if (r) return propsRecurso(r);
    if (ui.ferramenta === 'furo') {
      add(el('h4', '', 'FURO'), el('p', 'dica', 'Faça pinça numa face da peça para colocar o furo (encaixa na grade da face). A tesoura (✌ fechando) faz um furo passante onde você mira.'));
      return;
    }
    propsPeca();
  }

  function propsPeca() {
    const p = O.peca();
    const a = O.avaliacao();
    const add = (...x) => propsEl.append(...x);
    add(el('h4', '', 'PEÇA'));
    const nome = el('input', 'of-entrada');
    nome.value = p.nome;
    nome.addEventListener('change', () => acoes.renomearPeca(nome.value));
    add(nome);
    add(chips('MATERIAL', Object.entries(N.MATERIAIS).map(([k, m]) => [k, m.nome.split(' ')[0]]), p.material, (k) => acoes.material(k)));
    const tam = a.caixa.isEmpty() ? null : a.caixa.getSize(new THREE.Vector3());
    add(dados([
      ['MASSA', `${fmt(a.massa)} g`], ['VOLUME', `${fmt(a.volume / 1000)} cm³`],
      ['TAMANHO', tam ? `${fmt(tam.x, 0)}×${fmt(tam.z, 0)}×${fmt(tam.y, 0)} mm` : '—'],
      ['CENTRO DE GRAV.', tam ? `${fmt(a.centro.x)} · ${fmt(a.centro.y)} · ${fmt(a.centro.z)}` : '—'],
    ]));
    add(chips('ENCAIXE DA GRADE', [[0.5, '0,5'], [1, '1'], [5, '5'], [10, '10 mm']], ui.passo, (n) => acoes.passo(n)));
    add(el('p', 'dica', 'Comece com NOVO ESBOÇO, desenhe um perfil fechado e EXTRUDA. Ou peça pela voz: "Jarvis, projeta uma flange de 80 mm com 6 furos M6".'));
    add(botoes([['★ EXEMPLO', () => acoes.exemplo()], ['✚ NOVA PEÇA', () => acoes.novaPeca()]]));
  }

  function campoRec(r, chave, rotulo, opcoes = {}) {
    return campo(rotulo, r[chave], (v) => acoes.mudarCampo(r, chave, v), opcoes);
  }

  function escolhaAlvo(r, tipos) {
    const p = O.peca();
    const lista = p.recursos.filter((x) => tipos.includes(x.tipo) && x.id !== r.id);
    return chips('RECURSO DE ORIGEM', lista.map((x) => [x.id, x.nome]), r.alvo, (id) => acoes.mudarCampo(r, 'alvo', id, true));
  }

  function propsRecurso(r) {
    const add = (...x) => propsEl.append(...x);
    const novo = ui.edicao?.novo && ui.edicao.id === r.id;
    const titulo = el('h4', '', `${N.ICONES[r.tipo] || ''} ${r.nome.toUpperCase()}${novo ? ' · NOVO' : ''}`);
    add(titulo);
    const erro = ui.erros?.[r.id];
    if (erro) add(el('p', '', `⚠ ${erro}`));
    const esbocos = O.peca().recursos.filter((x) => x.tipo === 'esboco');
    switch (r.tipo) {
      case 'esboco': {
        add(dados([['PLANO', PLANO_NOME[r.ref] || 'FACE'], ['ENTIDADES', String(r.ents.length)], ['PERFIS FECHADOS', String(N.lacosDoEsboco(r).length)]]));
        add(botoes([['✎ EDITAR ESBOÇO', () => acoes.editarEsboco(r.id)]]));
        add(botoes([['⇧ EXTRUDIR', () => acoes.novoRecurso('extrusao', { esboco: r.id })], ['↻ REVOLUCIONAR', () => acoes.novoRecurso('revolucao', { esboco: r.id })]]));
        break;
      }
      case 'extrusao': {
        add(chips('PERFIL', esbocos.map((e) => [e.id, e.nome]), r.esboco, (id) => acoes.mudarCampo(r, 'esboco', id, true)));
        add(chips('OPERAÇÃO', [['juntar', 'JUNTAR'], ['cortar', 'CORTAR'], ['intersecao', 'INTERSEÇÃO']], r.operacao, (v) => acoes.mudarCampo(r, 'operacao', v, true)));
        add(chips('FIM', [['distancia', 'DISTÂNCIA'], ['face', 'ATÉ A FACE'], ['passante', 'PASSANTE']], r.fim || 'distancia', (v) => {
          acoes.mudarCampo(r, 'fim', v, true);
          if (v === 'face') {
            ui.ferramenta = 'escolher_face';
            O.aviso('FAÇA PINÇA NA FACE ONDE A EXTRUSÃO TERMINA');
          }
        }));
        if ((r.fim || 'distancia') === 'distancia') add(campoRec(r, 'distancia', 'DISTÂNCIA', { dica: 'puxe com a pinça' }));
        if (r.fim === 'face') add(el('p', 'dica', r.face ? 'Termina na face escolhida.' : 'Faça pinça na face onde a extrusão termina.'));
        if (r.fim !== 'passante') add(chips('DIREÇÃO', [['normal', '↑ NORMAL'], ['inversa', '↓ INVERSA'], ['simetrica', '⇕ SIMÉTRICA']], r.direcao || 'normal', (v) => acoes.mudarCampo(r, 'direcao', v, true)));
        break;
      }
      case 'revolucao': {
        const esb = O.recurso(r.esboco);
        add(chips('PERFIL', esbocos.map((e) => [e.id, e.nome]), r.esboco, (id) => acoes.mudarCampo(r, 'esboco', id, true)));
        const eixos = [['y', 'EIXO V (VERTICAL)'], ['x', 'EIXO H (HORIZONTAL)'], ...(esb?.ents || []).filter((e) => e.t === 'linha' && e.construcao).map((e, i) => [e.id, `LINHA DE CONSTRUÇÃO ${i + 1}`])];
        add(chips('EIXO', eixos, r.eixo, (v) => acoes.mudarCampo(r, 'eixo', v, true)));
        add(campoRec(r, 'angulo', 'ÂNGULO', { passo: 15, unidade: '°' }));
        add(chips('OPERAÇÃO', [['juntar', 'JUNTAR'], ['cortar', 'CORTAR'], ['intersecao', 'INTERSEÇÃO']], r.operacao, (v) => acoes.mudarCampo(r, 'operacao', v, true)));
        break;
      }
      case 'furo': {
        add(chips('TIPO', [['simples', 'SIMPLES'], ['escareado', 'ESCAREADO'], ['rebaixado', 'REBAIXADO'], ['roscado', 'ROSCADO']], r.estilo, (v) => acoes.mudarCampo(r, 'estilo', v, true)));
        if (r.estilo === 'roscado') add(chips('ROSCA', Object.keys(N.ROSCAS).map((k) => [k, k]), r.rosca, (v) => acoes.mudarCampo(r, 'rosca', v, true)));
        else add(campoRec(r, 'diametro', 'DIÂMETRO', { passo: 0.5 }));
        if (r.estilo === 'escareado') add(campoRec(r, 'escDiam', 'Ø ESCAREADO', { passo: 0.5 }), campoRec(r, 'escAng', 'ÂNGULO', { passo: 1, unidade: '°' }));
        if (r.estilo === 'rebaixado') add(campoRec(r, 'rebDiam', 'Ø REBAIXO', { passo: 0.5 }), campoRec(r, 'rebProf', 'PROF. REBAIXO', { passo: 0.5 }));
        add(chips('FIM', [['n', 'PROFUNDIDADE'], ['s', 'PASSANTE']], r.passante ? 's' : 'n', (v) => acoes.mudarCampo(r, 'passante', v === 's', true)));
        if (!r.passante) add(campoRec(r, 'profundidade', 'PROFUNDIDADE', { dica: 'puxe com a pinça' }));
        if (r.estilo === 'roscado') add(campoRec(r, 'profundidadeRosca', 'ROSCA (COMPR.)', { dica: 'vazio = automático' }));
        ['X', 'Y', 'Z'].forEach((eixo, i) => add(campo(`POSIÇÃO ${eixo}`, r.ponto[i], (v) => {
          const n = Number(String(v).replace(',', '.'));
          if (Number.isFinite(n)) acoes.mudarCampo(r, ['ponto', i], n);
        })));
        break;
      }
      case 'arredondar':
      case 'chanfro': {
        add(escolhaAlvo(r, ['extrusao']));
        add(campoRec(r, 'raio', r.tipo === 'chanfro' ? 'DISTÂNCIA' : 'RAIO', { passo: 0.5 }));
        add(chips('ARESTAS', [['todas', 'TODAS'], ['topo', 'DO TOPO'], ['base', 'DA BASE'], ['verticais', 'VERTICAIS']], r.arestas || 'todas', (v) => acoes.mudarCampo(r, 'arestas', v, true)));
        break;
      }
      case 'casca': {
        add(campoRec(r, 'espessura', 'PAREDE', { passo: 0.5 }));
        add(chips('FACE DE CIMA', [['aberta', 'ABERTA'], ['fechada', 'FECHADA (OCA)']], r.face || 'aberta', (v) => acoes.mudarCampo(r, 'face', v, true)));
        break;
      }
      case 'padrao_ret': {
        add(escolhaAlvo(r, ['furo', 'extrusao', 'primitiva', 'revolucao']));
        add(campoRec(r, 'n1', 'QUANTIDADE 1', { passo: 1, unidade: '' }), campoRec(r, 'd1', 'ESPAÇO 1'));
        add(chips('DIREÇÃO 1', [['x', 'X'], ['z', 'Z'], ['y', 'Y']], r.dir1, (v) => acoes.mudarCampo(r, 'dir1', v, true)));
        add(campoRec(r, 'n2', 'QUANTIDADE 2', { passo: 1, unidade: '' }), campoRec(r, 'd2', 'ESPAÇO 2'));
        add(chips('DIREÇÃO 2', [['z', 'Z'], ['x', 'X'], ['y', 'Y']], r.dir2, (v) => acoes.mudarCampo(r, 'dir2', v, true)));
        break;
      }
      case 'padrao_circ': {
        add(escolhaAlvo(r, ['furo', 'extrusao', 'primitiva', 'revolucao']));
        add(campoRec(r, 'n', 'QUANTIDADE', { passo: 1, unidade: '' }), campoRec(r, 'angulo', 'ÂNGULO TOTAL', { passo: 15, unidade: '°' }));
        add(chips('EIXO', [['y', 'Y (VERTICAL)'], ['x', 'X'], ['z', 'Z']], r.eixo, (v) => acoes.mudarCampo(r, 'eixo', v, true)));
        ['X', 'Y', 'Z'].forEach((eixo, i) => add(campo(`CENTRO ${eixo}`, r.centro?.[i] ?? '0', (v) => acoes.mudarCampo(r, ['centro', i], v))));
        break;
      }
      case 'espelhar': {
        add(escolhaAlvo(r, ['furo', 'extrusao', 'primitiva', 'revolucao']));
        add(chips('PLANO', [['yz', 'YZ (ESQ./DIR.)'], ['xy', 'XY (FRENTE/TRÁS)'], ['xz', 'XZ (CIMA/BAIXO)']], r.plano, (v) => acoes.mudarCampo(r, 'plano', v, true)));
        add(campoRec(r, 'desloc', 'DESLOC. DO PLANO'));
        break;
      }
      case 'primitiva': {
        add(chips('OPERAÇÃO', [['juntar', 'JUNTAR'], ['cortar', 'CORTAR'], ['intersecao', 'INTERSEÇÃO']], r.operacao, (v) => acoes.mudarCampo(r, 'operacao', v, true)));
        for (const k of Object.keys(N.PRIMITIVAS[r.forma].medidas)) add(campo(N.ROTULO_MEDIDA[k] || k.toUpperCase(), r.m[k], (v) => acoes.mudarCampo(r, ['m', k], v), { passo: k === 'dentes' ? 1 : ui.passo, unidade: k === 'dentes' ? '' : 'mm' }));
        ['X', 'Y', 'Z'].forEach((eixo, i) => add(campo(`POSIÇÃO ${eixo}`, r.pos[i], (v) => acoes.mudarCampo(r, ['pos', i], v))));
        add(campo('GIRO', r.giro || 0, (v) => acoes.mudarCampo(r, 'giro', v), { passo: 15, unidade: '° · gire o pulso' }));
        break;
      }
      default:
        break;
    }
    if (novo) add(botoes([['✓ OK', () => acoes.ok(), 'ok'], ['✕ CANCELAR', () => acoes.cancelar()]]));
    else {
      const nome = el('input', 'of-entrada');
      nome.value = r.nome;
      nome.addEventListener('change', () => acoes.renomear(r, nome.value));
      add(el('h5', '', 'NOME'), nome);
      add(botoes([[r.suprimido ? '◉ REATIVAR' : '◌ SUPRIMIR', () => acoes.suprimir(r.id)], ['✕ APAGAR', () => acoes.apagarRecurso(r.id), 'perigo']]));
    }
  }

  function propsEsboco() {
    const esb = O.esbocoAtivo();
    const add = (...x) => propsEl.append(...x);
    const e = esb.ents.find((x) => x.id === ui.entSel);
    add(el('h4', '', `▱ ${esb.nome.toUpperCase()} · ${PLANO_NOME[esb.ref] || 'FACE'}`));
    if (e) {
      const mudar = (fn) => acoes.mudarEntidade(e, fn);
      const num = (v) => {
        try { return N.avaliarExpr(v, O.avaliacao().vars); } catch { return null; }
      };
      if (e.t === 'linha') {
        const comp = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
        const ang = THREE.MathUtils.radToDeg(Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]));
        add(el('h5', '', `LINHA${e.h ? ' · HORIZONTAL' : e.v ? ' · VERTICAL' : ''}${e.construcao ? ' · CONSTRUÇÃO' : ''}`));
        add(campo('COMPRIMENTO', +comp.toFixed(3), (v) => {
          const n = num(v);
          if (n > 0) mudar((x) => { const a = THREE.MathUtils.degToRad(ang); x.b = [+(x.a[0] + Math.cos(a) * n).toFixed(3), +(x.a[1] + Math.sin(a) * n).toFixed(3)]; });
        }));
        add(campo('ÂNGULO', +ang.toFixed(2), (v) => {
          const n = num(v);
          if (n != null) mudar((x) => { const a = THREE.MathUtils.degToRad(n); x.b = [+(x.a[0] + Math.cos(a) * comp).toFixed(3), +(x.a[1] + Math.sin(a) * comp).toFixed(3)]; x.h = Math.abs(Math.sin(a)) < 1e-6; x.v = Math.abs(Math.cos(a)) < 1e-6; });
        }, { passo: 15, unidade: '°' }));
        add(campo('INÍCIO X', e.a[0], (v) => num(v) != null && mudar((x) => { x.a = [num(v), x.a[1]]; })), campo('INÍCIO Y', e.a[1], (v) => num(v) != null && mudar((x) => { x.a = [x.a[0], num(v)]; })));
      } else if (e.t === 'ret') {
        const larg = Math.abs(e.b[0] - e.a[0]);
        const alt = Math.abs(e.b[1] - e.a[1]);
        add(el('h5', '', 'RETÂNGULO'));
        add(campo('LARGURA', larg, (v) => num(v) > 0 && mudar((x) => { x.b = [x.a[0] + Math.sign(x.b[0] - x.a[0] || 1) * num(v), x.b[1]]; })));
        add(campo('ALTURA', alt, (v) => num(v) > 0 && mudar((x) => { x.b = [x.b[0], x.a[1] + Math.sign(x.b[1] - x.a[1] || 1) * num(v)]; })));
        add(campo('RAIO DOS CANTOS', e.raio || 0, (v) => num(v) >= 0 && mudar((x) => { x.raio = num(v); }), { passo: 0.5 }));
        add(botoes([['⊹ CENTRALIZAR NA ORIGEM', () => mudar((x) => { x.a = [-larg / 2, -alt / 2]; x.b = [larg / 2, alt / 2]; }) ]]));
      } else if (e.t === 'circ') {
        add(el('h5', '', 'CÍRCULO'));
        add(campo('DIÂMETRO', e.r * 2, (v) => num(v) > 0 && mudar((x) => { x.r = num(v) / 2; }), { passo: 1 }));
        add(campo('CENTRO X', e.c[0], (v) => num(v) != null && mudar((x) => { x.c = [num(v), x.c[1]]; })), campo('CENTRO Y', e.c[1], (v) => num(v) != null && mudar((x) => { x.c = [x.c[0], num(v)]; })));
      } else if (e.t === 'arco') {
        add(el('h5', '', `ARCO${e.tg ? ' · TANGENTE' : ''}`));
        add(campo('ABERTURA', +(+e.ang).toFixed(2), (v) => num(v) && mudar((x) => { x.ang = num(v); x.tg = false; }), { passo: 15, unidade: '°' }));
      } else if (e.t === 'poli') {
        add(el('h5', '', 'POLÍGONO'));
        add(campo('DIÂMETRO', e.r * 2, (v) => num(v) > 0 && mudar((x) => { x.r = num(v) / 2; }), { passo: 1 }));
        add(campo('LADOS', e.n, (v) => num(v) >= 3 && mudar((x) => { x.n = Math.round(num(v)); }), { passo: 1, unidade: '' }));
        add(campo('GIRO', e.rot || 0, (v) => num(v) != null && mudar((x) => { x.rot = num(v); }), { passo: 15, unidade: '°' }));
      }
      add(botoes([[e.construcao ? '━ NORMAL' : '┄ CONSTRUÇÃO', () => acoes.construcao()], ['✕ APAGAR', () => acoes.apagarEntidade(), 'perigo']]));
    } else {
      const perfis = N.lacosDoEsboco(esb).length;
      add(dados([['ENTIDADES', String(esb.ents.length)], ['PERFIS FECHADOS', String(perfis)], ['ENCAIXE', `${fmt(ui.passo)} mm`]]));
      const dicas = {
        linha: 'Pinça no plano e arraste: cada traço é uma linha. Perto de horizontal ou vertical ela trava sozinha (H/V); começando na ponta de outra linha, as duas ficam coincidentes.',
        ret: 'Pinça num canto e arraste até o canto oposto.', circ: 'Pinça no centro e arraste até o raio.', poli: 'Pinça no centro e arraste até o raio.',
        arco: 'Arraste do início ao fim. Começando na ponta de uma linha, o arco sai tangente a ela.',
        livre: 'Desenhe no ar com a pinça: o rabisco vira linha, retângulo, círculo ou polígono perfeitos, com medidas.',
        sel_esb: 'Pinça numa linha para selecionar e arrastar; as medidas aparecem aqui para editar.',
      };
      add(el('p', 'dica', dicas[ui.ferramenta] || 'Escolha uma ferramenta de esboço.'));
      if (ui.ferramenta === 'poli') add(chips('LADOS', [[3, '3'], [4, '4'], [5, '5'], [6, '6'], [8, '8'], [12, '12']], ui.ladosPoli, (n) => { ui.ladosPoli = n; props(); }));
      add(chips('ENCAIXE DA GRADE', [[0.5, '0,5'], [1, '1'], [5, '5'], [10, '10 mm']], ui.passo, (n) => acoes.passo(n)));
      add(botoes([['✓ TERMINAR ESBOÇO', () => acoes.terminarEsboco(true), 'ok']]));
    }
  }

  function propsMaterial() {
    const p = O.peca();
    const add = (...x) => propsEl.append(...x);
    add(el('h4', '', '◈ MATERIAL'));
    for (const [k, m] of Object.entries(N.MATERIAIS)) {
      const a = O.avaliacao();
      const massa = (a.volume / 1000) * m.densidade;
      const b = botao('', () => acoes.material(k), `of-no ${k === p.material ? 'sel' : ''}`);
      b.style.width = '100%';
      b.style.textAlign = 'left';
      const cor = el('span', 'ic', '■');
      cor.style.color = m.cor;
      const nm = el('span', 'nm', m.nome);
      nm.append(el('small', '', `${fmt(m.densidade, 2)} g/cm³ · escoa a ${m.escoamento} MPa · ${fmt(massa)} g`));
      b.append(cor, nm, el('span', 'bt'));
      add(b);
    }
  }

  function propsParametros() {
    const p = O.peca();
    const add = (...x) => propsEl.append(...x);
    add(el('h4', '', 'fx PARÂMETROS'));
    add(el('p', '', 'Use os nomes nas medidas dos recursos: "largura/2", "d0 * 1,5"…'));
    const { vars, erros } = N.valoresParametros(p.parametros);
    const t = el('table', 'of-tabela');
    t.innerHTML = '<thead><tr><th>NOME</th><th>FÓRMULA</th><th>VALOR</th><th></th></tr></thead>';
    const corpo = el('tbody');
    p.parametros.forEach((par, i) => {
      const tr = el('tr');
      const nome = el('input', 'of-entrada');
      nome.value = par.nome;
      nome.addEventListener('change', () => acoes.parametro(i, 'nome', nome.value));
      const expr = el('input', 'of-entrada');
      expr.value = par.expr;
      expr.addEventListener('change', () => acoes.parametro(i, 'expr', expr.value));
      const td = (x, c = '') => {
        const d = el('td', c);
        d.append(x);
        return d;
      };
      tr.append(td(nome), td(expr), td(document.createTextNode(erros[par.nome] ? '⚠' : fmt(vars[par.nome], 3)), `valor ${erros[par.nome] ? 'erro' : ''}`), td(botao('✕', () => acoes.parametro(i, 'apagar'))));
      corpo.append(tr);
    });
    t.append(corpo);
    add(t);
    add(botoes([['✚ PARÂMETRO', () => acoes.parametro('novo')]]));
  }

  function propsPrimitivas() {
    const add = (...x) => propsEl.append(...x);
    add(el('h4', '', '◇ PRIMITIVAS'));
    add(chips('FORMA', Object.entries(N.PRIMITIVAS).map(([k, t]) => [k, `${t.icone} ${t.nome}`]), ui.primitiva, (k) => { ui.primitiva = k; props(); }));
    add(el('p', 'dica', ui.primitiva === 'rasgo' ? 'Faça pinça em cima da peça e arraste para traçar o rasgo.' : 'Faça pinça na mesa (ou no topo da peça) e arraste: o tamanho encaixa na grade.'));
  }

  function propsMontagem() {
    const m = O.montagem;
    const add = (...x) => propsEl.append(...x);
    if (ui.ferramenta === 'biblioteca') {
      add(el('h4', '', '⛭ BIBLIOTECA'));
      add(chips('ITEM', Object.entries(N.BIBLIOTECA).map(([k, b]) => [k, `${b.icone} ${b.nome}`]), ui.bib.tipo, (k) => {
        ui.bib.tipo = k;
        ui.bib.tam = N.BIBLIOTECA[k].tamanhos[Math.min(4, N.BIBLIOTECA[k].tamanhos.length - 1)];
        props();
      }));
      const b = N.BIBLIOTECA[ui.bib.tipo];
      if (b.tamanhos.length > 1) add(chips('TAMANHO', b.tamanhos.map((t) => [t, t]), ui.bib.tam, (t) => { ui.bib.tam = t; props(); }));
      if (b.comprimento) add(campo('COMPRIMENTO', ui.bib.comp, (v) => { ui.bib.comp = Number(String(v).replace(',', '.')) || ui.bib.comp; }, { passo: 5 }));
      add(botoes([['⊕ INSERIR NA MONTAGEM', () => acoes.inserir({ lib: ui.bib.tipo, tam: b.tamanhos.length > 1 ? ui.bib.tam : b.tamanhos[0], comp: b.comprimento ? ui.bib.comp : undefined }), 'ok']]));
      return;
    }
    if (ui.ferramenta === 'inserir') {
      add(el('h4', '', '⊕ INSERIR PEÇA'));
      for (const p of O.doc.pecas) add(botoes([[`◇ ${p.nome}`, () => acoes.inserir({ peca: p.id })]]));
      add(botoes([['✚ NOVA PEÇA', () => acoes.novaPeca()]]));
      return;
    }
    if (ui.ferramenta === 'bom') {
      add(el('h4', '', '☰ LISTA DE MATERIAIS'));
      const t = el('table', 'of-tabela');
      t.innerHTML = '<thead><tr><th>#</th><th>DESCRIÇÃO</th><th>QTD</th><th>MASSA</th></tr></thead>';
      const corpo = el('tbody');
      let total = 0;
      for (const l of m.listaMateriais()) {
        const tr = el('tr');
        for (const [v, c] of [[String(l.item), ''], [`${l.nome} · ${l.material}`, ''], [String(l.qtd), 'valor'], [`${fmt(l.total)} g`, 'valor']]) tr.append(el('td', c, v));
        corpo.append(tr);
        total += l.total;
      }
      t.append(corpo);
      add(t, dados([['MASSA TOTAL', `${fmt(total)} g`]]));
      return;
    }
    const c = m.comps.find((x) => x.id === ui.compSel);
    if (c) {
      add(el('h4', '', `◇ ${m.nomeDe(c.id).toUpperCase()}`));
      ['X', 'Y', 'Z'].forEach((eixo, i) => add(campo(`POSIÇÃO ${eixo}`, c.pos[i], (v) => {
        const n = Number(String(v).replace(',', '.'));
        if (Number.isFinite(n)) acoes.moverComp(c.id, i, n);
      })));
      for (const eixo of ['x', 'y', 'z']) add(botoes([[`↺ ${eixo.toUpperCase()} −15°`, () => acoes.girarComp(c.id, eixo, -15)], [`↻ ${eixo.toUpperCase()} +15°`, () => acoes.girarComp(c.id, eixo, 15)]]));
      add(botoes([[c.fixo ? '📌 SOLTAR' : '📌 FIXAR', () => acoes.fixarComp(c.id)], ['✕ REMOVER', () => acoes.removerComp(c.id), 'perigo']]));
      return;
    }
    add(el('h4', '', 'MONTAGEM'));
    add(dados([['COMPONENTES', String(m.comps.length)], ['RESTRIÇÕES', String(m.restricoes.length)]]));
    const dicas = {
      face_face: ui.escolhaRestricao ? 'Agora faça pinça na face da outra peça.' : 'Faça pinça numa face de uma peça e depois na face da outra: elas encostam de frente.',
      eixo_eixo: ui.escolhaRestricao ? 'Agora faça pinça no furo ou pino da outra peça.' : 'Faça pinça perto de um furo/pino e depois no da outra peça: os eixos se alinham.',
      mover_comp: 'Pinça numa peça arrasta pela mesa; girar o pulso gira de 15 em 15°.',
    };
    add(el('p', 'dica', dicas[ui.ferramenta] || 'Escolha uma ferramenta.'));
    add(el('h5', '', `VISTA EXPLODIDA · ${Math.round(m.explosao * 100)}%`));
    add(chips('', [[0, 'FECHADA'], [0.5, '50%'], [1, '100%']], Math.round(m.explosao * 2) / 2, (f) => acoes.explodir(f)));
  }

  function propsDesenho() {
    const add = (...x) => propsEl.append(...x);
    add(el('h4', '', '▤ DESENHO TÉCNICO'));
    add(el('p', '', 'Folha A4 no 1º diedro (padrão brasileiro): vista frontal, superior e lateral esquerda, perspectiva isométrica, linhas ocultas tracejadas, cotas gerais, notas de furos e carimbo.'));
    add(botoes([['▤ GERAR FOLHA A4', () => acoes.folha(), 'ok']]));
    add(el('h5', '', 'EXPORTAR'));
    add(botoes([['⇩ STL', () => acoes.exportar('stl')], ['⇩ OBJ', () => acoes.exportar('obj')], ['⇩ GLB', () => acoes.exportar('glb')]]));
    add(el('p', '', 'STL para o fatiador da impressora 3D; OBJ e GLB para outros programas (o GLB leva as cores do material).'));
  }

  function propsInspecao() {
    const add = (...x) => propsEl.append(...x);
    const a = O.avaliacao();
    const f = ui.ferramenta;
    if (f === 'medir') {
      add(el('h4', '', '↔ MEDIR'));
      if (ui.medir.length === 2) {
        const d = ui.medir[1].clone().sub(ui.medir[0]);
        add(dados([['DISTÂNCIA', `${fmt(d.length(), 2)} mm`], ['ΔX', `${fmt(Math.abs(d.x), 2)} mm`], ['ΔY', `${fmt(Math.abs(d.y), 2)} mm`], ['ΔZ', `${fmt(Math.abs(d.z), 2)} mm`]]));
      }
      add(el('p', 'dica', 'Faça pinça em dois pontos da peça. Com as duas mãos em pinça você mede no ar.'));
    } else if (f === 'regua') {
      add(el('h4', '', '⟷ RÉGUA DE DEDOS'));
      add(el('p', '', 'Abra o polegar e o indicador na frente da câmera: a distância entre as pontas aparece em centímetros (estimada pelo MediaPipe, ± alguns milímetros). Faça joinha para mandar a medida ao campo ativo.'));
      add(dados([['AGORA', ui.regua ? `${fmt(ui.regua.cm, 1)} cm` : '—']]));
    } else if (f === 'corte') {
      add(el('h4', '', '◧ VISTA EM CORTE'));
      add(chips('ESTADO', [[true, 'LIGADA'], [false, 'DESLIGADA']], ui.corte.ativo, (v) => acoes.corte({ ativo: v })));
      add(chips('PLANO NORMAL A', [['x', 'X'], ['y', 'Y'], ['z', 'Z']], ui.corte.eixo, (v) => acoes.corte({ eixo: v, pos: 0 })));
      add(campo('POSIÇÃO', ui.corte.pos, (v) => acoes.corte({ pos: Number(String(v).replace(',', '.')) || 0 }), { passo: 1, dica: 'puxe com a pinça' }));
      add(botoes([['⇄ INVERTER LADO', () => acoes.corte({ inverter: !ui.corte.inverter })]]));
    } else if (f === 'massa') {
      add(el('h4', '', '⊕ MASSA E CENTRO DE GRAVIDADE'));
      const p = O.peca();
      add(dados([
        ['MATERIAL', N.MATERIAIS[p.material].nome], ['DENSIDADE', `${fmt(N.MATERIAIS[p.material].densidade, 2)} g/cm³`],
        ['VOLUME', `${fmt(a.volume / 1000, 2)} cm³`], ['MASSA', `${fmt(a.massa, 2)} g`],
        ['CG X', `${fmt(a.centro.x, 2)} mm`], ['CG Y', `${fmt(a.centro.y, 2)} mm`], ['CG Z', `${fmt(a.centro.z, 2)} mm`],
      ]));
      add(chips('MATERIAL', Object.entries(N.MATERIAIS).map(([k, m]) => [k, m.nome.split(' ')[0]]), p.material, (k) => acoes.material(k)));
    } else if (f === 'esforco') {
      add(el('h4', '', '≋ ESFORÇO (ESTIMATIVA)'));
      add(campo('FORÇA', ui.forca, (v) => acoes.forca(Number(String(v).replace(',', '.')) || ui.forca), { passo: 50, unidade: 'N' }));
      add(el('p', 'dica', 'Faça pinça na peça para empurrar naquele ponto (a peça fica presa na mesa pela base).'));
      if (ui.esforco) {
        const leg = el('div', 'of-legenda');
        leg.style.background = legendaCalor();
        add(leg, dados([['TENSÃO MÁX.', `${fmt(ui.esforco.maximo, 1)} MPa`], ['FATOR DE SEGURANÇA', fmt(ui.esforco.fatorSeguranca, 2)], ['SITUAÇÃO', ui.esforco.fatorSeguranca >= 2 ? 'FOLGADA ✓' : ui.esforco.fatorSeguranca >= 1 ? 'NO LIMITE ⚠' : 'VAI CEDER ✕']]));
        add(botoes([['✕ LIMPAR', () => acoes.limparEsforco()]]));
      }
      add(el('p', '', 'Modelo simplificado de viga presa na base (flexão + compressão + contato). Serve para ver onde a peça sofre; não substitui uma análise por elementos finitos.'));
    } else if (f === 'foto') {
      add(el('h4', '', '◉ PEÇA A PARTIR DA FOTO'));
      add(el('p', '', 'Segure o objeto na frente da câmera e toque em GERAR: o Jarvis olha a foto e modela uma peça parecida, com medidas aproximadas (você ajusta depois na árvore).'));
      if (ui.foto) {
        const img = el('img', 'of-foto');
        img.src = ui.foto;
        img.alt = 'Foto usada para modelar a peça';
        add(img);
      }
      add(botoes([['◉ GERAR PEÇA DA FOTO', () => acoes.fotoPeca().then((t) => O.aviso(t.slice(0, 60).toUpperCase())), 'ok']]));
    } else if (f === 'ra') {
      add(el('h4', '', '▣ PEÇA NO CELULAR (RA)'));
      add(el('p', '', 'Gera um QR code: abra no celular para ver a peça em realidade aumentada em cima da mesa, no tamanho real. O arquivo fica guardado por 24 horas.'));
      if (ui.qr) {
        const box = el('div', 'of-qr');
        const link = el('a', '', ui.qr.url);
        link.href = ui.qr.url;
        link.target = '_blank';
        link.rel = 'noopener';
        box.append(ui.qr.canvas, link);
        add(box);
      }
      add(botoes([['▣ GERAR QR CODE', () => acoes.celular().then((t) => O.aviso(t.slice(0, 50).toUpperCase())), 'ok']]));
    } else if (f === 'apresentar') {
      add(el('h4', '', '► APRESENTAÇÃO DE CINEMA'));
      add(el('p', '', 'A câmera dá a volta na peça com tarjas de cinema, legendas e narração em voz. Gravando, sai um vídeo .webm com trilha.'));
      add(chips('GRAVAR VÍDEO', [[true, 'SIM'], [false, 'NÃO']], ui.apresentacao.gravar, (v) => { ui.apresentacao.gravar = v; props(); }));
      add(botoes([['► INICIAR', () => acoes.apresentar(), 'ok']]));
    } else {
      add(el('h4', '', 'INSPEÇÃO'), el('p', '', 'Escolha uma ferramenta na faixa.'));
    }
  }

  // ---------- status ----------
  function status() {
    const p = O.peca();
    const a = O.avaliacao();
    statusEl.replaceChildren();
    const item = (k, v, classe = '') => {
      const s = el('span', classe);
      s.append(document.createTextNode(`${k} `), el('b', '', v));
      statusEl.append(s);
    };
    item('MATERIAL', N.MATERIAIS[p.material].nome);
    item('MASSA', `${fmt(a.massa)} g`);
    item('VOLUME', `${fmt(a.volume / 1000)} cm³`, 'opc');
    item('CG', a.caixa.isEmpty() ? '—' : `${fmt(a.centro.x)} · ${fmt(a.centro.y)} · ${fmt(a.centro.z)} mm`, 'opc');
    item('RECURSOS', String(p.recursos.length), 'opc');
    item('GRADE', `${fmt(ui.passo)} mm`, 'opc');
    const oc = el('span', `ocupado ${ocupado ? 'ligado' : ''}`, '◌ PROCESSANDO…');
    statusEl.append(oc);
    const dica = ui.edicao ? DICAS.edicao : ui.esboco ? DICAS.esboco : DICAS[ui.ferramenta] || (ui.aba === 'montagem' ? DICAS.montagem : DICAS.padrao);
    statusEl.append(el('span', 'dica', dica));
  }

  // ---------- rótulos 3D ----------
  function cotas() {
    const lista = O.rotulos3d();
    rotulosEl.replaceChildren();
    rotulos = lista.map((c) => {
      const e = el('div', `of-rotulo ${c.classe || ''}`, c.texto);
      rotulosEl.append(e);
      return { ...c, el: e };
    });
  }

  // ---------- menu radial (palma esquerda para cima) ----------
  function radial(abrir) {
    radialEl.hidden = !abrir;
    if (!abrir) return;
    radialEl.replaceChildren();
    const itens = (FERRAMENTAS[ui.aba] || []).flat().slice(0, 9);
    const extra = ui.edicao ? [['__ok', '✓', 'OK'], ['__cancelar', '✕', 'CANCELAR']] : ui.esboco ? [['terminar', '✓', 'TERMINAR']] : [['__desfazer', '↶', 'DESFAZER']];
    const todos = [...itens.filter((x) => !extra.some((y) => y[0] === x[0])), ...extra].slice(0, 10);
    todos.forEach(([chave, icone, nome], i) => {
      const ang = -Math.PI / 2 + (i / todos.length) * Math.PI * 2;
      const b = botao('', () => {
        if (chave === '__ok') acoes.ok();
        else if (chave === '__cancelar') acoes.cancelar();
        else if (chave === '__desfazer') acoes.desfazer();
        else acoes.ferramenta(chave);
        radial(true);
      }, ui.ferramenta === chave ? 'ativo' : '');
      b.dataset.esperar = '700';
      b.style.left = `${Math.cos(ang) * 104}px`;
      b.style.top = `${Math.sin(ang) * 104}px`;
      b.style.animationDelay = `${i * 30}ms`;
      b.append(el('i', '', icone), document.createTextNode(nome.length > 11 ? `${nome.slice(0, 10)}.` : nome));
      radialEl.append(b);
    });
  }

  // ---------- régua ----------
  const [linhaR, c1, c2] = reguaEl.querySelectorAll('line, circle');
  const rotuloR = reguaEl.querySelector('b');
  function regua(r) {
    reguaEl.hidden = !r;
    if (!r) return;
    linhaR.setAttribute('x1', r.a[0]);
    linhaR.setAttribute('y1', r.a[1]);
    linhaR.setAttribute('x2', r.b[0]);
    linhaR.setAttribute('y2', r.b[1]);
    c1.setAttribute('cx', r.a[0]);
    c1.setAttribute('cy', r.a[1]);
    c2.setAttribute('cx', r.b[0]);
    c2.setAttribute('cy', r.b[1]);
    rotuloR.textContent = `${fmt(r.cm, 1)} cm`;
    rotuloR.style.transform = `translate(${(r.a[0] + r.b[0]) / 2 + 24}px, ${(r.a[1] + r.b[1]) / 2 - 18}px)`;
  }

  // ---------- folha ----------
  function folha(canvas) {
    folhaEl.hidden = !canvas;
    const papel = folhaEl.querySelector('.papel');
    papel.replaceChildren();
    if (!canvas) return;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Folha A4 do desenho técnico da peça');
    papel.append(canvas, botoes([['⇩ BAIXAR PNG', () => acoes.baixarFolha(), 'ok'], ['✕ FECHAR', () => acoes.fecharFolha()]]));
  }

  let toastTimer = 0;
  function toast(texto) {
    if (!texto) return;
    toastEl.textContent = texto;
    toastEl.classList.remove('mostra');
    void toastEl.offsetWidth;
    toastEl.classList.add('mostra');
    clearTimeout(toastTimer);
  }

  function tudo() {
    faixa();
    arvore();
    props();
    status();
    cotas();
  }

  return {
    tudo, arvore, props, status, cotas, toast, radial, regua, folha,
    rotulos: () => rotulos,
    posicionarRadial(x, y) {
      radialEl.style.left = `${x}px`;
      radialEl.style.top = `${y}px`;
    },
    cubo(quat) {
      R.makeRotationFromQuaternion(quat);
      const m = new THREE.Matrix4().multiplyMatrices(S, R).multiply(S);
      cuboEl.style.transform = `matrix3d(${m.elements.map((v) => +v.toFixed(5)).join(',')})`;
    },
    ocupado(sim) {
      ocupado = sim;
      statusEl.querySelector('.ocupado')?.classList.toggle('ligado', sim);
    },
    mostrar(sim) {
      caixa.hidden = !sim;
      rotulosEl.hidden = !sim;
      if (sim) tudo();
    },
  };
}
