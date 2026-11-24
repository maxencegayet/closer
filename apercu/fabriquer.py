"""Fabrique l'image d'aperçu de Closer (apercu.png, 1200 x 630), affichée quand on partage le lien
(iMessage, WhatsApp, Slack, LinkedIn…). Lancer depuis la racine du dépôt :  python3 apercu/fabriquer.py
"""
import functools, http.server, pathlib, threading
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHECK = '<path d="M150 270 L228 336 L360 186" fill="none" stroke="#fff" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>'
HTML = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:S;src:url(/fonts/schibsted-grotesk.woff2) format("woff2");font-weight:100 900}}
html,body{{margin:0;width:1200px;height:630px;background:#eff0f2;-webkit-font-smoothing:antialiased}}
body{{display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box;font-family:S,sans-serif;color:#000}}
.top{{display:flex;align-items:center;gap:28px}}
.ic{{width:120px;height:120px;border-radius:28px;background:#000;display:flex;flex:none}}
.ic svg{{width:100%;height:100%}}
b{{font-weight:800;font-size:104px;line-height:1;letter-spacing:-.04em}}
p{{margin:44px 0 0;font-weight:600;font-size:46px;line-height:1.15;letter-spacing:-.02em;max-width:960px}}
small{{display:block;margin-top:22px;font-weight:500;font-size:30px;color:#6b6f78}}
</style></head><body>
<div class="top"><div class="ic"><svg viewBox="0 0 512 512">{CHECK}</svg></div><b>Closer</b></div>
<p>Tâches, devoirs, habitudes et objectifs.<br>Au même endroit.</p>
<small>Rappels à l'heure · synchronisé sur tous tes appareils</small>
</body></html>"""

srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
TMP = ROOT / "apercu" / "_page.html"
TMP.write_text(HTML, encoding="utf-8")
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        pg = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        pg.goto(f"http://127.0.0.1:{srv.server_port}/apercu/_page.html")
        pg.evaluate("document.fonts.ready")
        assert pg.evaluate("document.fonts.check('800 30px S')"), "police non chargée"
        out = ROOT / "apercu.png"
        pg.screenshot(path=str(out))
        Image.open(out).convert("RGB").quantize(64).save(out, optimize=True)
        b.close()
finally:
    TMP.unlink(missing_ok=True)
    srv.shutdown()
print("apercu.png fabriqué")
