"""
tv.py — o Jarvis controla as TVs da casa pela rede (rota /tv do jarvis-pc.py).

- Roku (a AOC Roku TV): protocolo ECP, HTTP na porta 8060 da TV, sem pareamento.
  Ligar com a TV desligada precisa do "Início rápido da TV" ligado nas configurações dela.
- LG webOS: websocket (biblioteca aiowebostv). Na primeira vez a TV mostra um pedido de
  permissão: aceite com o controle. A chave que a TV devolve fica em pc/tvs.local.json.
  Ligar usa Wake-on-LAN (na LG: Configurações > Geral > Dispositivos > "Ligar via Wi-Fi").

As TVs achadas pela rede (SSDP) ficam salvas em pc/tvs.local.json (fora do git), com IP,
MAC e a chave da LG, então dá para ligar mesmo com a TV em espera.
"""
import asyncio
import json
import re
import socket
import subprocess
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ARQUIVO = Path(__file__).with_name("tvs.local.json")
SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)
TECLAS_ROKU = {
    "home": "Home", "inicio": "Home", "voltar": "Back", "ok": "Select", "selecionar": "Select",
    "cima": "Up", "baixo": "Down", "esquerda": "Left", "direita": "Right", "info": "Info",
    "tocar": "Play", "pausar": "Play", "avancar": "Fwd", "voltar_video": "Rev",
}
TECLAS_LG = {
    "home": "HOME", "inicio": "HOME", "voltar": "BACK", "ok": "ENTER", "selecionar": "ENTER",
    "cima": "UP", "baixo": "DOWN", "esquerda": "LEFT", "direita": "RIGHT", "info": "INFO",
}


