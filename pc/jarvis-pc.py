"""
jarvis-pc.py — o "corpo" do Jarvis no computador do Renato.

Roda um servidor pequeno só em 127.0.0.1:47801. A página do Jarvis chama esse
servidor quando o agente usa a ferramenta controlar_pc: abrir programas e sites,
pesquisar, volume, mídia e bloquear a tela. Só aceita pedidos com a chave do
cérebro e vindos da página do Jarvis, e só executa ações de uma lista fixa —
nunca um comando livre.

Opcional: com numpy e sounddevice instalados (o venv do OpenJarvis tem), fica
ouvindo DUAS palmas e abre a página do Jarvis já iniciando a conversa.

Rodar:    py -3 pc\\jarvis-pc.py        (ou o atalho pc\\iniciar-jarvis-pc.cmd)
Opções:   --sem-palmas   não liga o detector de palmas
"""
import ctypes
import json
import os
import subprocess
import sys
import threading
import time
import unicodedata
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote

# ---------------- CONFIG ----------------
PORTA = 47801
PAGINA = "https://jarvis-nutri-ali.vercel.app/?auto=1"   # aberta com as duas palmas
ORIGENS = {                                              # quem pode mandar comandos
    "https://jarvis-nutri-ali.vercel.app",
    "http://localhost:5500", "http://127.0.0.1:5500",
    "http://localhost:5510", "http://127.0.0.1:5510",
}
ARQUIVO_CHAVE = Path(__file__).resolve().parent.parent / ".jarvis-chave.local.txt"
PASSOS_VOLUME = 5                                       # cada passo do Windows = 2%
# palmas (mesmos ajustes do jarvis-show.py)
SAMPLE_RATE = 16000
BLOCK = 512
THRESHOLD = 0.35
RATIO = 6.0
MIN_GAP = 0.12
MAX_GAP = 0.80
COOLDOWN = 6.0
# ----------------------------------------

# nome falado -> como abrir (lista de comando ou URI do Windows)
APPS = {
    "chrome": ["cmd", "/c", "start", "", "chrome"],
    "google chrome": ["cmd", "/c", "start", "", "chrome"],
    "edge": "microsoft-edge:",
    "explorador": ["explorer"],
    "arquivos": ["explorer"],
    "calculadora": ["calc"],
    "bloco de notas": ["notepad"],
    "paint": ["mspaint"],
    "spotify": "spotify:",
    "whatsapp": "whatsapp:",
    "discord": "discord:",
    "steam": "steam:",
    "vscode": ["cmd", "/c", "code"],
    "vs code": ["cmd", "/c", "code"],
    "word": ["cmd", "/c", "start", "", "winword"],
    "excel": ["cmd", "/c", "start", "", "excel"],
    "configuracoes": "ms-settings:",
    "gerenciador de tarefas": ["taskmgr"],
}
# teclas multimídia do Windows
TECLAS = {
    ("volume", "mais"): 0xAF, ("volume", "menos"): 0xAE, ("volume", "mudo"): 0xAD,
    ("midia", "tocar_pausar"): 0xB3, ("midia", "proxima"): 0xB0, ("midia", "anterior"): 0xB1,
}
SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def ler_chave() -> str:
    try:
        return ARQUIVO_CHAVE.read_text(encoding="utf-8").splitlines()[1].strip()
    except (OSError, IndexError):
        return ""


CHAVE = ler_chave()


def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFD", str(texto or "")).encode("ascii", "ignore").decode()
    return " ".join(sem_acento.lower().split())


def apertar(vk: int, vezes: int = 1) -> None:
    for _ in range(vezes):
        ctypes.windll.user32.keybd_event(vk, 0, 0, 0)
        ctypes.windll.user32.keybd_event(vk, 0, 2, 0)
        time.sleep(0.03)


def abrir_app(alvo: str) -> dict:
    nome = normalizar(alvo)
    como = APPS.get(nome)
    if not como:
        return {"ok": False, "mensagem": f"Não sei abrir '{alvo}'. Programas que eu abro: {', '.join(sorted(APPS))}."}
    if isinstance(como, str):
        os.startfile(como)
    else:
        subprocess.Popen(como, creationflags=SEM_JANELA)
    return {"ok": True, "mensagem": f"Abrindo {alvo}."}


def abrir_site(alvo: str) -> dict:
    url = str(alvo or "").strip()
    if not url.startswith(("http://", "https://")):
        if " " in url or "." not in url:
            return {"ok": False, "mensagem": "Isso não parece um site. Use pesquisar para buscar no Google."}
        url = "https://" + url
    webbrowser.open(url)
    return {"ok": True, "mensagem": f"Abrindo {url}."}


def executar(acao: str, alvo: str, valor: str) -> dict:
    acao = normalizar(acao).replace(" ", "_")
    valor = normalizar(valor).replace(" ", "_")
    if acao == "abrir_app":
        return abrir_app(alvo)
    if acao == "abrir_site":
        return abrir_site(alvo)
    if acao == "pesquisar":
        webbrowser.open("https://www.google.com/search?q=" + quote(str(alvo)))
        return {"ok": True, "mensagem": f"Pesquisando '{alvo}' no Google."}
    if acao == "youtube":
        webbrowser.open("https://www.youtube.com/results?search_query=" + quote(str(alvo)))
        return {"ok": True, "mensagem": f"Procurando '{alvo}' no YouTube."}
    if (acao, valor) in TECLAS:
        apertar(TECLAS[(acao, valor)], PASSOS_VOLUME if valor in ("mais", "menos") else 1)
        return {"ok": True, "mensagem": f"{acao.capitalize()}: {valor.replace('_', ' ')}."}
    if acao == "bloquear_tela":
        ctypes.windll.user32.LockWorkStation()
        return {"ok": True, "mensagem": "Tela bloqueada."}
    return {"ok": False, "mensagem": f"Ação desconhecida: {acao}. Use abrir_app, abrir_site, pesquisar, youtube, volume, midia ou bloquear_tela."}


