"""
dispositivos.py — procura aparelhos perto do PC (usado pelo jarvis-pc.py).

Bluetooth (fones, caixas de som, celulares, relógios, PCs — pareados ou por
perto) pelo próprio Windows, e a rede de casa (TVs, Chromecast, videogames)
por SSDP/UPnP e Wi-Fi Direct (telas para transmitir).

Conectar: pareia um Bluetooth novo (o Windows pode pedir confirmação), abre o
painel de Bluetooth para um aparelho já pareado, o painel "Transmitir" para uma
TV e o Vincular ao Celular para um celular.

Precisa dos pacotes winrt-Windows.Devices.Enumeration e winrt-Windows.Foundation.
"""
import asyncio
import ctypes
import os
import re
import socket
import subprocess
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

try:
    import winrt.system as ws
    from winrt.windows.devices.enumeration import (
        DeviceInformation, DeviceInformationKind, DevicePairingKinds, DevicePairingResultStatus)
except ImportError:
    ws = None

# ---------------- CONFIG ----------------
SEGUNDOS_BUSCA = 8
BLUETOOTH = "e0cbf06c-cd8b-4647-bb8a-263b43f0f974"
BLUETOOTH_LE = "bb7bb05e-5972-42b5-94fc-76eaa7084d49"
WIFI_DIRECT = "0407d24e-53de-4c9a-9ba1-9ced54641188"   # telas que aceitam transmissão (Miracast)
PROPRIEDADES = ["System.Devices.Aep.IsPaired", "System.Devices.Aep.IsConnected", "System.Devices.Aep.SignalStrength",
                "System.Devices.Aep.Bluetooth.Cod.Major", "System.Devices.Aep.Bluetooth.Cod.Minor"]
# ----------------------------------------

# classe Bluetooth (Class of Device) -> tipo
POR_CLASSE = {1: "computador", 2: "celular", 5: "periferico", 6: "impressora", 7: "relogio"}
AUDIO_VIDEO = {1: "fone", 2: "fone", 6: "fone", 5: "caixa", 7: "caixa", 10: "caixa", 8: "carro", 9: "tv", 14: "tv", 15: "tv"}
POR_NOME = [
    (r"buds|airpods|tws|fone|headset|headphone|earbud|jbl tune|qcy|wh-|wf-", "fone"),
    (r"speaker|caixa|soundbar|jbl (go|flip|charge)|boombox|echo|nest", "caixa"),
    (r"galaxy|iphone|redmi|xiaomi|moto|motorola|poco|pixel|android|celular|phone", "celular"),
    (r"tv|bravia|tizen|webos|roku|chromecast|fire ?stick|android ?tv|projetor", "tv"),
    (r"watch|band|rel[oó]gio|mi band|amazfit", "relogio"),
    (r"mouse|keyboard|teclado|controle|controller|gamepad|xbox wireless", "periferico"),
    (r"xbox|playstation|ps[45]|nintendo|switch", "console"),
    (r"mhdx|dvr|nvr|ipc|c[aâ]mera|camera|cam\b|intelbras", "camera"),
    (r"desktop|laptop|notebook|-pc\b|^pc-", "computador"),
]
NOMES = {"fone": "fone", "caixa": "caixa de som", "celular": "celular", "tv": "TV / tela", "relogio": "relógio",
         "periferico": "periférico", "computador": "computador", "console": "videogame", "roteador": "roteador",
         "carro": "som do carro", "impressora": "impressora", "camera": "câmera / gravador", "aparelho": "aparelho"}

ultima_busca = {}   # id -> aparelho, para o conectar achar o que foi visto
trava = threading.Lock()


def tipo_pelo_nome(nome: str) -> str:
    texto = (nome or "").lower()
    for padrao, tipo in POR_NOME:
        if re.search(padrao, texto):
            return tipo
    return "aparelho"


