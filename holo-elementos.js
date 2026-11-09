/*
 * holo-elementos.js — as partes de cada projeção do laboratório (holo.js) que dá para pegar.
 *
 * Cada projeção tem elementos em três níveis de detalhe: o nível 1 aparece sempre, o 2 quando a
 * projeção é ampliada e o 3 só bem de perto. Uma pinça em cima de um elemento (ou um clique)
 * foca nele: a projeção gira e se aproxima até ele, e aparece uma ficha animada com o nome se
 * decifrando, o texto sendo escrito e os dados entrando um a um.
 */
import * as THREE from 'three';
import { PLANETAS, DRONE, TERRENO, alturaTerreno, moleculaCafeina, vasosCoracao } from './holo-formas.js';

export const NIVEIS = [{ nivel: 1, escala: 0 }, { nivel: 2, escala: 1.3 }, { nivel: 3, escala: 1.9 }];
export const nivelDaEscala = (escala) => (escala >= 1.9 ? 3 : escala >= 1.3 ? 2 : 1);

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const rad = THREE.MathUtils.degToRad;
const el = (id, nome, nivel, ponto, resumo, texto, dados = [], extra = {}) => ({ id, nome, nivel, ponto: typeof ponto === 'function' ? ponto : () => ponto, resumo, texto, dados, ...extra });

// mesma conta da formaTerra (o Brasil fica de frente)
const naTerra = (lat, lon, r = 2.03) => {
  const la = rad(lat);
  const lo = rad(lon) + rad(52.38);
  return v(Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r, Math.cos(la) * Math.cos(lo) * r);
};
const naLua = (lat, lon, r = 1.93) => v(Math.cos(rad(lat)) * Math.sin(rad(lon)) * r, Math.sin(rad(lat)) * r, Math.cos(rad(lat)) * Math.cos(rad(lon)) * r);
const INCLINA_SATURNO = new THREE.Euler(0.47, 0, 0.12);
const noAnel = (r, a, y = 0) => v(Math.cos(a) * r, y, Math.sin(a) * r).applyEuler(INCLINA_SATURNO);
const fitaDna = (t, fase) => {
  const a = t * 3.2 * Math.PI * 2 + fase;
  return v(Math.cos(a), (t - 0.5) * 5.2, Math.sin(a));
};
const noBraco = (braco, r) => {
  const a = (braco / 4) * Math.PI * 2 + Math.log(r / 0.55) / 0.32;
  return v(Math.cos(a) * r, 0.05, Math.sin(a) * r);
};

