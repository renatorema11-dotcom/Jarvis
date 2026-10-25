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

**Música de boas-vindas:** na engrenagem, marque "Tocar uma música de boas-vindas no Spotify do PC", escreva o nome ou cole o link da música/playlist (OUVIR testa na hora) e escolha quando tocar: quando o Jarvis reconhecer seu rosto e mostrar as boas-vindas (padrão) ou assim que ele abrir. Vale uma vez por abertura (aba nova ou duas palmas); se o app do Spotify estiver fechado, o Jarvis PC abre. Durante a conversa o volume baixa para o microfone não ouvir a música e volta ao fim (webhook `jarvis/musica`).

**Identificação:** ligue o sensor no painel IDENTIDADE e toque em CADASTRAR ROSTO olhando para a câmera. O padrão facial fica salvo só no navegador; dá para desligar o sensor automático na engrenagem.

## Jarvis PC (controle do computador e duas palmas)

Dê dois cliques em `pc/iniciar-jarvis-pc.cmd`. Ele usa o Python do OpenJarvis (que tem `numpy` e `sounddevice` para as palmas) ou o `py -3` do sistema. O Jarvis passa a abrir programas e sites, pesquisar, mexer no volume e na mídia e bloquear a tela, e duas palmas abrem a conversa. O agente só aceita a chave do cérebro, só responde ao site do Jarvis e só executa ações de uma lista fixa. Na primeira vez, o Chrome pergunta se o site pode acessar o computador local: permita. O botão TESTAR PC, na engrenagem, mostra se o Jarvis PC está rodando e aceitando a chave.

### Laboratório holográfico

O botão do cubo na doca (ou `#holo` no endereço, ou "Jarvis, mostra a Terra") abre uma tela inteira de projeções 3D em partículas sobre uma mesa de projeção: Terra (continentes de verdade e marcador em Campo Mourão), Saturno, Reator Arc, Átomo, DNA e Cidade, que se transformam uma na outra. Você controla com as mãos pela câmera (MediaPipe): punho fechado gira, pinça dá zoom, mão aberta desmonta e as partículas seguem a mão, duas mãos ampliam e um deslize rápido troca a projeção. Também funciona com mouse (arrastar, rodinha, duplo clique), teclado (setas, espaço, Esc) e pela ferramenta `holograma` do agente. Tudo fica em `holo.js`, carregado só quando o laboratório abre (three.js com bloom).

### Dispositivos (fones, celulares, TVs)

O painel DISPOSITIVOS (botão VARRER) e a ferramenta `dispositivos` do agente pedem ao Jarvis PC uma varredura de uns 8 segundos (`pc/dispositivos.py`): Bluetooth pareado e por perto pelo próprio Windows, telas que aceitam transmissão (Wi-Fi Direct/Miracast) e a rede de casa (SSDP/UPnP). Conectar pareia um Bluetooth novo, abre o painel rápido do Bluetooth para um já pareado (o Windows não deixa programas ligarem o som de um fone sozinhos), abre o Transmitir (Win+K) para a TV e o Vincular ao Celular para um celular. Precisa dos pacotes `winrt-Windows.Devices.Enumeration` e `winrt-Windows.Foundation` no Python do Jarvis PC.

### Navegador (tarefas em sites)

Peça coisas como "procura um fone bluetooth no Mercado Livre e me fala os três primeiros". A ferramenta `navegador` do agente pede ao Jarvis PC, que abre uma janela própria do Chrome (o "Chrome do Jarvis", perfil em `~/jarvis/chrome-jarvis`) e faz a tarefa passo a passo (`pc/navegador.py` com Playwright). A cada passo o workflow **Jarvis — Navegador (cérebro)** no n8n escolhe a próxima ação (hoje com o Groq; para trocar pelo Claude, mude só o nó *Pensar*). Antes de comprar, enviar, publicar ou apagar, ele para e pergunta; nunca digita senhas nem cartões. Para sites com login, entre uma vez nessa janela do Chrome do Jarvis.

Precisa do Playwright (e, para os dispositivos, dos pacotes winrt) no Python do Jarvis PC:

```bash
uv pip install --python "%USERPROFILE%\jarvis\OpenJarvis\.venv\Scripts\python.exe" playwright winrt-Windows.Devices.Enumeration winrt-Windows.Foundation winrt-Windows.Foundation.Collections
```
