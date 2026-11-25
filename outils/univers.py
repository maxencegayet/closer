#!/usr/bin/env python3
"""Closer · fabrique les univers (Réglages › Univers) : couleurs et matières.

Une seule source pour tout ce qui concerne les univers. Le script écrit :
  css/univers.css   les couleurs de chaque univers (clair et sombre) et le lien vers ses matières
  matieres/*.svg    les matières (bruit SVG : grain, veines, fil du bois, mouchetures, marbrure)
  js/univers.js     la liste des univers pour la page Univers (noms, mots, nuances des aperçus)

Ces fichiers sont FABRIQUÉS : ne jamais les modifier à la main, changer ce script puis le relancer.
    python3 outils/univers.py            écrit les fichiers
    python3 outils/univers.py --verifier vérifie seulement qu'ils sont à jour (utilisé par les tests)

Le script contrôle aussi les contrastes (texte lisible partout) et s'arrête si l'un d'eux est trop faible.
Les règles d'usage des couleurs et des matières (où va chaque nuance) sont dans css/closer.css,
blocs « Univers : répartition des teintes » et « Univers : matières ».
"""
import colorsys, json, os, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------- univers
# id, nom affiché, mots, matière, teinte des neutres (degrés), saturation des neutres,
# bloc fort en clair, bloc fort en sombre (pastel), surfaces légèrement chaudes, carte du jour pastel en clair
UNIVERS = [
    ("sage",     "Sauge",       "Naturel · Apaisant", "Grès moucheté", 105,  9, "#455747", "#c9d6c3", False, True),
    ("nude",     "Nude",        "Chic · Intemporel",  "Chêne blanchi",  22, 14, "#5c4940", "#e3d0c4", True,  True),
    ("powder",   "Bleu poudré", "Frais · Clair",      "Marbre veiné",  210, 16, "#3b5674", "#c5d6e8", False, True),
    ("lavender", "Lavande",     "Doux · Sophistiqué", "Albâtre",       258, 11, "#4d4563", "#d6cfe6", False, True),
    ("rose",     "Vieux rose",  "Élégant · Délicat",  "Terre cuite",   352, 13, "#6c434a", "#ecc9cd", True,  True),
    ("midnight", "Nuit",        "Sobre · Contrasté",  "Ardoise",       224, 22, "#24396e", "#bccbea", False, False),
]
# l'univers d'origine (noir), pour les aperçus seulement : ses couleurs sont celles de base de css/closer.css
CLOSER = ["", "Closer", "Noir · Net",
          ["#eff0f2", "#000000", "#ffffff", "#ffffff", "#ecedf0", "#000000", "#e3e5e9", "#d9dbe1", "#a3a7b0"],
          ["#000000", "#f5f5f7", "#000000", "#1c1c1e", "#2c2c2e", "#f5f5f7", "#2c2c2e", "#3a3a3e", "#62666e"]]
# nuances reprises dans js/univers.js (aperçus de la page Univers), dans cet ordre
APERCU = ["bg", "hbg", "hink", "surface", "line", "solid", "t1", "t2", "t3"]

# ---------------------------------------------------------------- matières
# couches : op = grain (bruit centré), mottle (marbrure), vein (veines : table à pic),
# band (fil du bois / strates : table répétée), spot (mouchetures : seuil) ; f = fréquence,
# o = octaves, a = intensité, hi = couleur inversée (éclats clairs sur fond clair, etc.)
MATIERES = {
    "sage": (320, [dict(op="grain", f=".85", o=2, a=.07), dict(op="spot", f="1.1", o=1, a=.30, t=.70),
                   dict(op="spot", f=".5", o=1, a=.16, t=.72, s=29), dict(op="mottle", f=".012", o=3, a=.04)]),
    "nude": (360, [dict(op="band", f=".004 .07", o=3, a=.10, r=6), dict(op="grain", f=".9 .2", o=1, a=.05)]),
    "powder": (480, [dict(op="vein", f=".004 .007", o=5, a=.17, w=41), dict(op="vein", f=".008 .012", o=5, a=.10, w=51, s=41),
                     dict(op="mottle", f=".008", o=3, a=.05), dict(op="grain", f=".9", o=1, a=.04)]),
    "lavender": (440, [dict(op="mottle", f=".006", o=4, a=.09), dict(op="vein", f=".006", o=4, a=.07, w=31, s=17),
                       dict(op="grain", f=".9", o=1, a=.04)]),
    "rose": (340, [dict(op="mottle", f=".025", o=4, a=.05), dict(op="spot", f="1", o=1, a=.40, t=.71, hi=True),
                   dict(op="spot", f=".9", o=1, a=.16, t=.72, s=31), dict(op="grain", f=".75", o=2, a=.08)]),
    "midnight": (360, [dict(op="band", f=".0015 .02", o=5, a=.035, r=3), dict(op="vein", f=".003 .02", o=4, a=.10, w=31, hi=True, s=23),
                       dict(op="grain", f="1", o=1, a=.12), dict(op="mottle", f=".01", o=3, a=.05, hi=True)]),
}
# intensité par endroit : fond (seulement le grain), carte du jour (matière entière), barre d'onglets et +
INTENSITE = {"bg": .45, "hero": 1.0, "solid": .6}

