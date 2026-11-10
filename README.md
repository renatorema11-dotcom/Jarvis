# Jarvis
Meu assistente pessoal — voz pelo ElevenLabs, segundo cérebro no n8n, interface HUD com reconhecimento facial.

## Como funciona

```
index.html (navegador)                     n8n.nutriali.cloud
  ├─ voz ↔ agente ElevenLabs ──MCP──► Jarvis — Cérebro (MCP), 32 ferramentas:
  │                                     memória · tarefas · rotinas · Gmail · Agenda · Spotify
  │                                     internet · clima · notícias · finanças · pessoas · hábitos
  ├─ GET  /webhook/jarvis/contexto ──► perfil, memórias, tarefas, agenda, clima, hábitos,
  │                                     finanças e aniversários (viram variáveis do agente)
  ├─ POST /webhook/jarvis/visao ─────► foto da câmera → descrição (Groq)
  ├─ POST /webhook/jarvis/conversa ──► transcrição → memórias, tarefas e perfil (Groq)
  ├─ reconhecimento facial ──────────► local, no navegador (face-api); o rosto nunca sai dele
  └─ controlar_pc ───────────────────► pc/jarvis-pc.py em 127.0.0.1:47801
```

Workflows no n8n:

| Workflow | O que faz |
| --- | --- |
| Jarvis — Cérebro (MCP) | Ferramentas que o agente usa durante a conversa |
| Jarvis — API da interface | Contexto do painel e visão |
| Jarvis — Memória automática | Aprende com cada conversa |
| Jarvis — Rotinas automáticas | Briefing às 7h, lembretes de tarefas e cobrança de hábitos às 20h |
| Jarvis — Spotify (tocar) | Acha a playlist, escolhe o aparelho, toca e confere |
| Jarvis — Internet | Pesquisa na web, clima (Open-Meteo) e notícias (Google Notícias) |
| Jarvis — Cálculos | Totais de finanças, sequência de hábitos e próximos aniversários |
| Jarvis — Navegador (cérebro) | Escolhe a próxima ação do navegador a cada passo (Groq) |

Dados nas Data Tables `jarvis_memorias`, `jarvis_tarefas`, `jarvis_rotinas`, `jarvis_conversas`, `jarvis_perfil`, `jarvis_financas`, `jarvis_pessoas`, `jarvis_habitos` e `jarvis_habitos_registros`.

## Rodar a interface

Site: https://jarvis-tau-one-39.vercel.app (público) e https://jarvis-nutri-ali.vercel.app (time nutri-ali, com login da Vercel); os dois fazem deploy automático a cada push na `main`. Localmente:

```bash
py -3 -m http.server 5510
```

Na engrenagem, cole a chave do cérebro (está em `.jarvis-chave.local.txt`, que **não vai para o GitHub**). `?demo` mostra a interface com dados de exemplo; `?auto` já inicia a conversa.

**Música de boas-vindas:** na engrenagem, marque "Tocar uma música de boas-vindas no Spotify do PC", escreva o nome ou cole o link da música/playlist (OUVIR testa na hora) e escolha quando tocar: quando o Jarvis reconhecer seu rosto e mostrar as boas-vindas (padrão) ou assim que ele abrir. Vale uma vez por abertura (aba nova ou duas palmas). Para começar rápido, o Jarvis PC já abre o Spotify minimizado assim que o Jarvis inicia, enquanto a câmera procura o rosto, e o sensor liga junto com a animação de abertura. Durante a conversa o volume baixa para o microfone não ouvir a música e volta ao fim (webhook `jarvis/musica`).

**Identificação:** ligue o sensor no painel IDENTIDADE e toque em CADASTRAR ROSTO olhando para a câmera. O padrão facial fica salvo só no navegador; dá para desligar o sensor automático na engrenagem.

## Jarvis PC (controle do computador e duas palmas)

Dê dois cliques em `pc/iniciar-jarvis-pc.cmd`. Ele usa o Python do OpenJarvis (que tem `numpy` e `sounddevice` para as palmas) ou o `py -3` do sistema. O Jarvis passa a abrir programas e sites, pesquisar, mexer no volume e na mídia e bloquear a tela, e duas palmas abrem a conversa. O agente só aceita a chave do cérebro, só responde ao site do Jarvis e só executa ações de uma lista fixa. Na primeira vez, o Chrome pergunta se o site pode acessar o computador local: permita. O botão TESTAR PC, na engrenagem, mostra se o Jarvis PC está rodando e aceitando a chave.

