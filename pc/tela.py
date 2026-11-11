"""
tela.py — o Jarvis olha a tela do computador do Renato (rota /tela do jarvis-pc.py).

Tira um print só quando o agente pede (ferramenta ver_tela), reduz para no máximo 1600 px
de largura e devolve em JPEG (data URL). Nada fica salvo em disco: a imagem vai direto
para a visão do cérebro (n8n → Groq) e some.
"""
import base64
import io

LARGURA_MAX = 1600


def capturar(monitor: int = 0) -> dict:
    """monitor 0 = o principal; 1, 2... = cada monitor; -1 = todos juntos."""
    import mss
    from PIL import Image

    with mss.mss() as sct:
        monitores = sct.monitors          # [0] = todos juntos, [1..] = cada monitor
        if monitor == -1:
            area = monitores[0]
        else:
            indice = monitor if 1 <= monitor < len(monitores) else 1
            area = monitores[indice]
        bruto = sct.grab(area)
        imagem = Image.frombytes("RGB", bruto.size, bruto.bgra, "raw", "BGRX")
    if imagem.width > LARGURA_MAX:
        imagem = imagem.resize((LARGURA_MAX, round(imagem.height * LARGURA_MAX / imagem.width)), Image.LANCZOS)
    saida = io.BytesIO()
    imagem.save(saida, "JPEG", quality=80, optimize=True)
    return {
        "ok": True,
        "imagem": "data:image/jpeg;base64," + base64.b64encode(saida.getvalue()).decode("ascii"),
        "largura": imagem.width,
        "altura": imagem.height,
        "monitores": len(monitores) - 1,
        "mensagem": "Print da tela tirado.",
    }