# ---------------------------------------------------------------- couleurs
def hx(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))
def rgb(c): c = c.lstrip("#"); return [int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)]
def hls(c): h, l, s = colorsys.rgb_to_hls(*rgb(c)); return h * 360, s * 100, l * 100
def lum(c):
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = map(f, rgb(c)); return .2126 * r + .7152 * g + .0722 * b
def contraste(a, b): la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + .05) / (lb + .05)

def ajuste(V, cle, ref, mini, h, s, monte):
    """Éclaircit ou fonce V[cle] jusqu'à atteindre le contraste voulu avec V[ref]."""
    l = hls(V[cle])[2]
    while contraste(V[cle], V[ref]) < mini and 0 < l < 100:
        l += .5 if monte else -.5
        V[cle] = hx(h, s, l)

# contrastes exigés (WCAG : 4,5 pour le texte, 3 pour les éléments graphiques)
CONTROLES = [("hink", "hbg", 7), ("hsoft", "hbg", 4.5), ("hon", "hbg", 3), ("tink", "t1", 4.5), ("t3", "surface", 3),
             ("tink", "bg", 4.5), ("ink", "bg", 7), ("muted", "surface", 4.5), ("muted", "bg", 4.5),
             ("surface", "solid", 4.5), ("hero-soft", "solid", 4.5), ("on-solid", "solid", 4.5)]

def couleurs(H, S, sl, sd, chaud, doux):
    sh, ss, sll = hls(sl); dh, ds, dl = hls(sd)
    C = dict(bg=hx(H, S + 20, 93.5), surface=hx(H, 40, 99) if chaud else "#ffffff", ink=hx(H, S + 8, 12), muted=hx(H, S, 43),
             line=hx(H, S + 4, 91.5), solid=sl, **{"solid-press": hx(sh, ss, max(sll - 7, 6)), "hero-off": hx(sh, ss * .8, sll + 13),
             "hero-soft": hx(sh, ss * .55, 79), "check-line": hx(H, S, 75)}, faint=hx(H, S, 66), pip=hx(H, S + 2, 86),
             grab=hx(H, S, 78), **{"switch-off": hx(H, S + 2, 85)}, chev=hx(H, S, 73), x=hx(H, S, 50), **{"on-solid": "#ffffff"})
    D = dict(bg=hx(H, S + 14, 6), surface=hx(H, S + 8, 13), ink=hx(H, S + 15, 95), muted=hx(H, S + 2, 64), line=hx(H, S + 6, 20),
             solid=sd, **{"solid-press": hx(dh, ds, dl - 6), "hero-off": hx(dh, ds * .6, dl - 17), "hero-soft": hx(dh, ds * .35, 40),
             "check-line": hx(H, S, 37)}, faint=hx(H, S, 41), pip=hx(H, S, 24), grab=hx(H, S, 30), **{"switch-off": hx(H, S, 24)},
             chev=hx(H, S, 40), x=hx(H, S, 58), **{"on-solid": hx(dh, S, 9)})
    # gamme de la teinte : t0 survol, t1 fond doux, t2 piste/contour, t3 accent, tink texte teinté
    ts = min(ss * .75, 34)
    C.update(t0=hx(sh, ts * .7, 97), t1=hx(sh, ts, 92.5), t2=hx(sh, ts * .95, 84), t3=hx(sh, ts * .9, 58), tink=hx(sh, ss, 30))
    D.update(t0=hx(dh, ds * .25, 15), t1=hx(dh, ds * .3, 19), t2=hx(dh, ds * .3, 27), t3=hx(dh, ds * .5, 58), tink=hx(dh, ds * .8, 84))
    ajuste(C, "muted", "bg", 4.7, H, S, False); ajuste(D, "muted", "surface", 5, H, S + 2, True)
    ajuste(C, "hero-soft", "solid", 4.7, sh, ss * .45, True); ajuste(D, "hero-soft", "solid", 4.7, dh, ds * .35, False)
    # carte du jour : pastel et texte foncé (sinon bloc fort, comme Nuit)
    if doux:
        C.update(hbg=hx(dh, ds, min(dl + 2, 88)), hink=hx(dh, ds * .5, 15), hsoft=hx(dh, ds * .35, 36), hoff=hx(dh, ds * .7, dl - 12), hon=sl)
        ajuste(C, "hsoft", "hbg", 4.6, dh, ds * .35, False); ajuste(C, "hink", "hbg", 9, dh, ds * .5, False)
    else:
        C.update(hbg=sl, hink=C["surface"], hsoft=C["hero-soft"], hoff=C["hero-off"], hon=C["surface"])
    D.update(hbg=sd, hink=D["on-solid"], hsoft=D["hero-soft"], hoff=D["hero-off"], hon=D["on-solid"])
    ajuste(C, "tink", "t1", 6, sh, ss, False); ajuste(D, "tink", "t1", 6, dh, ds * .8, True)
    ajuste(C, "t3", "surface", 3, sh, ts * .9, False); ajuste(D, "t3", "surface", 3, dh, ds * .5, True)
    return C, D