### Laboratório holográfico

O botão do cubo na doca (ou `#holo` no endereço, ou "Jarvis, mostra a Terra") abre uma tela inteira com cinco modos (projeções, apps, criar, oficina e música), trocados no alto da tela. **Projeções:** 15 projeções 3D em partículas sobre uma mesa de projeção, que se transformam uma na outra: Terra (continentes de verdade e marcador em Campo Mourão), Lua (com a fase de hoje), Saturno, Sistema Solar, Via Láctea, Buraco Negro, Reator Arc, Turbina, Drone, Átomo, DNA, Molécula de cafeína, Coração batendo, Cidade e Terreno. Você controla com as mãos pela câmera (MediaPipe): punho fechado gira, pinça dá zoom, mão aberta desmonta e as partículas seguem a mão, duas mãos ampliam e um deslize rápido troca a projeção. Também funciona com mouse (arrastar, rodinha, duplo clique), teclado (setas, espaço, Esc) e pela ferramenta `holograma` do agente. Tudo fica em `holo.js`, carregado só quando o laboratório abre (three.js com bloom).

**Elementos:** cada projeção tem partes que dá para pegar (planetas, aorta, fan da turbina, Campo Mourão na Terra...). Faça pinça num losango: a projeção gira e se aproxima até ele, e uma ficha animada mostra o nome se decifrando, um texto curto e os dados. Mão aberta (ou ✕ SOLTAR) solta. Ampliando a projeção aparecem mais elementos, em três níveis de detalhe (`holo-elementos.js`).

**Oficina:** um CAD paramétrico no jeito do Autodesk Inventor, em milímetros. No alto fica a faixa de abas (ESBOÇO, MODELO 3D, MONTAGEM, DESENHO e INSPEÇÃO), à esquerda a árvore de recursos, à direita as propriedades do recurso, embaixo a barra de status (material, massa, centro de gravidade) e no canto o cubo de vistas.

- **Esboço 2D** num plano (topo, frente, lateral) ou numa face da peça: linha, retângulo, círculo, arco (tangente quando sai da ponta de uma linha), polígono e traço livre, em que um rabisco no ar vira linha, retângulo ou círculo perfeitos. Horizontal e vertical travam sozinhas, as pontas se encaixam (coincidentes) e cada entidade tem medidas editáveis.
- **Recursos:** extrusão (juntar, cortar ou interseção; por distância, até uma face ou passante), revolução, furo (simples, escareado, rebaixado ou roscado de M3 a M12, com a rosca desenhada), arredondar e chanfro (topo, base, verticais ou todas), padrão retangular e circular, espelhar, casca e as primitivas da oficina antiga.
- **Árvore:** cada recurso pode ser editado, suprimido ou apagado, e o "Fim da peça" arrasta para voltar no tempo. Toda medida aceita fórmula com parâmetros (aba fx: `D/2`, `largura*1,5`...).
- **Materiais de verdade** (aço, alumínio 6061, latão, titânio, ABS, PLA), com aparência, massa e centro de gravidade.
- **Montagem:** várias peças e uma biblioteca (parafusos, porcas e arruelas M3–M12, rolamentos 608 a 6202, perfil 20×20), com restrições face com face e eixo com eixo, vista explodida animada e lista de materiais.
- **Desenho técnico:** folha A4 no 1º diedro, com vista frontal, superior e lateral esquerda, isométrica, linhas ocultas tracejadas, cotas, notas de furos e roscas e carimbo, salva em PNG. Exporta STL, OBJ e GLB.
- **Inspeção:** medir entre dois pontos, régua de dedos (a distância entre o polegar e o indicador em centímetros), vista em corte com tampa hachurada, massa e centro de gravidade, e uma estimativa de esforço (empurrar a peça mostra um mapa de calor com a tensão máxima e o fator de segurança; é um modelo simplificado, não substitui elementos finitos).
- **Futuristas:** projetar pela voz ("Jarvis, projeta uma flange de 80 mm com 6 furos M6") ou a partir de uma foto do objeto na câmera, pelo cérebro no n8n; mandar a peça para o celular em realidade aumentada (um QR code abre `ra.html` com a peça no tamanho real, o arquivo fica guardado por 24 horas); e uma apresentação de cinema com a câmera dando a volta na peça, legendas, narração e gravação em vídeo.