def valor(objeto):
    """Os valores do Windows chegam embrulhados; tenta cada tipo até um servir."""
    if objeto is None or ws is None:
        return None
    for abrir in (ws.unbox_boolean, ws.unbox_uint16, ws.unbox_int32, ws.unbox_uint32, ws.unbox_uint8, ws.unbox_string):
        try:
            return abrir(objeto)
        except Exception:
            pass
    return None


def ler_propriedade(info, nome):
    p = info.properties
    return valor(p.lookup(nome)) if p.has_key(nome) else None


# ---------------- Bluetooth e telas (Windows) ----------------
async def vigiar(protocolo: str, segundos: float) -> list:
    achados = {}
    vigia = DeviceInformation.create_watcher(
        f'System.Devices.Aep.ProtocolId:="{{{protocolo}}}"', PROPRIEDADES, DeviceInformationKind.ASSOCIATION_ENDPOINT)
    vigia.add_added(lambda _, info: achados.__setitem__(info.id, info))
    vigia.add_updated(lambda _, mudou: achados[mudou.id].update(mudou) if mudou.id in achados else None)
    vigia.start()
    await asyncio.sleep(segundos)
    vigia.stop()
    return list(achados.values())


def aparelho_bluetooth(info, via: str) -> dict:
    nome = (info.name or "").strip()
    pareado = bool(ler_propriedade(info, PROPRIEDADES[0]))
    conectado = bool(ler_propriedade(info, PROPRIEDADES[1]))
    sinal = ler_propriedade(info, PROPRIEDADES[2])
    maior = ler_propriedade(info, PROPRIEDADES[3])
    menor = ler_propriedade(info, PROPRIEDADES[4])
    tipo = (AUDIO_VIDEO.get(menor, "caixa") if maior == 4 else POR_CLASSE.get(maior)) or tipo_pelo_nome(nome)
    if tipo == "aparelho":
        tipo = tipo_pelo_nome(nome)
    estado = "conectado" if conectado else "pareado" if pareado else "disponível"
    if not pareado:
        acao = "parear"
    elif conectado or tipo == "computador":
        acao = None
    else:
        acao = "abrir_celular" if tipo == "celular" else "conectar"
    return {"id": info.id, "nome": nome, "tipo": tipo, "via": via, "estado": estado,
            "sinal": sinal if isinstance(sinal, int) and sinal > -128 else None,
            "detalhe": f"{NOMES.get(tipo, tipo)} · {via}", "acao": acao}


def aparelho_tela(info) -> dict:
    return {"id": info.id, "nome": (info.name or "Tela sem nome").strip(), "tipo": "tv", "via": "Wi-Fi Direct",
            "estado": "disponível", "sinal": None, "detalhe": "tela para transmitir (Miracast)", "acao": "transmitir"}


# ---------------- rede de casa (SSDP / UPnP) ----------------
def buscar_ssdp(segundos: float = 3.5) -> list:
    pedido = "\r\n".join(["M-SEARCH * HTTP/1.1", "HOST: 239.255.255.250:1900", 'MAN: "ssdp:discover"',
                          "MX: 2", "ST: ssdp:all", "", ""]).encode()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    sock.settimeout(0.5)
    try:
        for _ in range(2):
            sock.sendto(pedido, ("239.255.255.250", 1900))
        locais = {}
        fim = time.time() + segundos
        while time.time() < fim:
            try:
                dados, (ip, _) = sock.recvfrom(65507)
            except socket.timeout:
                continue
            local = re.search(rb"(?im)^location:\s*(\S+)", dados)
            st = re.search(rb"(?im)^st:\s*(\S+)", dados)
            if local:
                url = local.group(1).decode(errors="ignore")
                locais.setdefault(url, {"ip": ip, "st": set()})["st"].add(st.group(1).decode(errors="ignore") if st else "")
    finally:
        sock.close()
    meus_ips = set(socket.gethostbyname_ex(socket.gethostname())[2])
    with ThreadPoolExecutor(8) as executor:
        descricoes = list(executor.map(descrever_upnp, locais))
    vistos, aparelhos = set(), []
    for (url, achado), info in zip(locais.items(), descricoes):
        if achado["ip"] in meus_ips:
            continue
        nome = info.get("friendlyName") or achado["ip"]
        if (nome, achado["ip"]) in vistos:
            continue
        vistos.add((nome, achado["ip"]))
        aparelhos.append(aparelho_rede(nome, achado["ip"], info, achado["st"]))
    return aparelhos


