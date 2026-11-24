"""Fabrique les écrans de lancement de Closer pour l'iPhone (apple-touch-startup-image).

Sans eux, l'iPhone affiche un écran blanc le temps que Closer démarre depuis l'écran d'accueil.
Chaque iPhone veut une image à la taille exacte de son écran : une par taille ci-dessous.
Lancer depuis la racine du dépôt :  python3 splash/fabriquer.py
puis recopier dans index.html les lignes <link> qu'il affiche.
"""
import functools, http.server, pathlib, threading
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
# largeur et hauteur de l'écran en points, densité de pixels
SIZES = [
    (440, 956, 3),  # 16 Pro Max, 17 Pro Max
    (430, 932, 3),  # 14 Pro Max, 15 Plus / Pro Max, 16 Plus
    (420, 912, 3),  # 17 Air
    (428, 926, 3),  # 12 / 13 Pro Max, 14 Plus
    (414, 896, 3),  # XS Max, 11 Pro Max
    (414, 896, 2),  # XR, 11
    (414, 736, 3),  # 6s / 7 / 8 Plus
    (402, 874, 3),  # 16 Pro, 17, 17 Pro
    (393, 852, 3),  # 14 Pro, 15, 15 Pro, 16
    (390, 844, 3),  # 12, 13, 14, 12 / 13 Pro, 16e
    (375, 812, 3),  # X, XS, 11 Pro, 12 / 13 mini
    (375, 667, 2),  # 6s, 7, 8, SE 2e et 3e génération
    (320, 568, 2),  # SE 1re génération
]
CHECK = '<path d="M150 270 L228 336 L360 186" fill="none" stroke="#fff" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>'
HTML = f"""<!doctype html><html><head><style>
@font-face{{font-family:S;src:url(/fonts/schibsted-grotesk.woff2) format("woff2");font-weight:100 900}}
html,body{{margin:0;height:100%;background:#eff0f2}}
body{{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding-bottom:6vh;box-sizing:border-box}}
.ic{{width:92px;height:92px;border-radius:22px;background:#000;display:flex}}
.ic svg{{width:100%;height:100%}}
b{{font:800 30px/1 S,sans-serif;letter-spacing:-.03em;color:#000;-webkit-font-smoothing:antialiased}}
</style></head><body><div class="ic"><svg viewBox="0 0 512 512">{CHECK}</svg></div><b>Closer</b></body></html>"""

# la police est chargée depuis un petit serveur local (le navigateur refuse de la lire directement sur le disque)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
TMP = ROOT / "splash" / "_page.html"
TMP.write_text(HTML)
URL = f"http://127.0.0.1:{srv.server_port}/splash/_page.html"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    links = []
    for w, h, r in SIZES:
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=r)
        pg.goto(URL)
        pg.evaluate("document.fonts.ready")
        assert pg.evaluate("document.fonts.check('800 30px S')"), "police non chargée"
        name = f"splash/{w * r}x{h * r}.png"
        pg.screenshot(path=str(ROOT / name))
        # peu de couleurs : une palette suffit et divise le poids par 4 environ
        Image.open(ROOT / name).convert("RGB").quantize(64).save(ROOT / name, optimize=True)
        pg.close()
        links.append(f'<link rel="apple-touch-startup-image" href="{name}" media="(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: portrait)">')
    b.close()
TMP.unlink()
srv.shutdown()
print("\n".join(links))