Os gestos da oficina: a pinça desenha, seleciona e puxa a medida principal do recurso (puxar para cima dá altura à extrusão); girar o pulso durante a pinça gira de 15 em 15°; duas pinças medem a largura entre as mãos e mandam o valor para o campo ativo; joinha confirma e joinha para baixo desfaz; a tesoura (V fechando) faz um furo passante onde você mira; o punho fechado em cima da peça pega e gira em todos os eixos; e a palma esquerda virada para cima abre um menu radial preso à mão, escolhido com a mão direita. Com o mouse: arrastar desenha ou puxa, Enter confirma, Esc cancela, Delete apaga e Ctrl+Z desfaz.

Arquivos: `holo-cad.js` (oficina), `holo-cad-ui.js` (faixa, árvore, propriedades, status e cubo de vistas), `holo-cad-nucleo.js` (geometria, fórmulas, materiais e biblioteca), `holo-cad-montagem.js`, `holo-cad-desenho.js` e `holo-cad-extra.js` (esforço, apresentação e QR code). As operações booleanas usam three-bvh-csg. A oficina fica salva no navegador (`localStorage jarvis.oficina`; a peça da oficina antiga é convertida).

**Música:** instrumentos holográficos tocados com os dedos: piano de duas oitavas (cada dedo que desce numa tecla toca), bateria (bater de cima para baixo, a força vem da velocidade), harpa de laser (passar o dedo pelos feixes), teremim (altura da mão direita é a nota e a da esquerda é o volume) e trilha de cinema (BRAAAM, impacto, subida, tímpano e acordes de cordas). Os sons são sintetizados na hora, com reverb (`holo-musica.js`).

**Mãos:** os pontos da câmera passam por um filtro One Euro, que tira a tremedeira sem atrasar, e os gestos são lidos em 3D com histerese, então a pinça não fica piscando. Além de pinça, apontar, punho e mão aberta, são lidos o joinha, o joinha para baixo, a tesoura, a palma para cima, o giro do pulso, a orientação 3D da mão e o tamanho dela em centímetros (`holo-maos.js`).

**Luva:** a mão aparece vestida com uma luva que se molda a ela: dedos contínuos que seguem a curva das juntas até a ponta arredondada, palma com borda, punho no pulso, placas articuladas nas costas da mão e sensores nas pontas, com a etiqueta "MÃO DIREITA · 18,4 cm · GESTO". O botão ✋ no alto troca o estilo: holograma, armadura (metal vermelho com placas douradas), nano (células violeta com partículas) e carbono (fibra com trilhas de LED verde); na foto real elas viram metal e verniz com reflexo. A pinça solta faíscas, os nós dos dedos acendem no punho e o dedo que toca a peça faz ondas na superfície (`holo-luva.js`).

O dedo apontado vira um **cursor** na tela: ele clica em qualquer botão do laboratório com uma pinça, ou segurando parado em cima um instante.

**Apps:** um mural de vidro com todos os programas do menu Iniciar do PC e os ícones de verdade. Aponte para o Chrome (ou outro app) e faça pinça para abrir a janela dele no computador; mão aberta deslizando troca de página. Quem lista e abre é o Jarvis PC (`pc/apps.py`, rota `/apps`), e ele só abre o que está no menu Iniciar.

**Criar:** um ateliê para desenhar no ar com o dedo (traços de luz), criar formas com a pinça (cubo, esfera, anel, cristal, pirâmide e cilindro, nas cores da barra; afastar os dedos aumenta) e pegar e mover com a pinça. Punho gira tudo e duas mãos ampliam. A criação fica salva no navegador (`holo-criar.js`).

**O Jarvis acompanha o laboratório:** durante a conversa, o que você faz lá (trocar de projeção, abrir um app, desenhar, criar uma forma) chega a ele como contexto. A ferramenta `holograma` também tem as ações `apps`, `criar`, `oficina`, `musica`, `projecoes`, `abrir_app`, `criar_forma`, `selecionar`, `soltar`, `instrumento`, `adicionar` (uma forma simples na oficina, como "cilindro 30 20"), `projetar` (a peça ou a mudança descrita em voz), `foto_peca`, `material`, `desenho`, `corte`, `explodir`, `biblioteca` ("parafuso M8 30"), `vista`, `celular`, `apresentar`, `exemplo_peca`, `exportar` (STL, OBJ ou GLB), `luva`, `desfazer`, `limpar`, `estado` (o que está acontecendo, em texto) e `ver` (uma foto da cena, com a sua câmera no canto, analisada pela visão do cérebro). O workflow "API da interface" no n8n atende a oficina em `jarvis/cad` (frase ou foto vira operações de CAD pelo Groq), `jarvis/ra` (guarda o GLB da peça por 24 horas na tabela `jarvis_ra`) e `jarvis/ra-arquivo` (o link público que o QR code abre).