def descrever_upnp(url: str) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=2) as resposta:
            raiz = ET.fromstring(resposta.read(200_000))
        ns = {"d": "urn:schemas-upnp-org:device-1-0"}
        dev = raiz.find("d:device", ns)
        if dev is None:
            return {}
        return {c: dev.findtext(f"d:{c}", default="", namespaces=ns) for c in ("friendlyName", "manufacturer", "modelName", "deviceType")}
    except Exception:
        return {}


def aparelho_rede(nome: str, ip: str, info: dict, sts: set) -> dict:
    texto = " ".join([nome, info.get("manufacturer", ""), info.get("modelName", ""), info.get("deviceType", "")] + list(sts)).lower()
    if "internetgatewaydevice" in texto:
        tipo = "roteador"
    elif "xbox" in texto or "playstation" in texto:
        tipo = "console"
    elif "sonos" in texto or "speaker" in texto:
        tipo = "caixa"
    elif "mediarenderer" in texto or "dial" in texto or re.search(r"\btv\b|chromecast|roku|tizen|webos|bravia", texto):
        tipo = "tv"
    else:
        tipo = tipo_pelo_nome(nome)
    detalhe = " ".join(x for x in (info.get("manufacturer"), info.get("modelName")) if x) or "rede de casa"
    return {"id": f"rede:{ip}:{nome}", "nome": nome, "tipo": tipo, "via": "rede", "estado": "na rede",
            "sinal": None, "detalhe": f"{NOMES.get(tipo, tipo)} · {detalhe} · {ip}",
            "acao": "transmitir" if tipo == "tv" else None}


# ---------------- busca completa ----------------
async def _buscar() -> list:
    rede = asyncio.get_running_loop().run_in_executor(None, buscar_ssdp)
    classico, baixa_energia, telas = await asyncio.gather(
        vigiar(BLUETOOTH, SEGUNDOS_BUSCA), vigiar(BLUETOOTH_LE, SEGUNDOS_BUSCA), vigiar(WIFI_DIRECT, SEGUNDOS_BUSCA))
    aparelhos = [aparelho_bluetooth(i, "Bluetooth") for i in classico]
    # o Bluetooth de baixa energia repete o mesmo aparelho e traz muita coisa sem nome: só os com nome
    aparelhos += [aparelho_bluetooth(i, "Bluetooth LE") for i in baixa_energia if (i.name or "").strip()]
    aparelhos += [aparelho_tela(i) for i in telas]
    try:
        aparelhos += await rede
    except Exception as erro:
        print(f"   (rede: {erro})")
    return aparelhos


def ordem(aparelho: dict) -> tuple:
    peso = {"conectado": 0, "disponível": 1, "na rede": 2, "pareado": 3}
    return (peso.get(aparelho["estado"], 4), aparelho["tipo"] == "roteador", -(aparelho["sinal"] or -200), aparelho["nome"].lower())


def buscar() -> dict:
    if ws is None:
        return {"ok": False, "mensagem": "Falta o pacote winrt no Python do Jarvis PC (uv pip install winrt-Windows.Devices.Enumeration)."}
    with trava:   # uma busca por vez: duas ao mesmo tempo só dobram o tempo
        return _buscar_agora()


def _buscar_agora() -> dict:
    inicio = time.time()
    aparelhos = asyncio.run(_buscar())
    # o mesmo aparelho aparece várias vezes (endereços diferentes): fica o mais "vivo"
    unicos = {}
    for a in sorted(aparelhos, key=ordem):
        unicos.setdefault((a["nome"].lower(), a["via"].split()[0]), a)
    lista = sorted(unicos.values(), key=ordem)
    ultima_busca.clear()
    ultima_busca.update({a["id"]: a for a in lista})
    return {"ok": True, "segundos": round(time.time() - inicio, 1), "aparelhos": lista,
            "resumo": resumir(lista)}