class Servidor(BaseHTTPRequestHandler):
    server_version = "JarvisPC/1.0"

    def log_message(self, formato, *args):
        print(f"   {self.address_string()} {formato % args}")

    def origem_ok(self) -> bool:
        origem = self.headers.get("Origin")
        return origem is None or origem in ORIGENS

    def cabecalhos_cors(self) -> None:
        origem = self.headers.get("Origin")
        if origem in ORIGENS:
            self.send_header("Access-Control-Allow-Origin", origem)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "content-type, x-jarvis-key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def responder(self, codigo: int, dados: dict) -> None:
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.cabecalhos_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def autorizado(self) -> bool:
        if not self.origem_ok():
            self.responder(403, {"ok": False, "mensagem": "Origem não permitida."})
            return False
        if not CHAVE or self.headers.get("x-jarvis-key") != CHAVE:
            self.responder(403, {"ok": False, "mensagem": "Chave inválida."})
            return False
        return True

    def do_OPTIONS(self):
        self.send_response(204 if self.origem_ok() else 403)
        self.cabecalhos_cors()
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        if self.path != "/status":
            return self.responder(404, {"ok": False})
        if self.autorizado():
            self.responder(200, {"ok": True, "versao": 1, "apps": sorted(APPS), "palmas": PALMAS_ATIVAS})

    def do_POST(self):
        if self.path != "/acao":
            return self.responder(404, {"ok": False})
        if not self.autorizado():
            return
        pedido = {}
        try:
            tamanho = min(int(self.headers.get("Content-Length", 0)), 4096)
            pedido = json.loads(self.rfile.read(tamanho) or b"{}")
            resultado = executar(pedido.get("acao", ""), pedido.get("alvo", ""), pedido.get("valor", ""))
        except Exception as erro:
            resultado = {"ok": False, "mensagem": f"Falhou: {erro}"}
        print(f">> {pedido.get('acao', '?')}: {resultado['mensagem']}")
        self.responder(200, resultado)


# ---------------- duas palmas ----------------
PALMAS_ATIVAS = False


def ouvir_palmas() -> None:
    """Abre a página do Jarvis quando ouve duas palmas seguidas."""
    global PALMAS_ATIVAS
    try:
        import numpy as np
        import sounddevice as sd
    except ImportError:
        print("   (palmas desligadas: falta numpy/sounddevice neste Python)")
        return

    def mic_settings() -> dict:
        # o áudio cru do WASAPI evita que a supressão de ruído do driver apague as palmas
        try:
            api = next(a for a in sd.query_hostapis() if "WASAPI" in a["name"])
            ws = sd.WasapiSettings(auto_convert=True)
            ws._streaminfo.streamOption = sd._lib.eStreamOptionRaw
            return {"device": api["default_input_device"], "extra_settings": ws}
        except Exception:
            return {}

    estado = {"ruido": 0.02, "ultima": 0.0, "disparo": 0.0, "no_pico": False}

    def callback(indata, frames, t, status):
        pico = float(np.max(np.abs(indata)))
        agora = time.time()
        if not (pico > THRESHOLD and pico > estado["ruido"] * RATIO):
            estado["ruido"] = 0.95 * estado["ruido"] + 0.05 * pico
            estado["no_pico"] = False
            return
        if estado["no_pico"] or agora - estado["disparo"] < COOLDOWN:
            estado["no_pico"] = True
            return
        estado["no_pico"] = True
        if MIN_GAP <= agora - estado["ultima"] <= MAX_GAP:
            estado["disparo"] = agora
            estado["ultima"] = 0.0
            print(">> Duas palmas! Abrindo o Jarvis...")
            webbrowser.open(PAGINA)
        else:
            estado["ultima"] = agora

    try:
        with sd.InputStream(channels=1, samplerate=SAMPLE_RATE, blocksize=BLOCK, callback=callback, **mic_settings()):
            PALMAS_ATIVAS = True
            print("   Ouvindo palmas: bata DUAS para abrir o Jarvis.")
            while True:
                time.sleep(1)
    except Exception as erro:
        print(f"   (palmas desligadas: {erro})")


if __name__ == "__main__":
    if sys.stdout is None:   # aberto pelo atalho (pythonw): sem janela, então registra em arquivo
        sys.stdout = sys.stderr = open(Path(__file__).with_name("jarvis-pc.local.log"), "a", encoding="utf-8", buffering=1)
    if not CHAVE:
        print(f"!! Não achei a chave em {ARQUIVO_CHAVE}. O Jarvis PC não vai aceitar comandos.")
    try:
        servidor = ThreadingHTTPServer(("127.0.0.1", PORTA), Servidor)
    except OSError:
        print(f"Já existe um Jarvis PC rodando na porta {PORTA}.")
        sys.exit()
    if "--sem-palmas" not in sys.argv:
        threading.Thread(target=ouvir_palmas, daemon=True).start()
    print(f"Jarvis PC pronto em http://127.0.0.1:{PORTA} (Ctrl+C para sair).")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
