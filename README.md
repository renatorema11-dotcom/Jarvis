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

Dados nas Data Tables `jarvis_memorias`, `jarvis_tarefas`, `jarvis_rotinas`, `jarvis_conversas`, `jarvis_perfil`, `jarvis_financas`, `jarvis_pessoas`, `jarvis_habitos` e `jarvis_habitos_registros`.

## Rodar a interface

Site: https://jarvis-tau-one-39.vercel.app (público) e https://jarvis-nutri-ali.vercel.app (time nutri-ali, com login da Vercel); os dois fazem deploy automático a cada push na `main`. Localmente:

```bash
py -3 -m http.server 5510
```

Na engrenagem, cole a chave do cérebro (está em `.jarvis-chave.local.txt`, que **não vai para o GitHub**). `?demo` mostra a interface com dados de exemplo; `?auto` já inicia a conversa.

**Identificação:** ligue o sensor no painel IDENTIDADE e toque em CADASTRAR ROSTO olhando para a câmera. O padrão facial fica salvo só no navegador; dá para desligar o sensor automático na engrenagem.

## Jarvis PC (controle do computador e duas palmas)

Dê dois cliques em `pc/iniciar-jarvis-pc.cmd`. Ele usa o Python do OpenJarvis (que tem `numpy` e `sounddevice` para as palmas) ou o `py -3` do sistema. O Jarvis passa a abrir programas e sites, pesquisar, mexer no volume e na mídia e bloquear a tela, e duas palmas abrem a conversa. O agente só aceita a chave do cérebro, só responde ao site do Jarvis e só executa ações de uma lista fixa. Na primeira vez, o Chrome pergunta se o site pode acessar o computador local: permita. O botão TESTAR PC, na engrenagem, mostra se o Jarvis PC está rodando e aceitando a chave.
