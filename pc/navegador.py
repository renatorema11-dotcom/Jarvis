"""
navegador.py — as mãos do Jarvis no Chrome (usado pelo jarvis-pc.py).

Abre uma janela própria do Chrome (perfil separado em ~/jarvis/chrome-jarvis,
o "Chrome do Jarvis") e cumpre uma tarefa passo a passo: lê a página, pergunta
ao cérebro no n8n (webhook jarvis/navegador, hoje com Groq) qual é a próxima
ação e executa. Antes de comprar, enviar, publicar ou apagar, para e espera o
Renato confirmar. Nunca digita em campo de senha nem número de cartão.

Precisa do Playwright (uv pip install playwright) e usa o Chrome instalado.
"""
import json
import queue
import re
import threading
import time
import urllib.request
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

# ---------------- CONFIG ----------------
CEREBRO = "https://n8n.nutriali.cloud/webhook/jarvis/navegador"
PERFIL = Path.home() / "jarvis" / "chrome-jarvis"
MAX_PASSOS = 25
MAX_SEGUNDOS = 6 * 60
ESPERA_CONFIRMACAO = 5 * 60
# ----------------------------------------

# cliques que mexem com dinheiro, mensagens ou dados: sempre pedem confirmação
ARRISCADO = re.compile(
    r"\b(comprar|compre|finalizar|pagar|pagamento|fechar pedido|confirmar (o )?(pedido|compra|pagamento)"
    r"|assinar|inscrever|enviar|publicar|postar|comentar|curtir|excluir|apagar|deletar|transferir|pix|doar"
    r"|cancelar (a )?(assinatura|conta|pedido)|buy|purchase|checkout|pay|place order|submit|send|post|delete|subscribe)\b",
    re.I,
)
TECLAS = {"Enter", "Escape", "Tab", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Space"}
CARTAO = re.compile(r"\d(?:[ .-]?\d){13,18}")

# numera os elementos clicáveis/digitáveis e pega o texto perto da tela atual
LER_PAGINA = r"""
() => {
  const altura = window.innerHeight, largura = window.innerWidth;
  const limpar = (t, n) => (t || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > altura * 2 || r.right < 0 || r.left > largura) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  // menus, barras laterais e rodapé tomam o espaço do conteúdo que importa
  const LATERAL = 'header, nav, aside, footer, [role=navigation], [role=banner], [role=complementary], [role=contentinfo]';
  document.querySelectorAll('[data-jarvis-id]').forEach((e) => e.removeAttribute('data-jarvis-id'));
  const seletor = 'a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], '
    + '[role=menuitem], [role=option], [role=checkbox], [role=switch], [role=searchbox], [role=combobox], [role=textbox], '
    + '[contenteditable=""], [contenteditable="true"]';
  const linhas = [];
  const vistos = new Set();
  let naLateral = 0;
  for (const el of document.querySelectorAll(seletor)) {
    if (linhas.length >= 55) break;
    if (el.disabled || !visivel(el) || el.closest('footer, [role=contentinfo]')) continue;
    const tag = el.tagName.toLowerCase();
    const tipoInput = (el.getAttribute('type') || 'text').toLowerCase();
    const papel = el.getAttribute('role') || '';
    let tipo;
    if (tag === 'a') tipo = 'link';
    else if (tag === 'button' || (tag === 'input' && ['button', 'submit', 'reset', 'image'].includes(tipoInput))) tipo = 'botão';
    else if (tag === 'select') tipo = 'lista';
    else if (tag === 'input' && ['checkbox', 'radio'].includes(tipoInput)) tipo = tipoInput + (el.checked ? ' marcado' : '');
    else if (tag === 'input' || tag === 'textarea' || el.isContentEditable || ['searchbox', 'textbox', 'combobox'].includes(papel)) tipo = tipoInput === 'password' ? 'campo de senha' : 'campo';
    else tipo = papel || tag;
    const campo = tipo.startsWith('campo');
    const marcavel = /^(checkbox|radio)/.test(tipo);
    // um botão dentro de um link já listado é o mesmo alvo
    if (!campo && el.parentElement && el.parentElement.closest('[data-jarvis-id]')) continue;
    const lateral = !campo && el.closest(LATERAL);
    if (lateral && naLateral >= 15) continue;
    const rotulo = limpar(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title')
      || (el.labels && el.labels[0] && el.labels[0].innerText) || (el.closest('label') && el.closest('label').innerText)
      || el.getAttribute('alt') || el.getAttribute('name'), 60);
    const imagem = el.querySelector && el.querySelector('img[alt]');
    const nome = campo || marcavel ? rotulo : (limpar(el.innerText || el.value || (imagem && imagem.alt), 70) || rotulo);
    if (!nome && !campo) continue;
    if (tipo === 'link' && vistos.has(nome)) continue;
    vistos.add(nome);
    if (lateral) naLateral += 1;
    const id = linhas.length + 1;
    el.setAttribute('data-jarvis-id', String(id));
    let linha = '[' + id + '] ' + tipo + ' "' + nome + '"';
    if (tipo === 'campo') {
      const valor = limpar(el.value || (el.isContentEditable ? el.innerText : ''), 40);
      if (valor) linha += ' valor="' + valor + '"';
    }
    if (tag === 'select' && el.selectedOptions[0]) linha += ' opção="' + limpar(el.selectedOptions[0].text, 30) + '"';
    linhas.push(linha);
  }
  // texto perto da tela atual, sem menus; pedaços do mesmo bloco (ex.: nome + preço de um produto) ficam na mesma linha
  const BLOCO = 'p, li, article, h1, h2, h3, h4, h5, h6, td, th, dd, dt, figcaption, blockquote, pre, [class*=card], [class*=item]';
  const partes = [];
  let total = 0;
  let blocoAnterior = null;
  const andar = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  while (andar.nextNode() && total < 2500) {
    const pai = andar.currentNode.parentElement;
    if (!pai || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(pai.tagName) || pai.closest(LATERAL)) continue;
    const t = limpar(andar.currentNode.textContent, 300);
    if (!t) continue;
    const r = pai.getBoundingClientRect();
    if (r.bottom < 0 || r.top > altura * 1.5 || r.width < 1) continue;
    const bloco = pai.closest(BLOCO) || pai;
    if (bloco === blocoAnterior && partes.length) partes[partes.length - 1] += ' ' + t;
    else partes.push(t);
    blocoAnterior = bloco;
    total += t.length + 1;
  }
  return {
    elementos: linhas.join('\n'),
    texto: partes.filter((p) => p.length > 1).join('\n').slice(0, 2500),
    rolagem: Math.round(window.scrollY) + ' de ' + Math.max(0, document.documentElement.scrollHeight - altura) + ' px',
  };
}
"""
CAMPO_DE_MENSAGEM = """e => (e.tagName === 'TEXTAREA' || e.isContentEditable)
  && !['combobox', 'searchbox'].includes(e.getAttribute('role'))
  && e.name !== 'q' && !e.closest('[role=search], form[action*=search]')"""


class Navegador:
    def __init__(self, chave: str):
        self.chave = chave
        self.fila = queue.Queue()
        self.trava = threading.Lock()
        self.parar = threading.Event()
        self.estado = {"id": 0, "fase": "parado", "tarefa": "", "passo": 0, "pensamento": "",
                       "pergunta": "", "resposta": "", "passos": []}
        self.pw = None
        self.contexto = None
        threading.Thread(target=self._trabalhar, daemon=True).start()

    # ---------- chamado pelo servidor HTTP (outras threads) ----------
    def foto(self) -> dict:
        with self.trava:
            return {**self.estado, "passos": list(self.estado["passos"])}

    def comando(self, acao: str, texto: str = "") -> dict:
        acao = str(acao or "status").strip().lower()
        texto = str(texto or "").strip()
        fase = self.estado["fase"]
        if sync_playwright is None:
            return {"ok": False, "mensagem": "Falta o Playwright no Python do Jarvis PC (uv pip install playwright)."}
        if acao == "tarefa":
            if not texto:
                return {"ok": False, "mensagem": "Diga qual é a tarefa no navegador."}
            if fase in ("trabalhando", "aguardando"):
                return {"ok": False, "mensagem": "Já estou fazendo uma tarefa no navegador. Peça para parar antes.", **self.foto()}
            self.parar.clear()
            self._atualizar(id=self.estado["id"] + 1, fase="trabalhando", tarefa=texto, passo=0,
                            pensamento="Abrindo o Chrome do Jarvis…", pergunta="", resposta="", passos=[])
            self.fila.put(("tarefa", texto))
        elif acao in ("confirmar", "cancelar"):
            if fase != "aguardando":
                return {"ok": False, "mensagem": "Não tem nada esperando confirmação.", **self.foto()}
            if acao == "confirmar":
                self._atualizar(fase="trabalhando", pergunta="")
            self.fila.put((acao, ""))
        elif acao == "parar":
            self.parar.set()
            if fase == "aguardando":
                self.fila.put(("parar", ""))
        elif acao != "status":
            return {"ok": False, "mensagem": "Ação desconhecida. Use tarefa, confirmar, cancelar, parar ou status."}
        return {"ok": True, **self.foto()}

    # ---------- thread do navegador (todo o Playwright roda aqui) ----------
    def _atualizar(self, **mudancas) -> None:
        with self.trava:
            self.estado.update(mudancas)

    def _trabalhar(self) -> None:
        while True:
            tipo, texto = self.fila.get()
            if tipo != "tarefa":
                continue
            try:
                fase, resposta = self._cumprir(texto)
            except Exception as erro:
                fase, resposta = "falhou", f"Deu erro no navegador: {str(erro).splitlines()[0][:150]}"
            self._atualizar(fase=fase, resposta=resposta, pensamento="", pergunta="")
            print(f">> navegador {fase}: {resposta}")

    def _cumprir(self, tarefa: str) -> tuple:
        print(f">> navegador: {tarefa}")
        historico, notas = [], []
        inicio = time.time()
        for passo in range(1, MAX_PASSOS + 1):
            if self.parar.is_set():
                return "falhou", "Parei a tarefa no navegador, como você pediu."
            if time.time() - inicio > MAX_SEGUNDOS:
                return "falhou", "A tarefa demorou demais e eu parei para não ficar preso."
            pagina = self._pagina()
            decisao = self._pensar(tarefa, passo, historico, notas, self._ler(pagina))
            if isinstance(decisao.get("acao"), dict):   # {"acao": {"acao": "abrir", ...}}
                decisao = {**decisao, **decisao["acao"]}
            acao = decisao.get("acao")
            pensamento = " ".join(str(decisao.get("pensamento") or "").split())[:200]
            # o que ele já descobriu volta em todo passo, para não reabrir a mesma página
            nota = " ".join(str(decisao.get("anotar") or "").split())[:300]
            if nota:
                notas = (notas + [nota])[-12:]
            self._atualizar(passo=passo, pensamento=pensamento)
            if acao == "concluir":
                return "concluido", str(decisao.get("resposta") or "Pronto.")
            if acao == "desistir":
                return "falhou", str(decisao.get("motivo") or "Não consegui fazer essa tarefa.")
            if acao == "confirmar":
                executar, pergunta = decisao.get("depois") or {}, str(decisao.get("pergunta") or "Posso continuar?")
            else:
                executar, pergunta = decisao, self._precisa_confirmar(pagina, decisao)
            if pergunta:
                autorizado = self._esperar_confirmacao(pergunta)
                if autorizado is None:
                    return "falhou", "Parei a tarefa no navegador, como você pediu."
                if not autorizado:
                    return "concluido", f"Tudo bem, não fiz. ({pergunta})"
                resultado = self._executar(pagina, executar)
                historico.append(f"{passo}. Renato autorizou: {pergunta} -> {resultado}")
            else:
                resultado = self._executar(pagina, decisao)
                historico.append(f"{passo}. {pensamento} | {self._resumo(decisao)} -> {resultado}")
                repetidas = [h.split(" | ", 1)[-1] for h in historico[-3:]]
                if len(repetidas) == 3 and len(set(repetidas)) == 1:
                    return "falhou", f"Fiquei preso repetindo a mesma ação ({resultado}). Parei para não ficar em círculos."
            with self.trava:
                self.estado["passos"] = (self.estado["passos"] + [{"n": passo, "pensamento": pensamento, "resultado": resultado}])[-30:]
        return "falhou", "Usei todos os passos e não terminei. Tente pedir algo mais simples."

    def _pagina(self):
        if self.contexto is None:
            if self.pw is None:
                self.pw = sync_playwright().start()
            PERFIL.mkdir(parents=True, exist_ok=True)
            # sem a marca de "controlado por automação", o Google não cai direto no captcha
            self.contexto = self.pw.chromium.launch_persistent_context(
                str(PERFIL), channel="chrome", headless=False, no_viewport=True,
                ignore_default_args=["--enable-automation"],
                args=["--window-size=1300,900", "--disable-blink-features=AutomationControlled"])
            self.contexto.on("close", lambda _: setattr(self, "contexto", None))
        abertas = [p for p in self.contexto.pages if not p.is_closed()]
        return abertas[-1] if abertas else self.contexto.new_page()

    def _ler(self, pagina) -> str:
        try:
            pagina.wait_for_load_state("domcontentloaded", timeout=8000)
        except Exception:
            pass
        try:
            titulo = pagina.title()
            dados = pagina.evaluate(LER_PAGINA)
        except Exception as erro:
            titulo, dados = "", {"elementos": "", "texto": f"(não consegui ler a página: {str(erro)[:100]})", "rolagem": "?"}
        return (f"URL: {pagina.url}\nTítulo: {titulo}\nRolagem: {dados['rolagem']}\n"
                f"ELEMENTOS:\n{dados['elementos'] or '(nenhum)'}\nTEXTO VISÍVEL:\n{dados['texto']}")

    def _pensar(self, tarefa: str, passo: int, historico: list, notas: list, pagina: str) -> dict:
        corpo = json.dumps({"tarefa": tarefa, "passo": passo, "max_passos": MAX_PASSOS,
                            "historico": "\n".join(historico[-6:]), "anotacoes": "\n".join(f"- {n}" for n in notas),
                            "pagina": pagina}).encode("utf-8")
        for _ in range(4):
            pedido = urllib.request.Request(CEREBRO, data=corpo, method="POST",
                                            headers={"Content-Type": "application/json", "x-jarvis-key": self.chave})
            try:
                with urllib.request.urlopen(pedido, timeout=75) as r:
                    resposta = json.loads(r.read().decode("utf-8") or "{}")
            except Exception as erro:
                resposta = {"ok": False, "erro": f"sem resposta do n8n ({erro})", "esperar_s": 5}
            if resposta.get("ok"):
                return resposta
            if not (resposta.get("limite") or resposta.get("esperar_s")):
                return {"acao": "desistir", "motivo": f"O cérebro do navegador falhou: {str(resposta.get('erro', ''))[:150]}"}
            espera = min(int(resposta.get("esperar_s") or 10), 60)
            self._atualizar(pensamento=f"O Groq pediu uma pausa; volto em {espera} segundos…")
            if self.parar.wait(espera):
                return {"acao": "desistir", "motivo": "Parei a tarefa no navegador, como você pediu."}
        return {"acao": "desistir", "motivo": "O Groq está no limite de uso agora. Tente de novo daqui a um minuto."}

    def _elemento(self, pagina, decisao: dict):
        return pagina.locator(f'[data-jarvis-id="{int(decisao.get("id"))}"]').first

    def _precisa_confirmar(self, pagina, decisao: dict) -> str:
        acao = decisao.get("acao")
        try:
            if acao == "clicar":
                texto = self._elemento(pagina, decisao).evaluate(
                    "e => [e.innerText, e.value, e.getAttribute('aria-label'), e.getAttribute('title')].filter(Boolean).join(' ')")
                texto = " ".join(str(texto or "").split())[:80]
                if ARRISCADO.search(texto):
                    return f'Posso clicar em "{texto}"?'
            elif acao == "digitar" and decisao.get("enter"):
                if self._elemento(pagina, decisao).evaluate(CAMPO_DE_MENSAGEM):
                    return f'Posso enviar "{str(decisao.get("texto"))[:80]}"?'
            elif acao == "tecla" and decisao.get("tecla") == "Enter":
                if pagina.evaluate(f"() => document.activeElement && ({CAMPO_DE_MENSAGEM})(document.activeElement)"):
                    return "Posso apertar Enter e enviar o que está escrito?"
        except Exception:
            pass
        return ""

    def _esperar_confirmacao(self, pergunta: str):
        """True = autorizou, False = recusou ou não respondeu, None = mandou parar."""
        self._atualizar(fase="aguardando", pergunta=pergunta)
        print(f">> navegador perguntando: {pergunta}")
        try:
            tipo, _ = self.fila.get(timeout=ESPERA_CONFIRMACAO)
        except queue.Empty:
            return False
        if tipo == "parar":
            return None
        self._atualizar(fase="trabalhando", pergunta="")
        return tipo == "confirmar"

    def _executar(self, pagina, decisao: dict) -> str:
        acao = decisao.get("acao")
        try:
            if acao == "abrir":
                url = str(decisao.get("url") or "")
                if not re.match(r"https?://", url):
                    return "endereço inválido"
                pagina.goto(url, wait_until="domcontentloaded", timeout=30000)
            elif acao == "clicar":
                self._elemento(pagina, decisao).click(timeout=8000)
            elif acao == "digitar":
                texto = str(decisao.get("texto") or "")
                if CARTAO.search(texto):
                    return "recusei: parece número de cartão ou documento"
                alvo = self._elemento(pagina, decisao)
                if alvo.evaluate("e => e.type === 'password' || /password|cc-/.test(e.autocomplete || '')"):
                    return "recusei: campo de senha ou cartão"
                if not alvo.evaluate("e => e.matches('input, textarea, select') || e.isContentEditable"):
                    interno = alvo.locator("input, textarea, [contenteditable]").first
                    if interno.count():
                        alvo = interno
                alvo.fill(texto, timeout=8000)
                if decisao.get("enter"):
                    alvo.press("Enter")
            elif acao == "tecla":
                tecla = str(decisao.get("tecla") or "")
                if tecla not in TECLAS:
                    return "tecla não permitida"
                pagina.keyboard.press(tecla)
            elif acao == "rolar":
                pagina.mouse.wheel(0, -700 if decisao.get("direcao") == "cima" else 700)
            elif acao == "voltar":
                pagina.go_back(wait_until="domcontentloaded", timeout=15000)
            elif acao == "esperar":
                time.sleep(2)
            else:
                return f"ação desconhecida: {acao}"
        except Exception as erro:
            return "falhou: " + str(erro).splitlines()[0][:150]
        time.sleep(1)
        return "ok"

    @staticmethod
    def _resumo(decisao: dict) -> str:
        campos = {k: v for k, v in decisao.items() if k not in ("ok", "pensamento")}
        return json.dumps(campos, ensure_ascii=False)[:160]
