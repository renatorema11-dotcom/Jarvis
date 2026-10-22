# Jarvis
Meu assistente pessoal — voz pelo ElevenLabs, segundo cérebro no n8n.

## Como funciona

```
index.html (navegador)
  ├─ voz ↔ agente ElevenLabs ──MCP──► n8n "Jarvis — Cérebro (MCP)"
  │                                     memória · tarefas · rotinas · Gmail · Agenda · Spotify
  ├─ GET  /webhook/jarvis/contexto ──► perfil, memórias, tarefas, rotinas e agenda de hoje
  │                                     (viram variáveis dinâmicas do agente)
  ├─ POST /webhook/jarvis/visao ─────► foto da câmera → descrição (Groq)
  └─ POST /webhook/jarvis/conversa ──► transcrição → Groq extrai memórias, tarefas e perfil
```

Workflows no n8n (`n8n.nutriali.cloud`):

| Workflow | O que faz |
| --- | --- |
| Jarvis — Cérebro (MCP) | Ferramentas que o agente usa durante a conversa |
| Jarvis — API da interface | Contexto e visão para a página |
| Jarvis — Memória automática | Aprende com cada conversa |
| Jarvis — Rotinas automáticas | Briefing às 7h por e-mail e lembretes de tarefas |

Os dados ficam nas Data Tables `jarvis_memorias`, `jarvis_tarefas`, `jarvis_rotinas`, `jarvis_conversas` e `jarvis_perfil`.

## Rodar

A página precisa de `localhost` ou HTTPS para usar microfone e câmera:

```bash
py -3 -m http.server 5500
```

Abra http://localhost:5500 e cole a chave do cérebro na engrenagem. A chave e o token do MCP ficam em `.jarvis-chave.local.txt`, que **não vai para o GitHub**.

`http://localhost:5500/?demo` mostra a interface com dados de exemplo, sem conectar no n8n.