const ELEMENTOS = {
  terra: (f) => [
    el('campo-mourao', 'CAMPO MOURÃO', 1, naTerra(-24.05, -52.38, 2.05), 'A cidade do Renato, no centro-oeste do Paraná',
      'Fica a 630 metros de altitude, bem no meio do caminho entre a serra e o rio Paraná, e o Trópico de Capricórnio passa a poucos quilômetros dela.',
      [['Latitude', '24,05° S'], ['Altitude', '630 m'], ['Estado', 'Paraná']], { frente: true }),
    el('iss', 'ESTAÇÃO ESPACIAL', 1, () => f.rotulos.find((r) => r.titulo === 'ISS')?.ponto() || naTerra(0, 0, 2.3), 'O laboratório mais caro já construído, voando agora',
      'A ISS dá uma volta na Terra a cada 92 minutos, a 28 mil km/h. A posição mostrada aqui é a de verdade, atualizada a cada cinco segundos.',
      [['Altitude', '~420 km'], ['Volta completa', '92 min'], ['Tripulação', '7 pessoas']], { frente: true }),
    el('amazonia', 'AMAZÔNIA', 2, naTerra(-3.5, -62), 'A maior floresta tropical do planeta',
      'Cobre 5,5 milhões de km² e produz boa parte da própria chuva: as árvores soltam tanto vapor que formam "rios voadores" que irrigam o sul do Brasil.',
      [['Área', '5,5 mi km²'], ['Espécies', '~10% do planeta'], ['Rio', 'Amazonas']], { frente: true }),
    el('atlantico', 'OCEANO ATLÂNTICO', 2, naTerra(-5, -25), 'O oceano que separa as Américas da Europa e da África',
      'Ainda se abre cerca de 2,5 cm por ano: a cordilheira submarina no meio dele empurra os continentes para longe um do outro.',
      [['Área', '106 mi km²'], ['Profundidade máx.', '8.376 m'], ['Abertura', '2,5 cm/ano']], { frente: true }),
    el('polo-norte', 'POLO NORTE', 2, v(0, 2.06, 0), 'Topo do eixo da Terra',
      'Não tem continente embaixo: é gelo flutuando sobre o Oceano Ártico, e a cada verão uma parte maior dele derrete.',
      [['Temperatura', 'até −40 °C'], ['Gelo', 'flutuante'], ['Sol', '6 meses seguidos']]),
    el('andes', 'CORDILHEIRA DOS ANDES', 3, naTerra(-20, -68), 'A cordilheira mais longa do mundo',
      'São 7 mil km de montanhas do norte ao sul da América do Sul, empurradas para cima pela placa de Nazca afundando sob o continente.',
      [['Extensão', '7.000 km'], ['Pico', 'Aconcágua 6.961 m'], ['Países', '7']], { frente: true }),
    el('himalaia', 'HIMALAIA', 3, naTerra(28, 86), 'Onde fica o ponto mais alto da Terra',
      'Nasceu quando a Índia bateu na Ásia há 50 milhões de anos — e o Everest ainda cresce uns 4 mm por ano.',
      [['Everest', '8.849 m'], ['Idade', '50 mi anos'], ['Crescimento', '4 mm/ano']], { frente: true }),
  ],
  lua: () => [
    el('tranquilidade', 'MAR DA TRANQUILIDADE', 1, v(0.25, 0.42, 0.87).normalize().multiplyScalar(1.94), 'Onde o homem pisou pela primeira vez',
      'A Apollo 11 pousou aqui em 20 de julho de 1969. Os "mares" são planícies de lava escura que endureceu há mais de 3 bilhões de anos.',
      [['Pouso', '20/07/1969'], ['Missão', 'Apollo 11'], ['Idade da lava', '3,6 bi anos']], { frente: true }),
    el('tycho', 'CRATERA TYCHO', 2, naLua(-43, -11), 'A cratera jovem com raios brancos',
      'Tem só 108 milhões de anos — jovem para a Lua — e os raios de material jogado no impacto se espalham por 1.500 km.',
      [['Diâmetro', '85 km'], ['Idade', '108 mi anos'], ['Raios', '1.500 km']], { frente: true }),
    el('procellarum', 'OCEANO DAS TEMPESTADES', 2, naLua(18, -57), 'O maior mar da Lua',
      'Uma planície de basalto do tamanho do Brasil. Apesar do nome, não tem água nem tempestade nenhuma.',
      [['Área', '4 mi km²'], ['Material', 'basalto'], ['Missões', 'Apollo 12']], { frente: true }),
    el('copernico', 'CRATERA COPÉRNICO', 3, naLua(9.6, -20), 'Uma cratera com montanhas no meio',
      'O impacto foi tão forte que o chão "ricocheteou" e formou picos centrais de mais de um quilômetro.',
      [['Diâmetro', '93 km'], ['Profundidade', '3,8 km'], ['Picos', '1,2 km']], { frente: true }),
    el('polo-sul-lua', 'POLO SUL LUNAR', 3, v(0, -1.95, 0.1), 'O destino das próximas missões',
      'Há crateras ali que nunca viram a luz do Sol e guardam gelo — água para beber e combustível para foguetes.',
      [['Temperatura', '−230 °C'], ['Recurso', 'gelo de água'], ['Missão', 'Artemis']]),
  ],
  saturno: () => [
    el('planeta-saturno', 'SATURNO', 1, v(0, 1.25, 0.6).applyEuler(INCLINA_SATURNO), 'O gigante dos anéis',
      'É tão pouco denso que boiaria numa banheira gigante. Um dia lá dura só 10 horas e 34 minutos.',
      [['Diâmetro', '116.460 km'], ['Dia', '10 h 34 min'], ['Densidade', '0,69 g/cm³']]),
    el('anel-b', 'ANEL B', 1, noAnel(2.5, 3.6), 'O anel mais brilhante e denso',
      'Feito de pedaços de gelo de grão de areia até casas inteiras, com no máximo uns 10 metros de espessura.',
      [['Largura', '25.500 km'], ['Espessura', '~10 m'], ['Material', 'gelo de água']]),
    el('cassini', 'DIVISÃO DE CASSINI', 2, noAnel(2.96, 0.5), 'O vão escuro entre os anéis',
      'A lua Mimas "puxa" as partículas dessa faixa a cada volta, e o espaço fica quase vazio.',
      [['Largura', '4.800 km'], ['Causa', 'lua Mimas'], ['Descoberta', '1675']]),
    el('anel-a', 'ANEL A', 2, noAnel(3.4, 2.2), 'O anel de fora',
      'Tem a divisão de Encke, um vão aberto por uma pequena lua pastora chamada Pã.',
      [['Largura', '14.600 km'], ['Vão', 'Encke'], ['Lua pastora', 'Pã']]),
    el('hexagono', 'HEXÁGONO POLAR', 3, v(0, 1.33, 0).applyEuler(INCLINA_SATURNO), 'Uma tempestade com seis lados',
      'No polo norte de Saturno há uma corrente de vento em forma de hexágono, maior que duas Terras.',
      [['Lado', '14.500 km'], ['Ventos', '320 km/h'], ['Visto pela', 'sonda Cassini']]),
    el('anel-c', 'ANEL C', 3, noAnel(2.15, 5.2), 'O anel transparente',
      'Mais escuro e fino que os outros, é tão ralo que dá para ver o planeta através dele.',
      [['Largura', '17.500 km'], ['Brilho', 'baixo'], ['Apelido', 'anel crepe']]),
  ],
  solar: (f, ctx) => {
    const planeta = (i) => () => {
      const [, orbita, raio] = PLANETAS[i];
      const a = i * 2.1 + 0.6 + ctx.tempo() * PLANETAS[i][4] * 0.6;
      return v(Math.cos(a) * orbita, raio + 0.04, -Math.sin(a) * orbita);
    };
    const info = {
      0: ['O mais rápido e mais perto do Sol', 'Dá uma volta no Sol em 88 dias, mas um único dia lá dura 176 dias terrestres.', [['Ano', '88 dias'], ['Temperatura', '−180 a 430 °C'], ['Luas', '0']]],
      1: ['O planeta mais quente', 'A atmosfera de gás carbônico prende o calor: a superfície passa de 460 °C, quente o bastante para derreter chumbo.', [['Temperatura', '465 °C'], ['Dia', '243 dias'], ['Luas', '0']]],
      2: ['O nosso planeta', 'O único lugar conhecido com vida e água líquida na superfície, na distância certa do Sol.', [['Distância', '150 mi km'], ['Ano', '365,25 dias'], ['Luas', '1']]],
      3: ['O planeta vermelho', 'É vermelho de ferrugem e tem o Monte Olimpo, o maior vulcão do Sistema Solar, três vezes mais alto que o Everest.', [['Monte Olimpo', '21,9 km'], ['Dia', '24 h 37 min'], ['Luas', '2']]],
      4: ['O gigante gasoso', 'Caberiam 1.300 Terras dentro dele, e a Grande Mancha Vermelha é uma tempestade maior que o nosso planeta, girando há séculos.', [['Massa', '318 Terras'], ['Dia', '9 h 56 min'], ['Luas', '95']]],
      5: ['O senhor dos anéis', 'Os anéis têm 280 mil km de largura, mas em média só uns 10 metros de espessura.', [['Anéis', '7 principais'], ['Dia', '10 h 34 min'], ['Luas', '146']]],
      6: ['O planeta deitado', 'Gira de lado, com o eixo quase deitado na órbita — provavelmente depois de uma colisão gigante.', [['Inclinação', '98°'], ['Ano', '84 anos'], ['Luas', '28']]],
      7: ['O mais distante', 'Tem os ventos mais rápidos do Sistema Solar, passando de 2.000 km/h, e foi descoberto pela matemática antes de ser visto.', [['Ventos', '2.100 km/h'], ['Ano', '165 anos'], ['Luas', '16']]],
    };
    const niveis = [2, 2, 1, 1, 1, 1, 2, 2];
    return [
      el('sol', 'SOL', 1, v(0, 0.66, 0), 'A estrela que segura tudo isso',
        'Concentra 99,8% de toda a massa do Sistema Solar. A luz que sai dele agora chega aqui em 8 minutos e 20 segundos.',
        [['Superfície', '5.500 °C'], ['Núcleo', '15 mi °C'], ['Luz até a Terra', '8 min 20 s']]),
      ...PLANETAS.map(([nome], i) => el(`planeta-${i}`, nome, niveis[i], planeta(i), info[i][0], info[i][1], info[i][2])),
      el('cinturao', 'CINTURÃO DE ASTEROIDES', 3, v(2.32, 0.05, 0), 'Os restos de um planeta que não se formou',
        'Milhões de rochas entre Marte e Júpiter — mas tão espalhadas que as sondas passam por ali sem desviar.',
        [['Maior', 'Ceres 940 km'], ['Objetos', 'milhões'], ['Massa total', '3% da Lua']]),
    ];
  },
  galaxia: () => [
    el('sgr-a', 'SAGITÁRIO A*', 1, v(0, 0.22, 0), 'O buraco negro no centro da galáxia',
      'Tem a massa de 4 milhões de sóis espremida num espaço menor que a órbita de Mercúrio. Foi fotografado pela primeira vez em 2022.',
      [['Massa', '4,3 mi sóis'], ['Distância', '26 mil anos-luz'], ['Foto', '2022']]),
    el('sol-galaxia', 'VOCÊ ESTÁ AQUI', 1, v(Math.cos(2.3) * 2.6, 0.05, Math.sin(2.3) * 2.6), 'O Sol, no braço de Órion',
      'O Sistema Solar leva 230 milhões de anos para dar uma volta no centro da galáxia: a última vez que estivemos neste ponto, os dinossauros nem existiam.',
      [['Volta galáctica', '230 mi anos'], ['Velocidade', '828 mil km/h'], ['Braço', 'Órion']]),
    el('barra', 'BARRA CENTRAL', 2, v(0.75, 0.05, 0), 'A barra de estrelas velhas no meio',
      'A Via Láctea é uma espiral barrada: no centro, as estrelas formam uma barra comprida que alimenta os braços.',
      [['Comprimento', '27 mil anos-luz'], ['Estrelas', 'velhas e vermelhas'], ['Tipo', 'SBbc']]),
    el('perseu', 'BRAÇO DE PERSEU', 2, noBraco(1, 3.2), 'Um dos dois braços principais',
      'Cheio de nuvens de gás onde estrelas novas estão nascendo agora mesmo.',
      [['Extensão', 'meia galáxia'], ['Destaque', 'nebulosa do Coração'], ['Tipo', 'braço principal']]),
    el('sagitario-braco', 'BRAÇO DE SAGITÁRIO', 2, noBraco(2, 2.1), 'O braço entre nós e o centro',
      'É ele que esconde boa parte do centro da galáxia atrás de poeira, quando olhamos o céu de noite.',
      [['Destaque', 'nebulosa da Águia'], ['Distância', '6.500 anos-luz'], ['Tipo', 'braço menor']]),
    el('orion', 'NEBULOSA DE ÓRION', 3, v(Math.cos(2.42) * 2.55, 0.08, Math.sin(2.42) * 2.55), 'Um berçário de estrelas visível a olho nu',
      'Fica a 1.344 anos-luz, na espada da constelação de Órion — dá para ver de Campo Mourão numa noite sem lua.',
      [['Distância', '1.344 anos-luz'], ['Estrelas novas', '~700'], ['Visível', 'a olho nu']]),
    el('halo', 'HALO GALÁCTICO', 3, v(0, 1.8, 1.2), 'A esfera que envolve o disco',
      'Tem aglomerados de estrelas antiquíssimos e muita matéria escura, que não brilha mas segura a galáxia pela gravidade.',
      [['Aglomerados', '~150'], ['Matéria escura', '~90% da massa'], ['Idade', '13 bi anos']]),
  ],
  buraco: () => [
    el('horizonte', 'HORIZONTE DE EVENTOS', 1, v(0, 0.86, 0), 'O ponto sem volta',
      'Daqui para dentro, nem a luz consegue escapar. Quem cruzasse veria o universo de fora acelerar como num filme.',
      [['Escape', 'mais que a luz'], ['Raio', '2GM/c²'], ['Tempo', 'quase para']]),
    el('disco', 'DISCO DE ACREÇÃO', 1, v(2.3, 0.02, 0.6), 'Gás girando quase à velocidade da luz',
      'O atrito esquenta o gás a milhões de graus. O lado que vem na nossa direção brilha mais — é o efeito Doppler da relatividade.',
      [['Temperatura', 'milhões de °C'], ['Velocidade', '~30% da luz'], ['Brilho', 'Doppler']]),
    el('jato', 'JATO RELATIVÍSTICO', 2, v(0, 2.4, 0), 'Matéria disparada pelos polos',
      'Campos magnéticos torcidos lançam plasma a quase a velocidade da luz por milhares de anos-luz.',
      [['Velocidade', '99% da luz'], ['Alcance', 'milhares de anos-luz'], ['Origem', 'campo magnético']]),
    el('fotons', 'ESFERA DE FÓTONS', 2, v(0.6, 0.62, 0.2), 'Onde a luz anda em círculo',
      'A uma vez e meia o raio do horizonte, a gravidade é tão forte que a luz pode orbitar o buraco negro.',
      [['Raio', '1,5 × horizonte'], ['Órbita', 'instável'], ['Aparece', 'anel brilhante']]),
    el('isco', 'ÚLTIMA ÓRBITA ESTÁVEL', 3, v(-1.05, 0.02, 0.2), 'A beirada de dentro do disco',
      'Mais perto que isso, nenhuma órbita se sustenta: o gás despenca em espiral direto para o horizonte.',
      [['Raio', '3 × horizonte'], ['Sigla', 'ISCO'], ['Depois', 'queda livre']]),
    el('lente', 'LUZ ENTORTADA', 3, v(0, 1.35, -0.05), 'A parte de trás do disco, vista por cima',
      'A gravidade curva a luz da parte de trás do disco e ela aparece como um arco por cima e por baixo do buraco negro — como no filme Interestelar.',
      [['Efeito', 'lente gravitacional'], ['Previsto por', 'Einstein'], ['Foto real', 'M87* 2019']]),
  ],
  reator: () => [
    el('nucleo-arc', 'NÚCLEO', 1, v(0, 0, 0.3), 'O coração do Reator Arc',
      'No filme, gera 3 gigajoules por segundo — o bastante para manter o coração de Tony Stark batendo e a armadura voando.',
      [['Saída', '3 GJ/s'], ['Elemento', 'paládio → vibrânio'], ['Criador', 'Tony Stark']]),
    el('bobinas', 'BOBINAS', 1, v(Math.cos(0.6) * 1.8, Math.sin(0.6) * 1.8, 0.2), 'Dez bobinas de cobre em anel',
      'Criam o campo magnético que segura o plasma do núcleo no lugar, como num reator de fusão de verdade.',
      [['Quantidade', '10'], ['Material', 'cobre'], ['Função', 'confinar o plasma']]),
    el('triangulo', 'TRIÂNGULO', 2, v(0, 0.92, 0.15), 'A marca do segundo reator',
      'O triângulo apareceu quando Tony trocou o paládio, que o envenenava, por um elemento novo sintetizado por ele.',
      [['Versão', 'Mark II'], ['Filme', 'Homem de Ferro 2'], ['Elemento', 'novo']]),
    el('carcaca', 'CARCAÇA', 2, v(2.42, 0, 0.1), 'O anel de aço que segura tudo',
      'Aguenta o calor e a pressão do núcleo e serve de encaixe no peito — ou na armadura.',
      [['Material', 'liga de aço'], ['Diâmetro', '~7 cm'], ['Encaixe', 'peito']]),
    el('contencao', 'ANEL DE CONTENÇÃO', 3, v(0, -1.05, 0.12), 'A barreira entre o plasma e as bobinas',
      'Um anel isolante que impede o calor do núcleo de derreter as bobinas de cobre.',
      [['Função', 'isolamento térmico'], ['Posição', 'anel interno'], ['Falha', 'não é uma opção']]),
  ],
  turbina: () => [
    el('fan', 'FAN', 1, v(-1.85, 0.95, 0.35), 'As pás grandes da frente',
      'Empurra 90% do ar por fora do motor, e é esse ar que dá a maior parte do empuxo — por isso os motores modernos são tão largos.',
      [['Pás', '22 de titânio'], ['Rotação', '4.800 RPM'], ['Ar por fora', '90%']]),
    el('compressor', 'COMPRESSOR', 1, v(-0.9, 0.62, 0.3), 'Espreme o ar 40 vezes',
      'Vários estágios de palhetas apertam o ar antes de ele chegar ao fogo, o que deixa a queima muito mais eficiente.',
      [['Estágios', '7 + 3'], ['Pressão', '40 ×'], ['Rotação', '13.000 RPM']]),
    el('camara', 'CÂMARA DE COMBUSTÃO', 1, v(0.35, 0.55, 0.3), 'Onde o querosene queima',
      'Chega a 1.700 °C, mais quente que o ponto de fusão do metal em volta — uma camada de ar frio protege as paredes.',
      [['Temperatura', '1.700 °C'], ['Combustível', 'querosene'], ['Proteção', 'película de ar']]),
    el('turbina-estagio', 'TURBINA', 2, v(1.1, 0.5, 0.25), 'Tira energia do gás quente',
      'O gás quente gira essas palhetas, que por um eixo giram o fan e o compressor lá na frente.',
      [['Estágios', '4'], ['Pás', 'monocristal'], ['Temperatura', '1.400 °C']]),
    el('escape', 'BOCAL DE ESCAPE', 2, v(2.1, 0.25, 0.15), 'Por onde o jato sai',
      'O cone acelera os gases quentes para trás; pela terceira lei de Newton, o avião vai para a frente.',
      [['Lei', '3ª de Newton'], ['Saída', '~600 m/s'], ['Ruído', 'até 140 dB']]),
    el('carenagem', 'CARENAGEM', 2, v(-0.5, 1.33, 0.3), 'A casca que guia o ar',
      'Além de proteger, guia o ar do fan e abriga o reversor que ajuda a frear o avião no pouso.',
      [['Material', 'compósito'], ['Função', 'reversor de empuxo'], ['Diâmetro', '~2,6 m']]),
    el('spinner', 'CONE DO FAN', 3, v(-2.25, 0.18, 0.12), 'A ponta da frente',
      'Muitos têm uma espiral pintada: avisa os mecânicos que o motor está girando e dizem que espanta pássaros.',
      [['Pintura', 'espiral'], ['Função', 'guiar o ar'], ['Aviso', 'motor girando']]),
    el('eixo', 'EIXO', 3, v(0.0, 0.14, 0.2), 'Liga a turbina ao fan',
      'São dois eixos, um dentro do outro, girando em velocidades diferentes.',
      [['Eixos', '2 concêntricos'], ['Alta', '13.000 RPM'], ['Baixa', '4.800 RPM']]),
  ],
  drone: () => [
    el('gimbal', 'GIMBAL', 1, v(0, -0.3, 0.72), 'A câmera que nunca treme',
      'Três motores pequenos compensam cada movimento do drone mil vezes por segundo para a imagem ficar lisa.',
      [['Eixos', '3'], ['Vídeo', '4K 60 fps'], ['Correção', '1 kHz']]),
    el('rotor', 'ROTORES', 1, () => DRONE.motores[0].clone().setY(0.22), 'Quatro hélices, duas para cada lado',
      'Duas giram no sentido horário e duas no anti-horário, para o drone não sair girando. Para virar, ele acelera umas e freia outras.',
      [['Rotação', '7.200 RPM'], ['Hélices', '4'], ['Sentidos', '2 + 2']]),
    el('motor', 'MOTOR', 2, () => DRONE.motores[2].clone().setY(0.05), 'Motor elétrico sem escovas',
      'Sem escovas para gastar, dura milhares de horas e muda de velocidade em milissegundos.',
      [['Tipo', 'brushless'], ['Resposta', '~5 ms'], ['Potência', '~200 W']]),
    el('bateria', 'BATERIA', 2, v(0, 0.2, -0.2), 'Fica dentro do corpo',
      'De polímero de lítio, guarda energia para uns 38 minutos de voo e tem sensores de temperatura em cada célula.',
      [['Química', 'Li-Po'], ['Autonomia', '38 min'], ['Células', '4']]),
    el('leds', 'LUZES DE NAVEGAÇÃO', 3, () => DRONE.motores[0].clone().setY(-0.1), 'Verde na frente, vermelho atrás',
      'Mostram para onde o drone está virado de longe, igual às luzes dos aviões.',
      [['Frente', 'verde'], ['Trás', 'vermelho'], ['Alcance visual', '~500 m']]),
    el('pernas', 'TREM DE POUSO', 3, () => v(DRONE.motores[1].x * 0.48, -0.55, DRONE.motores[1].z * 0.48), 'As pernas',
      'Levantam o corpo para a câmera não bater no chão na hora de pousar.',
      [['Altura', '~12 cm'], ['Material', 'fibra de carbono'], ['Peso', 'leve']]),
  ],
  atomo: (f) => [
    el('nucleo', 'NÚCLEO', 1, v(0.15, 0.2, 0.3), 'Quase toda a massa, quase nenhum espaço',
      'Se o átomo fosse um estádio de futebol, o núcleo seria uma ervilha no meio do gramado — o resto é vazio.',
      [['Prótons', '20'], ['Nêutrons', '20'], ['Elemento', 'cálcio-40']]),
    el('eletron', 'ELÉTRON', 1, () => f.rotulos.find((r) => r.titulo === 'ELÉTRON')?.ponto() || v(2, 0, 0), 'Carga negativa em movimento',
      'Não gira numa órbita de verdade: está numa nuvem de probabilidade, em vários lugares ao mesmo tempo até alguém medir.',
      [['Carga', '−1'], ['Massa', '1/1836 do próton'], ['Descoberta', '1897']]),
    el('proton', 'PRÓTON', 2, v(0.32, 0.05, 0.25), 'Carga positiva no núcleo',
      'É feito de três quarks presos pela força forte — a mais forte da natureza.',
      [['Carga', '+1'], ['Quarks', '2 up + 1 down'], ['Vida', 'praticamente eterna']]),
    el('neutron', 'NÊUTRON', 2, v(-0.28, -0.1, 0.3), 'Sem carga, segura o núcleo',
      'Sem os nêutrons, os prótons se repeliriam e o núcleo explodiria. Sozinho, um nêutron dura só uns 15 minutos.',
      [['Carga', '0'], ['Quarks', '1 up + 2 down'], ['Sozinho', '~15 min']]),
    el('orbita', 'CAMADA ELETRÔNICA', 2, v(2.7, 0.3, 0).applyEuler(new THREE.Euler(0.35, 0.3, 0)), 'Os níveis de energia',
      'Os elétrons só podem ficar em certos níveis de energia; ao pular de um para outro, soltam luz de uma cor exata.',
      [['Camadas', 'K, L, M, N'], ['Salto', 'emite luz'], ['Modelo', 'Bohr, 1913']]),
    el('nuvem', 'NUVEM DE PROBABILIDADE', 3, v(-1.6, 1.0, 0.6), 'Onde o elétron provavelmente está',
      'A física quântica não diz onde o elétron está, só a chance de achá-lo em cada lugar.',
      [['Teoria', 'mecânica quântica'], ['Equação', 'Schrödinger'], ['Ano', '1926']]),
  ],
  dna: () => [
    el('fita', 'FITA DE AÇÚCAR E FOSFATO', 1, fitaDna(0.85, 0), 'O corrimão da escada',
      'As duas fitas correm em sentidos opostos e protegem as bases do lado de dentro.',
      [['Fitas', '2'], ['Sentido', 'antiparalelas'], ['Ligação', 'fosfodiéster']]),
    el('par-at', 'PAR A–T', 1, fitaDna(0.72, 0).lerp(fitaDna(0.72, Math.PI), 0.3), 'Adenina com timina',
      'Sempre juntas, presas por duas pontes de hidrogênio — é isso que permite copiar o DNA sem erro.',
      [['Pontes H', '2'], ['Bases', 'A e T'], ['Tipo', 'purina + pirimidina']]),
    el('par-gc', 'PAR G–C', 1, fitaDna(0.3, Math.PI).lerp(fitaDna(0.3, 0), 0.3), 'Guanina com citosina',
      'Com três pontes de hidrogênio, é um par mais forte que o A–T.',
      [['Pontes H', '3'], ['Bases', 'G e C'], ['Força', 'maior']]),
    el('volta', 'VOLTA DA HÉLICE', 2, v(1.05, 0.4, 0), 'Dez pares por volta',
      'A cada 10,5 pares a hélice dá uma volta completa de 3,4 nanômetros.',
      [['Pares por volta', '10,5'], ['Passo', '3,4 nm'], ['Forma', 'B-DNA']]),
    el('sulco', 'SULCO MAIOR', 2, fitaDna(0.5, Math.PI / 2).multiplyScalar(1.05), 'A fresta por onde as proteínas leem',
      'As proteínas que ligam e desligam os genes encaixam aqui e "leem" a sequência sem abrir a hélice.',
      [['Largura', '2,2 nm'], ['Função', 'leitura de genes'], ['Par', 'sulco menor']]),
    el('pontes', 'PONTES DE HIDROGÊNIO', 3, fitaDna(0.12, 0).lerp(fitaDna(0.12, Math.PI), 0.5), 'O zíper do DNA',
      'São ligações fracas de propósito: o DNA abre como um zíper para ser copiado e fecha de novo.',
      [['Força', 'fraca'], ['Abre a', '~95 °C'], ['Função', 'zíper']]),
  ],
  molecula: () => {
    const { atomos } = moleculaCafeina();
    const achar = (elem, n = 0) => atomos.filter((a) => a.el === elem)[n]?.p.clone() || v(0, 0, 0);
    return [
      el('anel', 'ANEL DE PURINA', 1, v(0.1, 0, 0.25), 'O esqueleto da cafeína',
        'É o mesmo tipo de anel duplo da adenina e da guanina do DNA — a cafeína é "prima" das letras do código genético.',
        [['Anéis', '6 + 5'], ['Família', 'purinas'], ['Parente', 'adenina']]),
      el('oxigenio', 'OXIGÊNIO', 1, achar('O'), 'Dois oxigênios em ligação dupla',
        'Puxam elétrons para si e deixam a molécula levemente polar, o que ajuda a cafeína a se dissolver na água do café.',
        [['Quantidade', '2'], ['Ligação', 'C=O'], ['Cor no modelo', 'vermelho']]),
      el('nitrogenio', 'NITROGÊNIO', 1, achar('N', 1), 'Quatro nitrogênios nos anéis',
        'São eles que encaixam nos receptores de adenosina do cérebro e bloqueiam o sinal de cansaço.',
        [['Quantidade', '4'], ['Efeito', 'bloqueia adenosina'], ['Cor no modelo', 'azul']]),
      el('metila', 'GRUPO METILA', 2, achar('C', 7), 'Três "galhos" de CH₃',
        'São os três grupos metila que diferenciam a cafeína da xantina e deixam ela atravessar fácil para o cérebro.',
        [['Quantidade', '3'], ['Fórmula', 'CH₃'], ['Efeito', 'chega ao cérebro']]),
      el('hidrogenio', 'HIDROGÊNIO', 2, achar('H', 2), 'O átomo mais leve',
        'A cafeína tem dez hidrogênios, quase todos nas metilas.',
        [['Quantidade', '10'], ['Cor no modelo', 'branco'], ['Massa', '1 u']]),
      el('efeito', 'NO CORPO', 3, v(-1.5, 1.0, 0), 'De 15 a 45 minutos para fazer efeito',
        'Uma xícara de café tem uns 95 mg de cafeína; o corpo elimina metade dela em cerca de 5 horas.',
        [['Xícara', '~95 mg'], ['Meia-vida', '~5 h'], ['Efeito', '15–45 min']]),
    ];
  },
  coracao: () => {
    const vasos = vasosCoracao();
    return [
      el('aorta', 'AORTA', 1, () => vasos.aorta.getPoint(0.45), 'A maior artéria do corpo',
        'Sai do ventrículo esquerdo e distribui o sangue rico em oxigênio para o corpo inteiro. É grossa como uma mangueira de jardim.',
        [['Diâmetro', '~2,5 cm'], ['Pressão', '120/80 mmHg'], ['Leva', 'sangue oxigenado']]),
      el('ventriculo-e', 'VENTRÍCULO ESQUERDO', 1, v(-0.55, -0.35, 0.65), 'A bomba mais forte',
        'Tem a parede mais grossa do coração porque empurra o sangue para o corpo todo — uns 70 ml a cada batida.',
        [['Por batida', '~70 ml'], ['Parede', '~1,2 cm'], ['Pressão', '120 mmHg']]),
      el('pulmonar', 'ARTÉRIA PULMONAR', 1, () => vasos.pulmonar.getPoint(0.55), 'Leva o sangue para respirar',
        'É a única artéria que carrega sangue pobre em oxigênio: ele vai para os pulmões trocar gás carbônico por oxigênio.',
        [['Leva', 'sangue venoso'], ['Destino', 'pulmões'], ['Pressão', '25 mmHg']]),
      el('ventriculo-d', 'VENTRÍCULO DIREITO', 2, v(0.5, -0.3, 0.6), 'Bombeia para os pulmões',
        'Faz menos força que o esquerdo, porque os pulmões ficam pertinho.',
        [['Pressão', '25 mmHg'], ['Parede', '~0,4 cm'], ['Destino', 'pulmões']]),
      el('cava', 'VEIA CAVA', 2, () => vasos.cava.getPoint(0.6), 'O sangue voltando para casa',
        'Traz de volta ao coração todo o sangue que já passou pelo corpo.',
        [['Diâmetro', '~2 cm'], ['Chega no', 'átrio direito'], ['Leva', 'sangue venoso']]),
      el('coronaria-e', 'CORONÁRIA ESQUERDA', 2, () => vasos.coronariaE.getPoint(0.4), 'O coração alimentando a si mesmo',
        'As coronárias irrigam o próprio músculo do coração. Quando entopem, acontece o infarto.',
        [['Irriga', 'lado esquerdo'], ['Diâmetro', '~4 mm'], ['Risco', 'infarto']]),
      el('apice', 'ÁPICE', 3, v(0, -1.42, 0.25), 'A ponta do coração',
        'Aponta para a esquerda e para baixo; é ali que se sente a batida com a mão no peito.',
        [['Posição', '5º espaço intercostal'], ['Lado', 'esquerdo'], ['Batidas/dia', '~100 mil']]),
      el('coronaria-d', 'CORONÁRIA DIREITA', 3, () => vasos.coronariaD.getPoint(0.5), 'Irriga o lado direito',
        'Também alimenta o nó sinusal, o "marca-passo natural" que dá o ritmo das batidas.',
        [['Irriga', 'lado direito'], ['Alimenta', 'nó sinusal'], ['Diâmetro', '~3,5 mm']]),
    ];
  },
  cidade: (f) => {
    const predios = f.opcoesReal?.predios || [];
    const base = f.opcoesReal?.base ?? -1.7;
    const torre = predios.reduce((a, b) => (b.h > (a?.h ?? -1) ? b : a), null) || { x: 0, z: 0, h: 2 };
    const segunda = [...predios].sort((a, b) => b.h - a.h)[4] || torre;
    return [
      el('torre', 'TORRE CENTRAL', 1, v(torre.x, base + torre.h + 0.05, torre.z), 'O prédio mais alto do mapa',
        `Com ${Math.round(torre.h * 100)} metros, aparece de qualquer ponto da cidade; a baliza vermelha no topo avisa os aviões.`,
        [['Altura', `${Math.round(torre.h * 100)} m`], ['Andares', `~${Math.round(torre.h * 100 / 3.2)}`], ['Baliza', 'vermelha']]),
      el('centro', 'CENTRO', 1, v(0, base + 0.6, 1.0), 'Onde os prédios ficam mais altos',
        'As quadras do meio concentram os edifícios; as alturas caem em direção às bordas, como numa cidade de verdade.',
        [['Quadras', String(predios.length)], ['Perfil', 'em pirâmide'], ['Varredura', 'ativa']]),
      el('avenidas', 'AVENIDAS', 2, v(0.23, base + 0.02, 2.6), 'A grade de ruas',
        'As ruas cortam a cidade em quadras de 46 metros; na foto real dá para ver o trânsito andando.',
        [['Padrão', 'grade'], ['Quadra', '46 m'], ['Trânsito', 'na foto real']]),
      el('predio', 'EDIFÍCIO COMERCIAL', 2, v(segunda.x, base + segunda.h + 0.05, segunda.z), 'Um dos cinco mais altos',
        'À noite, as janelas acesas mostram quem ainda está trabalhando.',
        [['Altura', `${Math.round(segunda.h * 100)} m`], ['Uso', 'escritórios'], ['Janelas', 'acesas à noite']]),
      el('varredura', 'VARREDURA DE ALTURA', 3, v(-2.9, base + 1.4, -2.9), 'O plano verde subindo e descendo',
        'Simula um sensor medindo a altura de cada prédio, como os mapas 3D feitos por avião ou satélite.',
        [['Sensor', 'LIDAR'], ['Uso', 'mapas 3D'], ['Precisão', 'centímetros']]),
    ];
  },
  terreno: () => {
    let pico = { h: 0, x: 0, z: 0 };
    let vale = { h: 99, x: 0, z: 0 };
    for (let i = -28; i <= 28; i++) {
      for (let j = -28; j <= 28; j++) {
        const x = i * 0.1;
        const z = j * 0.1;
        const h = alturaTerreno(x, z);
        if (h > pico.h) pico = { h, x, z };
        if (Math.abs(x) < 2 && Math.abs(z) < 2 && h > TERRENO.agua + 0.15 && h < vale.h) vale = { h, x, z };
      }
    }
    const { base, agua } = TERRENO;
    return [
      el('pico', 'PICO', 1, v(pico.x, base + pico.h + 0.05, pico.z), 'O ponto mais alto do relevo',
        'Acima de certa altitude não crescem mais árvores: sobra rocha e, no topo, neve.',
        [['Altitude', `${Math.round(pico.h * 1350).toLocaleString('pt-BR')} m`], ['Topo', 'neve'], ['Vegetação', 'acaba antes']]),
      el('lago', 'LAGO', 1, v(-2, base + agua + 0.02, 2), 'Onde a água se acumula',
        'Fica na parte mais baixa do terreno; os rios da serra descem todos para cá.',
        [['Nível', '0 m'], ['Alimentado por', 'rios da serra'], ['Margem', 'areia']]),
      el('serra', 'SERRA', 2, v(pico.x * 0.6, base + alturaTerreno(pico.x * 0.6, pico.z * 0.6) + 0.05, pico.z * 0.6), 'A cadeia de morros no meio',
        'A serra separa as águas: a chuva de um lado corre para o lago, a do outro vai embora.',
        [['Função', 'divisor de águas'], ['Encostas', 'íngremes'], ['Cobertura', 'mata']]),
      el('vale', 'VALE', 2, v(vale.x, base + vale.h + 0.04, vale.z), 'O caminho natural entre os morros',
        'Os vales concentram a água e, por isso, quase sempre foram os primeiros lugares ocupados por gente.',
        [['Altitude', `${Math.round(vale.h * 1350).toLocaleString('pt-BR')} m`], ['Solo', 'fértil'], ['Água', 'abundante']]),
      el('curvas', 'CURVAS DE NÍVEL', 3, v(1.2, base + alturaTerreno(1.2, -1) + 0.04, -1), 'Linhas da mesma altitude',
        'Quanto mais juntas as linhas, mais íngreme o terreno — é assim que os mapas topográficos mostram o relevo.',
        [['Intervalo', '270 m'], ['Juntas', 'terreno íngreme'], ['Separadas', 'terreno plano']]),
    ];
  },
};

