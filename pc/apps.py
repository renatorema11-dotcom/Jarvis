"""
apps.py — os programas do menu Iniciar do Windows, com os ícones de verdade, para a
lista de apps do laboratório holográfico do Jarvis.

A lista vem do próprio Windows (Get-StartApps) e os ícones do Shell, então aparece
tudo o que está no menu Iniciar: programas comuns, apps da Microsoft Store e apps
instalados pelo Chrome. Fica guardada em apps.local.json e é refeita em segundo plano
cada vez que o Jarvis PC liga. Só abre um app que está nessa lista.
"""
import json
import re
import subprocess
import threading
from pathlib import Path

CACHE = Path(__file__).with_name("apps.local.json")
TAMANHO_ICONE = 64
SEM_JANELA = getattr(subprocess, "CREATE_NO_WINDOW", 0)
# aparecem primeiro, nesta ordem, quando estão instalados
FAVORITOS = [
    "google chrome", "spotify", "whatsapp", "discord", "visual studio code", "explorador de arquivos",
    "steam", "roblox", "claude", "chatgpt", "microsoft edge", "opera", "word", "excel", "powerpoint",
    "calculadora", "bloco de notas", "fotos", "paint", "camera", "configuracoes", "microsoft store",
]
# atalhos que não são programas: documentação, desinstaladores, sites
IGNORAR = re.compile(
    r"uninstall|desinstal|\bfaq\b|frequently asked|manual|\bdocs?\b|documentation|release notes|readme|leia-me|"
    r"website|\bhelp\b|ajuda|telemetria|modo seguro|safe ?mode|garantia",
    re.IGNORECASE,
)

SCRIPT = r"""
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class IconeApp {
  [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx; public int cy; }
  [StructLayout(LayoutKind.Sequential)] struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public ushort bmPlanes, bmBitsPixel; public IntPtr bmBits; }
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr phbm); }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int size, ref BITMAP bm);
  public static string Png(string caminho, int tamanho) {
    try {
      IShellItemImageFactory fabrica;
      SHCreateItemFromParsingName(caminho, IntPtr.Zero, new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), out fabrica);
      SIZE s; s.cx = tamanho; s.cy = tamanho;
      IntPtr hbm;
      // 0x4 = só o ícone (sem miniatura), 0x1 = aceita um tamanho maior
      if (fabrica.GetImage(s, 0x5, out hbm) != 0) return null;
      try {
        BITMAP bm = new BITMAP();
        GetObject(hbm, Marshal.SizeOf(typeof(BITMAP)), ref bm);
        Bitmap img;
        if (bm.bmBitsPixel == 32 && bm.bmBits != IntPtr.Zero) {
          // o Shell entrega um DIB de baixo para cima, com alfa pré-multiplicado
          using (var dib = new Bitmap(bm.bmWidth, bm.bmHeight, bm.bmWidthBytes, PixelFormat.Format32bppPArgb, bm.bmBits)) img = new Bitmap(dib);
          img.RotateFlip(RotateFlipType.RotateNoneFlipY);
        } else {
          img = Image.FromHbitmap(hbm);
        }
        using (img) using (var ms = new System.IO.MemoryStream()) {
          img.Save(ms, ImageFormat.Png);
          return Convert.ToBase64String(ms.ToArray());
        }
      } finally { DeleteObject(hbm); }
    } catch { return null; }
  }
}
'@
$lista = foreach ($a in Get-StartApps) {
  [pscustomobject]@{ nome = $a.Name; id = $a.AppID; icone = [IconeApp]::Png('shell:AppsFolder\' + $a.AppID, __TAMANHO__) }
}
$lista | ConvertTo-Json -Compress -Depth 3
"""

_lista: list[dict] = []
_trava = threading.Lock()


def _normalizar(texto: str) -> str:
    import unicodedata
    sem_acento = unicodedata.normalize("NFD", str(texto or "")).encode("ascii", "ignore").decode()
    return " ".join(sem_acento.lower().split())


def _e_programa(app: dict) -> bool:
    app_id = str(app.get("id") or "")
    nome = str(app.get("nome") or "")
    if not app_id or not nome:
        return False
    if app_id.lower().startswith(("http://", "https://")):
        return False
    if re.search(r"\.(html?|txt|pdf|chm|url)$", app_id, re.IGNORECASE):
        return False
    return not IGNORAR.search(nome)


def _ordem(app: dict) -> tuple:
    nome = _normalizar(app["nome"])
    for i, fav in enumerate(FAVORITOS):
        if nome == fav or nome.startswith(fav + " "):
            return (0, i, nome)
    return (1, 0, nome)


def atualizar() -> list[dict]:
    """Lê o menu Iniciar e os ícones de novo (leva alguns segundos) e guarda em apps.local.json."""
    global _lista
    script = SCRIPT.replace("__TAMANHO__", str(TAMANHO_ICONE))
    try:
        saida = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True, timeout=120, creationflags=SEM_JANELA,
        ).stdout.decode("utf-8", "ignore").strip()
        brutos = json.loads(saida) if saida else []
    except (subprocess.SubprocessError, json.JSONDecodeError, OSError) as erro:
        print(f"   (lista de apps falhou: {erro})")
        return _lista
    if isinstance(brutos, dict):
        brutos = [brutos]
    vistos = set()
    novos = []
    for app in sorted(filter(_e_programa, brutos), key=_ordem):
        chave = _normalizar(app["nome"])
        if chave in vistos:
            continue
        vistos.add(chave)
        novos.append({"id": app["id"], "nome": app["nome"], "icone": app.get("icone"), "favorito": _ordem(app)[0] == 0})
    with _trava:
        _lista = novos
    try:
        CACHE.write_text(json.dumps(novos, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass
    print(f"   Lista de apps: {len(novos)} programas do menu Iniciar.")
    return novos


def listar() -> list[dict]:
    global _lista
    with _trava:
        if _lista:
            return _lista
    try:
        guardada = json.loads(CACHE.read_text(encoding="utf-8"))
        with _trava:
            _lista = guardada
        return guardada
    except (OSError, json.JSONDecodeError):
        return atualizar()


def abrir(app_id: str) -> dict:
    app = next((a for a in listar() if a["id"] == app_id), None)
    if not app:
        return {"ok": False, "mensagem": "Esse app não está no menu Iniciar."}
    # o Shell abre qualquer item do menu Iniciar pelo AppID e traz a janela para a frente
    subprocess.Popen(["explorer.exe", "shell:AppsFolder\\" + app["id"]], creationflags=SEM_JANELA)
    return {"ok": True, "mensagem": f"Abrindo {app['nome']}.", "nome": app["nome"]}