def resumir(lista: list) -> str:
    if not lista:
        return "Não achei nenhum aparelho por perto."
    partes = [f"{a['nome']} ({NOMES.get(a['tipo'], a['tipo'])}, {a['estado']})" for a in lista[:12]]
    return f"Achei {len(lista)} aparelho(s): " + "; ".join(partes) + "."


# ---------------- conectar ----------------
def apertar_atalho(*teclas: int) -> None:
    for vk in teclas:
        ctypes.windll.user32.keybd_event(vk, 0, 0, 0)
    for vk in reversed(teclas):
        ctypes.windll.user32.keybd_event(vk, 0, 2, 0)


def abrir(uri: str) -> None:
    os.startfile(uri)


async def _parear(id_aparelho: str) -> dict:
    info = await DeviceInformation.create_from_id_async(id_aparelho)
    if info.pairing.is_paired:
        return {"ok": True, "mensagem": f"{info.name} já está pareado."}
    if not info.pairing.can_pair:
        return {"ok": False, "mensagem": f"{info.name} não aceita pareamento agora. Coloque o aparelho em modo de pareamento e procure de novo."}
    # fones e caixas só pedem "confirmar"; celulares mostram um código na tela deles, que o Renato confirma lá
    aceitar = DevicePairingKinds.CONFIRM_ONLY | DevicePairingKinds.CONFIRM_PIN_MATCH | DevicePairingKinds.DISPLAY_PIN
    personalizado = info.pairing.custom
    personalizado.add_pairing_requested(lambda _, pedido: pedido.accept())
    resultado = await asyncio.wait_for(personalizado.pair_async(aceitar), 40)
    if resultado.status in (DevicePairingResultStatus.PAIRED, DevicePairingResultStatus.ALREADY_PAIRED):
        return {"ok": True, "mensagem": f"Pareado com {info.name}. Se for fone ou caixa, o Windows já conecta o som nele."}
    return {"ok": False, "mensagem": f"O pareamento com {info.name} não deu certo ({resultado.status.name.lower()}). Confira se ele está em modo de pareamento."}


def conectar(id_aparelho: str) -> dict:
    aparelho = ultima_busca.get(id_aparelho)
    if not aparelho:
        return {"ok": False, "mensagem": "Não conheço esse aparelho. Procure os dispositivos de novo antes de conectar."}
    acao, nome = aparelho["acao"], aparelho["nome"]
    if acao == "parear":
        try:
            return asyncio.run(_parear(id_aparelho))
        except asyncio.TimeoutError:
            return {"ok": False, "mensagem": f"{nome} não respondeu ao pareamento. Coloque-o em modo de pareamento e tente de novo."}
        except Exception as erro:
            return {"ok": False, "mensagem": f"Falhou ao parear {nome}: {str(erro)[:120]}"}
    if acao == "conectar":
        # o Windows não deixa um programa ligar o som de um aparelho já pareado; o painel rápido faz isso em um toque
        try:
            abrir("ms-actioncenter:controlcenter/bluetooth")
        except OSError:
            abrir("ms-settings:bluetooth")
        return {"ok": True, "mensagem": f"Abri o painel do Bluetooth: toque em {nome} para conectar (ou ligue o aparelho, que ele conecta sozinho)."}
    if acao == "transmitir":
        apertar_atalho(0x5B, 0x4B)   # Win+K: painel "Transmitir"
        return {"ok": True, "mensagem": f"Abri o painel Transmitir do Windows: escolha {nome} para espelhar a tela."}
    if acao == "abrir_celular":
        subprocess.Popen(["explorer.exe", r"shell:AppsFolder\Microsoft.YourPhone_8wekyb3d8bbwe!App"])
        return {"ok": True, "mensagem": f"Abri o Vincular ao Celular para usar o {nome} pelo PC."}
    return {"ok": True, "mensagem": f"{nome} já está conectado."}