// ---------------- etiquetas e ficha animada ----------------
const CSS = `
.holo-elementos{ position:absolute; inset:0; z-index:1; pointer-events:none; overflow:hidden; }
.holo-elemento{ position:absolute; left:0; top:0; display:flex; align-items:center; gap:0; padding:3px; pointer-events:auto; cursor:pointer;
  background:rgba(2,12,18,0.55); border:1px solid rgba(77,232,240,0.28); border-radius:12px; color:#cfeff3; font-family:'Share Tech Mono',monospace;
  font-size:9.5px; letter-spacing:1.5px; white-space:nowrap; transition:opacity .3s, border-color .2s, background .2s, box-shadow .2s; will-change:transform; }
.holo-elemento i{ width:12px; height:12px; flex:none; border:1.5px solid #4de8f0; transform:rotate(45deg); border-radius:2px; box-shadow:0 0 8px #4de8f0; position:relative; }
.holo-elemento i::after{ content:""; position:absolute; inset:3px; background:#4de8f0; border-radius:1px; }
.holo-elemento[data-nivel="2"] i{ border-color:#5dfca0; box-shadow:0 0 8px #5dfca0; } .holo-elemento[data-nivel="2"] i::after{ background:#5dfca0; }
.holo-elemento[data-nivel="3"] i{ border-color:#ffa24c; box-shadow:0 0 8px #ffa24c; } .holo-elemento[data-nivel="3"] i::after{ background:#ffa24c; }
/* só o losango aparece; o nome surge quando o elemento entra na tela e quando é mirado */
.holo-elemento span{ max-width:0; overflow:hidden; opacity:0; transition:max-width .35s ease, opacity .3s, margin .35s; }
.holo-elemento:hover span, .holo-elemento.mirado span, .holo-elemento.apresenta span{ max-width:240px; opacity:1; margin:0 6px 0 7px; }
.holo-elemento:hover, .holo-elemento.mirado{ border-color:#4de8f0; background:rgba(10,40,52,0.8); box-shadow:0 0 16px rgba(77,232,240,0.45); color:#fff; }
.holo-elemento.surgindo{ animation:holo-el-surge .5s cubic-bezier(.2,.9,.3,1.4) both; }
@keyframes holo-el-surge{ from{ opacity:0; filter:blur(4px); } }
.holo-elemento .carga{ position:absolute; left:3px; bottom:-3px; right:6px; height:2px; transform-origin:0 50%; transform:scaleX(var(--carga,0)); background:#4de8f0; box-shadow:0 0 6px #4de8f0; }
.holo-alvo{ position:absolute; left:0; top:0; width:74px; height:74px; margin:-37px; z-index:2; pointer-events:none; opacity:0; transition:opacity .3s; will-change:transform; }
.holo-alvo.ativo{ opacity:1; }
.holo-alvo svg{ width:100%; height:100%; overflow:visible; }
.holo-alvo .gira{ transform-origin:37px 37px; animation:holo-alvo-gira 6s linear infinite; }
@keyframes holo-alvo-gira{ to{ transform:rotate(360deg); } }
.holo-alvo .pulsa{ transform-origin:37px 37px; animation:holo-alvo-pulsa 1.6s ease-out infinite; }
@keyframes holo-alvo-pulsa{ from{ transform:scale(.5); opacity:1; } to{ transform:scale(1.5); opacity:0; } }
.holo-ficha-linha{ position:absolute; left:0; top:0; height:1px; z-index:2; pointer-events:none; transform-origin:0 50%; opacity:0; transition:opacity .3s;
  background:linear-gradient(90deg, #4de8f0, rgba(77,232,240,0.25)); box-shadow:0 0 6px rgba(77,232,240,0.6); will-change:transform; }
.holo-ficha-linha.ativo{ opacity:1; }
.holo-ficha{ position:absolute; right:22px; top:92px; width:330px; z-index:3; padding:16px 18px 14px; color:#e9f7f9;
  background:linear-gradient(160deg, rgba(10,36,50,0.86), rgba(3,14,22,0.8)); border:1px solid rgba(77,232,240,0.35); border-radius:4px;
  backdrop-filter:blur(10px); box-shadow:0 0 40px rgba(77,232,240,0.15), inset 0 0 30px rgba(77,232,240,0.06); animation:holo-ficha-abre .55s cubic-bezier(.2,.8,.2,1) both; overflow:hidden; }
.holo-ficha[hidden]{ display:none; }
@keyframes holo-ficha-abre{ from{ clip-path:inset(0 0 100% 0); opacity:0; } to{ clip-path:inset(0 0 0 0); opacity:1; } }
.holo-ficha::before, .holo-ficha::after{ content:""; position:absolute; width:16px; height:16px; border:2px solid #4de8f0; }
.holo-ficha::before{ top:-1px; left:-1px; border-right:0; border-bottom:0; } .holo-ficha::after{ bottom:-1px; right:-1px; border-left:0; border-top:0; }
.holo-ficha .varre{ position:absolute; left:0; right:0; height:40px; top:-40px; background:linear-gradient(180deg, transparent, rgba(77,232,240,0.12), transparent); animation:holo-ficha-varre 3.2s linear infinite; pointer-events:none; }
@keyframes holo-ficha-varre{ to{ top:110%; } }
.holo-ficha-topo{ display:flex; justify-content:space-between; font-family:'Share Tech Mono',monospace; font-size:9.5px; letter-spacing:2px; color:#4de8f0; }
.holo-ficha h3{ margin:8px 0 2px; font-family:'Orbitron',sans-serif; font-size:17px; font-weight:900; letter-spacing:3px; line-height:1.15; text-shadow:0 0 16px rgba(77,232,240,0.6); }
.holo-ficha-resumo{ margin:0 0 10px; font-size:13.5px; color:#8ff3f7; font-style:italic; }
.holo-ficha-centro{ display:grid; grid-template-columns:78px 1fr; gap:12px; align-items:start; }
.holo-ficha-radar svg{ width:78px; height:78px; overflow:visible; }
.holo-ficha-radar .feixe{ transform-origin:39px 39px; animation:holo-alvo-gira 2.4s linear infinite; }
.holo-ficha-texto{ margin:0; min-height:5.2em; font-size:13.5px; line-height:1.38; color:#cfe7ec; }
.holo-ficha-texto::after{ content:"▌"; color:#4de8f0; animation:holo-pisca 1s steps(1) infinite; }
.holo-ficha-texto.pronto::after{ content:""; }
@keyframes holo-pisca{ 50%{ opacity:0; } }
.holo-ficha dl{ margin:12px 0 0; display:grid; gap:6px; }
.holo-ficha dl div{ display:grid; grid-template-columns:1fr auto; gap:2px 10px; font-family:'Share Tech Mono',monospace; font-size:11px; opacity:0; animation:holo-ficha-dado .45s ease forwards; }
.holo-ficha dt{ color:#5f8791; letter-spacing:1px; } .holo-ficha dd{ margin:0; color:#e9f7f9; text-align:right; }
.holo-ficha dl div::after{ content:""; grid-column:1 / -1; height:2px; background:linear-gradient(90deg, #4de8f0 var(--barra,60%), rgba(77,232,240,0.12) 0); transform-origin:0 50%; animation:holo-ficha-barra .9s ease both; animation-delay:inherit; }
@keyframes holo-ficha-dado{ from{ opacity:0; transform:translateX(12px); } to{ opacity:1; transform:none; } }
@keyframes holo-ficha-barra{ from{ transform:scaleX(0); } }
.holo-ficha .holo-acoes{ margin-top:12px; }
.holo[data-foco="1"] .holo-dir, .holo[data-foco="1"] .holo-rotulos{ visibility:hidden; }
@media (max-width: 900px){
  .holo-ficha{ left:12px; right:12px; top:auto; bottom:150px; width:auto; }
  .holo-ficha-centro{ grid-template-columns:1fr; } .holo-ficha-radar{ display:none; }
  .holo-elemento span{ display:none; }
}
`;