O botão VISUAL, no laboratório e na barra do console, troca entre dois estilos e fica salvo no navegador. O **holograma** (padrão) é o de cinema: partículas, raios saindo da mesa de projeção e etiquetas presas aos objetos. A **foto real** troca as partículas por objetos de verdade: Terra com texturas da NASA, nuvens, luzes das cidades e dia e noite conforme o sol de agora; Lua com textura de verdade e a fase de hoje; Saturno com anéis e sombras; Sistema Solar com o Sol fervendo e os planetas girando; Via Láctea com faixas de poeira; Buraco Negro com o disco quente e a luz entortada em volta; Reator Arc de aço e cobre; Turbina de metal em corte; Drone de fibra de carbono; Átomo, DNA e Molécula de vidro polido; Coração úmido batendo, com os vasos; Cidade como maquete noturna, com janelas acesas e trânsito; Terreno em relevo com lago, mata, rocha e neve. A Terra mostra a ISS na posição real (API wheretheiss.at) e o clima de Campo Mourão. Os dois estilos ficam numa sala escura com piso de vidro que reflete a cena, e há sons sintetizados no botão SOM. A voz troca o estilo pela ferramenta `holograma`, com as ações `foto_real` e `holograma`.

O console usa a mesma sala atrás dos painéis de vidro, com o reator no centro reagindo à voz. Em placa de vídeo fraca, o console volta para o desenho simples, e o laboratório entra em modo econômico (menos partículas e sem reflexo) quando o vídeo fica lento. Arquivos: `cena.js` (sala, lente, reator de metal e sons), `holo-formas.js` (as projeções novas em partículas), `holo-real.js` (objetos da foto real), `holo-apps.js` (mural de apps), `holo-criar.js` (ateliê), `holo-elementos.js` (partes das projeções e ficha), `holo-cad*.js` (oficina), `holo-musica.js` (instrumentos), `holo-maos.js` (rastreio e gestos), `holo-luva.js` (luva das mãos) e `console3d.js` (cena do console).

### Dispositivos (fones, celulares, TVs)

O painel DISPOSITIVOS (botão VARRER) e a ferramenta `dispositivos` do agente pedem ao Jarvis PC uma varredura de uns 8 segundos (`pc/dispositivos.py`): Bluetooth pareado e por perto pelo próprio Windows, telas que aceitam transmissão (Wi-Fi Direct/Miracast) e a rede de casa (SSDP/UPnP). Conectar pareia um Bluetooth novo, abre o painel rápido do Bluetooth para um já pareado (o Windows não deixa programas ligarem o som de um fone sozinhos), abre o Transmitir (Win+K) para a TV e o Vincular ao Celular para um celular. Precisa dos pacotes `winrt-Windows.Devices.Enumeration` e `winrt-Windows.Foundation` no Python do Jarvis PC.

### Navegador (tarefas em sites)

Peça coisas como "procura um fone bluetooth no Mercado Livre e me fala os três primeiros". A ferramenta `navegador` do agente pede ao Jarvis PC, que abre uma janela própria do Chrome (o "Chrome do Jarvis", perfil em `~/jarvis/chrome-jarvis`) e faz a tarefa passo a passo (`pc/navegador.py` com Playwright). A cada passo o workflow **Jarvis — Navegador (cérebro)** no n8n escolhe a próxima ação (hoje com o Groq; para trocar pelo Claude, mude só o nó *Pensar*). Antes de comprar, enviar, publicar ou apagar, ele para e pergunta; nunca digita senhas nem cartões. Para sites com login, entre uma vez nessa janela do Chrome do Jarvis.

Precisa do Playwright (e, para os dispositivos, dos pacotes winrt) no Python do Jarvis PC:

```bash
uv pip install --python "%USERPROFILE%\jarvis\OpenJarvis\.venv\Scripts\python.exe" playwright winrt-Windows.Devices.Enumeration winrt-Windows.Foundation winrt-Windows.Foundation.Collections
```