# ---------------------------------------------------------------- matières (SVG)
def couche(i, L, c):
    op, a = L["op"], L["a"]
    t = (f"<feTurbulence type='fractalNoise' baseFrequency='{L['f']}' numOctaves='{L.get('o', 2)}' "
         f"seed='{L.get('s', i * 11 + 5)}' stitchTiles='stitch'/>")
    m = f"<feColorMatrix values='0 0 0 0 {c} 0 0 0 0 {c} 0 0 0 0 {c} 1 0 0 0 0'/>"
    if op == "grain":
        k = a * 2.2; ct = f"<feFuncA type='linear' slope='{k:.3f}' intercept='{-0.45 * k:.3f}'/>"
    elif op == "mottle":
        k = a * 3; ct = f"<feFuncA type='linear' slope='{k:.3f}' intercept='{-0.4 * k:.3f}'/>"
    elif op == "vein":
        n = L.get("w", 15); v = ["0"] * n; v[n // 2] = str(a)
        ct = f"<feFuncA type='table' tableValues='{' '.join(v)}'/>"
    elif op == "band":
        v = []
        for _ in range(L.get("r", 6)): v += ["0", str(a * .5), str(a), str(a * .5)]
        ct = f"<feFuncA type='table' tableValues='{' '.join(v + ['0'])}'/>"
    elif op == "spot":
        th = L.get("t", .66)
        m = f"<feColorMatrix values='0 0 0 0 {c} 0 0 0 0 {c} 0 0 0 0 {c} 8 0 0 0 {-8 * th:.2f}'/>"
        ct = f"<feFuncA type='linear' slope='{a}'/>"
    else:
        raise ValueError(op)
    return t + m + f"<feComponentTransfer result='l{i}'>{ct}</feComponentTransfer>"

def svg(couches, taille, fonce, gain):
    """fonce = grain foncé (pour une surface claire) ; sinon grain clair (surface foncée)."""
    f, mg = [], []
    for i, L in enumerate(couches):
        c = 0 if fonce else 1
        if L.get("hi"): c = 1 - c
        L2 = dict(L); L2["a"] = round(L["a"] * gain, 3)
        f.append(couche(i, L2, c)); mg.append(f"<feMergeNode in='l{i}'/>")
    return (f"<svg xmlns='http://www.w3.org/2000/svg' width='{taille}' height='{taille}'>"
            f"<filter id='x' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>"
            + "".join(f) + "<feMerge>" + "".join(mg) + "</feMerge></filter>"
            "<rect width='100%' height='100%' filter='url(#x)'/></svg>\n")

# ---------------------------------------------------------------- fabrication
def fabriquer():
    """Renvoie {chemin relatif: contenu} et la liste des contrastes insuffisants."""
    fichiers, css, faibles, liste = {}, [], [], [CLOSER]
    dec = lambda V: ";".join(f"--{k}:{v}" for k, v in V.items())
    url = lambda n: f'url("../matieres/{n}.svg")'
    for pid, nom, mots, matiere, H, S, sl, sd, chaud, doux in UNIVERS:
        C, D = couleurs(H, S, sl, sd, chaud, doux)
        for mode, V in (("clair", C), ("sombre", D)):
            for a, b, mini in CONTROLES:
                if contraste(V[a], V[b]) < mini: faibles.append(f"{pid} {mode} {a}/{b} {contraste(V[a], V[b]):.2f}")
        taille, couches = MATIERES[pid]
        grain = [x for x in couches if x["op"] in ("grain", "spot")]  # fond : seulement le grain de la matière
        # clair : fond clair → grain foncé ; carte pastel → foncé (Nuit : carte foncée → clair) ; bloc fort foncé → clair
        # sombre : fond foncé → clair ; carte pastel → foncé ; bloc fort pastel → foncé
        for mode, sorte, cs, fonce, g in (("clair", "fond", grain, True, "bg"), ("clair", "carte", couches, doux, "hero"),
                                          ("clair", "bloc", couches, False, "solid"), ("sombre", "fond", grain, False, None),
                                          ("sombre", "carte", couches, True, "hero"), ("sombre", "bloc", couches, True, "solid")):
            gain = INTENSITE["bg"] * .8 if g is None else INTENSITE[g]
            fichiers[f"matieres/{pid}-{mode}-{sorte}.svg"] = svg(cs, taille, fonce, gain)
        tex = lambda m: f"--tex-bg:{url(pid + '-' + m + '-fond')};--tex-hero:{url(pid + '-' + m + '-carte')};--tex-solid:{url(pid + '-' + m + '-bloc')}"
        css.append(f"/* {nom} · {matiere} */")
        css.append(f':root[data-pal="{pid}"]{{{dec(C)};{tex("clair")}}}')
        css.append(f':root[data-pal="{pid}"][data-theme="dark"]{{{dec(D)};{tex("sombre")}}}')
        css.append(f'@media (prefers-color-scheme:dark){{:root[data-pal="{pid}"][data-theme="auto"]{{{dec(D)};{tex("sombre")}}}}}')
        # aperçus de la page Univers (fond et carte du jour de chaque univers)
        ap = lambda m: f'.pal[data-v="{pid}"] .pv{{background-image:{url(pid + "-" + m + "-fond")}}}.pal[data-v="{pid}"] .pv b{{background-image:{url(pid + "-" + m + "-carte")}}}'
        css.append(ap("clair"))
        css.append(f':root[data-theme="dark"] {ap("sombre").replace("}.pal", "}:root[data-theme=" + chr(34) + "dark" + chr(34) + "] .pal")}')
        css.append("@media (prefers-color-scheme:dark){:root[data-theme=\"auto\"] " + ap("sombre").replace("}.pal", "}:root[data-theme=\"auto\"] .pal") + "}")
        liste.append([pid, nom, mots, [C[k] for k in APERCU], [D[k] for k in APERCU]])
    fichiers["css/univers.css"] = ("/* FICHIER FABRIQUÉ par outils/univers.py : ne pas modifier à la main. */\n"
                                   "/* Couleurs et matières de chaque univers (Réglages › Univers). Les règles d'usage sont dans closer.css. */\n"
                                   + "\n".join(css) + "\n")
    mat = {u[0]: u[3] for u in UNIVERS}
    fichiers["js/univers.js"] = ("/* FICHIER FABRIQUÉ par outils/univers.py : ne pas modifier à la main.\n"
                                 "   Univers (Réglages › Univers) : [id, nom, mots, [fond, carte du jour, texte de la carte, carte, trait, bloc fort, t1, t2, t3] clair, idem sombre].\n"
                                 "   \"\" = Closer d'origine, noir. */\n"
                                 "var PALETTES=" + json.dumps(liste, ensure_ascii=False) + ";\n"
                                 "var PAL_MAT=" + json.dumps(mat, ensure_ascii=False) + ";\n")
    # sw.js : précharger les matières pour le hors ligne (bloc entre les deux repères)
    sw = open(os.path.join(RACINE, "sw.js"), encoding="utf-8").read()
    deb, fin = "  /* matieres:debut */\n", "  /* matieres:fin */"
    i, j = sw.index(deb) + len(deb), sw.index(fin)
    noms = sorted(n for n in fichiers if n.startswith("matieres/"))
    fichiers["sw.js"] = sw[:i] + "".join(f'  "{n}"' + (",\n" if k < len(noms) - 1 else "\n") for k, n in enumerate(noms)) + sw[j:]
    return fichiers, faibles

def main():
    fichiers, faibles = fabriquer()
    if faibles:
        print("Contrastes insuffisants :", *faibles, sep="\n  "); sys.exit(1)
    verifier = "--verifier" in sys.argv
    perimes = []
    existants = {f"matieres/{n}" for n in os.listdir(os.path.join(RACINE, "matieres"))} if os.path.isdir(os.path.join(RACINE, "matieres")) else set()
    for chemin, contenu in fichiers.items():
        p = os.path.join(RACINE, chemin)
        actuel = open(p, encoding="utf-8").read() if os.path.exists(p) else None
        if actuel != contenu:
            perimes.append(chemin)
            if not verifier:
                os.makedirs(os.path.dirname(p), exist_ok=True)
                open(p, "w", encoding="utf-8").write(contenu)
    en_trop = sorted(existants - set(fichiers))
    if verifier:
        if perimes or en_trop:
            print("Fichiers des univers pas à jour : relancer python3 outils/univers.py", *perimes, *en_trop, sep="\n  "); sys.exit(1)
        print(f"Univers à jour ({len(fichiers)} fichiers, contrastes OK)")
    else:
        for n in en_trop: os.remove(os.path.join(RACINE, n))
        print(f"{len(perimes)} fichier(s) écrit(s), {len(en_trop)} supprimé(s) ; contrastes OK")

if __name__ == "__main__":
    main()