const GLIFOS = '█▓▒░<>/\\|=+*#ΔΣΩ01';

export function criarElementos({ raiz, som, aoSelecionar, aoSoltar }) {
  if (!document.getElementById('holo-elementos-estilo')) {
    const estilo = document.createElement('style');
    estilo.id = 'holo-elementos-estilo';
    estilo.textContent = CSS;
    document.head.append(estilo);
  }
  const camada = document.createElement('div');
  camada.className = 'holo-elementos';
  const alvo = document.createElement('div');
  alvo.className = 'holo-alvo';
  alvo.innerHTML = `<svg viewBox="0 0 74 74"><circle class="pulsa" cx="37" cy="37" r="24" fill="none" stroke="#4de8f0" stroke-width="1.5"/>
    <g class="gira" fill="none" stroke="#4de8f0" stroke-width="2"><path d="M37 3 A34 34 0 0 1 71 37"/><path d="M37 71 A34 34 0 0 1 3 37"/></g>
    <g stroke="#8ff3f7" stroke-width="1.5"><line x1="37" y1="12" x2="37" y2="24"/><line x1="37" y1="50" x2="37" y2="62"/><line x1="12" y1="37" x2="24" y2="37"/><line x1="50" y1="37" x2="62" y2="37"/></g></svg>`;
  const linha = document.createElement('div');
  linha.className = 'holo-ficha-linha';
  const ficha = document.createElement('section');
  ficha.className = 'holo-ficha';
  ficha.hidden = true;
  ficha.setAttribute('aria-live', 'polite');
  raiz.append(camada, alvo, linha, ficha);

  const estado = { lista: [], tags: [], foco: null, chave: '', titulo: '', nivel: 1, timers: [] };
  const ponto = new THREE.Vector3();
  const centro = new THREE.Vector3();
  const aCamera = new THREE.Vector3();

  function limparTimers() {
    estado.timers.forEach((t) => clearInterval(t));
    estado.timers = [];
  }

  function montar(chave, forma, ctx) {
    soltar(false);
    estado.chave = chave;
    estado.titulo = forma.titulo;
    estado.lista = (ELEMENTOS[chave]?.(forma, ctx) || []);
    estado.tags = estado.lista.map((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'holo-elemento';
      b.dataset.mira = '';
      b.dataset.esperar = '700';
      b.dataset.nivel = e.nivel;
      b.title = e.nome;
      const icone = document.createElement('i');
      const nome = document.createElement('span');
      nome.textContent = e.nome;
      const carga = document.createElement('b');
      carga.className = 'carga';
      b.append(icone, nome, carga);
      b.style.opacity = 0;
      b.addEventListener('click', () => focar(e));
      return { e, b, visivel: false };
    });
    camada.replaceChildren(...estado.tags.map((t) => t.b));
  }

  // título se decifrando: cada letra passa por símbolos aleatórios até cair no lugar
  function decifrar(alvoEl, texto) {
    let quadro = 0;
    const t = setInterval(() => {
      quadro++;
      alvoEl.textContent = [...texto].map((c, i) => (c === ' ' || i < quadro / 2 ? c : GLIFOS[Math.floor(Math.random() * GLIFOS.length)])).join('');
      if (quadro / 2 >= texto.length) {
        alvoEl.textContent = texto;
        clearInterval(t);
      }
    }, 28);
    estado.timers.push(t);
  }

  function digitar(alvoEl, texto) {
    let i = 0;
    const t = setInterval(() => {
      i += 2;
      alvoEl.textContent = texto.slice(0, i);
      if (i >= texto.length) {
        alvoEl.classList.add('pronto');
        clearInterval(t);
      }
    }, 22);
    estado.timers.push(t);
  }

  function focar(e) {
    if (typeof e === 'string') e = estado.lista.find((x) => x.id === e);
    if (!e) return null;
    limparTimers();
    estado.foco = e;
    som.transformar?.();
    const indice = estado.lista.indexOf(e) + 1;
    ficha.hidden = false;
    // recria o conteúdo para a animação de abertura rodar de novo
    ficha.innerHTML = `<div class="varre"></div>
      <div class="holo-ficha-topo"><span>ELEMENTO ${String(indice).padStart(2, '0')}/${String(estado.lista.length).padStart(2, '0')} · ${estado.titulo}</span><span>NÍVEL ${e.nivel}</span></div>
      <h3></h3><p class="holo-ficha-resumo"></p>
      <div class="holo-ficha-centro">
        <div class="holo-ficha-radar"><svg viewBox="0 0 78 78"><circle cx="39" cy="39" r="36" fill="none" stroke="rgba(77,232,240,0.35)"/>
          <circle cx="39" cy="39" r="24" fill="none" stroke="rgba(77,232,240,0.25)"/><circle cx="39" cy="39" r="12" fill="none" stroke="rgba(77,232,240,0.2)"/>
          <path class="feixe" d="M39 39 L39 3 A36 36 0 0 1 70 21 Z" fill="rgba(77,232,240,0.22)"/>
          <circle cx="${39 + Math.cos(indice) * 18}" cy="${39 + Math.sin(indice) * 18}" r="3" fill="#5dfca0"/></svg></div>
        <p class="holo-ficha-texto"></p>
      </div>
      <dl></dl>
      <div class="holo-acoes"><button class="holo-btn" type="button" data-mira data-ficha="soltar">✕ SOLTAR</button><button class="holo-btn" type="button" data-mira data-ficha="proximo">PRÓXIMO ▸</button></div>`;
    ficha.querySelector('.holo-ficha-resumo').textContent = e.resumo;
    decifrar(ficha.querySelector('h3'), e.nome);
    digitar(ficha.querySelector('.holo-ficha-texto'), e.texto);
    const dl = ficha.querySelector('dl');
    e.dados.forEach(([k, val], i) => {
      const linhaDado = document.createElement('div');
      linhaDado.style.animationDelay = `${0.5 + i * 0.18}s`;
      linhaDado.style.setProperty('--barra', `${35 + ((indice * 37 + i * 23) % 60)}%`);
      const dt = document.createElement('dt');
      dt.textContent = k.toUpperCase();
      const dd = document.createElement('dd');
      dd.textContent = val;
      linhaDado.append(dt, dd);
      dl.append(linhaDado);
    });
    ficha.querySelector('[data-ficha="soltar"]').addEventListener('click', () => soltar());
    ficha.querySelector('[data-ficha="proximo"]').addEventListener('click', () => {
      const visiveis = estado.lista.filter((x) => x.nivel <= estado.nivel);
      const seguinte = visiveis[(visiveis.indexOf(e) + 1) % visiveis.length] || estado.lista[0];
      focar(seguinte);
    });
    raiz.dataset.foco = '1';
    alvo.classList.add('ativo');
    linha.classList.add('ativo');
    aoSelecionar?.(e);
    return e;
  }

  function soltar(avisar = true) {
    const tinha = estado.foco;
    limparTimers();
    estado.foco = null;
    ficha.hidden = true;
    alvo.classList.remove('ativo');
    linha.classList.remove('ativo');
    delete raiz.dataset.foco;
    if (tinha && avisar) {
      som.soltar?.();
      aoSoltar?.(tinha);
    }
  }

  // posiciona as etiquetas e a ficha; ativo = modo projeções com a forma montada
  function atualizar({ camera, projecao, escala, ativo }) {
    estado.nivel = nivelDaEscala(escala);
    const w = raiz.clientWidth;
    const h = raiz.clientHeight;
    projecao.getWorldPosition(centro);
    for (const t of estado.tags) {
      const { e, b } = t;
      ponto.copy(e.ponto());
      projecao.localToWorld(ponto);
      let mostra = ativo && e.nivel <= estado.nivel && (!estado.foco || estado.foco === e);
      if (mostra && e.frente) {
        aCamera.copy(camera.position).sub(ponto);
        if (ponto.clone().sub(centro).dot(aCamera) < 0) mostra = false;
      }
      ponto.project(camera);
      const x = (ponto.x + 1) / 2 * w;
      const y = (1 - ponto.y) / 2 * h;
      if (ponto.z > 1 || x < 20 || x > w - 20 || y < 50 || y > h - 40) mostra = false;
      if (mostra !== t.visivel) {
        t.visivel = mostra;
        b.style.opacity = mostra ? 1 : 0;
        b.style.pointerEvents = mostra ? 'auto' : 'none';
        b.classList.toggle('surgindo', mostra);
        b.classList.toggle('apresenta', mostra);
        clearTimeout(b._apresenta);
        if (mostra) b._apresenta = setTimeout(() => b.classList.remove('apresenta'), 2600);
      }
      if (mostra) b.style.transform = `translate(${x - 9}px, ${y - 9}px)`;
      if (estado.foco === e) {
        alvo.style.transform = `translate(${x}px, ${y}px)`;
        const caixa = ficha.getBoundingClientRect();
        const base = raiz.getBoundingClientRect();
        const fx = caixa.left - base.left;
        const fy = caixa.top - base.top + 46;
        const dx = fx - x;
        const dy = fy - y;
        linha.style.width = `${Math.max(0, Math.hypot(dx, dy) - 30)}px`;
        linha.style.transform = `translate(${x + (dx / Math.hypot(dx, dy || 1)) * 30}px, ${y + (dy / Math.hypot(dx, dy || 1)) * 30}px) rotate(${Math.atan2(dy, dx)}rad)`;
      }
    }
  }

  return {
    montar,
    atualizar,
    focar,
    soltar,
    foco: () => estado.foco,
    nivel: () => estado.nivel,
    quantos: () => estado.lista.filter((e) => e.nivel <= estado.nivel).length,
    total: () => estado.lista.length,
    lista: () => estado.lista,
    achar(nome) {
      const n = normalizar(nome);
      return estado.lista.find((e) => normalizar(e.nome) === n || e.id === n)
        || estado.lista.find((e) => normalizar(e.nome).includes(n) || n.includes(normalizar(e.nome)));
    },
  };
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