def normalizar(texto) -> str:
    t = unicodedata.normalize("NFD", str(texto or "").lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn").strip()


# ---------------- lista salva ----------------
def carregar() -> list:
    try:
        return json.loads(ARQUIVO.read_text(encoding="utf-8")).get("tvs", [])
    except (OSError, ValueError):
        return []


def salvar(tvs: list) -> None:
    ARQUIVO.write_text(json.dumps({"tvs": tvs}, ensure_ascii=False, indent=2), encoding="utf-8")


def mac_do_ip(ip: str) -> str:
    try:
        saida = subprocess.run(["arp", "-a", ip], capture_output=True, text=True, timeout=4, creationflags=SEM_JANELA).stdout
    except (OSError, subprocess.SubprocessError):
        return ""
    achado = re.search(r"([0-9a-f]{2}[-:]){5}[0-9a-f]{2}", saida, re.I)
    return achado.group(0).replace("-", ":").lower() if achado else ""


# ---------------- descoberta (SSDP) ----------------
def descobrir(tempo: float = 3.0) -> list:
    alvos = ["roku:ecp", "urn:lge-com:service:webos-second-screen:1", "urn:dial-multiscreen-org:service:dial:1"]
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    s.settimeout(0.5)
    for st in alvos:
        msg = f'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: {st}\r\n\r\n'
        s.sendto(msg.encode(), ("239.255.255.250", 1900))
    respostas = {}
    fim = time.time() + tempo
    while time.time() < fim:
        try:
            dados, (ip, _) = s.recvfrom(4096)
        except socket.timeout:
            continue
        texto = dados.decode(errors="ignore")
        respostas.setdefault(ip, []).append(texto)
    s.close()
    tvs = carregar()
    for ip, textos in respostas.items():
        tudo = "\n".join(textos).lower()
        if "roku" in tudo:
            tv = {"tipo": "roku", "ip": ip, "nome": "Roku TV"}
            try:
                xml = urllib.request.urlopen(f"http://{ip}:8060/query/device-info", timeout=3).read()
                raiz = ET.fromstring(xml)
                tv["nome"] = (raiz.findtext("user-device-name") or raiz.findtext("friendly-device-name") or raiz.findtext("model-name") or "Roku TV").strip()
                tv["mac"] = (raiz.findtext("wifi-mac") or raiz.findtext("ethernet-mac") or "").lower()
            except (OSError, ET.ParseError):
                pass
        elif "lge" in tudo or "webos" in tudo:
            tv = {"tipo": "lg", "ip": ip, "nome": "LG TV"}
            local = re.search(r"(?im)^location:\s*(\S+)", "\n".join(textos))
            if local:
                try:
                    xml = urllib.request.urlopen(local.group(1), timeout=3).read().decode(errors="ignore")
                    nome = re.search(r"<friendlyName>([^<]+)</friendlyName>", xml)
                    if nome:
                        tv["nome"] = nome.group(1).strip()
                except OSError:
                    pass
        else:
            continue
        tv["mac"] = tv.get("mac") or mac_do_ip(ip)
        igual = next((t for t in tvs if (tv["mac"] and t.get("mac") == tv["mac"]) or t.get("ip") == ip), None)
        if igual:
            igual.update({k: v for k, v in tv.items() if v})
        else:
            tv["id"] = f"tv{len(tvs) + 1}"
            tvs.append(tv)
    salvar(tvs)
    return tvs


def online(tv: dict, espera: float = 0.6) -> bool:
    portas = (8060,) if tv.get("tipo") == "roku" else (3000, 3001)
    for porta in portas:
        try:
            with socket.create_connection((tv["ip"], porta), timeout=espera):
                return True
        except OSError:
            continue
    return False


def escolher(alvo: str, tvs: list):
    if not tvs:
        return None
    a = normalizar(alvo)
    if a:
        for tv in tvs:
            if a in normalizar(tv.get("nome")) or normalizar(tv.get("nome")) in a or a in (tv.get("tipo"), tv.get("id")):
                return tv
        if "lg" in a.split():
            return next((t for t in tvs if t.get("tipo") == "lg"), tvs[0])
        if "roku" in a or "aoc" in a:
            return next((t for t in tvs if t.get("tipo") == "roku"), tvs[0])
    ligadas = [t for t in tvs if online(t, 0.4)]
    return ligadas[0] if ligadas else tvs[0]


# ---------------- Wake-on-LAN ----------------
def acordar(mac: str, ip: str = "") -> bool:
    limpo = re.sub(r"[^0-9a-f]", "", mac.lower())
    if len(limpo) != 12:
        return False
    pacote = bytes.fromhex("ff" * 6 + limpo * 16)
    destinos = {"255.255.255.255"}
    if ip.count(".") == 3:
        destinos.add(".".join(ip.split(".")[:3] + ["255"]))
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        for destino in destinos:
            for porta in (9, 7):
                s.sendto(pacote, (destino, porta))
    return True


# app pelo nome: igual, contido na frase ("netflix na tv da sala") ou a frase contida no nome
def achar_app(apps: list, pedido: str):
    p = normalizar(pedido).replace(" ", "")
    if not p:
        return None
    nome = lambda x: normalizar(x["nome"]).replace(" ", "")
    exatos = [x for x in apps if nome(x) == p]
    na_frase = sorted((x for x in apps if nome(x) and nome(x) in p), key=lambda x: -len(x["nome"]))
    no_nome = [x for x in apps if p in nome(x)]
    return (exatos or na_frase or no_nome or [None])[0]


# ---------------- Roku (ECP) ----------------
def roku(tv: dict, caminho: str, metodo: str = "POST") -> bytes:
    pedido = urllib.request.Request(f"http://{tv['ip']}:8060/{caminho}", data=b"" if metodo == "POST" else None, method=metodo)
    with urllib.request.urlopen(pedido, timeout=4) as resposta:
        return resposta.read()


def roku_apps(tv: dict) -> list:
    raiz = ET.fromstring(roku(tv, "query/apps", "GET"))
    return [{"id": app.get("id"), "nome": (app.text or "").strip()} for app in raiz.findall("app")]


def acao_roku(tv: dict, acao: str, alvo: str, valor: str) -> dict:
    nome = tv.get("nome", "TV")
    if acao == "ligar":
        roku(tv, "keypress/PowerOn")
        return {"ok": True, "mensagem": f"{nome} ligando."}
    if acao == "desligar":
        roku(tv, "keypress/PowerOff")
        return {"ok": True, "mensagem": f"{nome} desligada."}
    if acao == "volume":
        if valor == "mudo":
            roku(tv, "keypress/VolumeMute")
            return {"ok": True, "mensagem": "Mudo."}
        tecla = "VolumeUp" if valor in ("mais", "aumentar", "+") else "VolumeDown"
        for _ in range(4):
            roku(tv, f"keypress/{tecla}")
            time.sleep(0.08)
        return {"ok": True, "mensagem": "Volume aumentado." if tecla == "VolumeUp" else "Volume diminuído."}
    if acao in ("tocar", "pausar"):
        roku(tv, "keypress/Play")
        return {"ok": True, "mensagem": "Play/pausa."}
    if acao == "tecla":
        tecla = TECLAS_ROKU.get(normalizar(valor) or normalizar(alvo))
        if not tecla:
            return {"ok": False, "mensagem": "Teclas: home, voltar, ok, cima, baixo, esquerda, direita, info."}
        roku(tv, f"keypress/{tecla}")
        return {"ok": True, "mensagem": f"Tecla {tecla}."}
    if acao == "entrada":
        numero = re.sub(r"\D", "", valor or alvo) or "1"
        roku(tv, f"keypress/InputHDMI{numero}")
        return {"ok": True, "mensagem": f"Entrada HDMI {numero}."}
    if acao == "youtube":
        if alvo:
            roku(tv, "search/browse?" + urllib.parse.urlencode({"keyword": alvo, "provider-id": "837", "launch": "true"}))
            return {"ok": True, "mensagem": f"Procurando '{alvo}' no YouTube da {nome}."}
        roku(tv, "launch/837")
        return {"ok": True, "mensagem": f"YouTube aberto na {nome}."}
    if acao == "abrir":
        apps = roku_apps(tv)
        a = normalizar(alvo)
        app = achar_app(apps, a)
        if not app:
            return {"ok": False, "mensagem": f"Não achei '{alvo}' na {nome}. Apps: {', '.join(x['nome'] for x in apps[:20])}."}
        roku(tv, f"launch/{app['id']}")
        return {"ok": True, "mensagem": f"{app['nome']} aberto na {nome}."}
    if acao == "estado":
        raiz = ET.fromstring(roku(tv, "query/active-app", "GET"))
        app = raiz.find("app")
        return {"ok": True, "mensagem": f"{nome} ligada, em {(app.text or 'tela inicial').strip() if app is not None else 'tela inicial'}."}
    if acao == "mensagem":
        return {"ok": False, "mensagem": "A Roku não mostra mensagens na tela."}
    return {"ok": False, "mensagem": f"Ação desconhecida para a Roku: {acao}."}


# ---------------- LG webOS ----------------
def acao_lg(tv: dict, acao: str, alvo: str, valor: str) -> dict:
    from aiowebostv import WebOsClient

    nome = tv.get("nome", "TV LG")

    async def rodar():
        cliente = WebOsClient(tv["ip"], tv.get("chave") or None)
        try:
            await asyncio.wait_for(cliente.connect(), timeout=45 if not tv.get("chave") else 8)
        except asyncio.TimeoutError:
            return {"ok": False, "mensagem": f"A {nome} não respondeu. Se apareceu um pedido de permissão na TV, aceite com o controle e peça de novo."}
        try:
            if cliente.client_key and cliente.client_key != tv.get("chave"):
                tv["chave"] = cliente.client_key
                tvs = carregar()
                for t in tvs:
                    if t.get("ip") == tv["ip"]:
                        t["chave"] = cliente.client_key
                salvar(tvs)
            if acao == "desligar":
                await cliente.power_off()
                return {"ok": True, "mensagem": f"{nome} desligada."}
            if acao == "volume":
                if valor == "mudo":
                    await cliente.set_mute(True)
                    return {"ok": True, "mensagem": "Mudo."}
                if re.fullmatch(r"\d{1,3}", valor or ""):
                    await cliente.set_volume(max(0, min(100, int(valor))))
                    return {"ok": True, "mensagem": f"Volume em {valor}."}
                for _ in range(3):
                    await (cliente.volume_up() if valor in ("mais", "aumentar", "+") else cliente.volume_down())
                return {"ok": True, "mensagem": "Volume aumentado." if valor in ("mais", "aumentar", "+") else "Volume diminuído."}
            if acao == "tocar":
                await cliente.play()
                return {"ok": True, "mensagem": "Tocando."}
            if acao == "pausar":
                await cliente.pause()
                return {"ok": True, "mensagem": "Pausado."}
            if acao == "tecla":
                tecla = TECLAS_LG.get(normalizar(valor) or normalizar(alvo))
                if not tecla:
                    return {"ok": False, "mensagem": "Teclas: home, voltar, ok, cima, baixo, esquerda, direita, info."}
                await cliente.button(tecla)
                return {"ok": True, "mensagem": f"Tecla {tecla}."}
            if acao == "entrada":
                numero = re.sub(r"\D", "", valor or alvo) or "1"
                await cliente.set_input(f"HDMI_{numero}")
                return {"ok": True, "mensagem": f"Entrada HDMI {numero}."}
            if acao == "mensagem":
                await cliente.send_message(str(alvo or valor)[:200])
                return {"ok": True, "mensagem": "Mensagem mostrada na TV."}
            if acao in ("abrir", "youtube"):
                apps = (await cliente.get_apps()) or []
                lista = [{"id": a.get("id"), "nome": a.get("title", "")} for a in apps]
                procura = "youtube" if acao == "youtube" else normalizar(alvo)
                app = achar_app(lista, procura)
                if not app:
                    return {"ok": False, "mensagem": f"Não achei '{alvo}' na {nome}."}
                if acao == "youtube" and alvo:
                    await cliente.launch_app_with_params(app["id"], {"contentTarget": "https://www.youtube.com/tv#/search?q=" + urllib.parse.quote(alvo)})
                    return {"ok": True, "mensagem": f"Procurando '{alvo}' no YouTube da {nome}."}
                await cliente.launch_app(app["id"])
                return {"ok": True, "mensagem": f"{app['nome']} aberto na {nome}."}
            if acao == "estado":
                app = await cliente.get_current_app()
                volume = await cliente.get_volume()
                return {"ok": True, "mensagem": f"{nome} ligada, app {app or 'tela inicial'}, volume {volume.get('volume', '?') if isinstance(volume, dict) else volume}."}
            return {"ok": False, "mensagem": f"Ação desconhecida para a LG: {acao}."}
        finally:
            await cliente.disconnect()

    return asyncio.run(rodar())


# ---------------- entrada única ----------------
def comando(acao: str, alvo: str = "", valor: str = "", qual: str = "") -> dict:
    acao = normalizar(acao).replace(" ", "_")
    valor = normalizar(valor)
    if acao in ("procurar", "listar"):
        tvs = descobrir()
        if not tvs:
            return {"ok": True, "tvs": [], "mensagem": "Não achei nenhuma TV na rede agora. Elas precisam estar ligadas (ou em espera com a rede ativa) e no mesmo Wi-Fi do PC."}
        partes = [f"{t['nome']} ({'Roku' if t['tipo'] == 'roku' else 'LG'}, {'ligada' if online(t) else 'desligada ou em espera'})" for t in tvs]
        return {"ok": True, "tvs": tvs, "mensagem": "TVs: " + "; ".join(partes) + "."}
    tvs = carregar()
    if not tvs:
        tvs = descobrir()
    tv = escolher(qual or alvo, tvs)
    if not tv:
        return {"ok": False, "mensagem": "Ainda não conheço nenhuma TV. Ligue a TV e peça para eu procurar as TVs."}
    # o nome da TV no "alvo" não é o app nem a busca
    alvo_limpo = str(alvo or "")
    for palavra in (tv.get("nome", ""), "tv", "televisao", "televisão", "da sala", "do quarto"):
        if palavra:
            alvo_limpo = re.sub(re.escape(palavra), "", alvo_limpo, flags=re.I)
    alvo_limpo = alvo_limpo.strip(" ,.-")
    try:
        if acao == "ligar" and tv["tipo"] == "lg":
            if online(tv):
                return {"ok": True, "mensagem": f"A {tv['nome']} já está ligada."}
            if not tv.get("mac") or not acordar(tv["mac"], tv["ip"]):
                return {"ok": False, "mensagem": f"Não sei o endereço de rede da {tv['nome']} para ligá-la. Ligue uma vez pelo controle e peça para eu procurar as TVs."}
            for _ in range(12):
                time.sleep(1)
                if online(tv):
                    return {"ok": True, "mensagem": f"{tv['nome']} ligada."}
            return {"ok": False, "mensagem": f"Mandei ligar a {tv['nome']}, mas ela não respondeu. Confira se 'Ligar via Wi-Fi' está ativo nas configurações dela."}
        if not online(tv):
            if tv["tipo"] == "roku" and acao == "ligar":
                if tv.get("mac"):
                    acordar(tv["mac"], tv["ip"])
                return {"ok": False, "mensagem": f"A {tv['nome']} não está respondendo na rede. Ligue o 'Início rápido da TV' nas configurações da Roku para ela ligar pela voz."}
            return {"ok": False, "mensagem": f"A {tv['nome']} está desligada ou fora da rede."}
        if tv["tipo"] == "roku":
            return acao_roku(tv, acao, alvo_limpo, valor)
        return acao_lg(tv, acao, alvo_limpo, valor)
    except Exception as erro:  # a TV pode cair no meio do comando
        return {"ok": False, "mensagem": f"A {tv.get('nome', 'TV')} não aceitou o comando: {erro}"}


def listar() -> dict:
    tvs = carregar()
    return {"ok": True, "tvs": [{**{k: v for k, v in t.items() if k != "chave"}, "ligada": online(t, 0.4), "pareada": bool(t.get("chave")) or t.get("tipo") == "roku"} for t in tvs]}
